// The forecast grid: the ranked metric drawn under the markers (#246), in
// either of two styles over one set of samples.
//
// #121 rejected a forecast-derived raster, and the rejection was right about
// what it was aimed at: interpolating between two SUMMITS across the valley
// between them invents weather in exactly the terrain this app serves. Drawing
// between MODEL GRID POINTS is a different act. Open-Meteo answers a coordinate
// with the value of the model grid cell containing it, so sampling at the
// model's own pitch means adjacent samples are adjacent grid cells, and the
// field between them is one the model already claims is smooth. Every
// meteorological renderer draws it that way, Windy included.
//
// Both styles are therefore defensible, and they say different true things,
// which is why the panel offers both rather than this file choosing:
//
// - `blocks` (the default) draws each sample as its own square. It shows you
//   where the samples ARE, so the model's resolution is a thing you can see
//   and count rather than a number in the legend. Its edges are the only
//   dishonest part: the model has no discontinuity there.
// - `smooth` draws the field between samples. It reads the way every other
//   forecast map reads, and it is the honest shape of a field the model
//   already treats as continuous. What it hides is how few samples are under
//   it.
//
// They are ONE raster drawn with two magnification filters, not two drawings:
// `raster-resampling` is `nearest` for blocks and `linear` for smooth. Nothing
// downstream of this file needs to know which is showing, the switch touches no
// data, and there is no second layer to keep in step.
//
// The honesty rule sits with the pitch either way, and the legend states it:
// that is the distance over which the picture is a drawing rather than a
// measurement.
//
// Everything here is pure, including the raster, which is built as a pixel
// buffer rather than a canvas so Vitest can assert on it without a DOM. The
// fetching lives in `hooks/useForecastGrid.ts` and the drawing in `MapView`.

import type { FeatureCollection } from 'geojson'
import { DestinationResult, DiscoveredDestination, SortBy } from '../types'
import type { Coordinate, WeatherResult, AqiResult } from './openMeteo'
import { assemble } from './clientAnalyze'
import { alignRowToGrid } from './chartData'
import { NO_VALUE, bearingAt, fillColor } from './resultFeatures'

/** One cell's extent: `[west, south, east, north]` in degrees. */
export type CellBox = [number, number, number, number]

/**
 * How the field is drawn. `blocks` is the default because it is the style that
 * cannot overstate what was sampled: every square is one answer, and you can
 * count them.
 */
export type GridStyle = 'blocks' | 'smooth'

export const GRID_STYLES: GridStyle[] = ['blocks', 'smooth']

export function isGridStyle(value: string): value is GridStyle {
  return (GRID_STYLES as string[]).includes(value)
}

/**
 * A lattice of sample points and the squares they stand for.
 *
 * `points` and `cells` are parallel and laid out row-major from the SOUTH-WEST
 * corner, which `cols`/`rows` is what makes readable: sample `i` sits at row
 * `i / cols`, column `i % cols`. The raster needs that shape, and deriving it
 * back out of the coordinates would be a second answer to a question the
 * lattice already knows.
 *
 * `pitchKm` is the pitch the lattice was actually built at, which is the
 * model's own unless the cap coarsened it. It is returned rather than assumed
 * because the legend prints it: a field drawn at 13 km while the panel says
 * 3 km is the one failure this whole feature exists to avoid.
 */
export interface GridSpec {
  points: Coordinate[]
  cells: CellBox[]
  cols: number
  rows: number
  pitchKm: number
}

/** One sampled cell: where it sits in the lattice, its square, and its forecast. */
export interface GridCell {
  /** Row-major index into `spec.points`. What places it in the raster. */
  index: number
  box: CellBox
  row: DestinationResult
}

/**
 * How many samples one grid may cost.
 *
 * Open-Meteo bills weighted calls per location, so this is the whole spend
 * ceiling: 600 samples over a 16-day window is ~686 weighted calls against the
 * visitor's own budget, which the client pacer spreads rather than refuses.
 * Below the cap the pitch is the model's; above it the pitch coarsens, and the
 * legend says so.
 */
export const MAX_GRID_CELLS = 600

/**
 * The pitch to fall back on when `/api/capabilities` sent no grid figure for a
 * model (`finestGridKm` is documented as 0 in that case).
 *
 * GFS's global grid, the coarsest thing any model here degrades to, so an
 * unknown model is sampled conservatively rather than at a fineness nothing has
 * claimed.
 */
export const FALLBACK_PITCH_KM = 13

// One degree of latitude, in km. Longitude shrinks by cos(lat), which is what
// keeps a sample spacing roughly square on the ground rather than in degrees.
const KM_PER_DEG = 111.32

/**
 * The pitch as a distance, formatted the way the model picker formats the same
 * kind of number (`gridLabel` in useCapabilities): a space before the unit, so
 * the figure in the legend and the figure beside a model's name are visibly the
 * same quantity rather than two conventions.
 *
 * Whole km past 10, one decimal below it: the finest model here is GEM at
 * 2.5 km, and rounding that to "3 km" would misstate a number the reader can
 * check against the picker.
 */
export function pitchLabel(pitchKm: number): string {
  const km = pitchKm < 10 ? Math.round(pitchKm * 10) / 10 : Math.round(pitchKm)
  return `${km} km`
}

/**
 * The one line under the legend's bands: what the field is, or why it is not
 * there yet.
 *
 * The grid fills in progressively, so the only gap needing a cue is before the
 * first samples land — which after a large analysis is minutes, because the
 * grid shares its weighted budget with the analysis that just ran and inherits
 * that analysis's quota debt. Silence there reads as broken.
 *
 * The pacing line borrows the analysis overlay's vocabulary rather than
 * inventing one: that overlay already says the app is waiting on quota and
 * counts down to when it resumes, and this is the same wait for the same
 * reason. It outranks the plain loading line because it answers the question
 * the plain one leaves open, which is why nothing is happening.
 *
 * Once anything is painted the line becomes the pitch and stays there: at that
 * point the filling-in is visible on the map itself and does not need saying.
 */
export function gridLegendLine(
  painted: boolean,
  pitchKm: number,
  paceRemainingS: number | null,
): string {
  if (painted) return `Grid size: ${pitchLabel(pitchKm)}`
  if (paceRemainingS !== null && paceRemainingS > 0) {
    return `Waiting on quota · ${paceRemainingS}s`
  }
  return 'Loading grid'
}

/**
 * A lattice covering the analyzed field, at `pitchKm` or the nearest coarser
 * pitch that fits under `cap`.
 *
 * The bbox comes from the field's own coordinates rather than from the drawn
 * ring, so a custom-only analysis (which has no ring) grids identically to a
 * polygon one and nothing new has to be pinned in the `analyzed` snapshot. The
 * cost is that samples hug where destinations were *found*: a polygon corner
 * holding no candidates gets none.
 *
 * Padded by one pitch on every side. That ring is what the raster fades out
 * through, so the field has a soft edge rather than a hard rectangle, and it
 * is the right ring to spend on it: it sits outside the destinations entirely.
 *
 * Returns `null` when there is nothing to grid, or when the field straddles the
 * antimeridian — a west/east bbox is genuinely ill-defined there, the same
 * geometry the national fire snapshot sidesteps by never taking a bbox at all.
 * Drawing the long way round would paint the other 340 degrees of the planet.
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
  // that divided by ~0 would produce one absurd cell rather than no grid.
  const cosLat = Math.max(Math.cos((midLat * Math.PI) / 180), 0.01)

  // Coarsen until it fits. One scaled rebuild is not enough: cell counts come
  // out of `Math.ceil`, so a lattice 25 samples over the cap still needs the
  // same column count after a 2% coarsening and the pass changes nothing. Each
  // round therefore grows the pitch by at least 5%, which converges in a
  // handful of passes from any starting point and cannot loop.
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
  return { points, cells, cols, rows, pitchKm }
}

/**
 * The lattice's outer bounds, as MapLibre wants an image's corners: top-left
 * first, then clockwise.
 *
 * These are the OUTER edges rather than the corner samples' coordinates, and
 * that is what puts the raster in register. An image of `cols × rows` pixels
 * stretched across this box places pixel `i`'s centre at
 * `west + (i + 0.5) × lonStep`, which is exactly sample `i`'s coordinate. Map
 * it to the corner samples instead and every pixel lands half a cell off.
 */
export function gridImageCoordinates(
  spec: GridSpec,
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s] = spec.cells[0]
  const [, , e, n] = spec.cells[spec.cells.length - 1]
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

/**
 * The lattice's fetched forecasts, paired back to their samples.
 *
 * `wxList`/`aqiList` are positional against `indices`, not against the whole
 * lattice, so a caller can pair one chunk at a time and paint what it has —
 * which is what makes the grid fill in progressively rather than appearing all
 * at once at the end.
 *
 * The pairing happens here rather than through `assemble` over the whole list
 * because that helper drops rows whose weather came back null, and a dropped
 * row would slide every later sample onto the wrong lattice position. A sample
 * with no forecast is simply absent, which is also what "nulls draw nothing"
 * wants: the raster leaves it transparent rather than asserting a colour.
 *
 * `times` is the report's own hourly grid. Each sample's series is re-indexed
 * onto it by timestamp, so the hour under the playhead is the same hour for the
 * field as for the marker standing on it. In practice the two grids are
 * identical — one window, one model — and the alignment is the guarantee rather
 * than the mechanism.
 */
export function pairCells(
  spec: GridSpec,
  indices: readonly number[],
  wxList: readonly WeatherResult[],
  aqiList: readonly AqiResult[],
  times: readonly number[],
): GridCell[] {
  const cells: GridCell[] = []
  for (let i = 0; i < indices.length; i++) {
    const wx = wxList[i]
    if (!wx) continue
    const index = indices[i]
    const built = assemble([cellDestination(spec.points[index])], [wx], [aqiList[i] ?? null])
    const row = built.results[0]
    if (!row) continue
    cells.push({ index, box: spec.cells[index], row: onGrid(row, built.times, times) })
  }
  return cells
}

// A sample point in the shape `assemble` zips against. The name is never
// rendered — the field carries no label and no popup — but it is what the row
// would say it is if one ever leaked into a table, so it says the true thing.
function cellDestination(point: Coordinate): DiscoveredDestination {
  return {
    name: 'Forecast grid sample',
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

/** A raster ready to be handed to an image source: RGBA, row 0 at the north. */
export interface GridRaster {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/**
 * The field as one pixel per sample.
 *
 * Deliberately tiny — a 600-sample lattice is a ~25×24 image — because the
 * smoothing is the raster layer's job. `raster-resampling: linear` magnifies it
 * on the GPU, which is both free and the same bilinear the field is entitled
 * to between adjacent model grid cells. Interpolating here instead would mean
 * writing (and testing) a resampler that the renderer already contains, and
 * re-running it at every zoom level.
 *
 * Two passes rather than one. The first writes the colours it has. The second
 * spreads colour (not opacity) outward into the samples that have none, because
 * a transparent pixel still carries an RGB value into a bilinear blend: leave
 * it black and every gap grows a dark halo as the renderer mixes toward it.
 *
 * Rows are flipped on the way out. The lattice counts north from its
 * south-west corner and an image counts south from its top-left one.
 */
export function gridRaster(
  spec: GridSpec,
  cells: readonly GridCell[],
  sortBy: SortBy,
  hourIndex: number | null,
  style: GridStyle = 'smooth',
): GridRaster | null {
  if (cells.length === 0) return null
  const { cols, rows } = spec
  const rgba = new Uint8ClampedArray(cols * rows * 4)

  for (const { index, row } of cells) {
    const color = fillColor(row, sortBy, hourIndex)
    if (color === NO_VALUE) continue
    const r = Math.floor(index / cols)
    const c = index % cols
    const p = ((rows - 1 - r) * cols + c) * 4
    rgba[p] = parseInt(color.slice(1, 3), 16)
    rgba[p + 1] = parseInt(color.slice(3, 5), 16)
    rgba[p + 2] = parseInt(color.slice(5, 7), 16)
    rgba[p + 3] = style === 'smooth' ? edgeAlpha(r, c, cols, rows) : 255
  }

  bleedColor(rgba, cols, rows)
  return { width: cols, height: rows, rgba }
}

/**
 * How opaque one sample is drawn, which is full everywhere except the padded
 * outermost ring.
 *
 * `buildGrid` pads the bbox by one pitch, so that ring sits outside every
 * destination the analysis found: it is the least load-bearing data in the
 * lattice and the right place to spend on an edge. Fading through it is what
 * keeps the field from ending in a hard rectangle that reads as a UI boundary
 * rather than as the edge of what was sampled.
 *
 * Decided per AXIS rather than for the lattice as a whole, because the two are
 * routinely very different: a north-south polygon over the Cascades grids four
 * columns wide and eight rows tall, and a single "is there an interior?" test
 * would either fade a lattice that has no column to spare or refuse to fade one
 * whose rows had plenty.
 *
 * Smooth only. Blocks draws a boundary at every sample, so a ring of
 * half-transparent squares reads as a row of samples that answered weakly
 * rather than as an edge; smooth has no boundaries at all, and without the fade
 * would simply stop in a rectangle.
 */
function edgeAlpha(r: number, c: number, cols: number, rows: number): number {
  const onColEdge = cols >= MIN_AXIS_TO_FADE && (c === 0 || c === cols - 1)
  const onRowEdge = rows >= MIN_AXIS_TO_FADE && (r === 0 || r === rows - 1)
  return onColEdge || onRowEdge ? EDGE_ALPHA : 255
}

// Five is the smallest lattice with an interior wide enough that fading its
// ring leaves more data than edge. Below it the ring IS the data.
const MIN_AXIS_TO_FADE = 5
const EDGE_ALPHA = 40

// Spread colour into fully transparent pixels from whichever neighbour has
// some, leaving their opacity alone. Bilinear magnification reads RGB from
// transparent pixels too, so a gap left at rgba(0,0,0,0) drags every
// neighbouring blend toward black — a dark fringe around exactly the places
// the field knows nothing about. Iterated so a gap wider than one sample fills
// from both sides rather than only its first ring.
//
// Harmless under `nearest`, which never blends and so never reads the colour of
// a pixel it is not drawing. Run for both rather than branched, because the
// cost is a pass over ~600 pixels and a branch here would be one more thing
// that could disagree between the two styles.
function bleedColor(rgba: Uint8ClampedArray, cols: number, rows: number): void {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = (r * cols + c) * 4
        if (rgba[p + 3] !== 0 || rgba[p] !== 0 || rgba[p + 1] !== 0 || rgba[p + 2] !== 0) continue
        for (const [dr, dc] of NEIGHBOURS) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
          const q = (nr * cols + nc) * 4
          if (rgba[q] === 0 && rgba[q + 1] === 0 && rgba[q + 2] === 0) continue
          rgba[p] = rgba[q]
          rgba[p + 1] = rgba[q + 1]
          rgba[p + 2] = rgba[q + 2]
          changed = true
          break
        }
      }
    }
    if (!changed) return
  }
}

const NEIGHBOURS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

/**
 * The per-sample wind arrows, as points at each sample's coordinate.
 *
 * Separate from the raster because they are a second encoding on the same data
 * and MapLibre has no way to draw a symbol per texel. Reads `bearingAt` — the
 * markers' own derivation — rather than mirroring it, so the FROM-to-toward
 * half turn and the absent-bearing omission are defined once for both layers.
 * Empty unless playback is scrubbing, which is the only time an hour has a
 * direction to point in.
 */
export function gridArrowFeatures(
  cells: readonly GridCell[],
  hourIndex: number | null,
): FeatureCollection {
  if (hourIndex === null) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: cells.flatMap(({ box, row }) => {
      const bearing = bearingAt(row, hourIndex)
      if (bearing.bearing === undefined) return []
      const [w, s, e, n] = box
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [(w + e) / 2, (s + n) / 2] },
          properties: bearing,
        },
      ]
    }),
  }
}
