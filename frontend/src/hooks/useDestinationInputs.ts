import { useEffect, useMemo, useState } from 'react'
import { useSearchedPlaces } from './useSearchedPlaces'
import { type PresetListsInputs, usePresetLists } from './usePresetLists'
import type { DiscoveryType, GeoPolygon } from '../types'
import { parseCustomCsv } from '../utils/customDestinations'
import { bboxAreaKm2, ringToPts } from '../utils/drawGeometry'
import { restoredFramePoints } from '../utils/mapFraming'
import { authoredScope } from '../utils/removals'
import type { ShareableState } from '../utils/urlState'

/** The largest of these rings' areas, by the box around each, or null for none. */
function largestKm2(rings: readonly GeoPolygon[]): number | null {
  return rings.length === 0 ? null : Math.max(...rings.map((ring) => bboxAreaKm2(ringToPts(ring)) ?? 0))
}

/**
 * The ways a reader names destinations (record 0306): the areas drawn and the
 * kinds they look for, the ready-made lists added, the reader's own
 * coordinates, and the places searched by name or picked on the map.
 *
 * One hook because they are one question — what an analysis will rank — and
 * the values read across them (`destinationScope`, `destinationNamed`)
 * need all of them. Nothing here fetches forecasts: each input is held until
 * the next Analyze, which is where the spend boundary is. The lists' rows are
 * fetched as they are added, which costs no upstream call.
 */
export function useDestinationInputs(
  restored: Partial<ShareableState> | null,
  listEvents: Pick<PresetListsInputs, 'onArrived' | 'onFailed'>,
) {
  // Every point destination the URL restores (CSV rows and searched places),
  // built once so the memoized MapView frames them on load beside the ring.
  const restoredPoints = useMemo(
    () => restoredFramePoints(restored?.customCsv ?? '', restored?.pins ?? []),
    [restored],
  )

  // Every finished area, in the order drawn. One changes only at Done, never
  // mid-draw, so a count, a cue or the link never reads a half-drawn shape.
  const [areas, setAreas] = useState<GeoPolygon[]>(() => restored?.areas ?? [])
  // The ring on the map while an area is drawn or edited, as the map reports
  // each edit, or null outside draw mode. Its own state rather than an area,
  // so Cancel leaves `areas` as it was.
  const [draft, setDraft] = useState<GeoPolygon | null>(null)
  // Read off the rings rather than reported by the map, because the map can
  // only report an area once it has loaded: a ring restored from a link
  // printed its point count beside a blank area line until the reader edited
  // it (#429). A derived value cannot lag the ring it describes.
  const draftAreaKm2 = useMemo(() => largestKm2(draft ? [draft] : []), [draft])
  // Each finished area's size, in order, which its chip prints.
  const areaKm2s = useMemo(() => areas.map((area) => bboxAreaKm2(ringToPts(area)) ?? 0), [areas])
  // What the area cap reads: the largest area drawn or being drawn, since the
  // pod refuses each area on its own.
  const largestAreaKm2 = useMemo(() => largestKm2(draft ? [...areas, draft] : areas), [areas, draft])
  // Which kinds the areas look for, as a set — several are found in one
  // Overpass query. Nothing is checked by default: discovery is the input
  // that needs an area and costs an upstream query, so a fresh session
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
  // The ready-made lists, held apart from the box so several can stand.
  const presetLists = usePresetLists({ initial: restored?.presetLists ?? [], ...listEvents })
  // The box's own rows, parsed once per edit: what its count says.
  const ownRows = useMemo(() => parseCustomCsv(customCsv), [customCsv])
  // The box's rows and every arrived list's, shared by the pending markers
  // and the Analyze request, so what the map shows and what gets ranked
  // can't drift apart.
  const csvRows = useMemo(
    () => (presetLists.rows.length === 0 ? ownRows : [...presetLists.rows, ...ownRows]),
    [ownRows, presetLists.rows],
  )
  // The destination inputs the user authored, in one spelling: the removal
  // reset reads it (folding the areas in) and so does every removal
  // recorded while these inputs stand, so the two cannot drift apart.
  const destinationScope = useMemo(
    () => authoredScope(destinationTypes, customCsv, presetLists.ids),
    [destinationTypes, customCsv, presetLists.ids],
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
    areas,
    setAreas,
    draft,
    setDraft,
    draftAreaKm2,
    areaKm2s,
    largestAreaKm2,
    destinationTypes,
    setDestinationTypes,
    includeUnnamedPeaks,
    setIncludeUnnamedPeaks,
    customCsv,
    setCustomCsv,
    ownRows,
    presetLists,
    csvRows,
    destinationScope,
    places: searched.places,
    addPlace,
    removePlace,
    destinationNamed,
  }
}

/** What `useDestinationInputs` hands its callers; the controls drawer reads it whole. */
export type DestinationInputs = ReturnType<typeof useDestinationInputs>
