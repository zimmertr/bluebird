import { useEffect, useMemo, useRef, useState } from 'react'
import { overlayRecovery, retryAfterOf } from '../map/overlays/recovery'
import { type FireProximityStatus, pointsBbox, pointsKey } from '../utils/fireProximity'
import { type BBox, isRateLimited } from '../utils/wildfires'

// The lifecycle the Wildfire and Closure columns' checks share: one lookup per
// analysis over the candidate field, the quick retries, and what happens after
// the check gives up. Each check (useFireProximity, useClosureProximity) owns
// its feed and its test and hands them over as a `ProximityLookup`; nothing
// here knows a fire from a closure.

type Point = { latitude: number; longitude: number }

export interface ProximityCheck<W> {
  status: FireProximityStatus
  warnings: Map<string, W>
  uncovered: Set<string>
}

/** One answered lookup: the warned points and the ones the feed cannot see. */
export interface ProximityFound<W> {
  warnings: Map<string, W>
  uncovered: Set<string>
}

/**
 * What makes a check its own. A module constant at the call site, because the
 * effect below is keyed on it and a fresh object would re-ask every render.
 */
export interface ProximityLookup<W> {
  /** Names the check in the console line a failure writes. */
  label: string
  /** Miles of padding around the field's bounding box. */
  marginMi: number
  /** One query over `bbox`, and the local test of every point against its answer. */
  find(bbox: BBox, points: Point[], signal: AbortSignal): Promise<ProximityFound<W>>
}

// Three tries, backing off, because the observed failure was intermittent
// against a service that answers healthy direct requests: one bad response
// should not cost a whole analysis its warnings. Bounded and short, because the
// cells tick for as long as this runs.
const ATTEMPTS = 3
const BACKOFF_MS = [1000, 3000]

// How long a check that gave up waits before asking again, when the failure
// named no wait of its own (the pod unreachable, an unreadable body). A
// minute: a failure that outlasted three tries is not a blip, and it is about
// what the pod asks for when it does name one.
const RECOVERY_S = 60

const EMPTY = new Map<string, never>()
const NONE: Set<string> = new Set()

/**
 * @param lookup the check's own feed and test
 * @param field the destinations to check; only coordinates are read
 * @param seq bumped once per analysis, when its field is published, so
 *   clicking Analyze re-asks even when the destinations are identical. It is
 *   the publisher's own counter rather than analysisSeq: the commit lands
 *   after this lookup has started, and a bump there would abort the request in
 *   flight and restart it.
 * @param layerOn whether the map layer drawing the same data is on. The check
 *   runs either way; switching the layer on asks a failed check again at once,
 *   because the reader has just asked for this data and the layer's own fetch
 *   is asking the same pod.
 */
export function useProximityCheck<W>(
  lookup: ProximityLookup<W>,
  field: Point[],
  seq: number,
  layerOn: boolean,
): ProximityCheck<W> {
  const [state, setState] = useState<ProximityCheck<W>>({
    status: 'idle',
    warnings: EMPTY as Map<string, W>,
    uncovered: NONE,
  })

  // The identity of the destinations, not the identity of the array holding
  // them. `field` is a fresh array on paths that rebuild it per render, and
  // keying the effect on the reference meant re-asking, and aborting the
  // request in flight, for a set of points that had not changed. Live knobs
  // are exactly that case: a re-rank hands over the same destinations in a
  // new array.
  const contentKey = useMemo(() => pointsKey(field), [field])
  // Kept: holding `field` behind its CONTENT key is the whole point, and the
  // rule can only ask for the reference this is here to stop reading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const points = useMemo(() => field, [contentKey])

  // The running check's "ask again now", for the layer switch below.
  const reask = useRef<(() => void) | null>(null)

  useEffect(() => {
    const bbox = pointsBbox(points, lookup.marginMi)
    if (!bbox) {
      // Nothing to check. Not a failure, so not `unavailable`.
      setState((prev) =>
        prev.status === 'idle' && prev.warnings.size === 0
          ? prev
          : { status: 'idle', warnings: EMPTY as Map<string, W>, uncovered: NONE },
      )
      return
    }

    const ac = new AbortController()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // The check gave up and the recovery below is outstanding.
    let gaveUp = false
    let asking = false

    // Keep whatever is already displayed while refetching. Warnings are keyed
    // by coordinate, so a stale entry either still describes the same place or
    // simply never matches a row.
    setState((prev) => (prev.status === 'loading' ? prev : { ...prev, status: 'loading' }))

    // A check that gave up keeps asking, or one bad minute costs the report
    // its column until the next Analyze: when the wait runs out, and when the
    // browser comes back online (never inside a wait the pod named, which is
    // `overlayRecovery`'s rule). Those attempts are single and silent. The
    // status stays `unavailable` until one lands, so the cells and the panel
    // do not flicker once a minute through an outage.
    const askAgain = () => {
      clearTimeout(timer)
      if (!cancelled && !asking) void attempt(0, false)
    }
    const recovery = overlayRecovery(askAgain, { timed: true })

    async function attempt(n: number, quick: boolean): Promise<void> {
      asking = true
      try {
        const found = await lookup.find(bbox!, points, ac.signal)
        if (cancelled) return
        gaveUp = false
        recovery.succeeded()
        setState({ status: 'ready', ...found })
      } catch (err) {
        // An abort is the caller changing its mind, not a failure to report.
        if (cancelled || (err as Error).name === 'AbortError') return
        // The one diagnostic. The failure the retries exist for was
        // reproducible only in the wild, where the console is the only
        // instrument anyone has; naming the caught error is what tells the
        // next reporter whether it was the network, a truncated body, or an
        // error payload behind a 200.
        console.warn(
          `[bluebird-forecast] ${lookup.label} failed (${quick ? `attempt ${n + 1} of ${ATTEMPTS}` : 'asked again'})`,
          err,
        )
        // Never retry into a wall. A 429 is this client outpacing its own
        // address limit and a 503 is a pod with nothing it will serve; neither
        // clears inside a backoff a UI can hold for (the #180 doctrine), so
        // those skip the quick tries and wait out the pod's `Retry-After`.
        if (quick && !isRateLimited(err) && n + 1 < ATTEMPTS) {
          timer = setTimeout(() => {
            if (!cancelled) void attempt(n + 1, true)
          }, BACKOFF_MS[n])
          return
        }
        gaveUp = true
        setState((prev) =>
          prev.status === 'unavailable'
            ? prev
            : { status: 'unavailable', warnings: EMPTY as Map<string, W>, uncovered: NONE },
        )
        // At least a second, so an answer that says `Retry-After: 0` cannot
        // turn the silent attempts into a loop as fast as the network.
        const named = retryAfterOf(err)
        const wait = named === null ? null : Math.max(1, named)
        recovery.failed(wait)
        if (wait === null) timer = setTimeout(askAgain, RECOVERY_S * 1000)
      } finally {
        asking = false
      }
    }

    reask.current = () => {
      if (!gaveUp) return
      // `loading`, so the panel's notice does not flash in the moment between
      // the layer coming on and this answer landing.
      setState((prev) => ({ ...prev, status: 'loading' }))
      // A silent attempt already in flight is the answer.
      if (asking) return
      gaveUp = false
      clearTimeout(timer)
      recovery.stop()
      void attempt(0, true)
    }

    void attempt(0, true)

    return () => {
      cancelled = true
      reask.current = null
      clearTimeout(timer)
      recovery.stop()
      ac.abort()
    }
  }, [lookup, points, seq])

  useEffect(() => {
    if (layerOn) reask.current?.()
  }, [layerOn])

  return state
}
