import { useEffect, useMemo, useState } from 'react'
import { useSearchedPlaces } from './useSearchedPlaces'
import type { DiscoveryType, GeoPolygon } from '../types'
import { parseCustomCsv } from '../utils/customDestinations'
import { bboxAreaKm2, ringToPts } from '../utils/drawGeometry'
import { restoredFramePoints } from '../utils/mapFraming'
import { authoredScope } from '../utils/removals'
import type { ShareableState } from '../utils/urlState'

/**
 * The three ways a reader names destinations: the polygon and the kinds it
 * looks for, the pasted coordinates, and the places searched by name.
 *
 * One hook because they are one question — what an analysis will rank — and
 * the two values read across them (`destinationScope`, `destinationNamed`)
 * need all three. Nothing here fetches: each input is held until the next
 * Analyze, which is where the spend boundary is.
 */
export function useDestinationInputs(restored: Partial<ShareableState> | null) {
  // Every point destination the URL restores (CSV rows and searched places),
  // built once so the memoized MapView frames them on load beside the ring.
  const restoredPoints = useMemo(
    () => restoredFramePoints(restored?.customCsv ?? '', restored?.pins ?? []),
    [restored],
  )

  const [polygon, setPolygon] = useState<GeoPolygon | null>(() => restored?.polygon ?? null)
  // Read off the ring rather than reported by the map, because the map can only
  // report an area once it has loaded: a ring restored from a link printed its
  // point count beside a blank area line until the reader edited it (#429). A
  // derived value cannot lag the ring it describes.
  const polygonAreaKm2 = useMemo(
    () => (polygon ? bboxAreaKm2(ringToPts(polygon)) : null),
    [polygon],
  )
  // Which kinds the polygon looks for, as a set — several are found in one
  // Overpass query. Nothing is checked by default: discovery is the input
  // that needs a polygon and costs an upstream query, so a fresh session
  // asks for none of it until the user says so.
  const [destinationTypes, setDestinationTypes] = useState<DiscoveryType[]>(
    () => restored?.destinationTypes ?? [],
  )
  // Summits OSM knows only by their height. Off by default: measured over one
  // 8x10 km box in the Alpine Lakes, 7 peaks are named and 13 are not, so
  // this roughly triples what an analysis costs and how often it refuses.
  const [includeUnnamedPeaks, setIncludeUnnamedPeaks] = useState(
    () => restored?.includeUnnamedPeaks ?? false,
  )

  const [customCsv, setCustomCsv] = useState(() => restored?.customCsv ?? '')
  // Parsed once per edit and shared by the pending markers and the Analyze
  // request, so what the map shows and what gets ranked can't drift apart.
  const csvRows = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  // The destination inputs the user authored, in one spelling: the removal
  // reset reads it (folding the polygon ring in) and so does every removal
  // recorded while these inputs stand, so the two cannot drift apart.
  const destinationScope = useMemo(
    () => authoredScope(destinationTypes, customCsv),
    [destinationTypes, customCsv],
  )

  // Places searched by name — the third destination input. Searching registers
  // the place (map dot + URL persistence); its forecast joins the next Analyze,
  // where the list folds into the ranked request alongside the CSV.
  const searched = useSearchedPlaces()
  // The callbacks are taken by name because they are stable and the object
  // holding them is not, so a dependency list may hold one of these where
  // `searched` would change it on every render. `restore` is renamed on the way
  // out to stay clear of `restorePlace`, which undoes a row removal (#241).
  const { addPlace, removePlace, restore: restoreSearched } = searched

  // Repopulate searched places restored from the URL, once at mount. They show
  // as pending dots until the user runs an Analyze — nothing fetches on load.
  // Both dependencies hold for the life of the component — `restored` is a
  // ref's value and the hook's callbacks are stable — so this runs once.
  useEffect(() => {
    if (restored?.pins?.length) restoreSearched(restored.pins)
  }, [restored, restoreSearched])

  // Whether any destination has been named, by search or by pasting CSV. The
  // caller opens the results panel on it, so there is feedback before any
  // analysis runs. Read off the inputs rather than the derived `pending` list.
  //
  // The FACT is what a caller keys on, never the two lists. `csvRows` is a
  // fresh array per keystroke, so an effect keyed on it runs per character and
  // calls setShowResults(true) against a panel that is already open. React
  // skips a same-value setState only while the fiber has no work pending, which
  // a typing hand never leaves it, so each of those no-op calls schedules a
  // real update from inside a passive effect. Fifty in a row is React error
  // #185, which is what a pasted coordinate list used to produce (issue #185;
  // measured at the 61st character, the first ten being the row yet to parse).
  // The linter's `app-effect-keys` and `destination-inputs-hook` checks fail
  // any effect that takes `csvRows` again.
  const destinationNamed = searched.places.length > 0 || csvRows.length > 0

  return {
    restoredPoints,
    polygon,
    setPolygon,
    polygonAreaKm2,
    destinationTypes,
    setDestinationTypes,
    includeUnnamedPeaks,
    setIncludeUnnamedPeaks,
    customCsv,
    setCustomCsv,
    csvRows,
    destinationScope,
    places: searched.places,
    addPlace,
    removePlace,
    destinationNamed,
  }
}
