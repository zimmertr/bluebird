import { useEffect, useMemo, useState } from 'react'
import { fetchClosures } from '../utils/closures'
import {
  CLOSURE_UNCOVERED_NOTE,
  type ClosureProximityStatus,
  type ClosureWarning,
  closureFor,
  closureUncoveredNote,
  coveredStates,
} from '../utils/closureProximity'
import { pointsBbox, pointsKey, uncoveredKeys } from '../utils/fireProximity'
import { geoKey } from '../utils/points'
import { isRateLimited } from '../utils/wildfires'

// For each destination inside an active Forest Service area closure, returns
// a map (keyed by geoKey(lat, lon)) to its closure, alongside the state of the
// lookup itself (#550). The Closure column's twin of useFireProximity, and the
// same contract on purpose: keyed by coordinate so a warning finds its row
// after a re-sort, independent of the closure layers' toggles, and fed the
// analysis's candidate FIELD rather than the rows on screen, so a live knob
// never re-asks the pod.
//
// It rides the fire check's field and sequence (`fireField`/`fireSeq` in
// useAnalysisReport.ts) rather than a pair of its own: both checks are one
// lookup per analysis over the same candidate field, published at discovery
// so each overlaps the weather fetch, and a second publisher would be a
// second answer to "which destinations does this analysis cover".

export interface ClosureProximity {
  status: ClosureProximityStatus
  warnings: Map<string, ClosureWarning>
  uncovered: Set<string>
  // The hover an uncovered row's N/A carries, read off the same outline that
  // marked it uncovered, so a region whose feed failed is not named (#567).
  uncoveredNote: string
}

// The fire check's retry doctrine, unchanged: three tries, backing off, and
// a stop on a refusal that no backoff a UI can hold for would outlast.
const ATTEMPTS = 3
const BACKOFF_MS = [1000, 3000]

// A polygon that holds a point intersects every box around that point, so the
// test itself needs no margin. The mile keeps a one-destination field's box
// from being a single point, and costs the query nothing it would notice.
const MARGIN_MI = 1

const EMPTY: Map<string, ClosureWarning> = new Map()
const NONE: Set<string> = new Set()

/**
 * @param field the destinations to check; only coordinates are read
 * @param seq bumped once per analysis (`fireSeq`), so clicking Analyze
 *   re-asks even when the destinations are identical; see useFireProximity
 *   for why the content key alone is too stable.
 */
export function useClosureProximity(
  field: { latitude: number; longitude: number }[],
  seq = 0,
): ClosureProximity {
  const [state, setState] = useState<ClosureProximity>({
    status: 'idle',
    warnings: EMPTY,
    uncovered: NONE,
    uncoveredNote: CLOSURE_UNCOVERED_NOTE,
  })

  // The identity of the destinations rather than of the array holding them,
  // for useFireProximity's reason: a re-rank hands over the same points in a
  // new array, and keying on the reference re-asked and aborted in flight.
  const contentKey = useMemo(() => pointsKey(field), [field])
  // Kept: holding `field` behind its CONTENT key is the whole point, and the
  // rule can only ask for the reference this is here to stop reading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => field, [contentKey])

  useEffect(() => {
    const bbox = pointsBbox(points, MARGIN_MI)
    if (!bbox) {
      // Nothing to check. Not a failure, so not `unavailable`.
      setState((prev) =>
        prev.status === 'idle' && prev.warnings.size === 0
          ? prev
          : { status: 'idle', warnings: EMPTY, uncovered: NONE, uncoveredNote: CLOSURE_UNCOVERED_NOTE },
      )
      return
    }

    const ac = new AbortController()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Keep whatever is displayed while refetching: a stale entry keyed by
    // coordinate either still describes the same place or matches no row.
    setState((prev) => (prev.status === 'loading' ? prev : { ...prev, status: 'loading' }))

    const attempt = async (n: number): Promise<void> => {
      try {
        // The coarse copy, as the fire check reads. Its ~56 m of
        // simplification can move a boundary only for a destination standing
        // on the line itself, and the reader of such a row reads the order
        // either way, so the full copy's bytes would buy nothing they can act
        // on.
        const areas = await fetchClosures(bbox, 'area', 'coarse', ac.signal)
        if (cancelled) return
        // Which rows the feed cannot see, from the coverage the server
        // publishes beside the data: outside the area feeds' coverage an
        // empty answer is "not covered", not "no order", and the cell says N/A.
        const uncovered = uncoveredKeys(points, areas.coverage)
        const next = new Map<string, ClosureWarning>()
        for (const p of points) {
          const key = geoKey(p.latitude, p.longitude)
          if (uncovered.has(key)) continue
          const hit = closureFor(p.latitude, p.longitude, areas)
          if (hit) next.set(key, hit)
        }
        setState({
          status: 'ready',
          warnings: next,
          uncovered,
          uncoveredNote: closureUncoveredNote(coveredStates(areas.coverage)),
        })
      } catch (err) {
        // An abort is the caller changing its mind, not a failure to report.
        if (cancelled || (err as Error).name === 'AbortError') return
        // The one diagnostic, for useFireProximity's reason: in the wild the
        // console is the only instrument that names the caught error.
        console.warn(
          `[bluebird-forecast] closure lookup failed (attempt ${n + 1} of ${ATTEMPTS})`,
          err,
        )
        // A 429 or a 503 (a pod that has never fetched the orders) does not
        // clear inside a backoff, so the check stops honestly.
        if (isRateLimited(err)) {
          setState({ status: 'unavailable', warnings: EMPTY, uncovered: NONE, uncoveredNote: CLOSURE_UNCOVERED_NOTE })
          return
        }
        if (n + 1 < ATTEMPTS) {
          timer = setTimeout(() => {
            if (!cancelled) void attempt(n + 1)
          }, BACKOFF_MS[n])
          return
        }
        setState({ status: 'unavailable', warnings: EMPTY, uncovered: NONE, uncoveredNote: CLOSURE_UNCOVERED_NOTE })
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
