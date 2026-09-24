import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DestinationResult, HourlySeries, SortBy } from '../types'
import type { AnalyzedView } from './analyzeTypes'
import type { ForecastModelOption } from './useCapabilities'
import { useChartSelection } from './useChartSelection'
import { useModelCompare } from './useModelCompare'
import { allocateColors } from '../utils/chartColors'
import { alignRowToGrid, chartKey } from '../utils/chartData'
import { type PendingDestination, pendingAsResult } from '../utils/customList'
import type { WindowLimits } from '../utils/forecastWindow'
import {
  type ModelRow,
  drawnModelIds,
  pairColor,
  pairKeysFor,
  seedPairColors,
} from '../utils/modelCompare'
import { modelRows, pruneHidden, shownModels, toggleHidden } from '../utils/modelVisibility'
import { paceWaitLine } from '../utils/pacing'
import { geoKey } from '../utils/points'

export interface ChartCompareInputs {
  /** The displayed rows, in ranking order: what the chart and the compare fetch cover. */
  results: DestinationResult[]
  /** Named destinations no analysis has covered, which the chart tracks too. */
  pending: PendingDestination[]
  /** The ranking the report is shown under, which the chart opens on. */
  sortBy: SortBy
  /** The committed report's snapshot: its model and the models it bought. */
  analyzed: AnalyzedView | null
  analysisSeq: number
  /** The deployment's models (`/api/capabilities`). */
  models: readonly ForecastModelOption[]
  /** The panel's ranking model and its ticked comparisons. */
  forecastModel: string
  comparedModels: readonly string[]
  /** The report's hourly grid (`useTimeline`'s `forecastTimes`). */
  times: number[]
  windowLimits: WindowLimits
  /** Whether the chart panel is on screen (`useResultsLayout`). */
  chartShowing: boolean
}

/**
 * The comparison chart (#232): which destinations are charted and in what
 * colour, and several models' answers over them.
 *
 * The selection is `useChartSelection`'s and the fetch is `useModelCompare`'s;
 * this hook joins them. It owns the one decision neither can make alone: a
 * colour per LINE, which under a comparison is a colour per (destination,
 * model) pair, allocated before the lines are composed so the chart, the
 * table's checkboxes and the Models popover agree. The rules are pure, in
 * `utils/modelCompare.ts` and `utils/modelVisibility.ts`.
 */
export function useChartCompare({
  results,
  pending,
  sortBy,
  analyzed,
  analysisSeq,
  models,
  forecastModel,
  comparedModels,
  times,
  windowLimits,
  chartShowing,
}: ChartCompareInputs) {
  // Models whose lines the reader has put down (#232). Presentation and
  // nothing else: the forecasts behind them are bought either way, so this
  // rides in no link and no storage, and a reload comes back showing
  // everything the comparison paid for.
  const [hiddenModels, setHiddenModels] = useState<ReadonlySet<string>>(() => new Set())
  const toggleHiddenModel = useCallback(
    (id: string) => setHiddenModels((prev) => toggleHidden(prev, id)),
    [],
  )

  // Everything the chart tracks: the displayed rows plus the pending
  // destinations no analysis has covered. Pending rows ride along as
  // series-less pseudo-rows so a searched place is colored and selected the
  // moment it appears, and since colors stick to the coordinate key, the hue
  // it wears before the analysis is the hue its line draws in after.
  const pendingRows = useMemo(() => {
    const have = new Set(results.map((r) => geoKey(r.latitude, r.longitude)))
    return pending
      .filter((d) => !have.has(geoKey(d.latitude, d.longitude)))
      .map(pendingAsResult)
  }, [results, pending])
  const chartCandidates = useMemo(() => [...results, ...pendingRows], [results, pendingRows])
  const chart = useChartSelection(chartCandidates, sortBy)

  // Every DISPLAYED row as a point the comparison can fetch for. Wider than
  // the charted set: the results table shows one row per model for everything
  // on screen, so the numbers are bought for everything on screen. Keyed by
  // `chartKey` like the charted ones, so one pair key serves both readers.
  const comparePoints = useMemo(
    () =>
      results.map((r) => ({
        key: chartKey(r),
        latitude: r.latitude,
        longitude: r.longitude,
        elevationFt: r.elevation_ft,
      })),
    [results],
  )

  // The rank comes from `results`, the ranking order the markers and the
  // legend already read, not from the table's rows, whose numbering follows a
  // detail-column sort.
  const chartedDestinations = useMemo(() => {
    const rankByKey = new Map(results.map((r, i) => [chartKey(r), i + 1]))
    return chart.selectedRows
      .filter((r) => rankByKey.has(chartKey(r)))
      .map((r) => ({
        key: chartKey(r),
        rank: rankByKey.get(chartKey(r)) as number,
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        elevationFt: r.elevation_ft,
        // The colour it already wears in the table and on the map. A compared
        // chart says two things at once, and this is the one it has always
        // said; the model is the line style.
        color: chart.colorFor(r),
      }))
    // Kept: the rule asks for the whole `chart` object, which useChartSelection
    // rebuilds every render. `colorFor` cannot answer differently for a row
    // that has not changed, so the two listed values are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart.selectedRows, results])
  // The ranking model's own numbers per destination, on the chart's grid: a
  // pinned row carries its own stamps, so the alignment the chart does for its
  // rows has to happen here too or a pin would compare against the wrong hours.
  const chartedSeries = useMemo(() => {
    const out: Record<string, HourlySeries | null> = {}
    for (const row of chart.selectedRows) {
      out[chartKey(row)] = alignRowToGrid(row, times).series ?? null
    }
    return out
  }, [chart.selectedRows, times])
  // Every model the panel has selected, ranking first: the Models popover's
  // rows. The SELECTION rather than the chart, so a model ticked before the
  // next Analyze already has a row.
  const selectedModelRows = useMemo(
    () => modelRows(models, forecastModel, comparedModels),
    [models, comparedModels, forecastModel],
  )

  // A colour per LINE, which under a comparison means a colour per
  // (destination, model) PAIR. Allocated here rather than inside
  // `useModelCompare` because the allocation has to happen BEFORE the lines
  // are composed, and `drawnModelIds` is what lets both places agree about
  // which pairs exist without the hook having to answer first.
  const chartedPairKeys = useMemo(() => {
    const drawn = shownModels(
      drawnModelIds(
        comparedModels,
        analyzed?.compareModels ?? [],
        models,
        analyzed?.forecastModel ?? null,
      ).map((id) => ({ id })),
      hiddenModels,
    )
    return pairKeysFor(
      drawn.map((m) => m.id),
      chartedDestinations.map((d) => d.key),
    )
  }, [analyzed, models, chartedDestinations, comparedModels, hiddenModels])
  const chartedPairColors = useMemo(
    () =>
      seedPairColors(
        allocateColors(chart.colorByKey, chartedPairKeys),
        analyzed?.forecastModel,
        chartedDestinations,
      ),
    [analyzed, chart.colorByKey, chartedDestinations, chartedPairKeys],
  )
  // The allocation above is for the frame that draws the lines; this is what
  // makes it stick, so a pair hidden and shown again comes back the colour it
  // was rather than taking the next one off the end.
  const chartedPairsKey = chartedPairKeys.join('|')
  useEffect(() => {
    chart.rememberColors(chartedPairKeys)
    // Kept: `chartedPairsKey` is the joined VALUE of `chartedPairKeys`, which
    // is a new array whenever anything above it re-derives. Listing the array
    // and the hook object would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartedPairsKey])

  // Comparing models is a drill-down rather than a knob: it touches nothing
  // the ranking reads. Never on air quality, which comes from CAMS whatever
  // forecast model ranked the field, so a comparison there could only draw
  // the same line twice.
  const compare = useModelCompare({
    enabled: chart.metric !== 'aqi',
    destinations: chartedDestinations,
    rows: comparePoints,
    heldSeries: chartedSeries,
    analyzed,
    analysisSeq,
    models,
    picked: comparedModels,
    fetchable: analyzed?.compareModels ?? [],
    hidden: hiddenModels,
    colors: chartedPairColors,
    times,
    windowLimits,
  })

  // A model put down and later selected again comes back DRAWN, so a flag
  // outlives its model by exactly nothing. Keyed on the panel's selection
  // rather than on the chart's, because that is where a model leaves.
  const selectedModelsKey = [forecastModel, ...comparedModels].join(',')
  useEffect(() => {
    setHiddenModels((prev) => pruneHidden(prev, selectedModelsKey.split(',')) ?? prev)
  }, [selectedModelsKey])

  // What colour a table row's chart checkbox wears. With a comparison up, a
  // line is a (destination, model) pair, so two rows for one place draw two
  // lines in two colours and their checkboxes have to say which is which.
  // Keyed off the same `chartedPairColors` the chart reads. It falls back to
  // the destination's own colour wherever a pair has none.
  //
  // Keyed on `chart.colorFor` rather than on `chart`: the selection hook
  // returns a new object every render, so keying on it handed the memoized
  // table a new callback every render, and the table re-mapped its rows on
  // every overlay toggle and keystroke.
  const colorFor = chart.colorFor
  const rowChartColor = useCallback(
    (row: DestinationResult) =>
      pairColor(chartedPairColors, (row as ModelRow).modelId, chartKey(row), colorFor(row)),
    [chartedPairColors, colorFor],
  )

  // Whether the table shows one row per model. A single selected model is the
  // report as it always was: every row would carry the same model name.
  const comparingRows = compare.shown.length > 1

  // The comparison's wait, on the one surface that is always there (#433).
  // The forecasts behind the table's per-model rows are bought as soon as a
  // second model is selected, where `ModelCompare` says the same wait only
  // while the CHART draws a comparison. Null while the chart has it, because
  // one wait said twice is the reason it was put in one module.
  const compareWait = compare.active && chartShowing ? null : paceWaitLine(compare.paceRemainingS)

  return {
    chart,
    compare,
    pendingRows,
    selectedModelRows,
    hiddenModels,
    toggleHiddenModel,
    rowChartColor,
    comparingRows,
    compareWait,
  }
}
