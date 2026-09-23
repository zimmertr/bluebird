import { describe, it, expect } from 'vitest'
import {
  FALLBACK_PITCH_KM,
  GRID_REACH_DEFAULT_FRAC,
  GRID_REACH_MAX_X,
  GRID_REACH_MIN_X,
  MAX_GRID_CELLS,
  MAX_IMAGE_DIM,
  buildGrid,
  gridAllowed,
  gridView,
  reachKmFor,
  gridImageCoordinates,
  pairCells,
  type GridSpec,
} from './forecastGridLattice'
import { NO_VALUE, fillColor } from './resultFeatures'
import type { AqiResult, CloudResult, WeatherResult } from './openMeteo'
import { gridRow, weatherResult } from '../testSupport/fixtures'

// A field of destinations, as coordinates — the only part of a result the
// lattice reads.
function field(...points: [number, number][]) {
  return points.map(([latitude, longitude]) => ({ latitude, longitude }))
}

// Rainier and Adams: ~80 km apart, which is the everyday polygon this feature
// was designed around.
const CASCADES = field([46.8523, -121.7603], [46.2024, -121.4909])

// A filled mesh of destinations, the shape a polygon analysis produces: the
// reach disks overlap into one solid blob, which is what the dense-lattice
// tests need now that two corner points alone grid as two separate patches.
function mesh(
  latLo: number,
  latHi: number,
  lonLo: number,
  lonHi: number,
  step: number,
): { latitude: number; longitude: number }[] {
  const out: { latitude: number; longitude: number }[] = []
  for (let la = latLo; la <= latHi + 1e-9; la += step) {
    for (let lo = lonLo; lo <= lonHi + 1e-9; lo += step) {
      out.push({ latitude: la, longitude: lo })
    }
  }
  return out
}

describe('buildGrid', () => {
  it('covers the field with cells at the model pitch', () => {
    const spec = buildGrid(CASCADES, 13)!
    expect(spec.pitchKm).toBe(13)
    // Every destination lands inside some cell — the padding is what puts the
    // outermost ones inside a square rather than on its edge.
    for (const p of CASCADES) {
      const inside = spec.cells.some(
        ([w, s, e, n]) =>
          p.longitude >= w && p.longitude <= e && p.latitude >= s && p.latitude <= n,
      )
      expect(inside).toBe(true)
    }
  })

  it('keeps points and cells parallel, each point at its cell centre', () => {
    const spec = buildGrid(CASCADES, 13)!
    expect(spec.points).toHaveLength(spec.cells.length)
    spec.cells.forEach(([w, s, e, n], i) => {
      expect(spec.points[i].longitude).toBeCloseTo((w + e) / 2, 10)
      expect(spec.points[i].latitude).toBeCloseTo((s + n) / 2, 10)
    })
  })

  it('makes cells roughly square on the ground, not in degrees', () => {
    // A degree of longitude is ~0.69 of a degree of latitude at 46°N, so a
    // lattice square in degrees would be a rectangle on the map.
    const [w, s, e, n] = buildGrid(CASCADES, 13)!.cells[0]
    const latKm = (n - s) * 111.32
    const lonKm = (e - w) * 111.32 * Math.cos((46.5 * Math.PI) / 180)
    expect(lonKm).toBeCloseTo(latKm, 1)
  })

  it('grids a single destination rather than giving up on it', () => {
    // A one-point custom list has a zero-extent bbox; the padding is what makes
    // it a lattice at all.
    const spec = buildGrid(field([46.8523, -121.7603]), 3)!
    expect(spec.points.length).toBeGreaterThan(0)
    expect(spec.pitchKm).toBe(3)
  })

  it('coarsens the pitch rather than exceeding the cap', () => {
    // A large FILLED field at HRRR's 3 km: destinations blanket the area, so
    // the reach disks merge into one blob whose honest lattice would be tens
    // of thousands of cells, and what comes back is a coarser one that fits.
    const wide = mesh(42, 49, -124, -117, 0.5)
    const spec = buildGrid(wide, 3)!
    expect(spec.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS)
    expect(spec.pitchKm).toBeGreaterThan(3)
  })

  it('keeps a fine pitch for far-apart clusters, and grids no ocean between them', () => {
    // The Washington-plus-Etna case that forced this design (PR #288 review):
    // a Cascades summit and a Sicilian peak. The old bbox lattice stretched
    // one rectangle across the Atlantic and coarsened it to 181 km; the reach
    // limit keeps two local patches and spends nothing on the water. The
    // pitch is not quite the model's own 3 km: across a hemisphere the
    // TEXTURE bound binds first (the virtual lattice is thousands of pixels
    // wide), and ~5.5 km is what fits it — a legend number a reader can use,
    // where 181 km was not.
    const spec = buildGrid(field([46.8523, -121.7603], [37.75, 14.99]), 3)!
    expect(spec.pitchKm).toBeLessThan(10)
    expect(spec.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS)
    // Nothing anywhere near the mid-Atlantic: every sample hugs one side.
    for (const p of spec.points) {
      expect(p.longitude < -110 || p.longitude > 5).toBe(true)
    }
  })

  it('keeps every cell within reach of some destination, and reaches all of it', () => {
    // The default reach pinned: a lone destination's cells are a disk —
    // nothing past the reach, and the disk genuinely extends toward it rather
    // than stopping at the old one-pitch padding. The default is the bar's
    // middle — 2.5 model pitches, 7.5 km at a 3 km pitch.
    const dest = { latitude: 46.8, longitude: -121.8 }
    const spec = buildGrid([dest], 3)!
    const cos = Math.cos((dest.latitude * Math.PI) / 180)
    const km = (p: { latitude: number; longitude: number }) => {
      const dy = (p.latitude - dest.latitude) * 111.32
      const dx = (p.longitude - dest.longitude) * 111.32 * cos
      return Math.sqrt(dx * dx + dy * dy)
    }
    const defaultReach = reachKmFor(3, GRID_REACH_DEFAULT_FRAC)
    expect(defaultReach).toBeCloseTo(7.5, 10)
    const distances = spec.points.map(km)
    expect(Math.max(...distances)).toBeLessThanOrEqual(defaultReach + 1e-6)
    expect(Math.max(...distances)).toBeGreaterThan(defaultReach * 0.5)

    // The coverage slider's value overrides the default, both directions.
    const maxReach = reachKmFor(3, 1)
    const wide = buildGrid([dest], 3, maxReach)!
    const wideMax = Math.max(...wide.points.map(km))
    expect(wideMax).toBeLessThanOrEqual(maxReach + 1e-6)
    expect(wideMax).toBeGreaterThan(defaultReach)
    // The one-pitch floor still binds under a small slider value: even at
    // zero, a destination keeps its own cell and some neighbours.
    const floored = buildGrid([dest], 13, 0)!
    expect(floored.points.length).toBeGreaterThan(1)
    expect(Math.max(...floored.points.map(km))).toBeLessThanOrEqual(13 + 1e-6)

    // And the fetched distances ride the spec, one per kept cell, so a
    // smaller reach can re-cut the same lattice without rebuilding it.
    expect(wide.distancesKm).toHaveLength(wide.points.length)
    wide.distancesKm.forEach((d, i) => expect(d).toBeCloseTo(km(wide.points[i]), 6))
  })

  it('re-cuts a held field to a smaller reach without rebuilding it', () => {
    // gridView is the coverage slider's shrink direction (#288 review): the
    // lattice geometry and the pitch stay the fetched lattice's, only the
    // kept subset narrows — which is what makes the picture follow the thumb
    // with no fetch behind it.
    const dest = { latitude: 46.8, longitude: -121.8 }
    const spec = buildGrid([dest], 3, reachKmFor(3, 1))!
    const cells = spec.points.map((_, i) => ({
      index: spec.indices[i],
      box: spec.cells[i],
      row: gridRow(),
    }))

    const view = gridView(spec, cells, 4)
    expect(view.spec.cols).toBe(spec.cols)
    expect(view.spec.rows).toBe(spec.rows)
    expect(view.spec.pitchKm).toBe(spec.pitchKm)
    expect(view.spec.points.length).toBeLessThan(spec.points.length)
    expect(Math.max(...view.spec.distancesKm)).toBeLessThanOrEqual(4 + 1e-6)
    // The paired cells narrow in step with the spec, by virtual index.
    expect(view.cells).toHaveLength(view.spec.points.length)
    const allowed = new Set(view.spec.indices)
    for (const cell of view.cells) expect(allowed.has(cell.index)).toBe(true)

    // A reach at or above the fetched one is the identity, not a copy.
    const same = gridView(spec, cells, reachKmFor(3, 1))
    expect(same.spec).toBe(spec)
    expect(same.cells).toBe(cells)

    // The same one-pitch floor as the build: zero still shows the
    // destination's own cells rather than an empty map.
    const floor = gridView(spec, cells, 0)
    expect(floor.spec.points.length).toBeGreaterThan(0)
    expect(Math.max(...floor.spec.distancesKm)).toBeLessThanOrEqual(spec.pitchKm + 1e-6)
  })

  it('keeps indices parallel to the samples, ascending, and inside the lattice', () => {
    const spec = buildGrid(field([46.8523, -121.7603], [37.75, 14.99]), 3)!
    expect(spec.indices).toHaveLength(spec.points.length)
    for (let i = 1; i < spec.indices.length; i++) {
      expect(spec.indices[i]).toBeGreaterThan(spec.indices[i - 1])
    }
    for (const v of spec.indices) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(spec.cols * spec.rows)
    }
  })

  it('coarsens for the texture even when the kept cells already fit the cap', () => {
    // Two clusters most of a hemisphere apart keep a handful of cells — the
    // cap never binds — while the VIRTUAL lattice between them is thousands of
    // pixels wide, which is a WebGL texture the floor spec does not promise.
    const spec = buildGrid(field([46, -170], [46, 8]), 3)!
    expect(spec.cols).toBeLessThanOrEqual(MAX_IMAGE_DIM)
    expect(spec.rows).toBeLessThanOrEqual(MAX_IMAGE_DIM)
    expect(spec.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS)
    expect(spec.pitchKm).toBeGreaterThan(3)
  })

  it('reports the pitch it actually used, never the one it was asked for', () => {
    // The whole reason the legend reads from the returned value: a grid that
    // drew 40 km cells while claiming 3 km would be the one lie this feature
    // cannot afford.
    const spec = buildGrid(field([42, -124], [49, -117]), 3)!
    const latKm = (spec.cells[0][3] - spec.cells[0][1]) * 111.32
    expect(latKm).toBeCloseTo(spec.pitchKm, 6)
  })

  it('converges past the ceiling that one scaled rebuild cannot clear', () => {
    // Cell counts come out of Math.ceil, so a lattice a few cells over the cap
    // is not fixed by scaling the pitch a few percent — the rounding absorbs
    // it and the pass changes nothing. Sweep a range of fields and pitches:
    // every one has to land under the cap.
    for (let span = 1; span <= 12; span++) {
      for (const pitch of [2.5, 3, 13, 25]) {
        const spec = buildGrid(field([46, -122], [46 + span, -122 + span]), pitch)
        expect(spec).not.toBeNull()
        expect(spec!.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS)
      }
    }
  })

  it('falls back to a coarse pitch when capabilities published none', () => {
    // `finestGridKm` is documented as 0 when the server did not send one.
    // Sampling at 0 km would divide the world into infinite cells.
    const spec = buildGrid(CASCADES, 0)!
    expect(spec.pitchKm).toBe(FALLBACK_PITCH_KM)
  })

  it('declines an empty field and one straddling the antimeridian', () => {
    expect(buildGrid([], 13)).toBeNull()
    // A west/east bbox is ill-defined across ±180: taken literally it spans the
    // other 340 degrees of the planet. Out of scope by decision, and declining
    // is how that decision is expressed — the alternative paints the Atlantic.
    expect(buildGrid(field([51.9, 179.5], [51.8, -179.5]), 13)).toBeNull()
  })
})

describe('reachKmFor', () => {
  it('spans one to four rings of the MODEL pitch, default dead-centre', () => {
    // Model-relative bounds (TJ, 2026-08-21): the same bar position means the
    // same number of cell rings on every model, so the control never goes
    // dead under a coarse one the way a fixed km range did.
    expect(GRID_REACH_MIN_X).toBe(1)
    expect(GRID_REACH_MAX_X).toBe(4)
    expect(reachKmFor(3, 0)).toBeCloseTo(3, 10)
    expect(reachKmFor(3, 1)).toBeCloseTo(12, 10)
    expect(reachKmFor(3, GRID_REACH_DEFAULT_FRAC)).toBeCloseTo(7.5, 10)
    expect(reachKmFor(25, GRID_REACH_DEFAULT_FRAC)).toBeCloseTo(62.5, 10)
  })

  it('clamps the position and falls back on an unpublished pitch', () => {
    expect(reachKmFor(3, -1)).toBeCloseTo(3, 10)
    expect(reachKmFor(3, 2)).toBeCloseTo(12, 10)
    // finestGridKm is documented as 0 when the server did not send one.
    expect(reachKmFor(0, 0)).toBeCloseTo(FALLBACK_PITCH_KM, 10)
  })
})

describe('gridAllowed', () => {
  // The lattice is sampled at the analyzed model's finest pitch, and an archive
  // window names no model: that endpoint answers from a reanalysis on a coarser
  // grid, so the picture would state a pitch the numbers under it never had
  // (#123).
  it('allows a report whose every hour came from a model, and no other', () => {
    expect(gridAllowed({ windowSource: 'archive' })).toBe(false)
    expect(gridAllowed({ windowSource: 'forecast' })).toBe(true)
    // A window crossing the boundary is served now (#123), and half its hours
    // are that reanalysis: one stated pitch cannot be honest about both halves.
    expect(gridAllowed({ windowSource: 'spanning' })).toBe(false)
  })

  // The layer is a standing preference, so before the first analysis there is
  // nothing to forbid and the checkbox stays live. The report decides when it
  // commits.
  it('forbids nothing before a report exists', () => {
    expect(gridAllowed(null)).toBe(true)
  })
})

describe('pairCells', () => {
  const spec: GridSpec = {
    points: [
      { latitude: 46.4, longitude: -121.7 },
      { latitude: 46.5, longitude: -121.7 },
    ],
    cells: [
      [-121.8, 46.3, -121.6, 46.5],
      [-121.8, 46.5, -121.6, 46.7],
    ] as [number, number, number, number][],
    indices: [0, 1],
    distancesKm: [0, 0],
    cols: 1,
    rows: 2,
    west: -121.8,
    south: 46.3,
    latStep: 0.2,
    lonStep: 0.2,
    pitchKm: 13,
  }

  // A sample that publishes a freezing level, because the case below measures
  // its absence against this one.
  const wx = (precip: number[]): WeatherResult =>
    weatherResult({
      precip_total_in: precip.reduce((a, b) => a + b, 0),
      temp_min_f: 40,
      temp_max_f: 60,
      temp_avg_f: 50,
      wind_min_mph: 1,
      wind_max_mph: 9,
      wind_avg_mph: 5,
      freeze_min_ft: 9000,
      freeze_max_ft: 9500,
      freeze_avg_ft: 9250,
      series: {
        times: [1000, 2000],
        precip_in: precip,
        temp_f: [40, 60],
        wind_mph: [1, 9],
        freeze_ft: [9000, 9500],
        wind_dir_deg: [90, 270],
      },
    })

  const noAqi: AqiResult[] = [null, null]

  it('keeps a sample on its own lattice position when an earlier one has none', () => {
    // The bug this exists to stop: `assemble` drops rows whose weather came
    // back null, which over a whole lattice would slide every later sample onto
    // the wrong position — a forecast drawn one cell left of where it was
    // measured.
    const cells = pairCells(spec, [0, 1], [null, wx([0.1, 0.2])], noAqi, [1000, 2000])
    expect(cells).toHaveLength(1)
    expect(cells[0].index).toBe(1)
    expect(cells[0].box).toEqual(spec.cells[1])
    expect(cells[0].row.latitude).toBe(46.5)
  })

  it('pairs a chunk against its own lattice indices, not against position', () => {
    // What makes progressive painting possible: the second chunk to arrive
    // carries indices 1..n and must land there, not back at zero.
    const cells = pairCells(spec, [1], [wx([0.4, 0.5])], [null], [1000, 2000])
    expect(cells).toHaveLength(1)
    expect(cells[0].index).toBe(1)
    expect(cells[0].box).toEqual(spec.cells[1])
  })

  it('re-indexes each sample onto the report grid by timestamp', () => {
    // The lattice and the report are fetched for one window under one model, so
    // in practice their grids match. The alignment is the guarantee: an hour
    // the sample does not cover reads null rather than borrowing a neighbour's.
    const cells = pairCells(spec, [0, 1], [wx([0.1, 0.2]), null], noAqi, [500, 1000, 2000])
    expect(cells[0].row.series!.precip_in).toEqual([null, 0.1, 0.2])
    // And the bearings come along, or the arrows silently vanish.
    expect(cells[0].row.series!.wind_dir_deg).toEqual([null, 90, 270])
  })

  // The grid asks Open-Meteo for one set of variables and the freezing level is
  // one of them (`HOURLY_VARIABLES` in openMeteoAggregate.ts), which is why ranking by it
  // paints the field with no second fetch and no key on `sortBy` here. The
  // sample carries the window aggregates AND the hourly series, so the field
  // paints at rest and follows the playhead.
  it('carries the freezing level onto the lattice, so a freeze ranking paints', () => {
    const cells = pairCells(spec, [0, 1], [wx([0.1, 0.2]), null], noAqi, [1000, 2000])
    expect(cells[0].row.freeze_min_ft).toBe(9000)
    expect(cells[0].row.series!.freeze_ft).toEqual([9000, 9500])
    expect(fillColor(cells[0].row, 'freeze_min_ft', null)).not.toBe(NO_VALUE)
    expect(fillColor(cells[0].row, 'freeze_min_ft', 1)).not.toBe(NO_VALUE)
  })

  // The five models that publish no freezing level reach here as nulls, and a
  // sample with no number goes transparent rather than grey: a marker has to
  // stay on screen, a lattice cell has nothing to assert.
  it('paints nothing where the model published no freezing level', () => {
    const base = wx([0, 0])!
    const empty: WeatherResult = {
      ...base,
      freeze_min_ft: null,
      freeze_max_ft: null,
      freeze_avg_ft: null,
      series: { ...base.series!, freeze_ft: [null, null] },
    }
    const cells = pairCells(spec, [0], [empty], [null], [1000, 2000])
    expect(fillColor(cells[0].row, 'freeze_min_ft', null)).toBe(NO_VALUE)
    expect(fillColor(cells[0].row, 'freeze_min_ft', 1)).toBe(NO_VALUE)
  })

  it('leaves no stale series_times on an aligned sample', () => {
    // After the remap the series IS on the report's grid; a row still claiming
    // its old stamps would be corrupted by a second alignment.
    const cells = pairCells(spec, [0, 1], [wx([0.1, 0.2]), null], noAqi, [1000, 2000])
    expect(cells[0].row.series_times).toBeUndefined()
  })

  // The grid fetches the cloud column only when the report holds one (#117),
  // and a cell then paints it on the same hours as every other metric.
  it('lays a cloud answer onto the cell when one is given', () => {
    const cloud: CloudResult = {
      cloud_base_min_ft: 4000,
      cloud_base_avg_ft: 4500,
      cloud_base_max_ft: 5000,
      cloud_cover_min_pct: 20,
      cloud_cover_avg_pct: 55,
      cloud_cover_max_pct: 90,
      series: { times: [1000, 2000], cloud_base_ft: [4000, 5000], cloud_cover_pct: [20, 90] },
    }
    const cells = pairCells(spec, [0], [wx([0.1, 0.2])], [null], [1000, 2000], [cloud])
    expect(cells[0].row.cloud_base_min_ft).toBe(4000)
    expect(cells[0].row.series?.cloud_cover_pct).toEqual([20, 90])
  })

  it('carries no cloud column when none was fetched', () => {
    const cells = pairCells(spec, [0], [wx([0.1, 0.2])], [null], [1000, 2000])
    expect(cells[0].row.cloud_base_min_ft).toBeNull()
    expect(cells[0].row.series).not.toHaveProperty('cloud_base_ft')
  })
})

describe('gridImageCoordinates', () => {
  it('spans the lattice OUTER bounds, so pixel centres land on samples', () => {
    // The half-cell trap. An image of cols x rows stretched over the outer
    // bounds puts pixel i's centre at west + (i + 0.5) * step, which is sample
    // i's own coordinate. Map it to the corner SAMPLES instead and the whole
    // field slides half a cell northwest.
    // From the lattice geometry, never the kept cells: the first and last
    // kept cell hug the destinations, not the lattice's corners.
    const spec = buildGrid(CASCADES, 25)!
    const [topLeft, topRight, bottomRight, bottomLeft] = gridImageCoordinates(spec)
    const e = spec.west + spec.cols * spec.lonStep
    const n = spec.south + spec.rows * spec.latStep
    expect(topLeft).toEqual([spec.west, n])
    expect(topRight).toEqual([e, n])
    expect(bottomRight).toEqual([e, spec.south])
    expect(bottomLeft).toEqual([spec.west, spec.south])

    // And the sample really does sit at its pixel's centre — placed by its
    // VIRTUAL column, which for a sparse lattice is not its array position.
    const c = spec.indices[0] % spec.cols
    expect(spec.points[0].longitude).toBeCloseTo(spec.west + (c + 0.5) * spec.lonStep, 10)
  })

  it('spans the full lattice even when the kept cells are two far-apart patches', () => {
    const spec = buildGrid(field([46.85, -121.76], [37.75, 14.99]), 3)!
    const [topLeft, , bottomRight] = gridImageCoordinates(spec)
    // The west edge sits west of the Washington cluster and the east edge east
    // of the Sicilian one, regardless of which cells were kept between them.
    expect(topLeft[0]).toBeLessThan(-121.76)
    expect(bottomRight[0]).toBeGreaterThan(14.99)
  })
})
