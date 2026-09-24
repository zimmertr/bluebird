import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzeResponse, CustomDestination, DestinationResult, SortBy } from '../types'
import type { AnalyzedView } from './analyzeTypes'
import { NOUN, familyOf, isSnapshotFamily } from '../metrics'
import { snapshotCaption, windowCaption } from '../utils/calendar'
import { pendingDestinations } from '../utils/customList'
import { type Place, isPeakKind } from '../utils/geocode'
import { geoKey } from '../utils/points'
import { type PresentationKnobs, presentResults } from '../utils/present'
import type { SortDir, SortKey } from '../utils/tableColumns'

// Stands in for the analysis snapshot's covered set before the first analysis.
// A module constant rather than an inline `new Set()`, which would be a fresh
// identity on every render and rebuild the pending list underneath the map.
const NO_CUSTOM: ReadonlySet<string> = new Set()

export interface PresentedReportInputs {
  universe: DestinationResult[] | null
  response: AnalyzeResponse | null
  analyzed: AnalyzedView | null
  analysisSeq: number
  /** True while the field is still landing batch by batch (#337). */
  arriving: boolean
  /** The panel's live presentation knobs, which re-present the held field. */
  liveKnobs: PresentationKnobs
  /** The ranking the report is shown under: the panel's, once a field is held. */
  view: { sortBy: SortBy; sortDesc: boolean }
  pointSample: boolean
  /** Every ×-removed key, for the report, which is a snapshot of one analysis. */
  removedKeys: ReadonlySet<string>
  /** The removals still in force under the live scope, for the pending preview. */
  activeRemovedKeys: ReadonlySet<string>
  places: Place[]
  csvRows: CustomDestination[]
  /** The header sort a link carried, read once at mount. */
  restoredTableSort: { key: SortKey; desc: boolean } | null
}

/**
 * The report as the reader sees it: the ranked rows on screen, the named
 * destinations no analysis has covered yet, and what the results bar says
 * about both.
 *
 * Every row derives from `presentResults` over the held field, so the table,
 * the markers and the count cannot disagree about which rows are on screen.
 */
export function usePresentedReport({
  universe,
  response,
  analyzed,
  analysisSeq,
  arriving,
  liveKnobs,
  view,
  pointSample,
  removedKeys,
  activeRemovedKeys,
  places,
  csvRows,
  restoredTableSort,
}: PresentedReportInputs) {
  // Remembers each row's real identity (type + osm_id) by coordinate: from
  // discovered rows (which carry an osm_id) and from searched places (whose
  // geocoding knew their kind and OSM id). Rows echoed through the custom path
  // come back as type "custom" with no osm_id; this map restores them so a
  // peak still links to Peakbagger and shows the right badge.
  const identityMapRef = useRef<Map<string, { type: string; osm_id: string | null }>>(new Map())

  // Registers the whole analyzed field, not only the displayed rows: the refresh
  // echoes the universe (#177), so a destination that ranked below the last cut
  // can surface in the next report and would otherwise come back permanently
  // identity-less (no peak link, wrong marker type).
  useEffect(() => {
    const rows = universe ?? response?.results
    if (!rows) return
    for (const r of rows) {
      if (r.osm_id) identityMapRef.current.set(geoKey(r.latitude, r.longitude), { type: r.type, osm_id: r.osm_id })
    }
  }, [response, universe])

  // Searched places know more than the custom echo carries: their geocoded
  // kind (peak vs not) and OSM id. Seed those identities so their ranked rows
  // link where the feature belongs.
  useEffect(() => {
    for (const p of places) {
      identityMapRef.current.set(geoKey(p.lat, p.lon), {
        // The geocoder's own word for the thing, so the table's Type column
        // says what a place actually is: a searched city reads "City" rather
        // than "Custom", which is a statement about how it got here rather
        // than about what it is. Peaks normalize (OSM says "volcano" for
        // several) because the Peakbagger link keys on that one value;
        // everything else is carried through. "custom" stays the fallback for
        // a pasted coordinate, which genuinely has no kind.
        type: isPeakKind(p.kind) ? 'peak' : p.kind || 'custom',
        osm_id: p.osmId ?? null,
      })
    }
  }, [places])

  // The displayed report, re-derived from the held field on every knob change
  // (#188). presentResults owns the whole decision (band, removals, ranking,
  // cut).
  //
  // Rows returned without an osm_id (a refresh's custom echo) are re-tagged from
  // the remembered discovery identities by coordinate; genuine custom-CSV rows
  // simply have no match and pass through unchanged.
  const presented = useMemo(
    () => presentResults(universe, liveKnobs, removedKeys),
    [universe, liveKnobs, removedKeys],
  )
  const results = useMemo(
    () =>
      presented.rows.map((r) => {
        if (r.osm_id) return r
        const id = identityMapRef.current.get(geoKey(r.latitude, r.longitude))
        return id ? { ...r, type: id.type, osm_id: id.osm_id } : r
      }),
    [presented],
  )

  // The window the displayed rows describe, or null when nothing is displayed.
  // One string serves as both the line and its own tooltip: a narrow panel
  // ellipsizes it, and a truncated date range that cannot be recovered is
  // worse than no date range at all.
  const windowTitle =
    results.length > 0 && analyzed !== null
      ? isSnapshotFamily(familyOf(view.sortBy))
        ? // A snapshot ranking is not a reading of the window at all (#449), so
          // the caption names the day its grid is from instead. Null where the
          // report carries no date, which is the same report whose rows all
          // read N/A: there is nothing to be "as of".
          analyzed.snowAnalysisDate === null
          ? null
          : snapshotCaption(NOUN[familyOf(view.sortBy)], analyzed.snowAnalysisDate)
        : windowCaption(analyzed.kind, analyzed.window.startMs, analyzed.window.endMs, pointSample)
      : null

  // The detail-column sort, held here rather than inside ResultsTable (#125).
  //
  // Clicking one of the ranking columns re-cuts the whole field through
  // the panel knob and is already answered by `results` above. Clicking any
  // other column is a reading aid: it reorders the rows on screen without
  // changing which rows they are. A download has to leave in the order on
  // screen, so the table cannot be the only thing that knows that order.
  //
  // `results` therefore stays in ranking order for the markers, the legend,
  // the fire lookup and the chart's default selection, while the caller's
  // `tableRows` applies this sort for the table and the CSV. Handing the
  // sorted rows to the map would quietly make the markers follow a detail
  // sort, and the types would not complain.
  const [detailSort, setDetailSort] = useState<{ key: SortKey; dir: SortDir }>(() =>
    restoredTableSort
      ? { key: restoredTableSort.key, dir: restoredTableSort.desc ? 'desc' : 'asc' }
      : { key: view.sortBy, dir: view.sortDesc ? 'desc' : 'asc' },
  )

  // A link's header sort is for the report the link reopens, which is the
  // FIRST one after mount, so it outlives that report's arrival. The ranking
  // it was made under is held beside it: a change to either drops the sort
  // like any other, as does every report after the first.
  const keepRestoredSortRef = useRef(
    restoredTableSort ? { sortBy: view.sortBy, sortDesc: view.sortDesc, seq: analysisSeq } : null,
  )

  // Follow the ranking: on a new report, and on a live ranking change, drop any
  // detail-column sort and read in the order the rows arrived in.
  //
  // Keyed on the report rather than on the rows, which are a new array on every
  // live cap or bound change and would otherwise throw away a sort the
  // user just asked for.
  useEffect(() => {
    const kept = keepRestoredSortRef.current
    if (kept && kept.sortBy === view.sortBy && kept.sortDesc === view.sortDesc) {
      // The mount run, and then the first report, which the link's sort is for.
      if (analysisSeq === kept.seq) return
      if (analysisSeq === kept.seq + 1) {
        keepRestoredSortRef.current = null
        return
      }
    }
    keepRestoredSortRef.current = null
    setDetailSort({ key: view.sortBy, dir: view.sortDesc ? 'desc' : 'asc' })
  }, [view.sortBy, view.sortDesc, analysisSeq])

  // The header sort as a link carries it: null while it is the ranking's own
  // order, which is what the table shows when nobody clicked a header.
  const tableSort = useMemo(
    () =>
      detailSort.key === view.sortBy && (detailSort.dir === 'desc') === view.sortDesc
        ? null
        : { key: detailSort.key, desc: detailSort.dir === 'desc' },
    [detailSort, view.sortBy, view.sortDesc],
  )

  // A stable identity for the table's callback, for the reason `NO_TIMES`
  // exists: an inline arrow is a new prop on every render.
  const sortDetail = useCallback(
    (key: SortKey, dir: SortDir) => setDetailSort({ key, dir }),
    [],
  )

  // Custom destinations no analysis has covered yet, drawn as neutral pending
  // dots and un-forecasted rows. Pasted CSV rows count: a list should show up
  // the moment it's pasted, not only once an analysis returns.
  //
  // Measured against the analysis snapshot, never against `results`: those are
  // the top-`limit` rows, so asking them turned every added destination below
  // the cut back into an un-forecasted row (#205). Before the first analysis
  // there is no snapshot, so everything named is pending, which is the point.
  const pending = useMemo(
    () =>
      pendingDestinations(
        csvRows,
        places,
        analyzed?.customKeys ?? NO_CUSTOM,
        activeRemovedKeys,
      ),
    [csvRows, places, analyzed, activeRemovedKeys],
  )

  // The table bar's row count: shown, of what the knobs admit, and (only when
  // a forecast bound is hiding some) of what was analyzed. An elected top-N
  // cut appends what it left out, since "of 1,500" would otherwise read as the
  // whole area. Null before a report exists, so the bar carries no count for
  // the pending-rows-only case.
  const rowCount = useMemo(() => {
    if (response === null) return null
    // "so far" while the field is still arriving (#337): the rows are real and
    // ranked, but both numbers are a floor and the order moves as the rest of
    // the batches land. Two words on the count that is already there, rather
    // than a second line or a box, because the count is the thing that is
    // provisional.
    const tail = arriving ? ' so far' : ''
    const shown = `${results.length.toLocaleString()} of ${presented.eligible.toLocaleString()}${tail}`
    // Comma-joined rather than parenthesized: the bar already wraps the whole
    // thing in parentheses, and a nested pair reads as a typo.
    if (presented.excluded > 0) {
      const analyzedCount = (presented.eligible + presented.excluded).toLocaleString()
      return `${shown} matching, ${analyzedCount} analyzed`
    }
    if (response.truncated && response.total_found != null) {
      return `${shown}, ${response.total_found.toLocaleString()} found`
    }
    return shown
  }, [response, results.length, presented.eligible, presented.excluded, arriving])

  // Why the table is empty, when it is. Three ways to get here and three
  // different next moves, and the newest one is the most easily mistaken for a
  // failed analysis: the destinations were found and forecast, the filters
  // simply admit none of them.
  const emptyReason = useMemo(() => {
    if (response === null || results.length > 0) return null
    if (presented.excluded > 0 && presented.eligible === 0) {
      return `No destinations match these filters. ${(
        presented.eligible + presented.excluded
      ).toLocaleString()} were analyzed.`
    }
    if (removedKeys.size > 0) {
      return 'All rows have been removed from this analysis. Use Removed above to restore them.'
    }
    return 'No destinations found. Try a larger area.'
  }, [response, results.length, presented.eligible, presented.excluded, removedKeys])

  return {
    results,
    windowTitle,
    detailSort,
    sortDetail,
    tableSort,
    pending,
    rowCount,
    emptyReason,
  }
}

/** What `usePresentedReport` hands its callers; the results sheet reads it whole. */
export type PresentedReport = ReturnType<typeof usePresentedReport>
