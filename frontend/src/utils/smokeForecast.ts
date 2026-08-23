/**
 * Forecast smoke, as a picture that moves with the playhead (#298).
 *
 * `smoke.ts` draws what an analyst traced from a satellite this morning. This
 * draws where a model says that smoke goes next, hour by hour, over the window
 * the analysis was run for. The two are separate layers on purpose: one is an
 * observation and one is a forecast, and merging them would let a reader take a
 * model's opinion for something somebody saw.
 *
 * ## It is not a knob
 *
 * Turning it on fetches, and that is the whole of its cost. It never touches
 * `commitNeeded`, never re-ranks, and is no input to anything: the markers, the
 * table and the `analyzed` snapshot are identical with it on and off. Its
 * inputs come from the snapshot rather than from panel state, so it cannot
 * paint hours the report never saw.
 *
 * ## Why one fetch covers the whole window
 *
 * The server answers with every hour it has inside the window, not one hour per
 * request. A Cascades-sized box measured 0.4 KB per hour, so a two-day window
 * is tens of kilobytes, and playback then costs nothing at all: scrubbing is
 * reading an array. Paying per frame would have made the transport spend.
 *
 * ## Why every pixel carries the same colour
 *
 * The encoding is opacity, exactly as the observed layer's is, so the fill is
 * one stone at three alphas and the RGB is written even where the alpha is
 * zero. That is not redundant: MapLibre magnifies this raster with a linear
 * filter, which samples colour from transparent pixels too, so a hole left at
 * black rings itself in black. The forecast grid needs a whole bleed pass to
 * fix that. One colour everywhere means there is nothing to bleed.
 */

// Both borrowed rather than restated: the pitch has to print the same way on
// every layer that states one, and the playhead's readout and this legend must
// name the same hour the same way or they look like two different times.
import { pitchLabel } from './forecastGrid'
import { SMOKE_FILL, SMOKE_OPACITY, type SmokeDensity } from './smoke'
import { forecastStampLabel } from './timeline'

/** Where a click on the forecast-smoke legend goes. */
export const HRRR_HREF = 'https://rapidrefresh.noaa.gov/hrrr/'

/**
 * What a cell can say.
 *
 * `OUTSIDE` is not a fourth density. It means the cell fell off the model's
 * grid, which is a different statement from "no smoke here" and has to stay
 * distinguishable — the same rule the wildfire column follows when it separates
 * a cleared check from one that never ran. Both draw as nothing; only the
 * legend tells them apart.
 */
export const SMOKE_CLASS_NONE = 0
export const SMOKE_CLASS_OUTSIDE = 255

/** Class value to the density it names, or null where nothing is drawn. */
export function classDensity(value: number): SmokeDensity | null {
  if (value === 1) return 'Light'
  if (value === 2) return 'Medium'
  if (value === 3) return 'Heavy'
  return null
}

export interface SmokeForecastHour {
  time: number
  cells: number[]
}

export interface SmokeForecastResponse {
  cycle: string
  fetched_at: number
  west: number
  south: number
  east: number
  north: number
  cols: number
  rows: number
  pitch_km: number
  hours: SmokeForecastHour[]
}

export interface SmokeForecastBox {
  west: number
  south: number
  east: number
  north: number
}

/**
 * How far past the destinations the picture reaches, in degrees.
 *
 * Smoke is weather happening around a place rather than at it, so a box drawn
 * tight to a cluster of summits shows a reader the plume's inside and none of
 * its edge — and which way it is moving is most of what they came to see.
 * About 22 km, which is roughly seven of the model's own cells.
 */
export const BOX_PAD_DEG = 0.2

/**
 * The box to ask for, from the analyzed field's own coordinates.
 *
 * From the field rather than from the map's viewport, for the reason the
 * forecast grid takes the same input: a viewport box would refetch on every
 * pan, and this layer's whole claim to being cheap is that it fetches once per
 * analysis. It also means a custom-only report, which has no drawn ring, boxes
 * identically to a polygon one.
 *
 * Returns null for a field straddling the antimeridian. A west/east box is
 * genuinely ill-defined there, and asking the long way round would request the
 * other 340 degrees of the planet — the same geometry the national fire
 * snapshot sidesteps by never taking a box at all.
 */
export function fieldBox(
  field: readonly { latitude: number; longitude: number }[] | null,
): SmokeForecastBox | null {
  if (!field || field.length === 0) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const point of field) {
    if (point.latitude < south) south = point.latitude
    if (point.latitude > north) north = point.latitude
    if (point.longitude < west) west = point.longitude
    if (point.longitude > east) east = point.longitude
  }
  if (east - west > 180) return null
  return {
    west: Math.max(-180, west - BOX_PAD_DEG),
    south: Math.max(-90, south - BOX_PAD_DEG),
    east: Math.min(180, east + BOX_PAD_DEG),
    north: Math.min(90, north + BOX_PAD_DEG),
  }
}

/**
 * The layer's one server call.
 *
 * Marks a refusal the way `smoke.ts` does, so a caller can tell a rate limit
 * or a cold instance from a genuine failure without reading status codes.
 */
export async function fetchSmokeForecast(
  box: SmokeForecastBox,
  startMs: number,
  endMs: number,
  signal: AbortSignal,
): Promise<SmokeForecastResponse> {
  const params = new URLSearchParams({
    bbox: [box.west, box.south, box.east, box.north].map((v) => v.toFixed(4)).join(','),
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  })
  const response = await fetch(`/api/smoke/forecast?${params}`, { signal })
  if (!response.ok) {
    const error: Error & { rateLimited?: boolean } = new Error(
      `Forecast smoke request failed (${response.status})`,
    )
    if (response.status === 429 || response.status === 503) error.rateLimited = true
    throw error
  }
  return (await response.json()) as SmokeForecastResponse
}

/**
 * The hour covering a playhead stamp, or null when the model does not reach it.
 *
 * Matched on the exact hour rather than the nearest one. The playhead steps
 * through the analysis's own hourly grid and the model publishes on the same
 * whole hours, so a miss means the model genuinely has nothing there — and
 * drawing the nearest hour instead would put smoke on the map for a time it was
 * never forecast.
 */
export function frameFor(
  response: SmokeForecastResponse | null,
  timeMs: number | null,
): SmokeForecastHour | null {
  if (!response || timeMs === null) return null
  return response.hours.find((hour) => hour.time === timeMs) ?? null
}

export interface SmokeRaster {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/**
 * One hour as an image, ready for a MapLibre image source.
 *
 * The rows are flipped: a lattice counts north from its south-west corner and
 * an image counts south from its top-left. This is the same trap the forecast
 * grid's raster documents, and getting it wrong draws the country upside down
 * in a way that looks plausible on a small box.
 */
export function smokeRaster(
  response: SmokeForecastResponse,
  hour: SmokeForecastHour,
): SmokeRaster {
  const { cols, rows } = response
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  const red = parseInt(SMOKE_FILL.slice(1, 3), 16)
  const green = parseInt(SMOKE_FILL.slice(3, 5), 16)
  const blue = parseInt(SMOKE_FILL.slice(5, 7), 16)

  for (let index = 0; index < cols * rows; index += 1) {
    const row = Math.floor(index / cols)
    const col = index % cols
    const pixel = ((rows - 1 - row) * cols + col) * 4
    const density = classDensity(hour.cells[index] ?? SMOKE_CLASS_NONE)
    rgba[pixel] = red
    rgba[pixel + 1] = green
    rgba[pixel + 2] = blue
    rgba[pixel + 3] = density === null ? 0 : Math.round(SMOKE_OPACITY[density] * 255)
  }
  return { width: cols, height: rows, rgba }
}

/**
 * The image's four corners, clockwise from the north-west.
 *
 * Read off the response's own edges, which are the box the server tiled
 * exactly. Deriving them from the cells instead would stretch the picture to
 * fit whatever happened to be drawn and land every pixel off its sample.
 */
export function smokeImageCoordinates(
  response: SmokeForecastResponse,
): [[number, number], [number, number], [number, number], [number, number]] {
  const { west, south, east, north } = response
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}

/** Does this hour fall entirely outside the model's area? */
export function allOutside(hour: SmokeForecastHour): boolean {
  return hour.cells.length > 0 && hour.cells.every((cell) => cell === SMOKE_CLASS_OUTSIDE)
}

/**
 * The legend row: the layer's name on the left, one value on the right.
 *
 * The same shape every other layer row takes, and the label is the LAYER's name
 * in every state rather than the value's, for the reason `gridLegendLine`
 * spells out: a column of rows where one row is shaped differently reads as a
 * fault rather than as a distinction.
 *
 * The order below is what a reader needs most, first. A layer that reaches only
 * part of the window says so ahead of stating its pitch, because "this stops on
 * Sunday afternoon" changes what the reader does and "3 km" does not. Two
 * different kinds of not-covered are kept apart on purpose: `Outside model
 * reach` is a limit in TIME, `Outside model area` is a limit in SPACE, and a
 * reader who is told the wrong one goes looking for the wrong fix.
 */
export function smokeForecastLegend(
  response: SmokeForecastResponse | null,
  windowEndMs: number | null,
  failed: boolean,
  loading: boolean,
): { label: string; value: string; kind: 'pitch' | 'status' | 'error' } {
  const label = 'Forecast smoke'
  if (failed) return { label, value: 'Unavailable', kind: 'error' }
  if (loading || !response) return { label, value: 'Loading', kind: 'status' }
  if (response.hours.length === 0) {
    return { label, value: 'Outside model reach', kind: 'status' }
  }
  if (response.hours.every(allOutside)) {
    return { label, value: 'Outside model area', kind: 'status' }
  }
  const last = response.hours[response.hours.length - 1].time
  if (windowEndMs !== null && last < windowEndMs) {
    return { label, value: `Through ${forecastStampLabel(last)}`, kind: 'status' }
  }
  return { label, value: pitchLabel(response.pitch_km), kind: 'pitch' }
}
