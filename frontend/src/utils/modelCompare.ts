// Several models' answers at ONE destination (issue #232).
//
// A drill-down rather than a knob: it changes nothing about the ranking, the
// markers, the CSV or `present.ts`, and it exists only while exactly one
// destination is charted — which is what frees colour to mean model instead of
// destination, since there is only one destination left for it to mean.
//
// Everything here is pure, so it is testable under the node-env Vitest. The
// fetching lives in hooks/useModelCompare.ts and the drawing in the chart.

import { HourlySeries } from '../types'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import { colorForIndex } from './chartColors'
import { gridRemapper } from './chartData'
import type { WeatherSeries } from './openMeteo'

/**
 * How many models one chart may compare, the analysis model included.
 *
 * Three is the maintainer's call, and the cost is small rather than free. The
 * issue's table read "three models are free", computed from three variables;
 * the browser sends nine, so the weight formula's variable factor —
 * max(1, variables x models / 10) — leaves the floor at two models:
 *
 *   models in one request   series   factor   weight for one location
 *   1                        9       1.00     1.00
 *   2                       18       1.80     1.80
 *   3                       27       2.70     2.70
 *
 * What Bluebird Forecast actually spends is less than that table, because the
 * analysis model's numbers are already held: a three-model comparison buys two
 * model series. It buys them as one single-model request each (see
 * `useModelCompare`), so the true cost is 2 weighted calls for one destination
 * over a window of 14 days or shorter, against the ~100 an ordinary analysis
 * spends on a polygon. One request naming both would cost 1.8 — the 0.2 it
 * gives up buys a per-model answer, which the multi-model response cannot
 * give: measured 2026-09-12 at 46.5,8.0, `models=gfs_hrrr,ecmwf_ifs025`
 * answers HTTP 200 with BARE `precipitation` keys and no suffixed pair at all,
 * so one model being outside its domain takes its companion's label with it.
 */
export const MAX_COMPARE_MODELS = 3

const HOUR_MS = 3_600_000

/**
 * Is this one of Open-Meteo's blended products?
 *
 * The `_seamless` suffix IS the blend in Open-Meteo's own vocabulary: each one
 * serves an agency's fine regional model for the first day or two and its
 * coarse global model after that, so a single line on the chart changes model
 * partway along and has to say so. Read off the id rather than out of the
 * summary prose, which says the same thing ("Blends in the HRRR model.") in a
 * sentence written for a human.
 */
export function isBlend(modelId: string): boolean {
  return modelId.endsWith('_seamless')
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
 * The models that can still be added to a comparison.
 *
 * Three exclusions, and the third is the one worth naming: a model whose reach
 * stops before the analyzed window even starts is not offered, because adding
 * it would clamp every line on the chart to nothing. The calendar already
 * refuses days past a model's reach for the same reason.
 */
export function addableModels(
  models: readonly ForecastModelOption[],
  analysisModelId: string,
  added: readonly string[],
  window: { startMs: number; endMs: number },
  nowMs: number,
): ForecastModelOption[] {
  if (added.length >= MAX_COMPARE_MODELS - 1) return []
  return models.filter(
    (m) =>
      m.id !== analysisModelId &&
      !added.includes(m.id) &&
      compareEndMs(window.endMs, [m.forecastHours], nowMs) > window.startMs,
  )
}

/**
 * A colour per compared model, from the same ramp destinations draw from.
 *
 * The destination keeps the colour it was assigned when it was first charted —
 * that colour is also its swatch in the table, and a line that changed hue on
 * being compared would break the one identity the chart holds on to. So the
 * added models take the ramp from the top and skip the destination's own
 * colour, which is the only collision possible on one chart.
 */
export function compareColors(
  baseColor: string,
  ids: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  let next = 0
  for (const id of ids) {
    let color = colorForIndex(next++)
    while (color.toLowerCase() === baseColor.toLowerCase()) color = colorForIndex(next++)
    out[id] = color
  }
  return out
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
 * compare. The chart withdraws the control on that metric rather than drawing
 * lines that could only be identical.
 */
export function compareSeries(
  fetched: WeatherSeries | null | undefined,
  times: readonly number[],
): HourlySeries | null {
  if (!fetched) return null
  const remap = gridRemapper(fetched.times, times)
  return {
    precip_in: remap(fetched.precip_in),
    temp_f: remap(fetched.temp_f),
    wind_mph: remap(fetched.wind_mph),
    aqi: times.map(() => null),
  }
}
