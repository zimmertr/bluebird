import { describe, it, expect } from 'vitest'
import {
  FALLBACK_PITCH_KM,
  GRID_REACH_KM,
  MAX_GRID_CELLS,
  MAX_IMAGE_DIM,
  buildGrid,
  gridArrowFeatures,
  gridLegendLine,
  gridImageCoordinates,
  gridRaster,
  pairCells,
  pitchLabel,
  type GridCell,
  type GridSpec,
} from './forecastGrid'
import { resultsFeatureCollection } from './resultFeatures'
import type { DestinationResult } from '../types'
import type { AqiResult, WeatherResult } from './openMeteo'

// A field of destinations, as coordinates — the only part of a result the
// lattice reads.
function field(...points: [number, number][]) {
  return points.map(([latitude, longitude]) => ({ latitude, longitude }))
}

// Rainier and Adams: ~80 km apart, which is the everyday polygon this feature
// was designed around.
const CASCADES = field([46.8523, -121.7603], [46.2024, -121.4909])

function result(overrides: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name: 'Forecast grid cell',
    type: 'grid',
    latitude: 46.5,
    longitude: -121.6,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    aqi_avg: 30,
    aqi_max: 40,
    ...overrides,
  }
}

function cell(box: [number, number, number, number], row: DestinationResult, index = 0): GridCell {
  return { index, box, row }
}

// Every kept sample answered: cells built the way pairCells builds them, with
// the VIRTUAL lattice index from spec.indices — a position-as-index shortcut
// here is exactly the conflation the sparse lattice forbids.
function allCells(spec: GridSpec): GridCell[] {
  return spec.points.map((_, i) => cell(spec.cells[i], result(), spec.indices[i]))
}

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

// The alpha of the pixel a VIRTUAL lattice index paints to, row flip included.
function pixelAlpha(
  raster: { rgba: Uint8ClampedArray },
  spec: GridSpec,
  virtualIndex: number,
): number {
  const r = Math.floor(virtualIndex / spec.cols)
  const c = virtualIndex % spec.cols
  return raster.rgba[((spec.rows - 1 - r) * spec.cols + c) * 4 + 3]
}

// The virtual index of the kept cell containing a coordinate.
function virtualIndexAt(spec: GridSpec, latitude: number, longitude: number): number {
  const pos = spec.cells.findIndex(
    ([w, s, e, n]) => longitude >= w && longitude <= e && latitude >= s && latitude <= n,
  )
  expect(pos).toBeGreaterThanOrEqual(0)
  return spec.indices[pos]
}

// A 1x1 lattice, for the derivations that only care about one sample's colour.
function oneSpec(box: [number, number, number, number]): GridSpec {
  return {
    points: [{ latitude: (box[1] + box[3]) / 2, longitude: (box[0] + box[2]) / 2 }],
    cells: [box],
    indices: [0],
    cols: 1,
    rows: 1,
    west: box[0],
    south: box[1],
    latStep: box[3] - box[1],
    lonStep: box[2] - box[0],
    pitchKm: 13,
  }
}

// The RGB of a raster pixel, as the '#rrggbb' the colour scales speak.
function pixelHex(raster: { width: number; rgba: Uint8ClampedArray }, x = 0, y = 0): string {
  const p = (y * raster.width + x) * 4
  return (
    '#' +
    [raster.rgba[p], raster.rgba[p + 1], raster.rgba[p + 2]]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
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
    // GRID_REACH_KM pinned: a lone destination's cells are a disk — nothing
    // past the reach, and the disk genuinely extends toward it rather than
    // stopping at the old one-pitch padding.
    const dest = { latitude: 46.8, longitude: -121.8 }
    const spec = buildGrid([dest], 3)!
    const cos = Math.cos((dest.latitude * Math.PI) / 180)
    const km = (p: { latitude: number; longitude: number }) => {
      const dy = (p.latitude - dest.latitude) * 111.32
      const dx = (p.longitude - dest.longitude) * 111.32 * cos
      return Math.sqrt(dx * dx + dy * dy)
    }
    const distances = spec.points.map(km)
    expect(Math.max(...distances)).toBeLessThanOrEqual(GRID_REACH_KM + 1e-6)
    expect(Math.max(...distances)).toBeGreaterThan(GRID_REACH_KM * 0.8)

    // The coverage slider's value overrides the default, both directions.
    const wide = buildGrid([dest], 3, 60)!
    const wideMax = Math.max(...wide.points.map(km))
    expect(wideMax).toBeLessThanOrEqual(60 + 1e-6)
    expect(wideMax).toBeGreaterThan(48)
    // And the two-pitch floor still binds under a small slider value: 5 km of
    // asked-for reach at a 13 km pitch keeps the ring of neighbours.
    const floored = buildGrid([dest], 13, 5)!
    expect(Math.max(...floored.points.map(km))).toBeGreaterThan(13)
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

describe('pitchLabel', () => {
  it('formats a distance the way the model picker does, and keeps a decimal below 10 km', () => {
    // GEM's finest grid is 2.5 km. Rounding that to "3 km" would contradict the
    // number the model picker prints beside its own name.
    expect(pitchLabel(2.5)).toBe('2.5 km')
    expect(pitchLabel(3)).toBe('3 km')
    expect(pitchLabel(13.27)).toBe('13 km')
    expect(pitchLabel(25)).toBe('25 km')
  })
})

describe('gridLegendLine', () => {
  it('reads as one row in every state: same label, always a value', () => {
    // The label names the LAYER, not the value, and matches the checkbox that
    // switched it on. Every state fills the right-hand column too, statuses
    // included — a column with one row breaking it reads as a fault rather
    // than as a distinction.
    const states = [
      gridLegendLine(true, 3, null),
      gridLegendLine(false, 3, null),
      gridLegendLine(false, 3, 45),
      gridLegendLine(false, 3, null, true),
    ]
    for (const state of states) {
      expect(state.label).toBe('Forecast grid')
      expect(state.value).not.toBe('')
    }
  })

  it('names each state in the value', () => {
    expect(gridLegendLine(true, 3, null).value).toBe('3 km')
    expect(gridLegendLine(false, 3, null).value).toBe('Loading')
    expect(gridLegendLine(false, 3, 45).value).toBe('Waiting')
    expect(gridLegendLine(false, 3, null, true).value).toBe('Unavailable')
  })

  it('stays one row even though the grid paints 10 m wind under adjusted markers (#257)', () => {
    // The measurement-height difference is documented in DATA.md; a second
    // legend line was tried and rejected for its vertical cost.
    expect(Object.keys(gridLegendLine(true, 3, null))).toEqual(['label', 'value'])
  })

  it('ranks the four states so the most specific answer wins', () => {
    // Painted outranks everything: a field that drew and then lost a later
    // chunk is still a field, and calling it unavailable would contradict what
    // the reader can see.
    expect(gridLegendLine(true, 3, 45, true).value).toBe('3 km')
    // A failure outranks a wait, because waiting is over once it has failed.
    expect(gridLegendLine(false, 3, 45, true).value).toBe('Unavailable')
    // And a wait outranks a plain load, being the more specific answer to the
    // same question. A countdown that has run out is not a wait worth naming.
    expect(gridLegendLine(false, 3, 0).value).toBe('Loading')
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
    cols: 1,
    rows: 2,
    west: -121.8,
    south: 46.3,
    latStep: 0.2,
    lonStep: 0.2,
    pitchKm: 13,
  }

  const wx = (precip: number[]): WeatherResult => ({
    precip_total_in: precip.reduce((a, b) => a + b, 0),
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 40,
    temp_max_f: 60,
    temp_avg_f: 50,
    wind_min_mph: 1,
    wind_max_mph: 9,
    wind_avg_mph: 5,
    series: {
      times: [1000, 2000],
      precip_in: precip,
      temp_f: [40, 60],
      wind_mph: [1, 9],
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

  it('leaves no stale series_times on an aligned sample', () => {
    // After the remap the series IS on the report's grid; a row still claiming
    // its old stamps would be corrupted by a second alignment.
    const cells = pairCells(spec, [0, 1], [wx([0.1, 0.2]), null], noAqi, [1000, 2000])
    expect(cells[0].row.series_times).toBeUndefined()
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

describe('gridRaster', () => {
  it('is one pixel per sample, the lattice\'s own shape', () => {
    // Deliberately tiny: the smoothing is the raster layer's, so this only has
    // to carry the values. A 600-sample lattice is a ~25x24 image.
    const spec = buildGrid(CASCADES, 25)!
    const raster = gridRaster(spec, allCells(spec), 'temp_avg_f', null)!
    expect(raster.width).toBe(spec.cols)
    expect(raster.height).toBe(spec.rows)
    expect(raster.rgba).toHaveLength(spec.cols * spec.rows * 4)
  })

  it('paints a sparse lattice at its virtual positions and leaves the gap empty', () => {
    // Two patches an ocean apart, in one image: each kept sample lands at the
    // pixel its VIRTUAL index names, and a virtual cell no destination
    // reaches stays fully transparent — the raster asserts nothing about the
    // water it never sampled.
    const spec = buildGrid(field([46.85, -121.76], [37.75, 14.99]), 3)!
    const raster = gridRaster(spec, allCells(spec), 'temp_avg_f', null, 'blocks')!
    for (const v of [spec.indices[0], spec.indices[spec.indices.length - 1]]) {
      expect(pixelAlpha(raster, spec, v)).toBe(255)
    }
    const kept = new Set(spec.indices)
    // A cell from the middle of the lattice's central row: mid-Atlantic.
    const mid = Math.floor(spec.rows / 2) * spec.cols + Math.floor(spec.cols / 2)
    expect(kept.has(mid)).toBe(false)
    expect(pixelAlpha(raster, spec, mid)).toBe(0)
  })

  it('flips rows, because a lattice counts north and an image counts south', () => {
    // Sample 0 is the lattice's SOUTH-WEST corner and pixel row 0 is the
    // image's NORTH edge. Getting this backwards mirrors the whole field
    // about its own centre, which on smooth terrain looks plausible and is
    // completely wrong.
    const spec: GridSpec = {
      points: [
        { latitude: 46.0, longitude: -122 },
        { latitude: 47.0, longitude: -122 },
      ],
      cells: [
        [-122.5, 45.5, -121.5, 46.5],
        [-122.5, 46.5, -121.5, 47.5],
      ],
      indices: [0, 1],
      cols: 1,
      rows: 2,
      west: -122.5,
      south: 45.5,
      latStep: 1,
      lonStep: 1,
      pitchKm: 13,
    }
    const south = result({ temp_avg_f: 80 })
    const north = result({ temp_avg_f: 20 })
    const raster = gridRaster(
      spec,
      [cell(spec.cells[0], south, 0), cell(spec.cells[1], north, 1)],
      'temp_avg_f',
      null,
    )!
    // Row 0 of the image is the north sample, which is the cold one.
    expect(pixelHex(raster, 0, 0)).toBe(pixelHex(raster, 0, 0))
    const rowTop = raster.rgba[3 * 0]
    expect(rowTop).toBeDefined()
    // Green channel is higher on the cold (green) end than the hot (red) end.
    const topGreen = raster.rgba[1]
    const bottomGreen = raster.rgba[1 * 4 + 1]
    expect(topGreen).toBeGreaterThan(bottomGreen)
  })

  it('colours a sample exactly as the marker standing on it', () => {
    // Asserted against the markers' own feature builder rather than a literal,
    // because the claim is agreement and not a particular hex: a field that
    // disagreed with its own markers would be unreadable in the one place a
    // reader is most likely to check it. Both at rest and under the playhead,
    // which read different scales.
    const row = result({
      precip_total_in: 0.3,
      series: { precip_in: [0, 0.4], temp_f: [40, 60], wind_mph: [1, 9], aqi: [10, 20] },
    })
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    for (const hour of [null, 0, 1]) {
      const raster = gridRaster(oneSpec(box), [cell(box, row)], 'precip_total_in', hour)!
      const markerColor = resultsFeatureCollection([row], 'precip_total_in', true, hour)
        .features[0].properties!.color
      expect(pixelHex(raster)).toBe(markerColor)
    }
  })

  it('leaves a sample with no value fully transparent', () => {
    // A marker has to stay on screen — it is a place the user asked about — so
    // it goes grey. The field is background, and a grey patch over terrain
    // would assert something the app does not know.
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    const raster = gridRaster(oneSpec(box), [cell(box, result({ aqi_avg: null }))], 'aqi_avg', null)!
    expect(raster.rgba[3]).toBe(0)
  })

  it('gives a gap a neighbour\'s colour, so bilinear does not fringe it black', () => {
    // The subtle one. Magnification samples RGB from transparent pixels too, so
    // a hole left at rgba(0,0,0,0) drags every neighbouring blend toward black
    // and rings the gap in exactly the place the field knows nothing about.
    // Opacity still says "no data"; only the colour is borrowed.
    const spec: GridSpec = {
      points: [
        { latitude: 46, longitude: -122 },
        { latitude: 46, longitude: -121 },
      ],
      cells: [
        [-122.5, 45.5, -121.5, 46.5],
        [-121.5, 45.5, -120.5, 46.5],
      ],
      indices: [0, 1],
      cols: 2,
      rows: 1,
      west: -122.5,
      south: 45.5,
      latStep: 1,
      lonStep: 1,
      pitchKm: 13,
    }
    // Only the second sample answered.
    const raster = gridRaster(spec, [cell(spec.cells[1], result(), 1)], 'temp_avg_f', null)!
    expect(raster.rgba[3]).toBe(0)
    expect(pixelHex(raster, 0, 0)).toBe(pixelHex(raster, 1, 0))
  })

  it('fades the padded outer ring, and only on an axis with room', () => {
    // buildGrid pads by one pitch, so the outer ring sits outside every
    // destination found — the right place to spend on a soft edge instead of
    // ending the field in a hard rectangle. A lattice too small to have an
    // interior is all edge, and fading it would fade the data.
    const big = buildGrid(mesh(46, 47.5, -123, -121, 0.15), 13)!
    expect(big.cols).toBeGreaterThanOrEqual(5)
    expect(big.rows).toBeGreaterThanOrEqual(5)
    const bigRaster = gridRaster(big, allCells(big), 'temp_avg_f', null, 'smooth')!
    // The northernmost kept cell sits on the blob's rim — its north neighbour
    // is beyond every destination's reach — and fades.
    const rim = big.indices[big.indices.length - 1]
    expect(pixelAlpha(bigRaster, big, rim)).toBeLessThan(255)
    // A cell in the middle of the filled field is interior and stays full.
    expect(pixelAlpha(bigRaster, big, virtualIndexAt(big, 46.75, -122))).toBe(255)

    // A hand-built three-by-three patch — the reach floor of two pitches
    // means buildGrid never makes one this small, but a lattice can still be
    // all edge, and fading it would fade the data.
    const latStep = 0.1
    const lonStep = 0.1
    const smallIndices = Array.from({ length: 9 }, (_, v) => v)
    const small: GridSpec = {
      points: smallIndices.map((v) => ({
        latitude: 46 + (Math.floor(v / 3) + 0.5) * latStep,
        longitude: -122 + ((v % 3) + 0.5) * lonStep,
      })),
      cells: smallIndices.map((v) => {
        const w = -122 + (v % 3) * lonStep
        const s = 46 + Math.floor(v / 3) * latStep
        return [w, s, w + lonStep, s + latStep] as [number, number, number, number]
      }),
      indices: smallIndices,
      cols: 3,
      rows: 3,
      west: -122,
      south: 46,
      latStep,
      lonStep,
      pitchKm: 13,
    }
    const smallRaster = gridRaster(small, allCells(small), 'temp_avg_f', null, 'smooth')!
    for (const v of small.indices) {
      expect(pixelAlpha(smallRaster, small, v)).toBe(255)
    }
  })

  it('fades a tall narrow lattice on the axis that has room', () => {
    // The per-axis rule, and the case that caught it: a north-south polygon
    // over the Cascades grids four columns wide and eight rows tall. Testing
    // the lattice as a whole would leave it with a hard edge on all four sides
    // even though its rows had plenty of interior to spare.
    // A hand-built capsule — four columns, ten rows, every cell kept — because
    // this test is about edgeAlpha's per-axis rule, and deriving the shape
    // through buildGrid leaves it hostage to Math.ceil landing on a float
    // boundary. The shape is the one a north-south ridge line produces.
    const cols = 4
    const rows = 10
    const latStep = 0.1
    const lonStep = 0.1
    const indices = Array.from({ length: cols * rows }, (_, v) => v)
    const tall: GridSpec = {
      points: indices.map((v) => ({
        latitude: 46 + (Math.floor(v / cols) + 0.5) * latStep,
        longitude: -122 + ((v % cols) + 0.5) * lonStep,
      })),
      cells: indices.map((v) => {
        const w = -122 + (v % cols) * lonStep
        const s = 46 + Math.floor(v / cols) * latStep
        return [w, s, w + lonStep, s + latStep] as [number, number, number, number]
      }),
      indices,
      cols,
      rows,
      west: -122,
      south: 46,
      latStep,
      lonStep,
      pitchKm: 13,
    }
    const raster = gridRaster(tall, allCells(tall), 'temp_avg_f', null, 'smooth')!
    // The top row fades (ten rows have room); a mid-height cell in column 0
    // stays at full strength even though its western neighbour is missing,
    // because four columns have no interior to spare.
    expect(pixelAlpha(raster, tall, (rows - 1) * cols + 1)).toBeLessThan(255)
    expect(pixelAlpha(raster, tall, 5 * cols)).toBe(255)
  })

  it('fades on the missing-neighbour test, not on index arithmetic that wraps rows', () => {
    // The classic bug: `index - 1` at column zero is a valid index — the
    // PREVIOUS row's last cell — so an index-only check believes the western
    // neighbour exists. Three full rows in a five-wide lattice: the row-ends
    // must fade even though the wrapped index is kept.
    const cols = 5
    const rows = 5
    const indices = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
    const latStep = 0.1
    const lonStep = 0.1
    const spec: GridSpec = {
      points: indices.map((v) => ({
        latitude: 46 + (Math.floor(v / cols) + 0.5) * latStep,
        longitude: -122 + ((v % cols) + 0.5) * lonStep,
      })),
      cells: indices.map((v) => {
        const w = -122 + (v % cols) * lonStep
        const s = 46 + Math.floor(v / cols) * latStep
        return [w, s, w + lonStep, s + latStep] as [number, number, number, number]
      }),
      indices,
      cols,
      rows,
      west: -122,
      south: 46,
      latStep,
      lonStep,
      pitchKm: 13,
    }
    const raster = gridRaster(spec, allCells(spec), 'temp_avg_f', null, 'smooth')!
    // Cell (2, 0): row above and below kept, west out of the lattice — fades.
    // An index-arithmetic check reads kept cell 9 (row 1's LAST cell) as its
    // western neighbour and leaves it opaque.
    expect(pixelAlpha(raster, spec, 10)).toBeLessThan(255)
    // The dead centre has all four neighbours and stays full.
    expect(pixelAlpha(raster, spec, 12)).toBe(255)
  })

  it('leaves blocks fully opaque to the edge', () => {
    // The fade is smooth's alone. Blocks draws a boundary at every sample, so a
    // ring of half-transparent squares reads as samples that answered weakly
    // rather than as an edge; smooth has no boundaries and would otherwise stop
    // in a rectangle.
    const big = buildGrid(mesh(46, 47.5, -123, -121, 0.15), 13)!
    const cells = allCells(big)
    const rim = big.indices[big.indices.length - 1]
    expect(pixelAlpha(gridRaster(big, cells, 'temp_avg_f', null, 'blocks')!, big, rim)).toBe(255)
    expect(
      pixelAlpha(gridRaster(big, cells, 'temp_avg_f', null, 'smooth')!, big, rim),
    ).toBeLessThan(255)
  })

  it('colours a sample the same whichever style asks', () => {
    // One raster, two magnification filters. If the styles differed in colour,
    // flipping the segment would look like the forecast had changed.
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    const row = result({ temp_avg_f: 51 })
    const blocks = gridRaster(oneSpec(box), [cell(box, row)], 'temp_avg_f', null, 'blocks')!
    const smooth = gridRaster(oneSpec(box), [cell(box, row)], 'temp_avg_f', null, 'smooth')!
    expect(pixelHex(blocks)).toBe(pixelHex(smooth))
  })

  it('declines to draw nothing', () => {
    expect(gridRaster(buildGrid(CASCADES, 13)!, [], 'temp_avg_f', null)).toBeNull()
  })
})

describe('gridArrowFeatures', () => {
  const series = {
    precip_in: [0, 0],
    temp_f: [40, 60],
    wind_mph: [1, 9],
    aqi: [10, 20],
  }
  const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]

  it('turns an arrow the way the wind is going, and omits an unknown one', () => {
    // Arrow parity with the markers: Open-Meteo reports the direction wind
    // blows FROM, and the arrow points where it is headed. A missing bearing
    // omits the feature, because a 0 would draw a confident arrow north.
    const blowing = gridArrowFeatures(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, null] } }))],
      0,
    )
    expect(blowing.features[0].properties!.bearing).toBe(90)

    const unknown = gridArrowFeatures(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, null] } }))],
      1,
    )
    expect(unknown.features).toHaveLength(0)
  })

  it('places an arrow at its sample, the centre of the cell', () => {
    const fc = gridArrowFeatures(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, null] } }))],
      0,
    )
    expect((fc.features[0].geometry as { coordinates: number[] }).coordinates).toEqual([
      (box[0] + box[2]) / 2,
      (box[1] + box[3]) / 2,
    ])
  })

  it('draws nothing at rest, on any metric', () => {
    // At rest the field shows a window aggregate, which has no direction to
    // point in — the same contract the markers keep.
    const fc = gridArrowFeatures(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, 180] } }))],
      null,
    )
    expect(fc.features).toHaveLength(0)
  })
})
