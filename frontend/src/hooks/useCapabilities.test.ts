import { describe, expect, it } from 'vitest'
import {
  FALLBACK_FORECAST_MODEL,
  gridLabel,
  modelForecastHours,
  parseCapabilities,
  publishesModels,
  reachLabel,
} from './useCapabilities'
// `?raw` gives the file's text without executing it. The one text check left
// here compares forecastWindow.ts against the values the module exports, which
// a lint rule could only do by copying the numbers. The rest of the rule that a
// published limit has one source lives in the linter (tools/eslint/checks).
import forecastWindowSource from '../utils/forecastWindow.ts?raw'
import { AQI_LIMIT_DAYS } from '../utils/calendar'
import {
  FALLBACK_WINDOW_LIMITS,
  FUTURE_LIMIT_SLACK_DAYS,
  PAST_DATA_DAYS,
  PAST_LIMIT_SLACK_DAYS,
} from '../utils/forecastWindow'

describe('parseCapabilities', () => {
  const body = {
    limits: {
      max_destinations: 900,
      max_limit: 800,
      max_polygon_area_km2: 70_000,
      archive_days: 200,
      // Deliberately none of the compiled fallbacks, so an assertion below
      // cannot pass by reading the constant it is meant to have replaced.
      max_past_days: 210,
      max_future_days: 9,
      past_data_days: 30,
      aqi_forecast_days: 4,
    },
    // Deliberately NOT in reach order: the server ranks these for mountain
    // terrain, and a client that re-sorted would undo the ranking.
    forecast_models: [
      {
        id: 'gfs_seamless',
        label: 'NOAA GFS',
        summary: 'Sharp over North America at 3 km.',
        finest_grid_km: 3,
        forecast_hours: 384,
        regional: false,
        blend: true,
        default: true,
      },
      // No `summary` and no `blend`: a deployment on an older build publishes
      // neither, and the row has to render as a plain name rather than as a gap.
      { id: 'gem_seamless', label: 'ECCC GEM', forecast_hours: 216, regional: false },
      { id: 'ecmwf_ifs025', label: 'ECMWF IFS', forecast_hours: 336, regional: false },
      { id: 'gfs_hrrr', label: 'NOAA HRRR', forecast_hours: 42, regional: true },
    ],
  }

  it('takes every ceiling the deployment publishes', () => {
    expect(parseCapabilities(body)).toEqual({
      maxDestinations: 900,
      maxLimit: 800,
      maxPolygonAreaKm2: 70_000,
      archiveDays: 200,
      aqiForecastDays: 4,
      windowLimits: { maxPastDays: 210, maxFutureDays: 9, pastDataDays: 30 },
      forecastModels: [
        {
          id: 'gfs_seamless',
          label: 'NOAA GFS',
          summary: 'Sharp over North America at 3 km.',
          finestGridKm: 3,
          forecastHours: 384,
          regional: false,
          blend: true,
        },
        {
          id: 'gem_seamless',
          label: 'ECCC GEM',
          summary: '',
          finestGridKm: 0,
          forecastHours: 216,
          regional: false,
          blend: false,
        },
        {
          id: 'ecmwf_ifs025',
          label: 'ECMWF IFS',
          summary: '',
          finestGridKm: 0,
          forecastHours: 336,
          regional: false,
          blend: false,
        },
        {
          id: 'gfs_hrrr',
          label: 'NOAA HRRR',
          summary: '',
          finestGridKm: 0,
          forecastHours: 42,
          regional: true,
          blend: false,
        },
      ],
      defaultForecastModel: 'gfs_seamless',
    })
  })

  // The regression this pair caught while it was being written: the model
  // fields are spread over the parsed limits, so a body publishing ceilings but
  // no models must not have those ceilings replaced by compiled fallbacks.
  it('keeps the published ceilings when the deployment publishes no models', () => {
    const older = parseCapabilities({ limits: { max_limit: 800, max_destinations: 900 } })
    expect(older.maxLimit).toBe(800)
    expect(older.maxDestinations).toBe(900)
    expect(older.forecastModels).toEqual([FALLBACK_FORECAST_MODEL])
  })

  // Only a published list can refuse a link's model, so the stand-in must be
  // told apart from it: before the answer, and when the body has no list.
  it('tells a published model list from the stand-in', () => {
    expect(publishesModels(parseCapabilities({ limits: {} }).forecastModels)).toBe(false)
    expect(publishesModels(parseCapabilities(null).forecastModels)).toBe(false)
    const published = parseCapabilities({
      limits: {},
      forecast_models: [{ id: 'gfs_seamless', forecast_hours: 384, default: true }],
    })
    expect(publishesModels(published.forecastModels)).toBe(true)
  })

  it('drops model entries missing the fields that make one usable', () => {
    const parsed = parseCapabilities({
      limits: {},
      forecast_models: [
        { id: 'good', forecast_hours: 100 },
        { id: 'no_hours' },
        { forecast_hours: 50 },
      ],
    })
    expect(parsed.forecastModels.map((m) => m.id)).toEqual(['good'])
    // No `default` flag anywhere still has to name one, or the panel would
    // land with nothing selected.
    expect(parsed.defaultForecastModel).toBe('good')
    // And a missing label reads as the id rather than as a gap.
    expect(parsed.forecastModels[0].label).toBe('good')
  })

  // The chart marks a blended line, because a blend changes model partway
  // along. That mark is the server's claim, never an inference from the id:
  // `gem_seamless` above publishes no flag and is a blend in reality, and a
  // client that read the suffix would assert what it was never told.
  it('reads the blend flag rather than the model id', () => {
    const models = parseCapabilities(body).forecastModels
    expect(models.find((m) => m.id === 'gfs_seamless')!.blend).toBe(true)
    expect(models.find((m) => m.id === 'gem_seamless')!.blend).toBe(false)
  })

  // An unknown model is an old link or a dropped model, and the calendar has to
  // pick some reach for it. The shortest on offer, not the longest: a day drawn
  // as available and returned empty is worse than one drawn as unavailable that
  // would have worked.
  // The server's ranking is not a sort on anything the client can see, so the
  // client must not impose one of its own.
  it('preserves the published order rather than re-sorting', () => {
    expect(parseCapabilities(body).forecastModels.map((m) => m.id)).toEqual([
      'gfs_seamless',
      'gem_seamless',
      'ecmwf_ifs025',
      'gfs_hrrr',
    ])
  })

  it('assumes the shortest reach for a model it does not recognize', () => {
    const models = parseCapabilities(body).forecastModels
    expect(modelForecastHours(models, 'ecmwf_ifs025')).toBe(336)
    expect(modelForecastHours(models, 'something_retired')).toBe(42)
  })

  it('falls back per field, so an older deployment keeps the rest', () => {
    const partial = parseCapabilities({ limits: { max_limit: 800 } })
    expect(partial.maxLimit).toBe(800)
    // Not undefined: these feed Math.min, a polygon comparison, and the
    // calendar's near edge.
    expect(partial.maxDestinations).toBeGreaterThan(0)
    expect(partial.maxPolygonAreaKm2).toBeGreaterThan(0)
    expect(partial.archiveDays).toBeGreaterThan(0)
    expect(partial.aqiForecastDays).toBeGreaterThan(0)
  })

  // The three window bounds arrive as one object, so the per-field rule has to
  // hold INSIDE it too: a deployment publishing one of them must not take the
  // two beside it down to undefined, where the window check would compare
  // against NaN and refuse everything.
  it('falls back per field inside the window bounds', () => {
    const partial = parseCapabilities({ limits: { max_future_days: 9 } })
    expect(partial.windowLimits).toEqual({
      maxPastDays: PAST_LIMIT_SLACK_DAYS,
      maxFutureDays: 9,
      pastDataDays: PAST_DATA_DAYS,
    })
  })

  it('falls back whole when the body is missing, empty, or the wrong shape', () => {
    const fallback = parseCapabilities(null)
    expect(fallback.maxPolygonAreaKm2).toBeGreaterThan(0)
    expect(parseCapabilities({})).toEqual(fallback)
    expect(parseCapabilities({ limits: {} })).toEqual(fallback)
    expect(parseCapabilities({ limits: { max_limit: 'lots' } })).toEqual(fallback)
  })
})

// The same rule over the last four published limits (#393). `max_past_days`,
// `max_future_days`, `past_data_days` and `aqi_forecast_days` were published
// and ignored while the browser computed with copies of its own; now the copies
// are fallbacks and nothing but the fallback reads them.
describe('the window bounds and the air-quality horizon have one source', () => {
  // The declarations themselves, which is the one place each number may appear.
  // Stripped rather than excused, so the assertion below is about every OTHER
  // line of the file: a second occurrence is the mirrored constant #152
  // removed, reborn as a value someone computed with instead of passing in.
  const FALLBACK_DECLARATIONS = [
    'PAST_LIMIT_SLACK_DAYS',
    'FUTURE_LIMIT_SLACK_DAYS',
    'PAST_DATA_DAYS',
  ]
  const elsewhere = forecastWindowSource
    .split('\n')
    .filter((line) => !FALLBACK_DECLARATIONS.some((n) => line.startsWith(`export const ${n} =`)))
    .join('\n')

  it('spells each window bound only where its fallback is declared', () => {
    for (const value of [PAST_LIMIT_SLACK_DAYS, FUTURE_LIMIT_SLACK_DAYS, PAST_DATA_DAYS]) {
      // Bounded by hyphens as well as digits, or a date in a comment would
      // read as one of these numbers and fail a file that is perfectly fine.
      expect(
        elsewhere,
        `forecastWindow.ts must take ${value} as an argument, not spell it`,
      ).not.toMatch(new RegExp(`(?<![\\d-])${value}(?![\\d-])`))
    }
  })

  // The moment before /api/capabilities answers must behave exactly as the app
  // behaved when these numbers were compiled in. That is what makes the
  // fallback safe, and it is only true while it IS the old constant.
  it('falls back to the numbers the browser used to compute with', () => {
    const fallback = parseCapabilities(null)
    expect(fallback.aqiForecastDays).toBe(AQI_LIMIT_DAYS)
    expect(fallback.windowLimits).toEqual(FALLBACK_WINDOW_LIMITS)
    expect(FALLBACK_WINDOW_LIMITS).toEqual({
      maxPastDays: PAST_LIMIT_SLACK_DAYS,
      maxFutureDays: FUTURE_LIMIT_SLACK_DAYS,
      pastDataDays: PAST_DATA_DAYS,
    })
  })
})

describe('the two figures the picker prints beside a model', () => {
  it('prints a grid in km, keeping a fractional one', () => {
    expect(gridLabel(3)).toBe('3 km')
    expect(gridLabel(2.5)).toBe('2.5 km')
    expect(gridLabel(25)).toBe('25 km')
  })

  // A deployment that publishes no figure gets no figure, not "0 km".
  it('prints nothing for a grid it was not told', () => {
    expect(gridLabel(0)).toBe('')
  })

  it('prints reach in whole days', () => {
    expect(reachLabel(384)).toBe('16 days')
    expect(reachLabel(336)).toBe('14 days')
    expect(reachLabel(72)).toBe('3 days')
  })

  // HRRR is 42 hours, which is the only entry that does not divide evenly and
  // the only one where rounding is a judgement rather than arithmetic.
  it('rounds a part-day reach rather than truncating it', () => {
    expect(reachLabel(42)).toBe('2 days')
  })

  it('never rounds a real reach down to nothing, and singularizes one day', () => {
    expect(reachLabel(6)).toBe('1 day')
    expect(reachLabel(24)).toBe('1 day')
  })

  it('prints nothing for a reach it was not told', () => {
    expect(reachLabel(0)).toBe('')
  })
})
