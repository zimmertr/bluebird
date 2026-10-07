import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CustomDestination, DiscoveredDestination } from '../types'
import type { Place } from '../utils/geocode'
import { resolveCustomOnly } from '../utils/clientAnalyze'
import {
  type IdentityMap,
  LOOKUP_DEBOUNCE_MS,
  LOOKUP_RETRY_MS,
  NO_IDENTITY,
  learn,
  rowsKey,
  unanswered,
} from '../utils/elevationLookup'

/** What the app reads of the lookup, and what an analysis hands it. */
export interface ElevationLookup {
  // Every identity learned so far, by `geoKey`.
  identity: IdentityMap
  // The identities once no lookup is in flight: an analysis waits on this
  // before it resolves its own list, so the two never ask the pod about the
  // same rows at once and the second never waits behind the first.
  settled: () => Promise<IdentityMap>
  // An analysis learned these on its own call. `complete` false says the pod
  // gave up, and the rows with no elevation are asked about again.
  learn: (rows: readonly DiscoveredDestination[], complete: boolean) => void
}

interface Inputs {
  csvRows: CustomDestination[]
  places: Place[]
  // The analysis cap, above which no lookup is sent.
  cap: number
  // Rows this hook's own lookup placed, for a committed report to take.
  onPlaced?: (rows: readonly DiscoveredDestination[]) => void
}

/**
 * The elevation lookup for the coordinates box, run as soon as the box holds
 * rows rather than when Analyze is pressed (#673). However the rows got
 * there (a paste, a typed line, a share link, an example), every distinct
 * coordinate the browser has no answer for is sent to the pod once the box
 * has been still for `LOOKUP_DEBOUNCE_MS`, one lookup at a time. The
 * answers are kept for the session, so a row is never asked about twice, an
 * added row asks about itself alone, and a removed one costs nothing. By the
 * time Analyze is pressed the lookup is usually done, and the request carries
 * the elevations, which is what lets the pod skip the map server.
 *
 * A lookup the pod gave up on (a busy map server) is asked once more after
 * `LOOKUP_RETRY_MS`, and then not again until the list changes.
 */
export function useElevationLookup({ csvRows, places, cap, onPlaced }: Inputs): ElevationLookup {
  const [identity, setIdentity] = useState<IdentityMap>(NO_IDENTITY)
  // The latest identities, for callbacks that must not close over a render.
  const identityRef = useRef(identity)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The set a give-up was retried for, so a set is retried once.
  const retriedRef = useRef<string | null>(null)
  // The set the pod last gave up on, which the retry alone may ask again.
  const gaveUpRef = useRef<string | null>(null)
  // Bumped when a lookup settles, so the effect below looks again.
  const [settledSeq, setSettledSeq] = useState(0)
  const onPlacedRef = useRef(onPlaced)
  onPlacedRef.current = onPlaced

  const pending = useMemo(() => unanswered(csvRows, places, identity, cap), [csvRows, places, identity, cap])
  const key = useMemo(() => rowsKey(pending), [pending])
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const take = useCallback((rows: readonly DiscoveredDestination[], complete: boolean) => {
    const next = learn(identityRef.current, rows, complete)
    identityRef.current = next
    setIdentity(next)
    return next
  }, [])

  const ask = useCallback(
    (rows: readonly CustomDestination[]) => {
      const controller = new AbortController()
      abortRef.current = controller
      const run = (async () => {
        try {
          const resolved = await resolveCustomOnly(rows, controller.signal)
          if (controller.signal.aborted) return
          take(resolved.destinations, resolved.lookupComplete)
          gaveUpRef.current = resolved.lookupComplete ? null : rowsKey(rows)
          const placed = resolved.destinations.filter((d) => d.elevation_ft != null)
          if (placed.length) onPlacedRef.current?.(placed)
        } catch {
          // An abort, which is the unmount. Nothing to keep.
        } finally {
          inFlightRef.current = null
          abortRef.current = null
          setSettledSeq((n) => n + 1)
        }
      })()
      inFlightRef.current = run
    },
    [take],
  )

  // One lookup at a time, sent once the box has been still. A set the pod
  // gave up on waits the retry delay and is sent once more; after that it
  // waits for the list to change, which makes a new set.
  useEffect(() => {
    if (!key || inFlightRef.current) return
    const retry = gaveUpRef.current === key
    if (retry && retriedRef.current === key) return
    const timer = setTimeout(
      () => {
        if (retry) retriedRef.current = key
        const rows = pendingRef.current
        if (rows.length) ask(rows)
      },
      retry ? LOOKUP_RETRY_MS : LOOKUP_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [key, settledSeq, ask])

  useEffect(() => () => abortRef.current?.abort(), [])

  const settled = useCallback(() => (inFlightRef.current ?? Promise.resolve()).then(() => identityRef.current), [])

  const learnFromAnalysis = useCallback(
    (rows: readonly DiscoveredDestination[], complete: boolean) => {
      take(rows, complete)
      // The analysis asked the pod itself; a give-up there is one this hook
      // may retry, once, like its own.
      gaveUpRef.current = complete ? null : rowsKey(rows.filter((r) => r.elevation_ft == null))
      setSettledSeq((n) => n + 1)
    },
    [take],
  )

  return useMemo(
    () => ({ identity, settled, learn: learnFromAnalysis }),
    [identity, settled, learnFromAnalysis],
  )
}
