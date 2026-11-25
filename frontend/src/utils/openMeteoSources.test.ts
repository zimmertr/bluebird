import { afterEach, describe, expect, it } from 'vitest'
import {
  BREAKER_OPEN_MS,
  FORECAST_URL,
  HEDGE_CAP_MS,
  HEDGE_DEFAULT_MS,
  HEDGE_FLOOR_MS,
  MAX_HEDGES_PER_RUN,
  OUTAGE_WAITS_S,
  OUTAGE_WINDOW_MS,
  PUBLIC_SOURCE,
  RunBudget,
  chainFor,
  hedgeDelayMs,
  parseSources,
  recordFailure,
  recordLatency,
  recordSuccess,
  resetSourceState,
  setOpenMeteoSources,
} from './openMeteoSources'

const MIRROR = {
  name: 'mirror' as const,
  forecast_url: 'https://om.example.org/v1/forecast',
  archive_url: null,
  air_quality_url: 'https://om.example.org/v1/air-quality',
  paced: false,
}

afterEach(() => resetSourceState())

describe('parseSources', () => {
  it('keeps the published list in its order', () => {
    expect(parseSources({ open_meteo_sources: [MIRROR, PUBLIC_SOURCE] })).toEqual([MIRROR, PUBLIC_SOURCE])
  })

  it('answers the public hosts for a build that publishes none', () => {
    expect(parseSources({ limits: {} })).toEqual([PUBLIC_SOURCE])
    expect(parseSources(null)).toEqual([PUBLIC_SOURCE])
  })

  it('drops an entry of the wrong shape, or one that is not https', () => {
    const plain = { ...MIRROR, forecast_url: 'http://om.example.org/v1/forecast' }
    const unnamed = { ...MIRROR, name: 'other' }
    const unpaced = { ...MIRROR, paced: 'no' }
    expect(parseSources({ open_meteo_sources: [plain, unnamed, unpaced, PUBLIC_SOURCE] })).toEqual([PUBLIC_SOURCE])
    expect(parseSources({ open_meteo_sources: [plain] })).toEqual([PUBLIC_SOURCE])
  })
})

describe('chainFor', () => {
  it('is the public hosts alone until a list is set', () => {
    expect(chainFor('forecast').map((l) => l.url)).toEqual([FORECAST_URL])
  })

  it('lists only the sources that answer the endpoint', () => {
    setOpenMeteoSources([MIRROR, PUBLIC_SOURCE])
    expect(chainFor('forecast').map((l) => l.source.name)).toEqual(['mirror', 'open-meteo'])
    expect(chainFor('archive').map((l) => l.source.name)).toEqual(['open-meteo'])
  })

  it('never takes an empty list', () => {
    setOpenMeteoSources([])
    expect(chainFor('forecast').map((l) => l.url)).toEqual([FORECAST_URL])
  })

  it('moves a host that failed twice to the back for a minute, and forward again when it answers', () => {
    setOpenMeteoSources([MIRROR, PUBLIC_SOURCE])
    recordFailure(MIRROR.forecast_url, 0)
    expect(chainFor('forecast', 1).map((l) => l.source.name)).toEqual(['mirror', 'open-meteo'])
    recordFailure(MIRROR.forecast_url, 1)
    expect(chainFor('forecast', 2).map((l) => l.source.name)).toEqual(['open-meteo', 'mirror'])
    // The breaker is the host's, so the mirror's air quality moves with it.
    expect(chainFor('air_quality', 2).map((l) => l.source.name)).toEqual(['open-meteo', 'mirror'])
    expect(chainFor('forecast', 1 + BREAKER_OPEN_MS).map((l) => l.source.name)).toEqual(['mirror', 'open-meteo'])
    recordFailure(MIRROR.forecast_url, 2)
    recordFailure(MIRROR.forecast_url, 3)
    recordSuccess(MIRROR.forecast_url)
    expect(chainFor('forecast', 4).map((l) => l.source.name)).toEqual(['mirror', 'open-meteo'])
  })
})

describe('hedgeDelayMs', () => {
  it('waits the default until the host has been measured five times', () => {
    for (let i = 0; i < 4; i++) recordLatency(FORECAST_URL, 1_800, 50)
    expect(hedgeDelayMs(FORECAST_URL, 50)).toBe(HEDGE_DEFAULT_MS)
  })

  it('scales the host\'s 95th percentile per place to the batch, within the floor and the cap', () => {
    // 1.8 s for 50 places is 36 ms a place: 50 places hedge at the floor, 200
    // at 7.2 s, and 400 at the cap.
    for (let i = 0; i < 5; i++) recordLatency(FORECAST_URL, 1_800, 50)
    expect(hedgeDelayMs(FORECAST_URL, 50)).toBe(HEDGE_FLOOR_MS)
    expect(hedgeDelayMs(FORECAST_URL, 200)).toBeCloseTo(7_200)
    expect(hedgeDelayMs(FORECAST_URL, 400)).toBe(HEDGE_CAP_MS)
  })

  it('reads the slow tail, not the typical answer', () => {
    for (let i = 0; i < 19; i++) recordLatency(FORECAST_URL, 1_000, 50)
    recordLatency(FORECAST_URL, 7_700, 50)
    expect(hedgeDelayMs(FORECAST_URL, 50)).toBe(HEDGE_FLOOR_MS)
    recordLatency(FORECAST_URL, 7_700, 50)
    expect(hedgeDelayMs(FORECAST_URL, 50)).toBeCloseTo(7_700)
  })
})

describe('RunBudget', () => {
  it('opens one outage window at the first ask, the length of the waits', () => {
    expect(OUTAGE_WAITS_S.reduce((a, b) => a + b, 0) * 1000).toBe(OUTAGE_WINDOW_MS)
    const run = new RunBudget()
    expect(run.outageLeftMs(1_000)).toBe(OUTAGE_WINDOW_MS)
    expect(run.outageLeftMs(11_000)).toBe(OUTAGE_WINDOW_MS - 10_000)
    expect(run.outageLeftMs(1_000 + OUTAGE_WINDOW_MS)).toBe(0)
  })

  it('allows a fixed number of second copies', () => {
    const run = new RunBudget()
    for (let i = 0; i < MAX_HEDGES_PER_RUN; i++) {
      expect(run.hasHedge()).toBe(true)
      run.takeHedge()
    }
    expect(run.hasHedge()).toBe(false)
  })
})
