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

import { DestinationResult, HourlySeries } from '../types'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import {
  ChartLine,
  comparedLineLabel,
  cutSeriesAfter,
  gridRemapper,
} from './chartData'
import { HOUR_MS } from './forecastWindow'
import type { WeatherResult } from './openMeteo'
import type { WeatherSeries } from './openMeteoAggregate'

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
 * The identity of one (model, destination) pair — how a fetched forecast is
 * filed and found again.
 *
 * A pair rather than a location: the same destination is fetched once per
 * picked model, and the same model once per charted destination.
 */
export function pairKey(modelId: string, destinationKey: string): string {
  return `${modelId}|${destinationKey}`
}

/**
 * What colour one (destination, model) pair wears. **The one derivation.**
 *
 * A colour identifies a LINE, and a line is a pair: two places under two
 * models is four lines in four colours. Two surfaces show that — the chart
 * draws the lines, and the results table's chart checkbox stands beside the
 * row that produces one — so both call THIS rather than each indexing the map
 * their own way. Two lookups over one map is one spelling away from two
 * answers, which is the class of bug `fillColor` is shared to prevent.
 *
 * `fallback` is the DESTINATION's own colour: the hue its marker and its table
 * checkbox already wear. It is the right answer wherever a pair has none — a
 * report with one model selected, a row nobody has charted, and the one frame
 * before the allocator has run.
 */
export function pairColor(
  colors: Readonly<Record<string, string>>,
  modelId: string | undefined,
  destinationKey: string,
  fallback: string,
): string {
  if (!modelId) return fallback
  return colors[pairKey(modelId, destinationKey)] ?? fallback
}

/**
 * One place a compared model is fetched FOR: everything the request needs and
 * nothing the chart does.
 *
 * Separate from `CompareDestination` because the fetch now covers every
 * DISPLAYED row, where the chart draws only the charted ones. A row nobody has
 * charted still needs its numbers, because the results table shows one row per
 * model and a blank there would read as a forecast rather than as an absence.
 */
export interface ComparePoint {
  /** `chartKey`: the coordinate identity a colour, a selection and a pair key by. */
  key: string
  latitude: number
  longitude: number
  elevationFt: number | null
}

/** One charted destination, as the chart's lines need it. */
export interface CompareDestination extends ComparePoint {
  /** Its place in the ranking, which is what the label leads with. */
  rank: number
  name: string
  /** Its line colour, the one it already wears in the table and on the map. */
  color: string
}

/** One model on the chart. Its lines take a colour per DESTINATION, not per model. */
export interface CompareModel {
  id: string
  label: string
}

/**
 * The EXTRA models the chart is drawing: selected in the panel, bought by the
 * last Analyze, published by this deployment, and never the ranking model,
 * which is on the chart by being the report.
 *
 * Pure and shared, because two callers need the same answer from different
 * places: the hook, which fetches and draws them, and `App.tsx`, which
 * allocates a colour per (destination, model) pair before the hook composes a
 * line. Two spellings of this filter would put a line on the chart with no
 * colour allocated, or a colour allocated for a line nobody draws.
 *
 * Panel order, so the pairs are allocated in the order the picker reads.
 */
export function drawnModelIds(
  picked: readonly string[],
  fetchable: readonly string[],
  published: readonly { id: string }[],
  rankingModel: string | null,
): string[] {
  return picked.filter(
    (id) =>
      id !== rankingModel &&
      fetchable.includes(id) &&
      published.some((m) => m.id === id),
  )
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
 * chips read and the ranking model's lines lead. **Every line has a colour of
 * its own**: `colors` is keyed by `pairKey`, so nine lines are nine colours,
 * and the pairs for the RANKING model are seeded with their destinations' own
 * colours — the hue the marker and the table checkbox already wear — so a
 * chart with nothing compared draws exactly as it always did. A pair with no
 * colour yet falls back to its destination's, which is the closest true thing
 * to say for the one frame before the allocator has run. The label names rank,
 * destination and model on every entry, which is how a line is identified. A
 * pair with no series draws nothing rather than a flat zero — a model
 * Open-Meteo has no data for at that spot must not look like a forecast of
 * calm — and the note beside the metric buttons is what says so.
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
  colors: Readonly<Record<string, string>>,
): ChartLine[] {
  const lines: ChartLine[] = []
  for (const model of models) {
    for (const destination of destinations) {
      const pair = pairKey(model.id, destination.key)
      const held = series[pair]
      if (!held) continue
      lines.push({
        // Prefixed so a pair's key can never collide with a destination's,
        // which is a bare coordinate pair.
        key: `model:${pair}`,
        label: comparedLineLabel(destination.rank, destination.name, model.label),
        color: pairColor(colors, model.id, destination.key, destination.color),
        series: cutSeriesAfter(times, held, endMs),
      })
    }
  }
  return lines
}

/**
 * One table row, tagged with the model its numbers came from.
 *
 * The tag rides beside `DestinationResult` rather than on it, because that
 * type is the API's response shape and a model is a thing the browser knows
 * about a row it is displaying. `tableColumns.ts` reads it through a virtual
 * key, the way the wildfire distance does.
 */
export interface ModelRow extends DestinationResult {
  modelId: string
  modelLabel: string
  /**
   * Where the DESTINATION placed in the ranking, which every one of its model
   * rows shares.
   *
   * The table numbers its rows by position when there is one row per
   * destination and the two are the same thing. They stop being the same thing
   * here: eight rows for one place would count off 1 to 8 and read as eight
   * places. The number is the destination's, so it repeats down its group.
   */
  rank: number
}

/**
 * Every displayed row under every selected model: the results table's rows
 * when a comparison is up.
 *
 * **Grouped by destination, not by model.** A reader comparing models is
 * asking "what do they say about THIS place", so the eight answers belong
 * next to each other; sorting a metric column afterwards interleaves them,
 * which is the reader's choice rather than the default.
 *
 * The ranking model's row is the report's own — it is already in hand, it
 * already ranked, and re-deriving it from a second fetch could only disagree
 * with the ranking. Every other row takes the destination's identity from the
 * report and its weather from that model's own aggregates, which the compare
 * fetch already computes and used to discard.
 *
 * **Air quality is copied, not fetched again.** It comes from one source
 * whatever model ranks the field, so a compared row carries the same numbers
 * as the report's, which is the truth rather than a blank.
 *
 * A pair with nothing fetched contributes NO row. A model outside its domain
 * at that spot has no numbers, and a row of zeros there would read as a
 * forecast of calm; the panel's own warning is what says a model came back
 * empty. So a destination need not appear once per model — it appears once
 * per model that answered.
 */
export function modelRowsFor(
  rows: readonly DestinationResult[],
  models: readonly CompareModel[],
  rankingId: string,
  fetched: Readonly<Record<string, WeatherResult>>,
  keyOf: (row: DestinationResult) => string,
): ModelRow[] {
  const out: ModelRow[] = []
  rows.forEach((row, at) => {
    const rank = at + 1
    for (const model of models) {
      if (model.id === rankingId) {
        out.push({ ...row, rank, modelId: model.id, modelLabel: model.label })
        continue
      }
      const held = fetched[pairKey(model.id, keyOf(row))]
      if (!held) continue
      const { series, ...aggregates } = held
      out.push({
        ...row,
        // The weather aggregates are this model's. Everything the spread above
        // leaves standing is the destination's own — name, type, coordinates,
        // elevation — plus the AQI aggregates, which are not in `aggregates`
        // and must not be: one source answers them whatever model ranks.
        ...aggregates,
        // The hourly AQI column rides as nulls on the model's own grid, for
        // the reason `modelSeriesOnGrid` gives: the numbers exist, but on the
        // report's grid rather than this one, and re-indexing them here to
        // carry a value no surface reads would be work in aid of a duplicate.
        series: series ? { ...series, aqi: series.times.map(() => null) } : null,
        series_times: series?.times,
        rank,
        modelId: model.id,
        modelLabel: model.label,
      })
    }
  })
  return out
}
