import { describe, it, expect } from 'vitest'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import { callWeight } from './openMeteo'
import {
  MAX_COMPARE_MODELS,
  addableModels,
  compareColors,
  compareEndMs,
  compareSeries,
  isBlend,
} from './modelCompare'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 8, 12, 12, 0)

function model(id: string, forecastHours: number): ForecastModelOption {
  return {
    id,
    label: id.toUpperCase(),
    summary: '',
    finestGridKm: 3,
    forecastHours,
    regional: false,
  }
}

const MODELS: ForecastModelOption[] = [
  model('gfs_seamless', 384),
  model('ecmwf_ifs025', 336),
  model('gfs_hrrr', 42),
  model('meteofrance_seamless', 72),
]

// The cost of a comparison, in the unit every capacity number in this app is
// written in. The issue's own table said three models were free; it assumed
// three hourly variables and the browser sends nine, so the floor of the
// variable factor stops covering a second model.
describe('what a comparison costs', () => {
  const start = Date.UTC(2026, 8, 12, 0, 0)
  const end = Date.UTC(2026, 8, 13, 0, 0)

  it('prices models in one request at variables x models / 10', () => {
    expect(callWeight(1, start, end, 9, 1)).toBeCloseTo(1.0, 6)
    expect(callWeight(1, start, end, 9, 2)).toBeCloseTo(1.8, 6)
    expect(callWeight(1, start, end, 9, 3)).toBeCloseTo(2.7, 6)
  })

  // What the app actually spends: the analysis model's numbers are held, so a
  // three-model comparison buys two model series, as one single-model request
  // each. The premium over asking for both in one request is 0.2 weighted
  // calls, and it buys a per-model coverage answer a bare-keyed multi-model
  // response cannot give.
  it('spends two single-model requests for a three-model comparison', () => {
    const split = 2 * callWeight(1, start, end, 9, 1)
    expect(split).toBeCloseTo(2.0, 6)
    expect(split - callWeight(1, start, end, 9, 2)).toBeCloseTo(0.2, 6)
  })

  it('scales with the window the way any other request does', () => {
    const long = Date.UTC(2026, 8, 27, 0, 0) // 16 days inclusive
    expect(callWeight(1, start, long, 9, 1)).toBeCloseTo(16 / 14, 6)
  })

  it('caps the comparison at three models', () => {
    expect(MAX_COMPARE_MODELS).toBe(3)
  })
})

describe('isBlend', () => {
  it('reads Open-Meteo’s seamless products as blends', () => {
    expect(isBlend('gfs_seamless')).toBe(true)
    expect(isBlend('gem_seamless')).toBe(true)
    expect(isBlend('meteofrance_seamless')).toBe(true)
  })

  it('leaves the single-model products unlabelled', () => {
    expect(isBlend('ecmwf_ifs025')).toBe(false)
    expect(isBlend('gfs_hrrr')).toBe(false)
  })
})

describe('compareEndMs', () => {
  it('stops at the shortest reach among the models on the chart', () => {
    const end = NOW + 10 * DAY
    expect(compareEndMs(end, [384, 42], NOW)).toBe(NOW + 42 * HOUR)
  })

  it('leaves a window every model covers alone', () => {
    const end = NOW + DAY
    expect(compareEndMs(end, [384, 42], NOW)).toBe(end)
  })

  // forecast_hours counts hours ahead of now, so history is not model-limited.
  it('leaves a window in the past alone', () => {
    const end = NOW - DAY
    expect(compareEndMs(end, [42], NOW)).toBe(end)
  })

  it('is the window itself when nothing is compared', () => {
    const end = NOW + 10 * DAY
    expect(compareEndMs(end, [], NOW)).toBe(end)
  })
})

describe('addableModels', () => {
  const window = { startMs: NOW, endMs: NOW + DAY }
  const ids = (list: ForecastModelOption[]) => list.map((m) => m.id)

  it('offers every other model that reaches the window', () => {
    expect(ids(addableModels(MODELS, 'gfs_seamless', [], window, NOW))).toEqual([
      'ecmwf_ifs025',
      'gfs_hrrr',
      'meteofrance_seamless',
    ])
  })

  it('drops a model already on the chart', () => {
    expect(ids(addableModels(MODELS, 'gfs_seamless', ['gfs_hrrr'], window, NOW))).toEqual([
      'ecmwf_ifs025',
      'meteofrance_seamless',
    ])
  })

  it('offers nothing once the cap is reached', () => {
    expect(
      addableModels(MODELS, 'gfs_seamless', ['gfs_hrrr', 'ecmwf_ifs025'], window, NOW),
    ).toEqual([])
  })

  // Adding one would clamp every line on the chart to nothing, so it is not
  // offered — the same rule the calendar applies to a day past a model's reach.
  it('drops a model whose reach stops before the window starts', () => {
    // At five days out only ECMWF's 336 hours still reach: HRRR stops at 42
    // and ARPEGE at 72.
    const far = { startMs: NOW + 5 * DAY, endMs: NOW + 6 * DAY }
    expect(ids(addableModels(MODELS, 'gfs_seamless', [], far, NOW))).toEqual(['ecmwf_ifs025'])
  })

  it('keeps the published order', () => {
    const reordered = [...MODELS].reverse()
    expect(ids(addableModels(reordered, 'gfs_seamless', [], window, NOW))).toEqual([
      'meteofrance_seamless',
      'gfs_hrrr',
      'ecmwf_ifs025',
    ])
  })
})

describe('compareColors', () => {
  it('gives each model a colour and skips the destination’s own', () => {
    const first = compareColors('#000000', ['a', 'b'])
    const colors = compareColors(first.a, ['a', 'b'])
    expect(Object.values(colors)).not.toContain(first.a)
    expect(colors.a).not.toBe(colors.b)
  })

  it('is stable for the same destination and models', () => {
    expect(compareColors('#000000', ['a', 'b'])).toEqual(compareColors('#000000', ['a', 'b']))
  })
})

describe('compareSeries', () => {
  const fetched = {
    times: [2000, 3000],
    precip_in: [0.1, 0.2],
    temp_f: [30, 31],
    wind_mph: [5, 6],
  }

  it('re-indexes a clamped fetch onto the chart’s grid', () => {
    const series = compareSeries(fetched, [1000, 2000, 3000, 4000])!
    expect(series.precip_in).toEqual([null, 0.1, 0.2, null])
    expect(series.temp_f).toEqual([null, 30, 31, null])
    expect(series.wind_mph).toEqual([null, 5, 6, null])
  })

  // Air quality has one model, so there is no second answer to draw.
  it('carries no air quality', () => {
    expect(compareSeries(fetched, [2000, 3000])!.aqi).toEqual([null, null])
  })

  it('has nothing to draw for a model that answered with nothing', () => {
    expect(compareSeries(null, [1000])).toBeNull()
  })
})
