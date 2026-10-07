import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CustomDestination, DiscoveredDestination } from '../types'
import type { Place } from '../utils/geocode'
import { resolveCustomOnly } from '../utils/clientAnalyze'
import {
  type Identity,
  type IdentityMap,
  LOOKUP_DEBOUNCE_MS,
  LOOKUP_RETRY_MS,
  NO_IDENTITY,
  answered,
  learn,
  rowsKey,
  unanswered,
} from '../utils/elevationLookup'
import { geoKey } from '../utils/points'

/** What the app reads of the lookup. */
export interface ElevationLookup {
  // Every identity learned so far, by `geoKey`.
  identity: IdentityMap
  // The same, as of this moment rather than the last render: what a run
  // starting now builds its list from.
  latest: () => IdentityMap
  // The rows, by `geoKey`, that have no answer yet and will still be asked
  // about: waiting for the box to be still, in flight, or waiting for the one
  // retry. A row's height-read cells tick only while it is here; a row the
  // lookup has given up on is not, so its cells stop ticking and read blank.
  inquiring: ReadonlySet<string>
}

interface Inputs {
  csvRows: CustomDestination[]
  places: Place[]
  // The analysis cap, above which no lookup is sent.
  cap: number
  // Rows this lookup placed, for a committed report to take.
  onPlaced?: (rows: readonly DiscoveredDestination[]) => void
}

const NO_KEYS: ReadonlySet<string> = new Set()

/**
 * The elevation lookup for the coordinates box, run as soon as the box holds
 * rows rather than when Analyze is pressed (#673), and the only thing in the
 * app that looks an elevation up: an analysis reads what this has learned and
 * never waits for it. However the rows got there (a paste, a typed line, a
 * share link, an example), every distinct coordinate the browser has no
 * answer for is looked up once the box has been still for
 * `LOOKUP_DEBOUNCE_MS`, one lookup at a time, in two steps: the basemap's own
 * tiles first (`peakTiles.ts`, static files, well under a second), then the
 * pod's map-server lookup for whatever the tiles left. The answers are kept
 * for the session, so a row is never asked about twice, an added row asks
 * about itself alone, and a removed one costs nothing. By the time Analyze is
 * pressed the lookup is usually done, and the request carries the
 * elevations.
 *
 * A set the pod gave up on (a busy map server) is asked once more after
 * `LOOKUP_RETRY_MS`, tiles and all, and then not again until the list
 * changes.
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
  // The set given up on after its retry: nothing more will be asked for it.
  const [abandoned, setAbandoned] = useState<string | null>(null)
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
    (rows: readonly CustomDestination[], retry: boolean) => {
      const controller = new AbortController()
      abortRef.current = controller
      const run = (async () => {
        try {
          // The tiles first. Loaded on the first lookup, so the decoder and
          // its tile library stay off the cold load the Lighthouse gate
          // measures; a chunk that cannot be loaded leaves every row to the
          // pod.
          let fromTiles = new Map<string, Identity>()
          try {
            const tiles = await import('../utils/peakTiles')
            fromTiles = await tiles.lookupPeaks(rows, tiles.fetchTileWith(await tiles.tileTemplate(), controller.signal))
          } catch {
            // Nothing placed; the pod is asked about every row below.
          }
          if (controller.signal.aborted) return
          const placed = answered(rows, fromTiles)
          if (placed.length) {
            take(placed, true)
            onPlacedRef.current?.(placed)
          }
          const left = rows.filter((r) => !fromTiles.has(geoKey(r.latitude, r.longitude)))
          if (!left.length) {
            gaveUpRef.current = null
            return
          }
          // Then the pod, for the rest.
          const resolved = await resolveCustomOnly(left, controller.signal, true)
          if (controller.signal.aborted) return
          const learned = take(resolved.destinations, resolved.lookupComplete)
          const unplaced = left.filter((r) => !learned.has(geoKey(r.latitude, r.longitude)))
          const gaveUp = resolved.lookupComplete ? null : rowsKey(unplaced)
          gaveUpRef.current = gaveUp
          if (gaveUp && retry) setAbandoned(gaveUp)
          const byPod = resolved.destinations.filter((d) => d.elevation_ft != null)
          if (byPod.length) onPlacedRef.current?.(byPod)
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
        if (inFlightRef.current) return
        if (retry) retriedRef.current = key
        const rows = pendingRef.current
        if (rows.length) ask(rows, retry)
      },
      retry ? LOOKUP_RETRY_MS : LOOKUP_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [key, settledSeq, ask])

  useEffect(() => () => abortRef.current?.abort(), [])

  const latest = useCallback(() => identityRef.current, [])

  const inquiring = useMemo<ReadonlySet<string>>(
    () => (abandoned === key ? NO_KEYS : new Set(pending.map((r) => geoKey(r.latitude, r.longitude)))),
    [abandoned, key, pending],
  )

  return useMemo(() => ({ identity, latest, inquiring }), [identity, latest, inquiring])
}
