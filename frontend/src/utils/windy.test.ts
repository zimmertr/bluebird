import { describe, expect, it } from 'vitest'
import { extremeHourMs, windyModel, windyTime, windyUrl } from './windy'
import { HourlySeries } from '../types'

const RAINIER = { latitude: 46.8523, longitude: -121.7603 }

function series(over: Partial<HourlySeries> = {}): HourlySeries {
  return {
    precip_in: [0, 0, 0.1, 0],
    temp_f: [30, 21, 38, 25],
    wind_mph: [4, 22, 9, 12],
    freeze_ft: [9000, 8000, 11000, 9500],
    aqi: [31, 44, 20, 35],
    ...over,
  }
}

// One hour apart, starting at 2026-09-16T12:00Z.
const TIMES = [
  Date.UTC(2026, 8, 16, 12),
  Date.UTC(2026, 8, 16, 13),
  Date.UTC(2026, 8, 16, 14),
  Date.UTC(2026, 8, 16, 15),
]

describe('which model Windy is asked for', () => {
  // Matched by the agency behind the model: a reader who picked the Met Office
  // should land on the Met Office's model.
  it('maps every forecast model this app offers', () => {
    const at = (id: string) => windyModel(id, RAINIER.latitude, RAINIER.longitude)
    expect(at('ecmwf_ifs025')).toBe('ecmwf')
    expect(at('gfs_seamless')).toBe('gfs')
    expect(at('icon_seamless')).toBe('icon')
    expect(at('gem_seamless')).toBe('canHrdps')
    expect(at('ukmo_seamless')).toBe('ukv')
    expect(at('meteofrance_seamless')).toBe('arome')
    expect(at('jma_seamless')).toBe('jmaMsm')
    expect(at('gfs_hrrr')).toBe('hrrrConus')
  })

  // HRRR is one model here and two domains on Windy, so the destination picks.
  it('sends the HRRR domain the destination is in', () => {
    expect(windyModel('gfs_hrrr', 63.07, -151.0)).toBe('hrrrAlaska')
    expect(windyModel('gfs_hrrr', 51.88, -176.65)).toBe('hrrrAlaska')
    expect(windyModel('gfs_hrrr', 46.85, -121.76)).toBe('hrrrConus')
    expect(windyModel('gfs_hrrr', 40.0, -105.0)).toBe('hrrrConus')
  })

  // A link built before a model is known, or naming one this deployment stopped
  // publishing, asks for no model at all rather than for the wrong one.
  it('asks for nothing when the model is unknown', () => {
    expect(windyModel(null, 46, -121)).toBeNull()
    expect(windyModel(undefined, 46, -121)).toBeNull()
    expect(windyModel('best_match', 46, -121)).toBeNull()
  })
})

describe('the hour Windy is asked for', () => {
  // UTC, measured against the live site: 5 AM Pacific is hour 13 there.
  it('is UTC, zero padded', () => {
    expect(windyTime(Date.UTC(2026, 8, 16, 13))).toBe('2026-09-16-13')
    expect(windyTime(Date.UTC(2026, 0, 2, 3))).toBe('2026-01-02-03')
  })

  it('does not roll the date off the local clock', () => {
    // 2026-09-17T00:00Z is the evening of the 16th in the Pacific zone the
    // tests run near; the token must still say the 17th.
    expect(windyTime(Date.UTC(2026, 8, 17, 0))).toBe('2026-09-17-00')
  })
})

describe('which hour produced a cell', () => {
  it('finds the hour of a floor and of a ceiling', () => {
    expect(extremeHourMs('temp_min_f', series(), TIMES)).toBe(TIMES[1])
    expect(extremeHourMs('temp_max_f', series(), TIMES)).toBe(TIMES[2])
    expect(extremeHourMs('wind_max_mph', series(), TIMES)).toBe(TIMES[1])
    expect(extremeHourMs('aqi_min', series(), TIMES)).toBe(TIMES[2])
    expect(extremeHourMs('freeze_max_ft', series(), TIMES)).toBe(TIMES[2])
  })

  // A flat run names its beginning rather than an arbitrary hour inside it: a
  // night of no rain starts when it starts.
  it('takes the first hour of a tie', () => {
    expect(extremeHourMs('precip_min_in_hr', series(), TIMES)).toBe(TIMES[0])
  })

  // An average and a window total are every hour at once, so they name none.
  it('names no hour for an average or a total', () => {
    expect(extremeHourMs('temp_avg_f', series(), TIMES)).toBeNull()
    expect(extremeHourMs('precip_total_in', series(), TIMES)).toBeNull()
    expect(extremeHourMs('name', series(), TIMES)).toBeNull()
  })

  // Nulls are skipped rather than read as zero, which is the rule the
  // aggregation itself follows. Five of the eight models publish no freezing
  // level at all, so an all-null column is the ordinary case there.
  it('skips absent hours and answers nothing when every hour is absent', () => {
    const gappy = series({ temp_f: [null, 21, null, 38] })
    expect(extremeHourMs('temp_min_f', gappy, TIMES)).toBe(TIMES[1])
    expect(extremeHourMs('temp_max_f', gappy, TIMES)).toBe(TIMES[3])
    expect(extremeHourMs('freeze_min_ft', series({ freeze_ft: [null, null] }), TIMES)).toBeNull()
  })

  it('answers nothing without a series', () => {
    expect(extremeHourMs('temp_min_f', null, TIMES)).toBeNull()
    expect(extremeHourMs('temp_min_f', undefined, TIMES)).toBeNull()
  })

  // A row whose series is longer than the grid it is drawn on must not read a
  // timestamp that does not exist.
  it('never reads past the end of the time grid', () => {
    expect(extremeHourMs('temp_max_f', series(), TIMES.slice(0, 2))).toBe(TIMES[0])
  })
})

describe('the link', () => {
  it('leads with the model, then the layer', () => {
    expect(
      windyUrl({ ...RAINIER, layer: 'temp', modelId: 'gfs_seamless' }),
    ).toBe('https://www.windy.com/?gfs,temp,46.8523,-121.7603,11')
  })

  it('puts the hour between the layer and the coordinates', () => {
    expect(
      windyUrl({
        ...RAINIER,
        layer: 'temp',
        modelId: 'gfs_seamless',
        atMs: Date.UTC(2026, 8, 16, 13),
      }),
    ).toBe('https://www.windy.com/?gfs,temp,2026-09-16-13,46.8523,-121.7603,11')
  })

  // The shape the link had before any of this, which is what a cell naming no
  // hour on a model Windy does not carry still gets.
  it('falls back to the coordinate and the layer alone', () => {
    expect(windyUrl({ ...RAINIER, layer: 'rain' })).toBe(
      'https://www.windy.com/?rain,46.8523,-121.7603,11',
    )
  })

  // Windy rewrites the path itself, so sending one would be a second spelling
  // of something it already owns.
  it('sends no path segment', () => {
    expect(windyUrl({ ...RAINIER, layer: 'temp' })).toContain('windy.com/?')
  })
})
