import { useMemo, useRef, useState } from 'react'
import { AnalyzeRequest, AnalyzeResponse, DestinationResult } from '../types'
import { Place, isPeakKind } from '../utils/geocode'

// A searched place pinned to the map and table. `row` is null only while its
// first forecast is in flight — settled pins without data are dropped.
export type PinnedPlace = {
  place: Place
  row: DestinationResult | null
}

// ~1 m precision — enough to match a backend-echoed coordinate back to its
// pin, and to treat a re-search of the same feature as a refresh, not a dupe.
export function pinKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

// Forecasts for every searched location, shown as pinned rows above the
// results table. Pins accumulate across searches and are only removed by the
// user (the 📍 cell). All pins refetch together in one batched request on the
// custom-destinations path of /api/analyze, so the whole pinned block always
// shares a single forecast window. Best-effort like AQI and NIFC: a failed
// fetch keeps previous numbers where they exist and never breaks the UI.
export function usePinnedForecasts() {
  const [pins, setPins] = useState<PinnedPlace[]>([])
  // Synchronous mirror of `pins` — add/remove/merge must see the latest list
  // immediately, not after the next render.
  const pinsRef = useRef<PinnedPlace[]>([])
  const abortRef = useRef<AbortController | null>(null)
  // Foreground-refresh flag, driving a standalone pins-only overlay. Only
  // `announce`d fetches (an explicit pins-only Analyze) flip it; a search's
  // silent pin fetch does not, so searching never throws up a modal.
  const [loading, setLoading] = useState(false)
  // In-flight flag for ANY pin fetch (announced or not). Lets a concurrent
  // ranked analysis fold the pin refresh into its union progress ("x/y") —
  // pins count as done the moment this clears.
  const [refreshing, setRefreshing] = useState(false)

  function commit(next: PinnedPlace[]) {
    pinsRef.current = next
    setPins(next)
  }

  async function fetchSet(
    places: Place[],
    startIso: string,
    endIso: string,
    announce = false,
  ) {
    abortRef.current?.abort()
    if (places.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    // `abortRef` guarantees a single in-flight fetch, so "loading = the current
    // fetch is announced" is self-consistent: a superseding silent search-fetch
    // (announce=false) then correctly lowers an overlay it just cancelled,
    // without depending on stacking order to keep them from overlapping.
    setLoading(announce)
    setRefreshing(true)

    const request: AnalyzeRequest = {
      destination_type: 'custom',
      custom_destinations: places.map((p) => ({
        name: p.label,
        latitude: p.lat,
        longitude: p.lon,
        elevation_ft: p.elevationFt,
      })),
      start_datetime: startIso,
      end_datetime: endIso,
      limit: places.length,
    }

    let byKey: Map<string, DestinationResult> | null = null
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AnalyzeResponse = await res.json()
      // Carry the response's shared grid onto each pinned row so the chart can
      // align its series (a pin may have been fetched for a different window).
      byKey = new Map(
        data.results.map((r) => [
          pinKey(r.latitude, r.longitude),
          { ...r, series_times: data.times },
        ]),
      )
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.warn('Pinned forecast fetch failed:', e)
    } finally {
      // Only the latest fetch owns the loading flag: a superseding fetch has
      // already swapped abortRef, so an older one's cleanup here is a no-op and
      // can't lower a spinner the newer fetch just raised. On a user cancel the
      // controller is still current, so this clears the overlay as expected.
      if (abortRef.current === controller) {
        abortRef.current = null
        setLoading(false)
        setRefreshing(false)
      }
    }

    // Merge into whatever the list looks like NOW — a pin removed mid-flight
    // must stay removed. Pins the fetch produced no row for keep their old
    // numbers; ones that never had any (a just-added place on a failed fetch)
    // are dropped, dot and all, rather than lingering blank.
    commit(
      pinsRef.current
        .map((p) => {
          const row = byKey?.get(pinKey(p.place.lat, p.place.lon))
          return row ? { ...p, row } : p
        })
        .filter((p) => p.row !== null),
    )
  }

  // Add a place (or refresh it, if already pinned) and refetch the whole set
  // with the given window. The new pin's dot shows immediately; its table row
  // appears when the forecast lands.
  function addPlace(place: Place, startIso: string, endIso: string) {
    const key = pinKey(place.lat, place.lon)
    const exists = pinsRef.current.some((p) => pinKey(p.place.lat, p.place.lon) === key)
    commit(
      exists
        ? pinsRef.current.map((p) =>
            pinKey(p.place.lat, p.place.lon) === key ? { ...p, place } : p,
          )
        : [...pinsRef.current, { place, row: null }],
    )
    void fetchSet(
      pinsRef.current.map((p) => p.place),
      startIso,
      endIso,
    )
  }

  function removePlace(latitude: number, longitude: number) {
    const key = pinKey(latitude, longitude)
    commit(pinsRef.current.filter((p) => pinKey(p.place.lat, p.place.lon) !== key))
  }

  // Refetch every pin with a new window (each Analyze does this, so the pinned
  // block stays comparable with the report it sits above). `announce` surfaces
  // the loading overlay — set on a pins-only Analyze (where nothing else gives
  // feedback), left off when a ranked analysis is already showing its own modal.
  function refetchAll(startIso: string, endIso: string, announce = false) {
    void fetchSet(
      pinsRef.current.map((p) => p.place),
      startIso,
      endIso,
      announce,
    )
  }

  // Seed pins restored from the URL at load, then fetch their forecasts for the
  // given window (silently — a shared link opening shouldn't throw up a modal).
  // Their dots and table rows appear as the forecasts land, just like a search.
  function restore(places: Place[], startIso: string, endIso: string) {
    if (places.length === 0) return
    commit(places.map((place) => ({ place, row: null })))
    void fetchSet(places, startIso, endIso)
  }

  // Abort an in-flight refresh (wired to the loading overlay's Cancel button).
  function cancel() {
    abortRef.current?.abort()
  }

  // The backend echoes custom destinations as type "custom" with no osm_id,
  // but the search that created the pin knew more. Restore that identity so
  // the name cell links where the feature belongs — a searched peak to
  // Peakbagger, a searched lake or town to its exact OSM object page.
  const rows = useMemo(
    () =>
      pins.flatMap((p) =>
        p.row !== null
          ? [
              {
                ...p.row,
                type: isPeakKind(p.place.kind) ? 'peak' : p.row.type,
                osm_id: p.row.osm_id ?? p.place.osmId ?? null,
              },
            ]
          : [],
      ),
    [pins],
  )
  const places = useMemo(() => pins.map((p) => p.place), [pins])

  return { rows, places, loading, refreshing, addPlace, removePlace, refetchAll, restore, cancel }
}
