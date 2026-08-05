import { describe, it, expect } from 'vitest'
import {
  FALLBACK_PITCH_KM,
  MAX_GRID_CELLS,
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

// A 1x1 lattice, for the derivations that only care about one sample's colour.
function oneSpec(box: [number, number, number, number]): GridSpec {
  return {
    points: [{ latitude: (box[1] + box[3]) / 2, longitude: (box[0] + box[2]) / 2 }],
    cells: [box],
    cols: 1,
    rows: 1,
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
    // A large field at HRRR's 3 km: the honest lattice would be tens of
    // thousands of cells, and what comes back is a coarser one that fits.
    const wide = field([42, -124], [49, -117])
    const spec = buildGrid(wide, 3)!
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
  it('splits into a label and a right-justified value once painted', () => {
    // Past the first samples the filling-in is visible on the map itself, so
    // the row goes back to describing what the field IS — in the same shape
    // every other layer row takes, name left and key right.
    expect(gridLegendLine(true, 3, null)).toEqual({ label: 'Grid size', value: '3 km' })
    expect(gridLegendLine(true, 3, 45)).toEqual({ label: 'Grid size', value: '3 km' })
  })

  it('names a failure rather than showing an empty layer', () => {
    // The layer is switched on and nothing is drawn. Saying nothing leaves a
    // checkbox that appears to do nothing, which is the reading this avoids.
    expect(gridLegendLine(false, 3, null, true)).toEqual({
      label: 'Forecast grid',
      value: 'Unavailable',
    })
    // Anything painted outranks it: a field that drew and then lost a later
    // chunk is still a field, and calling it unavailable would contradict what
    // the reader can see.
    expect(gridLegendLine(true, 3, null, true)).toEqual({ label: 'Grid size', value: '3 km' })
  })

  it('gives a status no value, since a status is not a key', () => {
    // The pacing line answers the question the plain one leaves open: why
    // nothing is happening. It borrows the analysis overlay's vocabulary
    // because it is the same wait for the same reason, and it takes the whole
    // row because there is no key to right-justify beside it.
    expect(gridLegendLine(false, 3, 45)).toEqual({ label: 'Waiting on quota · 45s', value: null })
    expect(gridLegendLine(false, 3, null)).toEqual({ label: 'Loading grid', value: null })
    // A countdown that has run out is not a wait worth naming.
    expect(gridLegendLine(false, 3, 0)).toEqual({ label: 'Loading grid', value: null })
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
    cols: 1,
    rows: 2,
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
    const spec = buildGrid(CASCADES, 25)!
    const [topLeft, topRight, bottomRight, bottomLeft] = gridImageCoordinates(spec)
    const [w, s] = spec.cells[0]
    const [, , e, n] = spec.cells[spec.cells.length - 1]
    expect(topLeft).toEqual([w, n])
    expect(topRight).toEqual([e, n])
    expect(bottomRight).toEqual([e, s])
    expect(bottomLeft).toEqual([w, s])

    // And the sample really does sit at its pixel's centre.
    const lonStep = (e - w) / spec.cols
    expect(spec.points[0].longitude).toBeCloseTo(w + 0.5 * lonStep, 10)
  })
})

describe('gridRaster', () => {
  it('is one pixel per sample, the lattice\'s own shape', () => {
    // Deliberately tiny: the smoothing is the raster layer's, so this only has
    // to carry the values. A 600-sample lattice is a ~25x24 image.
    const spec = buildGrid(CASCADES, 25)!
    const cells = spec.points.map((_, i) => cell(spec.cells[i], result(), i))
    const raster = gridRaster(spec, cells, 'temp_avg_f', null)!
    expect(raster.width).toBe(spec.cols)
    expect(raster.height).toBe(spec.rows)
    expect(raster.rgba).toHaveLength(spec.cols * spec.rows * 4)
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
      cols: 1,
      rows: 2,
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
      cols: 2,
      rows: 1,
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
    const big = buildGrid(field([46, -123], [47.5, -121]), 13)!
    expect(big.cols).toBeGreaterThanOrEqual(5)
    expect(big.rows).toBeGreaterThanOrEqual(5)
    const bigCells = big.points.map((_, i) => cell(big.cells[i], result(), i))
    const bigRaster = gridRaster(big, bigCells, 'temp_avg_f', null, 'smooth')!
    expect(bigRaster.rgba[3]).toBeLessThan(255)
    const midIndex = (Math.floor(big.rows / 2) * big.cols + Math.floor(big.cols / 2)) * 4
    expect(bigRaster.rgba[midIndex + 3]).toBe(255)

    const small = buildGrid(field([46.8, -121.8]), 25)!
    expect(small.cols).toBeLessThan(5)
    const smallCells = small.points.map((_, i) => cell(small.cells[i], result(), i))
    const smallRaster = gridRaster(small, smallCells, 'temp_avg_f', null, 'smooth')!
    expect(smallRaster.rgba[3]).toBe(255)
  })

  it('fades a tall narrow lattice on the axis that has room', () => {
    // The per-axis rule, and the case that caught it: a north-south polygon
    // over the Cascades grids four columns wide and eight rows tall. Testing
    // the lattice as a whole would leave it with a hard edge on all four sides
    // even though its rows had plenty of interior to spare.
    const tall = buildGrid(CASCADES, 13)!
    expect(tall.cols).toBeLessThan(5)
    expect(tall.rows).toBeGreaterThanOrEqual(5)
    const cells = tall.points.map((_, i) => cell(tall.cells[i], result(), i))
    const raster = gridRaster(tall, cells, 'temp_avg_f', null, 'smooth')!
    // Top row faded (rows have room); a middle row at full strength even though
    // it sits in column 0, which has none.
    expect(raster.rgba[3]).toBeLessThan(255)
    const midLeft = (Math.floor(tall.rows / 2) * tall.cols) * 4
    expect(raster.rgba[midLeft + 3]).toBe(255)
  })

  it('leaves blocks fully opaque to the edge', () => {
    // The fade is smooth's alone. Blocks draws a boundary at every sample, so a
    // ring of half-transparent squares reads as samples that answered weakly
    // rather than as an edge; smooth has no boundaries and would otherwise stop
    // in a rectangle.
    const big = buildGrid(field([46, -123], [47.5, -121]), 13)!
    const cells = big.points.map((_, i) => cell(big.cells[i], result(), i))
    expect(gridRaster(big, cells, 'temp_avg_f', null, 'blocks')!.rgba[3]).toBe(255)
    expect(gridRaster(big, cells, 'temp_avg_f', null, 'smooth')!.rgba[3]).toBeLessThan(255)
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
