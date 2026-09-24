import { useCallback, useState } from 'react'
import type { DestinationResult } from '../types'
import type { AnalyzedView } from './analyzeTypes'
import type { ForecastModelOption } from './useCapabilities'
import { useForecastGrid } from './useForecastGrid'
import type { WindowLimits } from '../utils/forecastWindow'
import {
  GRID_REACH_DEFAULT_FRAC,
  gridAllowed,
  gridLegendLine,
  modelPitchKm,
  type GridStyle,
} from '../utils/forecastGrid'
import type { ShareableState } from '../utils/urlState'

export interface GridLayerInputs {
  /** The state a shared link restored, or null: the style and the coverage. */
  restored: Partial<ShareableState> | null
  /** The Layers checkbox: the reader's preference, not whether it is in effect. */
  showGrid: boolean
  /** The committed report's snapshot, which every fetch input comes from. */
  analyzed: AnalyzedView | null
  /** The held field the lattice covers, or null before any report. */
  universe: DestinationResult[] | null
  /** The panel's model: only what the slider quotes before any report. */
  forecastModel: string
  /** The deployment's models, for each one's finest grid. */
  forecastModels: readonly ForecastModelOption[]
  /** The report's hourly grid (`useTimeline`), which samples are re-indexed onto. */
  forecastTimes: readonly number[]
  /** Moves once per committed report: a new report is a new lattice. */
  analysisSeq: number
  windowLimits: WindowLimits
  aqiForecastDays: number
}

/**
 * The forecast grid layer (#246): the ranked metric as model-resolution cells
 * under the markers, and the Layers popover's sub-choices for it.
 *
 * Every fetch input comes from the `analyzed` snapshot rather than from the
 * panel. The calendar, the model picker and the ranking can all move while a
 * report sits on screen, and a grid built from panel state would paint a
 * window the markers above it never saw. The pitch is the ANALYZED model's
 * finest grid for the same reason. The fetch itself is `useForecastGrid`'s;
 * this hook decides whether the layer is in play and what it is fed.
 */
export function useGridLayer({
  restored,
  showGrid,
  analyzed,
  universe,
  forecastModel,
  forecastModels,
  forecastTimes,
  analysisSeq,
  windowLimits,
  aqiForecastDays,
}: GridLayerInputs) {
  // Which drawing the samples get. Purely presentation over held samples, so
  // switching costs one re-render and nothing upstream.
  const [gridStyle, setGridStyle] = useState<GridStyle>(() => restored?.gridStyle ?? 'smooth')
  // The coverage slider's committed BAR POSITION in [0, 1]. The kilometres
  // derive from the model's pitch, so the position means the same thing on
  // every model. Changing it re-grids on its own, so it is an overlay
  // property, never a knob: commitNeeded does not know it exists.
  const [gridReachFrac, setGridReachFrac] = useState<number>(
    () => restored?.gridReachFrac ?? GRID_REACH_DEFAULT_FRAC,
  )
  // The slider's live position while a drag is in flight, or null at rest.
  // Displaying the draft and committing on release is what keeps a drag from
  // refetching the lattice per pixel.
  const [gridReachDraft, setGridReachDraft] = useState<number | null>(null)
  const commitGridReach = useCallback(() => {
    if (gridReachDraft !== null) {
      setGridReachFrac(gridReachDraft)
      setGridReachDraft(null)
    }
  }, [gridReachDraft])

  // A report carrying archive hours is the one the grid cannot draw over:
  // those hours name no model, so there is no pitch the lattice could honestly
  // be sampled at (`gridAllowed`, #123). The layer is switched out of play
  // rather than off, so the reader's preference survives.
  const gridAvailable = gridAllowed(analyzed)
  // The layer as it actually stands, which every surface reads: the checkbox
  // holds a preference, and this is whether that preference is in effect. One
  // flag, so the fetch, the sub-choices and the legend cannot disagree.
  const gridOn = showGrid && gridAvailable

  const grid = useForecastGrid({
    enabled: gridOn,
    field: universe,
    window: analyzed?.window ?? null,
    model: analyzed?.forecastModel ?? forecastModel,
    times: forecastTimes,
    pitchKm: modelPitchKm(forecastModels, analyzed?.forecastModel),
    reachFrac: gridReachFrac,
    // The live thumb position while dragging: the held field re-cuts to it in
    // real time, and only a committed value can fetch.
    displayReachFrac: gridReachDraft ?? gridReachFrac,
    analysisSeq,
    windowLimits,
    aqiForecastDays,
    cloud: analyzed?.cloudFetched ?? false,
  })
  // The pitch the slider's kilometres read from: the analyzed model once a
  // report is held (what the grid actually draws), the panel's pick before one
  // exists, so the control never quotes the fallback at a reader who has a
  // model selected.
  const gridReachPitchKm = modelPitchKm(forecastModels, analyzed?.forecastModel ?? forecastModel)
  // Something is painted, which is what a legend can be keyed to. A field
  // still filling in has some, so the legend arrives with the first chunk.
  const gridPainted = gridOn && grid.cells.length > 0
  // The legend also opens while the grid is still fetching, so its one line
  // can say the field is coming: after a big analysis the grid inherits its
  // quota debt, and it is minutes before the first samples land.
  const gridCued = gridOn && grid.status === 'loading'
  // On and could not draw. Said out loud, because a switched-on layer with
  // nothing under it and nothing said reads as a broken app.
  const gridFailed = gridOn && grid.status === 'failed'
  const gridLegend = gridLegendLine(gridPainted, grid.pitchKm, grid.paceRemainingS, gridFailed, grid.complete)

  return {
    gridStyle,
    setGridStyle,
    gridReachFrac,
    gridReachDraft,
    setGridReachDraft,
    commitGridReach,
    gridAvailable,
    gridOn,
    grid,
    gridReachPitchKm,
    gridPainted,
    gridCued,
    gridFailed,
    gridLegend,
  }
}

/** What `useGridLayer` hands its callers: the Layers popover and the legend read it whole. */
export type GridLayer = ReturnType<typeof useGridLayer>
