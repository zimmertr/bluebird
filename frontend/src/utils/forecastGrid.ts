// The forecast grid: the ranked metric painted as model-resolution cells
// beneath the markers (#246).
//
// #121 rejected a forecast-derived raster because interpolating temperature
// between two summits across a valley fabricates data in exactly the terrain
// this app serves. The grid keeps that rejection and changes the drawing, not
// the data: every cell is one real Open-Meteo answer at one real coordinate,
// drawn as a square at the pitch it was sampled on, with nothing smoothed
// between cells. A 13 km cell looks like a 13 km claim, and the legend states
// the pitch so the claim is legible rather than implied.
//
// Everything here is pure. The fetching lives in `hooks/useForecastGrid.ts` and
// the drawing in `MapView.tsx`, for the reason `ForecastCalendar` splits the
// same way: Vitest has no DOM, so logic left in a component is untestable by
// construction.

import type { FeatureCollection } from 'geojson'
import { DestinationResult, DiscoveredDestination, SortBy } from '../types'
import type { Coordinate, WeatherResult, AqiResult } from './openMeteo'
import { assemble } from './clientAnalyze'
import { alignRowToGrid } from './chartData'
import { NO_VALUE, bearingAt, fillColor } from './resultFeatures'

/** One cell's extent: `[west, south, east, north]` in degrees. */
export type CellBox = [number, number, number, number]

/**
 * A lattice of sample points and the squares they stand for.
 *
 * `points` and `cells` are parallel: `cells[i]` is the box centred on
 * `points[i]`. `pitchKm` is the pitch the lattice was actually built at, which
 * is the model's own unless the cap coarsened it — and it is returned rather
 * than assumed because the legend prints it. A grid that quietly drew 13 km
 * cells while the panel said 3 km would be the one failure this whole feature
 * exists to avoid.
 */
export interface GridSpec {
  points: Coordinate[]
  cells: CellBox[]
  pitchKm: number
}

/** One sampled cell: its square, and the forecast that square carries. */
export interface GridCell {
  box: CellBox
  row: DestinationResult
}

/**
 * How many cells one grid may cost.
 *
 * Open-Meteo bills weighted calls per location, so this is the whole spend
 * ceiling: 600 cells over a 16-day window is ~686 weighted calls against the
 * visitor's own budget, which the client pacer spreads rather than refuses.
 * Below the cap the pitch is the model's; above it the pitch coarsens, and the
 * legend says so.
 */
export const MAX_GRID_CELLS = 600

/**
 * The pitch to fall back on when `/api/capabilities` sent no grid figure for a
 * model (`finestGridKm` is documented as 0 in that case).
 *
 * GFS's global grid, which is the coarsest thing any model here degrades to, so
 * an unknown model is sampled conservatively rather than at a fineness nothing
 * has claimed.
 */
export const FALLBACK_PITCH_KM = 13

// One degree of latitude, in km. Longitude shrinks by cos(lat), which is what
// keeps a cell roughly square on the ground rather than square in degrees.
const KM_PER_DEG = 111.32

/**
 * The pitch as the legend says it.
 *
 * Whole km past 10, one decimal below it: the finest model here is GEM at
 * 2.5 km, and rounding that to "3 km" would misstate a number the user can
 * check against the model picker's own summary.
 */
export function pitchLabel(pitchKm: number): string {
  const km = pitchKm < 10 ? Math.round(pitchKm * 10) / 10 : Math.round(pitchKm)
  return `${km} km grid`
}

/**
 * A lattice covering the analyzed field, at `pitchKm` or the nearest coarser
 * pitch that fits under `cap`.
 *
 * The bbox comes from the field's own coordinates rather than from the drawn
 * ring, so a custom-only analysis (which has no ring) grids identically to a
 * polygon one and nothing new has to be pinned in the `analyzed` snapshot. The
 * cost is that cells hug where destinations were *found*: a polygon corner
 * holding no candidates gets none.
 *
 * Padded by one pitch on every side so the outermost destinations sit inside a
 * cell rather than on its edge.
 *
 * Returns `null` when there is nothing to grid, or when the field straddles the
 * antimeridian — a west/east bbox is genuinely ill-defined there, which is the
 * same geometry the national fire snapshot sidesteps by never taking a bbox at
 * all. Drawing the long way round would paint the other 340 degrees of the
 * planet.
 */
export function buildGrid(
  field: readonly { latitude: number; longitude: number }[],
  pitchKm: number,
  cap: number = MAX_GRID_CELLS,
): GridSpec | null {
  if (field.length === 0) return null
  const pitch = pitchKm > 0 ? pitchKm : FALLBACK_PITCH_KM

  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  for (const p of field) {
    if (p.latitude < south) south = p.latitude
    if (p.latitude > north) north = p.latitude
    if (p.longitude < west) west = p.longitude
    if (p.longitude > east) east = p.longitude
  }
  if (east - west > 180) return null

  const midLat = (south + north) / 2
  // Guard the pole: cos(89.99°) is small enough that a longitude step blows up
  // to hundreds of degrees. Nothing this app ranks is up there, but a lattice
  // that divides by ~0 would produce one absurd cell rather than no grid.
  const cosLat = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01)

  // Coarsen until it fits. One scaled rebuild is not enough: cell counts come
  // out of `Math.ceil`, so a bbox 25.1 cells wide still needs 26 columns after
  // a 2% coarsening and the pass changes nothing. Each round therefore grows
  // the pitch by at least 5%, which converges in a handful of passes from any
  // starting point and cannot loop.
  let effective = pitch
  for (let guard = 0; guard < 64; guard++) {
    const spec = lattice(west, south, east, north, effective, cosLat)
    if (spec.points.length <= cap) return spec
    effective *= Math.max(Math.sqrt(spec.points.length / cap), 1.05)
  }
  return null
}

function lattice(
  west: number,
  south: number,
  east: number,
  north: number,
  pitchKm: number,
  cosLat: number,
): GridSpec {
  const latStep = pitchKm / KM_PER_DEG
  const lonStep = pitchKm / (KM_PER_DEG * cosLat)
  const w = west - lonStep
  const s = south - latStep
  const cols = Math.max(1, Math.ceil((east + lonStep - w) / lonStep))
  const rows = Math.max(1, Math.ceil((north + latStep - s) / latStep))

  const points: Coordinate[] = []
  const cells: CellBox[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cw = w + c * lonStep
      const cs = s + r * latStep
      cells.push([cw, cs, cw + lonStep, cs + latStep])
      points.push({ latitude: cs + latStep / 2, longitude: cw + lonStep / 2 })
    }
  }
  return { points, cells, pitchKm }
}

/**
 * The lattice's fetched forecasts, paired back to their squares.
 *
 * `wxList`/`aqiList` are positional against `spec.points`, which is why the
 * pairing happens here rather than through `assemble` over the whole list:
 * that helper drops rows whose weather came back null, and a dropped row would
 * slide every later cell onto the wrong square. A cell with no forecast is
 * simply absent from the result, which is also what "nulls draw nothing"
 * wants — an unanswered cell leaves the basemap showing rather than painting a
 * grey block over it.
 *
 * `times` is the report's own hourly grid. Each cell's series is re-indexed
 * onto it by timestamp, so the hour under the playhead is the same hour for a
 * cell as for the marker sitting on top of it. In practice the two grids are
 * identical — same window, same model — and the alignment is the guarantee
 * rather than the mechanism.
 */
export function pairCells(
  spec: GridSpec,
  wxList: readonly WeatherResult[],
  aqiList: readonly AqiResult[],
  times: readonly number[],
): GridCell[] {
  const cells: GridCell[] = []
  for (let i = 0; i < spec.points.length; i++) {
    const wx = wxList[i]
    if (!wx) continue
    const built = assemble([cellDestination(spec.points[i])], [wx], [aqiList[i] ?? null])
    const row = built.results[0]
    if (!row) continue
    cells.push({ box: spec.cells[i], row: onGrid(row, built.times, times) })
  }
  return cells
}

// A sample point in the shape `assemble` zips against. The name is never
// rendered — cells carry no label and no popup — but it is what the row would
// say it is if one ever leaked into a table, so it says the true thing.
function cellDestination(point: Coordinate): DiscoveredDestination {
  return {
    name: 'Forecast grid cell',
    type: 'grid',
    latitude: point.latitude,
    longitude: point.longitude,
    elevation_ft: null,
    osm_id: null,
  }
}

// Re-index onto the report's grid, then drop `series_times`: after the remap
// the series IS on `times`, and a row still claiming its old stamps would be
// corrupted by a second alignment.
function onGrid(
  row: DestinationResult,
  cellTimes: readonly number[],
  times: readonly number[],
): DestinationResult {
  const aligned = alignRowToGrid({ ...row, series_times: [...cellTimes] }, [...times])
  const next = { ...aligned }
  delete next.series_times
  return next
}

/**
 * The cells as GeoJSON, colored for one hour or for the window aggregate.
 *
 * Reads `fillColor` and `bearingAt` — the markers' own derivations — rather
 * than mirroring them, so a cell and the marker standing on it are scored on
 * byte-identical scales and a wind arrow flips FROM-to-toward the same way in
 * both places. A cell whose metric has no value carries no `color` and is
 * filtered out by the layer: an unanswered hour leaves the map showing rather
 * than asserting a neutral grey.
 */
export function gridFeatureCollection(
  cells: readonly GridCell[],
  sortBy: SortBy,
  hourIndex: number | null,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap(({ box, row }) => {
      const color = cellColor(row, sortBy, hourIndex)
      if (color === null) return []
      const [w, s, e, n] = box
      return [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
          },
          properties: {
            color,
            ...(hourIndex !== null ? bearingAt(row, hourIndex) : {}),
          },
        },
      ]
    }),
  }
}

// The marker fill, except that a missing value drops the cell instead of
// coloring it. A marker has to stay on screen when its metric is null — it is
// a place the user asked about — so `fillColor` answers grey. A cell is
// background, and a grey block over the terrain would be the one thing on this
// map asserting something it does not know.
function cellColor(row: DestinationResult, sortBy: SortBy, hourIndex: number | null): string | null {
  const color = fillColor(row, sortBy, hourIndex)
  return color === NO_VALUE ? null : color
}
