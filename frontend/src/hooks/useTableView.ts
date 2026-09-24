import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DestinationResult, SortBy } from '../types'
import type { AnalyzedView } from './analyzeTypes'
import type { ForecastModelOption } from './useCapabilities'
import type { FireProximity } from './useFireProximity'
import type { ComparedModel } from './useModelCompare'
import { chartKey } from '../utils/chartData'
import { NAME_DEFAULT_PX } from '../utils/columnResize'
import type { PendingDestination } from '../utils/customList'
import { downloadCsv, reportCsv } from '../utils/exportCsv'
import {
  type ModelEnd,
  type ModelRow,
  PARTIAL_COVERAGE_NOTE,
  legendEntries,
  modelRowsFor,
  partialModels,
} from '../utils/modelCompare'
import type { WeatherResult } from '../utils/openMeteo'
import { geoKey } from '../utils/points'
import { compareValues } from '../utils/sortResults'
import {
  MODEL_KEY,
  type SortDir,
  type SortKey,
  WILDFIRE_COL,
  WILDFIRE_KEY,
  applyColumnOrder,
  displayedColumns,
  keepUnlistedChoices,
  moveColumn,
  visibleColumns,
  withModelColumn,
} from '../utils/tableColumns'
import { type ViewPrefs, writeViewPrefs } from '../utils/viewPrefs'

// No compared model ends early: one identity, so the memo below hands the same
// empty list on every render where nothing is short.
const NO_PARTIAL_MODELS: readonly ModelEnd[] = []

export interface TableViewInputs {
  /** The stored preferences, read once by App for the mount; only the first render reads them. */
  storedView: ViewPrefs
  /** The displayed rows, in ranking order (`usePresentedReport`). */
  results: DestinationResult[]
  /** The table's own header sort, which reorders rows without re-ranking them. */
  detailSort: { key: SortKey; dir: SortDir }
  /** The ranking, whose metric group leads the columns. */
  sortBy: SortBy
  /** Whether the window is a single hour, which relabels every metric column. */
  pointSample: boolean
  /** The committed report's snapshot: its model, its window, and whether it carries cloud. */
  analyzed: AnalyzedView | null
  /** The deployment's models (`/api/capabilities`), for the analysis model's label. */
  models: readonly ForecastModelOption[]
  /** The panel's ranking model, whose row leads each compared group. */
  forecastModel: string
  /** Whether several models' rows are on display (`useChartCompare`). */
  comparingRows: boolean
  /** The compared models on display, in the picker's order (`compare.shown`). */
  shownModels: readonly ComparedModel[]
  /** Every compared model's answer, keyed by model and destination. */
  compareResults: Readonly<Record<string, WeatherResult>>
  /** Where each compared model's reach ends, by model. */
  compareReachEnds: Readonly<Record<string, number>>
  /** Named destinations no analysis has covered, which the file carries as blank rows. */
  pending: PendingDestination[]
  /** The same destinations as the chart's pseudo-rows (`useChartCompare`), for the legend. */
  pendingRows: DestinationResult[]
  /** The wildfire check (`useFireProximity`), which sorts and fills the wildfire column. */
  fire: FireProximity
}

/**
 * The results table's shape: which columns it draws and in what order, how
 * wide, which rows under a comparison and in what order, and the CSV file
 * that leaves with the same shape.
 *
 * The column rules are pure, in `utils/tableColumns.ts`; the file is
 * `utils/exportCsv.ts`. This hook holds the reader's answers (visibility, the
 * Model column, the order, the widths) and the three effects that keep them.
 */
export function useTableView({
  storedView,
  results,
  detailSort,
  sortBy,
  pointSample,
  analyzed,
  models,
  forecastModel,
  comparingRows,
  shownModels,
  compareResults,
  compareReachEnds,
  pending,
  pendingRows,
  fire,
}: TableViewInputs) {
  // Which columns the table displays (null = use default narrowed set, Set = user choice).
  // The CSV export always gets the full displayedColumns set regardless.
  const [columnVisibility, setColumnVisibility] = useState<Set<string> | null>(
    () => storedView.columns,
  )
  // The Model column's own switch, which is three-valued rather than two.
  //
  // It is in the Columns picker like every other column (TJ, 2026-09-14), but
  // unlike every other column its DEFAULT depends on the report: with one model
  // every row would carry the same name, and with several the column is what
  // tells a destination's rows apart. So `null` means "follow the model count"
  // and a boolean is the reader's own answer, which then stands whatever the
  // count does. Folding it into `columnVisibility` instead would freeze the
  // default the first time the reader touched ANY column, and a later
  // comparison would then come up without the column that explains it.
  const [modelColumn, setModelColumn] = useState<boolean | null>(() => storedView.modelColumn)

  // The order the reader dragged the columns into, or null for the automatic
  // one (#360). A list of keys rather than positions, so a column the list
  // predates keeps its place instead of vanishing; `applyColumnOrder` owns that
  // rule.
  //
  // It is discarded whenever the ranking changes (TJ, 2026-09-14): `Rank by`
  // pulls the ranked metric group to the front, and the maintainer chose to let
  // it win rather than have a stored order suppress the one thing the ranking
  // does to the columns.
  const [columnOrder, setColumnOrder] = useState<readonly string[] | null>(
    () => storedView.columnOrder,
  )

  // Persist the table's shape whenever it changes. One write for all three:
  // they are read back together, and `writeViewPrefs` drops a null rather than
  // storing one, so "the reader has not answered" survives a reload as the
  // absence it is and the report still decides.
  useEffect(() => {
    writeViewPrefs({ columns: columnVisibility, modelColumn, columnOrder })
  }, [columnVisibility, modelColumn, columnOrder])

  // Column widths the user has set (px by key). Held here rather than in the
  // table so a mode switch or the collapse chevron, both of which unmount
  // the table, cannot reset them. Session-only by design: a width is a
  // reading posture, not a preference. Name opens at the measured
  // 25-character width and everything else natural.
  const [tableColWidths, setTableColWidths] = useState<Record<string, number>>({
    name: NAME_DEFAULT_PX,
  })
  // A point-sample flip relabels the metric columns under the SAME keys
  // (the collapsed bare-noun header and the windowed aggregate header both
  // live at one key), so a width fitted under one regime clips the other
  // regime's longer header. The metric columns re-open at their natural width
  // when the regime changes; the identity columns keep theirs, since their
  // labels never change.
  useEffect(() => {
    setTableColWidths((w) =>
      Object.fromEntries(
        Object.entries(w).filter(([k]) => k === 'name' || k === 'type' || k === 'elevation_ft'),
      ),
    )
  }, [pointSample])

  // Whether the report carries the cloud column (#117). Before any report,
  // nothing does, which leaves the cloud columns out of an empty table too.
  const cloudHeld = analyzed?.cloudFetched ?? false
  const csvColumns = useMemo(
    () => displayedColumns(pointSample, sortBy, cloudHeld),
    [pointSample, sortBy, cloudHeld],
  )
  // Every column is on by default: the table scrolls sideways rather than
  // opening narrowed (TJ's call in the #242 review). A stored choice from the
  // Columns picker still wins; null means "all of them".
  const effectiveVisibleKeys = useMemo(() => {
    if (columnVisibility !== null) return columnVisibility
    return new Set([...csvColumns.map((c) => c.key as string), WILDFIRE_KEY])
  }, [columnVisibility, csvColumns])

  // Whether the Model column is drawn: the reader's answer if they gave one,
  // and otherwise the model count. See `modelColumn` above for why the switch
  // has three values rather than two.
  const modelColumnOn = modelColumn ?? comparingRows
  // What the Columns picker shows ticked. The Model column rides beside the
  // visibility set rather than inside it, so it is added here, at the one place
  // that draws the picker.
  const pickerVisibleKeys = useMemo(() => {
    const keys = new Set(effectiveVisibleKeys)
    if (modelColumnOn) keys.add(MODEL_KEY)
    else keys.delete(MODEL_KEY)
    return keys
  }, [effectiveVisibleKeys, modelColumnOn])

  // The ranking pulls its own metric group to the front, and the maintainer
  // chose to let it win over an order the reader set (TJ, 2026-09-14). Keyed on
  // the ranking alone: a live sort, a limit or a bound re-presents the same
  // columns and must not throw the order away.
  //
  // Skipping the first run is what makes the order survive a reload: an effect
  // keyed on a value fires on mount as well as on change, so without the ref
  // the stored order was discarded by the very render that read it.
  const rankedOnce = useRef(false)
  useEffect(() => {
    if (!rankedOnce.current) {
      rankedOnce.current = true
      return
    }
    setColumnOrder(null)
  }, [sortBy])

  // The model every row came from when only one did, so the column says
  // something rather than a dash on a report with no comparison. The ANALYZED
  // model, not the panel's: the numbers are the analysis's, and the picker can
  // move after it.
  const analysisModelLabel =
    models.find((m) => m.id === (analyzed?.forecastModel ?? forecastModel))?.label ?? null

  // Every displayed row under every model that answered, grouped by
  // destination. `modelRowsFor` owns the rules; this only decides whether to
  // ask, and hands it the ranking model first so its row leads each group.
  const comparedTableRows = useMemo(() => {
    if (!comparingRows) return null
    return modelRowsFor(
      results,
      shownModels.map((m) => ({ id: m.id, label: m.label })),
      forecastModel,
      compareResults,
      chartKey,
      compareReachEnds,
    )
  }, [comparingRows, results, shownModels, compareResults, compareReachEnds, forecastModel])

  // The compared models whose rows on display cover fewer hours than the
  // window, in the picker's order. One derivation for the table's footnote and
  // the file's metadata rows, so the two cannot name different models.
  const partial = useMemo(
    () => (comparedTableRows ? partialModels(shownModels, comparedTableRows) : NO_PARTIAL_MODELS),
    [comparedTableRows, shownModels],
  )
  // A string rather than the list, so the memoized table compares it by value.
  const partialNote = partial.length > 0 ? PARTIAL_COVERAGE_NOTE : null

  // The chart-only legend's chips: the rows the table would show, so a chip is
  // a line whenever models are compared. `legendEntries` owns the rules.
  const legend = useMemo(
    () => legendEntries(comparedTableRows ?? results, pendingRows, comparingRows),
    [comparedTableRows, results, pendingRows, comparingRows],
  )

  // Nulls sort last in both directions; string columns use numeric collation so
  // a pasted list numbered 1..100 reads in order. See compareValues. The
  // wildfire column's key is virtual: its value is the warning's mileage, so a
  // clear row and an uncovered row are both null and land last either way.
  const fireWarnings = fire.warnings
  const tableRows = useMemo(() => {
    const value = (r: DestinationResult) =>
      detailSort.key === WILDFIRE_KEY
        ? (fireWarnings.get(geoKey(r.latitude, r.longitude))?.miles ?? null)
        : detailSort.key === MODEL_KEY
          ? ((r as ModelRow).modelLabel ?? null)
          : r[detailSort.key]
    const base = comparedTableRows ?? results
    return [...base].sort((a, b) => compareValues(value(a), value(b), detailSort.dir))
  }, [results, comparedTableRows, detailSort, fireWarnings])

  // Columns displayed in the table (filtered by visibility). The wildfire
  // column is last, shown by default, and toggleable in the Columns picker
  // like everything else (TJ, 2026-08-21, reversing the #256-era always-on
  // rule). While shown, its cells, not the column, say where the check
  // stands (ticking while it runs, answered when it has; ResultsTable owns
  // that). The CSV keeps the stricter rule and carries the column only once
  // the check answered AND the column is shown, because a file's columns
  // must not disagree with the screen's.
  const tableColumns = useMemo(() => {
    const cols = visibleColumns(pointSample, sortBy, effectiveVisibleKeys, cloudHeld)
    const withFire = effectiveVisibleKeys.has(WILDFIRE_KEY) ? [...cols, WILDFIRE_COL] : cols
    return applyColumnOrder(withModelColumn(withFire, modelColumnOn), columnOrder)
  }, [pointSample, sortBy, effectiveVisibleKeys, cloudHeld, modelColumnOn, columnOrder])

  // Every column there is, in the reader's order: what the Columns picker
  // lists, and the list a move is made within.
  //
  // The baseline is this rather than the columns on screen, so a hidden column
  // keeps its place. Ordering only the visible ones would send every hidden
  // column to the end the moment it came back.
  const allColumns = useMemo(
    () => applyColumnOrder([...withModelColumn(csvColumns, true), WILDFIRE_COL], columnOrder),
    [csvColumns, columnOrder],
  )

  // Both surfaces move a column by naming the column and the one it lands on.
  // The key list is what is stored, so the move is made on that rather than on
  // a pair of indices each surface would have to derive the same way.
  const handleColumnMove = useCallback(
    (fromKey: string, toKey: string) => {
      const base = allColumns.map((c) => c.key as string)
      setColumnOrder((prev) => moveColumn(prev ?? base, fromKey, toKey))
    },
    [allColumns],
  )

  // The picker hands back one set for every column. The Model column's answer
  // is pulled out of it and kept separately; the rest is the ordinary set.
  const handleVisibilityChange = useCallback(
    (keys: Set<string>) => {
      const wanted = keys.has(MODEL_KEY)
      if (wanted !== modelColumnOn) setModelColumn(wanted)
      const rest = new Set(keys)
      rest.delete(MODEL_KEY)
      setColumnVisibility(
        keepUnlistedChoices(rest, new Set(allColumns.map((c) => c.key as string)), columnVisibility),
      )
    },
    [modelColumnOn, allColumns, columnVisibility],
  )

  // Download the displayed report (#125): the table's rows and columns, so the
  // file leaves in the shape that is on screen.
  const fireStatus = fire.status
  const fireUncovered = fire.uncovered
  const handleDownloadCsv = useCallback(() => {
    const csv = reportCsv({
      rows: tableRows,
      columns: csvColumns,
      modelColumnOn,
      columnOrder,
      visibleKeys: effectiveVisibleKeys,
      fireStatus,
      fireWarnings,
      fireUncovered,
      window: analyzed?.window ?? null,
      pending,
      modelLabel: analysisModelLabel,
      modelEnds: partial,
    })
    downloadCsv(csv, new Date())
  }, [
    tableRows,
    csvColumns,
    modelColumnOn,
    columnOrder,
    effectiveVisibleKeys,
    fireStatus,
    fireWarnings,
    fireUncovered,
    analyzed,
    pending,
    analysisModelLabel,
    partial,
  ])

  return {
    tableRows,
    tableColumns,
    allColumns,
    pickerVisibleKeys,
    tableColWidths,
    setTableColWidths,
    analysisModelLabel,
    partialNote,
    legend,
    handleColumnMove,
    handleVisibilityChange,
    handleDownloadCsv,
  }
}
