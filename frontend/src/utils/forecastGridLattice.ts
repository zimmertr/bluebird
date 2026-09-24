// The forecast grid's lattice: which sample points a field is covered by, at
// what pitch, and how each fetched sample becomes a row the raster and the
// arrows can read. The pitch is the whole of what the picture claims, so every
// rule that decides it lives here, beside the reach and the cell cap that bound
// it.

import { DestinationResult, DiscoveredDestination } from '../types'
import type { Coordinate, WeatherResult, AqiResult, CloudResult } from './openMeteo'
import { assemble } from './clientAnalyze'
import { alignRowToGrid } from './chartData'
import type { WindowSource } from './forecastWindow'

/** One cell's extent: `[west, south, east, north]` in degrees. */
export type CellBox = [number, number, number, number]

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
  /**
   * The kept samples only — the cells within the coverage reach of a destination.
   * `points`, `cells` and `indices` are parallel: position `i` in any of them
   * describes the same sample. An array POSITION is the currency the fetch
   * loop and `pairCells` trade in; the VIRTUAL lattice index in `indices[i]`
   * (row-major from the lattice's south-west corner, over the full
   * `cols × rows`) is what places a sample in the raster. Before the reach
   * limit the lattice was dense and the two numbers coincided; they no longer
   * do, and `indices` is the bridge.
   */
  points: Coordinate[]
  cells: CellBox[]
  indices: number[]
  /**
   * Each kept cell's distance to its nearest destination, in km — the number
   * the reach compared against. Held so `gridView` can re-cut the SAME
   * fetched lattice at a smaller reach without rebuilding or refetching
   * anything: the coverage slider's shrink direction is a filter over these.
   */
  distancesKm: number[]
  /** The VIRTUAL lattice shape — the raster image's dimensions. */
  cols: number
  rows: number
  /** The lattice's outer south-west corner and per-cell steps, in degrees.
   * `gridImageCoordinates` derives the raster's corners from these rather
   * than from the first and last kept cell, which with a sparse lattice are
   * not corners at all. */
  west: number
  south: number
  latStep: number
  lonStep: number
  pitchKm: number
}

/** One sampled cell: where it sits in the lattice, its square, and its forecast. */
export interface GridCell {
  /** VIRTUAL lattice index (row-major over `cols × rows`), never an array
   * position. What places the sample in the raster. */
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
 * The coverage slider's span, in multiples of the MODEL's grid pitch.
 *
 * The grid exists to show the weather AROUND the places the analysis ranked,
 * so a cell earns its fetch only near one of them. How far "around" reaches
 * is model-relative (TJ, 2026-08-21): a fixed km range went dead on coarse
 * models (a 10 km slider under ECMWF's 25 km cells had nothing to vary), so
 * the slider spans one to four RINGS of the model's own cells and means the
 * same thing on every model. The default sits dead-centre on the bar —
 * 2.5 rings, 7.5 km on NOAA GFS's 3 km grid, 62.5 km on ECMWF's 25 km.
 *
 * The kilometres derive from the MODEL pitch, never the coarsened effective
 * pitch: reach that grew with coarsening would keep the kept-cell count
 * roughly constant per destination, and the cell cap could never converge on
 * a field of scattered, far-apart destinations.
 *
 * Before any reach bound existed, one stray destination an ocean away
 * stretched the lattice across the Atlantic and the 600-cell cap answered
 * with a 181 km pitch — the whole budget spent on cells no destination was
 * in (PR #288 review, 2026-08-21).
 */
export const GRID_REACH_MIN_X = 1
export const GRID_REACH_MAX_X = 4
/** The slider's default position, as a fraction of the bar: the middle. */
export const GRID_REACH_DEFAULT_FRAC = 0.5

/**
 * The reach in km for a slider position, on a model of `modelPitchKm`.
 *
 * `frac` is the bar position in [0, 1], clamped rather than trusted — it
 * arrives from the URL as well as from the control.
 */
export function reachKmFor(modelPitchKm: number, frac: number): number {
  const pitch = modelPitchKm > 0 ? modelPitchKm : FALLBACK_PITCH_KM
  const f = Math.min(1, Math.max(0, frac))
  return pitch * (GRID_REACH_MIN_X + f * (GRID_REACH_MAX_X - GRID_REACH_MIN_X))
}

/**
 * The raster's texture bound, per axis, in pixels.
 *
 * The lattice's virtual cols × rows becomes a MapLibre image source, which is
 * a WebGL texture, and WebGL guarantees only 4096 as the minimum max-texture
 * size — 2048 leaves margin for that floor. Without this bound two far-apart
 * clusters keep a fine pitch (their KEPT cells fit the cap easily) while the
 * virtual lattice between them grows a several-thousand-pixel-wide image that
 * is almost entirely transparent.
 */
export const MAX_IMAGE_DIM = 2048

/**
 * The pitch to fall back on when `/api/capabilities` sent no grid figure for a
 * model (`finestGridKm` is documented as 0 in that case).
 *
 * GFS's global grid, the coarsest thing any model here degrades to, so an
 * unknown model is sampled conservatively rather than at a fineness nothing has
 * claimed.
 */
export const FALLBACK_PITCH_KM = 13

/**
 * A model's finest grid as `/api/capabilities` published it, or the fallback
 * when the model is not in the list (or no model is named). A published 0 is
 * passed through: `buildGrid` and `reachKmFor` treat it as unpublished.
 */
export function modelPitchKm(
  models: readonly { id: string; finestGridKm: number }[],
  modelId: string | undefined,
): number {
  return models.find((m) => m.id === modelId)?.finestGridKm ?? FALLBACK_PITCH_KM
}

/**
 * May this report be gridded at all?
 *
 * The pitch is the whole of what the picture claims: the legend states it, and
 * it is the distance over which the drawing stops being a measurement. The
 * lattice is sampled at the ANALYZED MODEL's finest pitch — but an archive
 * window names no model (#123). That endpoint answers from a reanalysis, on a
 * grid coarser than any forecast model's finest figure, so the same lattice
 * would paint real numbers at a spacing far finer than anything that produced
 * them and the legend would state a pitch the data never had. There is no
 * honest pitch to substitute either, because the archive publishes no
 * per-model figure for `/api/capabilities` to carry.
 *
 * A window that CROSSES the boundary is the same claim made over half a report:
 * its early hours are that reanalysis, and one pitch cannot be honest about both
 * halves. So the test is "is every hour a model's", not "is this the archive" —
 * the model picker stays live for such a window, because the forecast half is
 * genuinely the chosen model's, but a single stated pitch over the whole field is
 * not.
 *
 * Read off the ANALYZED snapshot rather than the panel, like every other input
 * this overlay takes: the calendar can move to a recent window while an archive
 * report still sits on screen, and the layer must follow the rows it draws
 * under.
 *
 * `null` is a report that does not exist yet, and forbids nothing. The layer is
 * a standing preference, so the analysis decides when it commits.
 */
export function gridAllowed(analyzed: { windowSource: WindowSource } | null): boolean {
  return analyzed === null || analyzed.windowSource === 'forecast'
}

// One degree of latitude, in km. Longitude shrinks by cos(lat), which is what
// keeps a sample spacing roughly square on the ground rather than in degrees.
const KM_PER_DEG = 111.32

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
 * A cell exists only within `GRID_REACH_KM` of some destination — the lattice
 * is the union of disks around the field, not the field's bounding box. Two
 * far-apart clusters each get their own local patch at a fine pitch, and the
 * ocean between them gets nothing: before this a single stray destination
 * stretched one rectangle across the Atlantic and coarsened it to a 181 km
 * pitch (PR #288 review). The reach also replaces the old one-pitch padding as
 * the soft margin the raster fades out through. One consequence to know: a
 * compact field's margin grew from one pitch to ~25 km, so its pitch coarsens
 * slightly sooner than it used to.
 *
 * Returns `null` when there is nothing to grid, or when the field straddles the
 * antimeridian — a west/east bbox is genuinely ill-defined there, the same
 * geometry the national fire snapshot sidesteps by never taking a bbox at all.
 * Drawing the long way round would paint the other 340 degrees of the planet.
 */
export function buildGrid(
  field: readonly { latitude: number; longitude: number }[],
  pitchKm: number,
  reachKm?: number,
  cap: number = MAX_GRID_CELLS,
): GridSpec | null {
  if (field.length === 0) return null
  const pitch = pitchKm > 0 ? pitchKm : FALLBACK_PITCH_KM
  // Defaulted from the MODEL pitch at the bar's default position — never from
  // the coarsened effective pitch, for the convergence reason the constants
  // above record.
  const reach = reachKm ?? reachKmFor(pitch, GRID_REACH_DEFAULT_FRAC)

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
  //
  // Two fits are demanded, and each can bind alone: the KEPT cell count under
  // `cap` (the spend), and the VIRTUAL cols/rows under `MAX_IMAGE_DIM` (the
  // texture). Two far-apart clusters fit the cap at a fine pitch while their
  // virtual lattice is thousands of pixels wide, which is exactly the case the
  // second bound exists for.
  let effective = pitch
  for (let guard = 0; guard < 64; guard++) {
    const spec = lattice(west, south, east, north, effective, cosLat, field, reach)
    if (
      spec.points.length <= cap &&
      spec.cols <= MAX_IMAGE_DIM &&
      spec.rows <= MAX_IMAGE_DIM
    ) {
      return spec
    }
    effective *= Math.max(
      Math.sqrt(spec.points.length / cap),
      spec.cols / MAX_IMAGE_DIM,
      spec.rows / MAX_IMAGE_DIM,
      1.05,
    )
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
  field: readonly { latitude: number; longitude: number }[],
  baseReachKm: number,
): GridSpec {
  const latStep = pitchKm / KM_PER_DEG
  const lonStep = pitchKm / (KM_PER_DEG * cosLat)
  // The one-pitch floor keeps a destination's own cell and its axial
  // neighbours at any slider value, zero included — a coverage of nothing
  // would draw nothing, and a layer switched on that draws nothing reads as
  // broken. `gridView` applies the same floor so the fetched set and the
  // displayed subset agree about what a value means.
  const reachKm = Math.max(baseReachKm, pitchKm)
  const reachLat = reachKm / KM_PER_DEG
  const reachLon = reachKm / (KM_PER_DEG * cosLat)
  const w = west - reachLon
  const s = south - reachLat
  const cols = Math.max(1, Math.ceil((east + reachLon - w) / lonStep))
  const rows = Math.max(1, Math.ceil((north + reachLat - s) / latStep))

  // The kept set is built from the destinations OUTWARD, never by filtering
  // the full lattice: Washington-to-Sicily at a 3 km pitch is ~2M virtual
  // cells, where the disks around even 1,500 destinations mark ~400k cell
  // visits with heavy overlap. A cell is kept when its CENTER is within reach
  // of some destination — a true disk, so the field's edge is a rounded blob
  // hugging the candidates rather than a rectangle asserting a coverage
  // nothing sampled.
  const kept = new Map<number, number>()
  for (const d of field) {
    const minC = Math.max(0, Math.floor((d.longitude - reachLon - w) / lonStep))
    const maxC = Math.min(cols - 1, Math.floor((d.longitude + reachLon - w) / lonStep))
    const minR = Math.max(0, Math.floor((d.latitude - reachLat - s) / latStep))
    const maxR = Math.min(rows - 1, Math.floor((d.latitude + reachLat - s) / latStep))
    for (let r = minR; r <= maxR; r++) {
      const dyKm = (s + r * latStep + latStep / 2 - d.latitude) * KM_PER_DEG
      for (let c = minC; c <= maxC; c++) {
        const dxKm = (w + c * lonStep + lonStep / 2 - d.longitude) * KM_PER_DEG * cosLat
        const distKm = Math.sqrt(dxKm * dxKm + dyKm * dyKm)
        if (distKm <= reachKm) {
          const index = r * cols + c
          const prev = kept.get(index)
          if (prev === undefined || distKm < prev) kept.set(index, distKm)
        }
      }
    }
  }

  const indices = Array.from(kept.keys()).sort((a, b) => a - b)
  const points: Coordinate[] = []
  const cells: CellBox[] = []
  const distancesKm: number[] = []
  for (const index of indices) {
    const r = Math.floor(index / cols)
    const c = index % cols
    const cw = w + c * lonStep
    const cs = s + r * latStep
    cells.push([cw, cs, cw + lonStep, cs + latStep])
    points.push({ latitude: cs + latStep / 2, longitude: cw + lonStep / 2 })
    distancesKm.push(kept.get(index) as number)
  }
  return {
    points,
    cells,
    indices,
    distancesKm,
    cols,
    rows,
    west: w,
    south: s,
    latStep,
    lonStep,
    pitchKm,
  }
}

/**
 * The held field re-cut at a smaller reach, with nothing rebuilt and nothing
 * refetched (#288 review): the coverage slider's shrink direction, applied
 * live while the thumb moves.
 *
 * A pure filter over `distancesKm`: the lattice geometry, the pitch, and the
 * cell positions all stay exactly the fetched lattice's, so every consumer —
 * raster, image corners, arrows, edge fade — works on the subset unchanged.
 * The same one-pitch floor `lattice` applies, so a slider at zero shows the
 * destinations' own cells rather than an empty map, and the fetched set and
 * the displayed set agree about what a value means. A reach at or above the
 * fetched one returns the inputs untouched, which the memoising caller reads
 * as "nothing changed".
 */
export function gridView(
  spec: GridSpec,
  cells: readonly GridCell[],
  reachKm: number,
): { spec: GridSpec; cells: readonly GridCell[] } {
  const effective = Math.max(reachKm, spec.pitchKm)
  if (spec.distancesKm.every((d) => d <= effective)) return { spec, cells }

  const points: Coordinate[] = []
  const boxes: CellBox[] = []
  const indices: number[] = []
  const distancesKm: number[] = []
  for (let i = 0; i < spec.indices.length; i++) {
    if (spec.distancesKm[i] > effective) continue
    points.push(spec.points[i])
    boxes.push(spec.cells[i])
    indices.push(spec.indices[i])
    distancesKm.push(spec.distancesKm[i])
  }
  const allowed = new Set(indices)
  return {
    spec: { ...spec, points, cells: boxes, indices, distancesKm },
    cells: cells.filter((cell) => allowed.has(cell.index)),
  }
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
/*
 * KNOWN LIMIT (#288 review): MapLibre texture-maps an image source linearly
 * in MERCATOR between these corners, while the lattice rows are linear in
 * DEGREES. Over a compact field the two agree to well under a pixel; over a
 * multi-cluster field spanning many degrees of latitude, mid-span rows drift
 * north of their true position by up to a few cells (measured with a
 * Washington-plus-Sicily field; the corners stay exact). Fixing it means
 * spacing rows in mercator or drawing one image per cluster — deferred until
 * a real field, rather than a stray destination, needs it.
 */
export function gridImageCoordinates(
  spec: GridSpec,
): [[number, number], [number, number], [number, number], [number, number]] {
  // From the lattice geometry, never from the kept cells: with the reach
  // limit the first and last kept cell are wherever the destinations were,
  // not the lattice's corners, and corners read off them would stretch the
  // raster to fit the blob and land every pixel off its sample.
  const w = spec.west
  const s = spec.south
  const e = spec.west + spec.cols * spec.lonStep
  const n = spec.south + spec.rows * spec.latStep
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
  cloudList: readonly CloudResult[] | null = null,
): GridCell[] {
  const cells: GridCell[] = []
  for (let i = 0; i < indices.length; i++) {
    const wx = wxList[i]
    if (!wx) continue
    // `indices` carries array POSITIONS into the sparse points/cells — the
    // fetch loop's currency. The VIRTUAL lattice index the raster places by
    // is `spec.indices[pos]`; conflating the two only worked while the
    // lattice was dense and every position WAS its virtual index.
    const pos = indices[i]
    const built = assemble(
      [cellDestination(spec.points[pos])],
      [wx],
      [aqiList[i] ?? null],
      cloudList && [cloudList[i] ?? null],
    )
    const row = built.results[0]
    if (!row) continue
    cells.push({
      index: spec.indices[pos],
      box: spec.cells[pos],
      row: onGrid(row, built.times, times),
    })
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
