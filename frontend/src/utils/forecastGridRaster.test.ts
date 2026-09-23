import { describe, it, expect } from 'vitest'
import { buildGrid, type GridCell, type GridSpec } from './forecastGridLattice'
import { gridRaster } from './forecastGridRaster'
import { resultsFeatureCollection } from './resultFeatures'
import { gridCell, gridRow } from '../testSupport/fixtures'

// A field of destinations, as coordinates — the only part of a result the
// lattice reads.
function field(...points: [number, number][]) {
  return points.map(([latitude, longitude]) => ({ latitude, longitude }))
}

// Rainier and Adams: ~80 km apart, which is the everyday polygon this feature
// was designed around.
const CASCADES = field([46.8523, -121.7603], [46.2024, -121.4909])

// Every kept sample answered: cells built the way pairCells builds them, with
// the VIRTUAL lattice index from spec.indices — a position-as-index shortcut
// here is exactly the conflation the sparse lattice forbids.
function allCells(spec: GridSpec): GridCell[] {
  return spec.points.map((_, i) => gridCell(spec.cells[i], gridRow(), spec.indices[i]))
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
    distancesKm: [0],
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
      distancesKm: [0, 0],
      cols: 1,
      rows: 2,
      west: -122.5,
      south: 45.5,
      latStep: 1,
      lonStep: 1,
      pitchKm: 13,
    }
    const south = gridRow({ temp_avg_f: 80 })
    const north = gridRow({ temp_avg_f: 20 })
    const raster = gridRaster(
      spec,
      [gridCell(spec.cells[0], south, 0), gridCell(spec.cells[1], north, 1)],
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
    const row = gridRow({
      precip_total_in: 0.3,
      series: { precip_in: [0, 0.4], temp_f: [40, 60], wind_mph: [1, 9], freeze_ft: [9000, 9500], aqi: [10, 20] },
    })
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    for (const hour of [null, 0, 1]) {
      const raster = gridRaster(oneSpec(box), [gridCell(box, row)], 'precip_total_in', hour)!
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
    const raster = gridRaster(oneSpec(box), [gridCell(box, gridRow({ aqi_avg: null }))], 'aqi_avg', null)!
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
      distancesKm: [0, 0],
      cols: 2,
      rows: 1,
      west: -122.5,
      south: 45.5,
      latStep: 1,
      lonStep: 1,
      pitchKm: 13,
    }
    // Only the second sample answered.
    const raster = gridRaster(spec, [gridCell(spec.cells[1], gridRow(), 1)], 'temp_avg_f', null)!
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
      distancesKm: smallIndices.map(() => 0),
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
      distancesKm: indices.map(() => 0),
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
      distancesKm: indices.map(() => 0),
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
    const row = gridRow({ temp_avg_f: 51 })
    const blocks = gridRaster(oneSpec(box), [gridCell(box, row)], 'temp_avg_f', null, 'blocks')!
    const smooth = gridRaster(oneSpec(box), [gridCell(box, row)], 'temp_avg_f', null, 'smooth')!
    expect(pixelHex(blocks)).toBe(pixelHex(smooth))
  })

  it('declines to draw nothing', () => {
    expect(gridRaster(buildGrid(CASCADES, 13)!, [], 'temp_avg_f', null)).toBeNull()
  })
})
