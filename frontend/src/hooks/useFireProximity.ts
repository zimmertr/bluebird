import { useEffect, useMemo, useState } from 'react'
import { fetchWildfires, isRateLimited } from '../utils/wildfires'
import {
  FireWarning,
  FIRE_WARN_MILES,
  fireKey,
  nearestFire,
  pointsBbox,
  pointsKey,
  uncoveredKeys,
} from '../utils/fireProximity'

// For each destination within FIRE_WARN_MILES of an active US wildfire, returns
// a map (keyed by fireKey(lat, lon)) to its nearest-fire warning, alongside the
// state of the lookup itself. Independent of the map overlay toggle — this is
// safety info, not a display option.
//
// Takes the analysis's candidate FIELD, not the rows on screen. Since #188 the
// displayed rows are re-derived on every sort, limit and elevation change, so
// keying off them would fire a NIFC query per knob twiddle. The field changes
// once per analysis — published at discovery so this lookup overlaps the
// weather fetch — and warnings for destinations below the cut are simply never
// looked up: cheap, since the extra work is local distance math against one
// query's perimeters rather than another request. Only coordinates are read,
// which is what lets a pre-forecast candidate stand in for a result row.

/**
 * Whether the lookup has an answer, and whether that answer can be trusted.
 *
 * This used to be a bare Map, and every way of failing produced the same empty
 * one: an aborted request, a network error, and a truncated body all landed in
 * one silent catch. So the feature's failure mode was indistinguishable from
 * its all-clear mode, which for a safety warning is the wrong way round.
 * `ready` with an empty map means the check ran and found nothing within the
 * radius; `unavailable` means it could not run and the caller must not imply
 * otherwise.
 *
 * `unavailable` is now rare by construction. Perimeters come from Bluebird's
 * own cache rather than from NIFC directly, and that cache serves its last good
 * snapshot rather than expiring into nothing, so only a server that has never
 * completed a fetch has no answer at all (issue #203).
 *
 * `uncovered` names the geographic blind spot (#256): WFIGS is US-only, and
 * a destination outside the coverage the server publishes was never checked,
 * which used to be indistinguishable from its all-clear. It is a per-row
 * set rather than a status, because one analysis can hold a Cascades row and
 * a British Columbia row at once: both the table and the CSV write the no-data
 * dash in an uncovered row's wildfire cell, while covered rows keep their
 * real answers.
 */
export type FireProximityStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface FireProximity {
  status: FireProximityStatus
  warnings: Map<string, FireWarning>
  uncovered: Set<string>
}

// Three tries, backing off, because the observed failure was intermittent
// against a service that answers healthy direct requests: one bad response
// should not cost a whole analysis its fire warnings. Bounded and short —
// this is a best-effort overlay on data the user is already reading, not
// something worth spending a visible delay on.
const ATTEMPTS = 3
const BACKOFF_MS = [1000, 3000]

const EMPTY: Map<string, FireWarning> = new Map()
const NONE: Set<string> = new Set()

/**
 * @param field the destinations to check; only coordinates are read
 * @param seq bumped once per analysis, when its field is published, so
 *   clicking Analyze re-asks even when the destinations are identical.
 *   Without it the content key below is *too* stable: a failed lookup over an
 *   unchanged polygon could never be retried, which turns a transient outage
 *   into a stuck warning until the user edits their search. It also keeps the
 *   documented contract of one query per analysis, which matters because
 *   perimeters move. It is the publisher's own counter rather than
 *   analysisSeq: the commit lands after this lookup has started, and a bump
 *   there would abort the request in flight and restart it — serial again.
 */
export function useFireProximity(
  field: { latitude: number; longitude: number }[],
  seq = 0,
): FireProximity {
  const [state, setState] = useState<FireProximity>({
    status: 'idle',
    warnings: EMPTY,
    uncovered: NONE,
  })

  // The identity of the destinations, not the identity of the array holding
  // them. `field` is a fresh array on paths that rebuild it per render, and
  // keying the effect on the reference meant re-querying NIFC — and aborting
  // the request in flight —
  // for a set of points that had not actually changed. Live knobs are exactly
  // that case: a re-rank hands over the same destinations in a new array.
  const contentKey = useMemo(() => pointsKey(field), [field])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => field, [contentKey])

  useEffect(() => {
    const bbox = pointsBbox(points, FIRE_WARN_MILES + 1)
    if (!bbox) {
      // Nothing to check. Not a failure, so not `unavailable`.
      setState((prev) =>
        prev.status === 'idle' && prev.warnings.size === 0
          ? prev
          : { status: 'idle', warnings: EMPTY, uncovered: NONE },
      )
      return
    }

    const ac = new AbortController()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Keep whatever is already displayed while refetching. Warnings are keyed
    // by coordinate, so a stale entry either still describes the same place or
    // simply never matches a row.
    setState((prev) => (prev.status === 'loading' ? prev : { ...prev, status: 'loading' }))

    const attempt = async (n: number): Promise<void> => {
      try {
        // The coarse copy, deliberately (TJ, PR #275 review). Its ~56 m of
        // simplification is 0.035 mi against a FIRE_WARN_MILES threshold and
        // a cell that rounds to 0.1 mi, so it cannot change any displayed
        // answer — and it is about a thirteenth of the full copy's bytes
        // (measured: 210 KB vs 3.3 MB for a Washington-sized field).
        const fires = await fetchWildfires(bbox, 'coarse', ac.signal)
        if (cancelled) return
        // Which rows the dataset could not see, from the coverage the server
        // publishes beside the data (#256). Kept per row: an uncovered
        // destination's wildfire cell reads the no-data dash in the table and
        // the CSV, while its covered neighbours keep their real answers.
        const uncovered = uncoveredKeys(points, fires.coverage)
        const next = new Map<string, FireWarning>()
        for (const r of points) {
          if (uncovered.has(fireKey(r.latitude, r.longitude))) continue
          const near = nearestFire(r.latitude, r.longitude, fires)
          if (near && near.miles <= FIRE_WARN_MILES) {
            next.set(fireKey(r.latitude, r.longitude), near)
          }
        }
        setState({ status: 'ready', warnings: next, uncovered })
      } catch (err) {
        // An abort is the caller changing its mind, not a failure to report.
        if (cancelled || (err as Error).name === 'AbortError') return
        // The one diagnostic. The failure this retry loop exists for was
        // reproducible only in the wild, where the console is the only
        // instrument anyone has; naming the caught error is what tells the
        // next reporter whether it was the network, a truncated body, or an
        // ArcGIS error payload behind a 200.
        console.warn(
          `[bluebird] wildfire proximity lookup failed (attempt ${n + 1} of ${ATTEMPTS})`,
          err,
        )
        // Never retry into a wall. A 429 is this client outpacing its own
        // address limit and a 503 is a server that has never managed a fetch
        // from NIFC; neither resolves inside a backoff a UI can hold for. Same
        // doctrine as #180 on the Open-Meteo side: a hard limit stops honestly
        // rather than retrying into the wall.
        if (isRateLimited(err)) {
          setState({ status: 'unavailable', warnings: EMPTY, uncovered: NONE })
          return
        }
        if (n + 1 < ATTEMPTS) {
          timer = setTimeout(() => {
            if (!cancelled) void attempt(n + 1)
          }, BACKOFF_MS[n])
          return
        }
        setState({ status: 'unavailable', warnings: EMPTY, uncovered: NONE })
      }
    }

    void attempt(0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      ac.abort()
    }
  }, [points, seq])

  return state
}
