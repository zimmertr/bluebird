import { describe, it, expect } from 'vitest'
import {
  FALLBACK_PITCH_KM,
  MAX_GRID_CELLS,
  buildGrid,
  gridFeatureCollection,
  pairCells,
  pitchLabel,
  type GridCell,
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

function cell(box: [number, number, number, number], row: DestinationResult): GridCell {
  return { box, row }
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
  it('keeps a decimal below 10 km and drops it above', () => {
    // GEM's finest grid is 2.5 km. Rounding that to "3 km" would contradict the
    // number the model picker prints beside its own name.
    expect(pitchLabel(2.5)).toBe('2.5 km grid')
    expect(pitchLabel(3)).toBe('3 km grid')
    expect(pitchLabel(13.27)).toBe('13 km grid')
    expect(pitchLabel(25)).toBe('25 km grid')
  })
})

describe('pairCells', () => {
  const spec = {
    points: [
      { latitude: 46.4, longitude: -121.7 },
      { latitude: 46.5, longitude: -121.7 },
    ],
    cells: [
      [-121.8, 46.3, -121.6, 46.5],
      [-121.8, 46.5, -121.6, 46.7],
    ] as [number, number, number, number][],
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

  it('keeps a cell on its own square when an earlier one has no forecast', () => {
    // The bug this exists to stop: `assemble` drops rows whose weather came
    // back null, which over a whole lattice would slide every later cell onto
    // the wrong square — a forecast drawn a cell to the left of where it was
    // measured.
    const cells = pairCells(spec, [null, wx([0.1, 0.2])], noAqi, [1000, 2000])
    expect(cells).toHaveLength(1)
    expect(cells[0].box).toEqual(spec.cells[1])
    expect(cells[0].row.latitude).toBe(46.5)
  })

  it('re-indexes each cell onto the report grid by timestamp', () => {
    // The lattice and the report are fetched for one window under one model, so
    // in practice their grids match. The alignment is the guarantee: an hour
    // the cell does not cover reads null rather than borrowing a neighbour's.
    const cells = pairCells(spec, [wx([0.1, 0.2]), null], noAqi, [500, 1000, 2000])
    expect(cells[0].row.series!.precip_in).toEqual([null, 0.1, 0.2])
    // And the bearings come along, or the cell arrows silently vanish.
    expect(cells[0].row.series!.wind_dir_deg).toEqual([null, 90, 270])
  })

  it('leaves no stale series_times on an aligned cell', () => {
    // After the remap the series IS on the report's grid; a row still claiming
    // its old stamps would be corrupted by a second alignment.
    const cells = pairCells(spec, [wx([0.1, 0.2]), null], noAqi, [1000, 2000])
    expect(cells[0].row.series_times).toBeUndefined()
  })
})

describe('gridFeatureCollection', () => {
  it('closes each cell as a five-point ring', () => {
    const fc = gridFeatureCollection(
      [cell([-121.8, 46.3, -121.6, 46.5], result())],
      'precip_total_in',
      null,
    )
    const ring = (fc.features[0].geometry as { coordinates: number[][][] }).coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it('scores a cell exactly as the marker standing on it', () => {
    // Asserted against the markers' own feature builder rather than against a
    // literal, because the claim is agreement and not a particular hex: a cell
    // that disagreed with its own marker would make the grid unreadable in the
    // one place a reader is most likely to check it. Both at rest and under the
    // playhead, which read different scales.
    const row = result({
      precip_total_in: 0.3,
      series: { precip_in: [0, 0.4], temp_f: [40, 60], wind_mph: [1, 9], aqi: [10, 20] },
    })
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    for (const hour of [null, 0, 1]) {
      const cellColor = gridFeatureCollection([cell(box, row)], 'precip_total_in', hour)
        .features[0]?.properties!.color
      const markerColor = resultsFeatureCollection([row], 'precip_total_in', true, hour)
        .features[0].properties!.color
      expect(cellColor).toBe(markerColor)
    }
  })

  it('drops a cell with no value instead of greying it', () => {
    // A marker has to stay on screen — it is a place the user asked about — so
    // it goes grey. A cell is background, and a grey block over terrain would
    // assert something the app does not know.
    const fc = gridFeatureCollection(
      [cell([-121.8, 46.3, -121.6, 46.5], result({ aqi_avg: null }))],
      'aqi_avg',
      null,
    )
    expect(fc.features).toHaveLength(0)
  })

  it('colors one hour under the playhead, on the hourly scale', () => {
    // Precipitation is the reason the scale has to move: the ranking bins a
    // window total and one hour of it is a rate. 0.4 in one hour is heavy rain
    // and orange; the same 0.4 as a window total is past the top of its scale.
    const row = result({
      precip_total_in: 0.4,
      series: {
        precip_in: [0, 0.4],
        temp_f: [40, 60],
        wind_mph: [1, 9],
        aqi: [10, 20],
      },
    })
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    const hourly = gridFeatureCollection([cell(box, row)], 'precip_total_in', 1).features[0]
      .properties!.color
    const window = gridFeatureCollection([cell(box, row)], 'precip_total_in', null).features[0]
      .properties!.color
    expect(hourly).not.toBe(window)
  })

  it('turns a cell arrow the way the wind is going, and omits an unknown one', () => {
    // Arrow parity with the markers: Open-Meteo reports the direction wind
    // blows FROM, and the arrow points where it is headed. A missing bearing
    // omits the property, because the layer filters on its presence and a 0
    // would draw a confident arrow pointing north.
    const series = {
      precip_in: [0, 0],
      temp_f: [40, 60],
      wind_mph: [1, 9],
      aqi: [10, 20],
    }
    const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]
    const blowing = gridFeatureCollection(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, null] } }))],
      'wind_avg_mph',
      0,
    ).features[0].properties!
    expect(blowing.bearing).toBe(90)

    const unknown = gridFeatureCollection(
      [cell(box, result({ series: { ...series, wind_dir_deg: [270, null] } }))],
      'wind_avg_mph',
      1,
    ).features[0].properties!
    expect('bearing' in unknown).toBe(false)
  })

  it('carries no bearing at rest, on any metric', () => {
    // At rest the cells show a window aggregate, which has no direction to
    // point in — the same contract the markers keep.
    const props = gridFeatureCollection(
      [
        cell(
          [-121.8, 46.3, -121.6, 46.5],
          result({
            series: {
              precip_in: [0, 0],
              temp_f: [40, 60],
              wind_mph: [1, 9],
              aqi: [10, 20],
              wind_dir_deg: [270, 180],
            },
          }),
        ),
      ],
      'wind_avg_mph',
      null,
    ).features[0].properties!
    expect('bearing' in props).toBe(false)
  })
})
