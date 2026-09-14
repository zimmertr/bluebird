// Several models' answers over the charted destinations (issue #232).
//
// A drill-down rather than a knob: it changes nothing about the ranking, the
// markers, the CSV or `present.ts`. Every charted destination is drawn under
// every picked model, so the chart holds one line per pair.
//
// Which models are picked is panel state, held beside the ranking model in the
// model picker and carried in the link. Everything here is pure, so it is
// testable under the node-env Vitest. The fetching lives in
// hooks/useModelCompare.ts and the drawing in the chart.

import { HourlySeries } from '../types'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import { CHART_DASHES } from '../styles'
import { ChartLine, comparedLineLabel, cutSeriesAfter, gridRemapper } from './chartData'
import type { WeatherSeries } from './openMeteo'

const HOUR_MS = 3_600_000

/**
 * Is this one of Open-Meteo's blended products?
 *
 * A blend serves an agency's fine regional model for the first day or two and
 * its coarse global model after that, so a single line on the chart changes
 * model partway along and has to say so.
 *
 * The server publishes the answer as `forecast_models[].blend`, and this reads
 * it rather than testing the id for a `_seamless` suffix: the suffix is
 * Open-Meteo's naming habit rather than a contract, so a blended product added
 * under another name would be drawn as one model with nothing saying otherwise.
 * A model the server did not publish is not a blend, which is the shape every
 * other missing field takes here.
 */
export function isBlend(
  models: readonly ForecastModelOption[],
  modelId: string,
): boolean {
  return models.find((m) => m.id === modelId)?.blend === true
}

/**
 * Where every line on a comparison has to stop: the analyzed window's end, or
 * the nearest model's reach, whichever comes first.
 *
 * Aggregates over ragged windows are the dishonest half of this feature — an
 * "average wind" covering ten days for one model and three for another,
 * presented as one comparison — so the whole chart is clamped to the shortest
 * reach among the models on it, the analysis model included. Only the far end
 * moves: `forecast_hours` counts hours ahead of NOW, and a window in the past
 * is answered by every model alike.
 */
export function compareEndMs(
  windowEndMs: number,
  forecastHours: readonly number[],
  nowMs: number,
): number {
  let end = windowEndMs
  for (const hours of forecastHours) end = Math.min(end, nowMs + hours * HOUR_MS)
  return end
}

/**
 * Has the panel picked a model the analysis never bought?
 *
 * The live/commit split the rest of the app already draws, applied to the
 * comparison: DROPPING a model is pure re-presentation, because its line is
 * drawn from numbers already in hand and unticking it only stops drawing them,
 * while ADDING one is a fetch per charted destination. So a tick after an
 * analysis reports through `commitNeeded` and an untick applies at once — the
 * same asymmetry as narrowing versus widening the elevation band.
 */
export function compareAdded(
  analyzed: readonly string[],
  panel: readonly string[],
): boolean {
  return panel.some((id) => !analyzed.includes(id))
}

/**
 * A line style per model on the chart, the ranking model first.
 *
 * Colour is the DESTINATION's and stays the destination's — it is the same hue
 * the map marker and the table's checkbox wear, and the one the chart uses with
 * no comparison up — so the model rides the other channel. The ranking model
 * takes `CHART_DASHES[0]`, which is solid, so the lines the report was built
 * from read as the plain ones.
 *
 * The published order, which is the order the picker's chips read in, so one
 * set of models always draws the same patterns whoever assembled it and in
 * whatever order. The cost is that selecting a model ahead of another moves
 * the patterns after it; the gain is that a shared link cannot draw a chart
 * its sender never saw. Past the table's length it cycles rather than running
 * out, which repeats a pattern already on the chart; the hover box's label is
 * what separates those lines.
 */
export function compareDashes(ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  ids.forEach((id, i) => {
    out[id] = CHART_DASHES[i % CHART_DASHES.length]
  })
  return out
}

/**
 * The identity of one (model, destination) pair — how a fetched forecast is
 * filed and found again.
 *
 * A pair rather than a location: the same destination is fetched once per
 * picked model, and the same model once per charted destination.
 */
export function pairKey(modelId: string, destinationKey: string): string {
  return `${modelId}|${destinationKey}`
}

/** One charted destination, as the comparison needs it. */
export interface CompareDestination {
  /** `chartKey`: the coordinate identity a colour and a selection key by. */
  key: string
  /** Its place in the ranking, which is what the label leads with. */
  rank: number
  name: string
  latitude: number
  longitude: number
  elevationFt: number | null
  /** Its line colour, the one it already wears in the table and on the map. */
  color: string
}

/** One model on the chart, with the line style its lines take. */
export interface CompareModel {
  id: string
  label: string
  /** An SVG `strokeDasharray`; empty is solid. See `CHART_DASHES`. */
  dash: string
}

/**
 * One fetched model's hourly series on the chart's grid.
 *
 * The values arrive from `weatherSeries` — the same vector-pinned aggregation
 * the analysis itself runs, reached through the same `fetchWeather` — so a
 * compared line and a re-analysis under that model cannot disagree about a
 * number. This only re-indexes them by timestamp, the way a pinned row is
 * re-indexed, since a clamped comparison covers fewer hours than the grid.
 *
 * `aqi` is all nulls and that is not a gap: air quality comes from CAMS
 * whatever forecast model ranks the field, so there is no second answer to
 * compare. The chart withdraws the comparison on that metric rather than
 * drawing lines that could only be identical.
 */
export function modelSeriesOnGrid(
  fetched: WeatherSeries | null | undefined,
  times: readonly number[],
): HourlySeries | null {
  if (!fetched) return null
  const remap = gridRemapper(fetched.times, times)
  return {
    precip_in: remap(fetched.precip_in),
    temp_f: remap(fetched.temp_f),
    wind_mph: remap(fetched.wind_mph),
    // The freezing level rides too: three of the eight models publish it, and a
    // compared line under one that does not is a line of nulls, drawn as nothing.
    freeze_ft: remap(fetched.freeze_ft),
    aqi: times.map(() => null),
  }
}

/**
 * Every line a comparison draws: one per (destination, model) pair.
 *
 * Models outer and destinations inner, so the lines leave in the order the
 * chips read and the ranking model's lines lead. Each line is its
 * DESTINATION's colour and its MODEL's line style, which is the whole of how
 * the chart says two things at once. A pair with no series draws
 * nothing rather than a flat zero — a model Open-Meteo has no data for at that
 * spot must not look like a forecast of calm — and the chip's own state is what
 * says so.
 *
 * `series` is keyed by `pairKey`, which is what lets the ranking model ride
 * this same product: its numbers are already held per destination, so the
 * caller seeds them under its own id and nothing here has to know which pairs
 * cost a fetch and which did not.
 */
export function compareSeries(
  destinations: readonly CompareDestination[],
  models: readonly CompareModel[],
  series: Readonly<Record<string, HourlySeries | null>>,
  times: readonly number[],
  endMs: number | null,
): ChartLine[] {
  const lines: ChartLine[] = []
  for (const model of models) {
    for (const destination of destinations) {
      const held = series[pairKey(model.id, destination.key)]
      if (!held) continue
      lines.push({
        // Prefixed so a pair's key can never collide with a destination's,
        // which is a bare coordinate pair.
        key: `model:${pairKey(model.id, destination.key)}`,
        label: comparedLineLabel(destination.rank, destination.name, model.label),
        color: destination.color,
        dash: model.dash,
        series: cutSeriesAfter(times, held, endMs),
      })
    }
  }
  return lines
}
