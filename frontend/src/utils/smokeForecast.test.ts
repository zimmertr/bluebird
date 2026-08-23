import { describe, expect, it } from 'vitest'
import { SMOKE_FILL, SMOKE_OPACITY } from './smoke'
import { forecastStampLabel } from './timeline'
import {
  BOX_PAD_DEG,
  SMOKE_CLASS_OUTSIDE,
  type SmokeForecastResponse,
  allOutside,
  classDensity,
  fieldBox,
  frameFor,
  smokeForecastLegend,
  smokeImageCoordinates,
  smokeRaster,
} from './smokeForecast'

const HOUR = 3_600_000

function response(overrides: Partial<SmokeForecastResponse> = {}): SmokeForecastResponse {
  return {
    cycle: '2026-08-23T00:00:00Z',
    fetched_at: 1_755_000_000_000,
    west: -122,
    south: 47,
    east: -121,
    north: 48,
    cols: 2,
    rows: 2,
    pitch_km: 3,
    hours: [{ time: 1_000 * HOUR, cells: [0, 1, 2, 3] }],
    ...overrides,
  }
}

describe('classDensity', () => {
  it('maps the three classes and nothing else', () => {
    expect(classDensity(1)).toBe('Light')
    expect(classDensity(2)).toBe('Medium')
    expect(classDensity(3)).toBe('Heavy')
    expect(classDensity(0)).toBeNull()
  })

  it('does not treat off-the-grid as a density', () => {
    // 255 means the model does not cover this cell. Drawing it as any density
    // would assert smoke where nothing was ever computed.
    expect(classDensity(SMOKE_CLASS_OUTSIDE)).toBeNull()
  })
})

describe('fieldBox', () => {
  it('pads the field so the plume has an edge on screen', () => {
    const box = fieldBox([
      { latitude: 47.0, longitude: -121.5 },
      { latitude: 47.4, longitude: -121.1 },
    ])
    expect(box).toEqual({
      west: -121.5 - BOX_PAD_DEG,
      south: 47.0 - BOX_PAD_DEG,
      east: -121.1 + BOX_PAD_DEG,
      north: 47.4 + BOX_PAD_DEG,
    })
  })

  it('has no box without a field', () => {
    expect(fieldBox(null)).toBeNull()
    expect(fieldBox([])).toBeNull()
  })

  it('refuses a field straddling the antimeridian', () => {
    // A west/east box is ill-defined there, and the long way round would ask
    // for the other 340 degrees of the planet.
    expect(
      fieldBox([
        { latitude: 52, longitude: 179 },
        { latitude: 52, longitude: -179 },
      ]),
    ).toBeNull()
  })
})

describe('frameFor', () => {
  const held = response({
    hours: [
      { time: 1_000 * HOUR, cells: [1, 1, 1, 1] },
      { time: 1_001 * HOUR, cells: [2, 2, 2, 2] },
    ],
  })

  it('finds the hour the playhead is on', () => {
    expect(frameFor(held, 1_001 * HOUR)?.cells[0]).toBe(2)
  })

  it('draws nothing rather than the nearest hour', () => {
    // A miss means the model has nothing for that time. Snapping to a
    // neighbour would put smoke on the map for an hour it was never forecast.
    expect(frameFor(held, 1_000 * HOUR + 60_000)).toBeNull()
    expect(frameFor(held, 1_009 * HOUR)).toBeNull()
  })

  it('is null with no report or no playhead', () => {
    expect(frameFor(null, 1_000 * HOUR)).toBeNull()
    expect(frameFor(held, null)).toBeNull()
  })
})

describe('smokeRaster', () => {
  const held = response()
  const raster = smokeRaster(held, held.hours[0])

  it('is the size of the lattice', () => {
    expect(raster.width).toBe(2)
    expect(raster.height).toBe(2)
    expect(raster.rgba.length).toBe(2 * 2 * 4)
  })

  it('flips the rows, because a lattice counts north and an image counts south', () => {
    // cells [0,1,2,3] are two rows south-first, so the lattice's TOP row is
    // [2, 3] and that is what the image's first row must be.
    expect(raster.rgba[3]).toBe(Math.round(SMOKE_OPACITY.Medium * 255))
    expect(raster.rgba[7]).toBe(Math.round(SMOKE_OPACITY.Heavy * 255))
    // The image's second row is the lattice's southern one: nothing, then Light.
    expect(raster.rgba[11]).toBe(0)
    expect(raster.rgba[15]).toBe(Math.round(SMOKE_OPACITY.Light * 255))
  })

  it('writes the fill colour into every pixel, including the empty ones', () => {
    // MapLibre magnifies this with a linear filter, which samples colour from
    // transparent pixels too. A hole left at black would ring itself in black.
    const red = parseInt(SMOKE_FILL.slice(1, 3), 16)
    for (let pixel = 0; pixel < raster.rgba.length; pixel += 4) {
      expect(raster.rgba[pixel]).toBe(red)
    }
  })

  it('draws an off-the-grid cell as nothing', () => {
    const outside = response({ hours: [{ time: 0, cells: [SMOKE_CLASS_OUTSIDE, 0, 0, 0] }] })
    expect(smokeRaster(outside, outside.hours[0]).rgba[3 + 4 * 2]).toBe(0)
  })
})

describe('smokeImageCoordinates', () => {
  it('reads the corners off the response, clockwise from the north-west', () => {
    expect(smokeImageCoordinates(response())).toEqual([
      [-122, 48],
      [-121, 48],
      [-121, 47],
      [-122, 47],
    ])
  })
})

describe('smokeForecastLegend', () => {
  const end = 1_005 * HOUR

  it('names the layer in every state, never the value', () => {
    const states = [
      smokeForecastLegend(null, end, true, false),
      smokeForecastLegend(null, end, false, true),
      smokeForecastLegend(response(), end, false, false),
    ]
    for (const state of states) expect(state.label).toBe('Forecast smoke')
  })

  it('reports a failure ahead of anything else', () => {
    expect(smokeForecastLegend(null, end, true, true)).toMatchObject({
      value: 'Unavailable',
      kind: 'error',
    })
  })

  it('says it is loading before a report lands', () => {
    expect(smokeForecastLegend(null, end, false, true).value).toBe('Loading')
  })

  it('separates a limit in time from a limit in space', () => {
    // Two different not-covered states. A reader told the wrong one goes
    // looking for the wrong fix.
    const noHours = response({ hours: [] })
    expect(smokeForecastLegend(noHours, end, false, false).value).toBe('Outside model reach')

    const noArea = response({
      hours: [{ time: 1_000 * HOUR, cells: Array(4).fill(SMOKE_CLASS_OUTSIDE) }],
    })
    expect(smokeForecastLegend(noArea, end, false, false).value).toBe('Outside model area')
  })

  it('says where the model stops when it stops inside the window', () => {
    const last = 1_002 * HOUR
    const partial = response({ hours: [{ time: last, cells: [1, 1, 1, 1] }] })
    expect(smokeForecastLegend(partial, end, false, false)).toMatchObject({
      value: `Through ${forecastStampLabel(last)}`,
      kind: 'status',
    })
  })

  it('states the pitch once the whole window is covered', () => {
    const whole = response({ hours: [{ time: end, cells: [1, 1, 1, 1] }], pitch_km: 9.3 })
    expect(smokeForecastLegend(whole, end, false, false)).toMatchObject({
      value: '9.3 km',
      kind: 'pitch',
    })
  })

  it('prefers the reach warning over the pitch', () => {
    // "This stops on Sunday afternoon" changes what a reader does. "3 km"
    // does not.
    const partial = response({ hours: [{ time: 1_001 * HOUR, cells: [3, 3, 3, 3] }] })
    expect(smokeForecastLegend(partial, end, false, false).kind).toBe('status')
  })
})

describe('allOutside', () => {
  it('is true only when nothing in the hour was covered', () => {
    expect(allOutside({ time: 0, cells: [255, 255] })).toBe(true)
    expect(allOutside({ time: 0, cells: [255, 0] })).toBe(false)
    expect(allOutside({ time: 0, cells: [] })).toBe(false)
  })
})
