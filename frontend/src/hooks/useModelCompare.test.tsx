import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ModelCompareOptions, useModelCompare } from './useModelCompare'
import { analyzedSnapshot, fetchedSeries, forecastModel, resultRow, series, weatherResult } from '../testSupport/fixtures'
import { chartKey } from '../utils/chartData'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { type CompareDestination, pairKey } from '../utils/modelCompare'
import { fetchWeather, type WeatherResult } from '../utils/openMeteo'
import { COVERAGE_PHRASE, OpenMeteoModelCoverage } from '../utils/openMeteoErrors'

// The spend is `fetchWeather`, which has its own suite. Here every call is
// held open until the test answers it, so the order in which answers land is
// the test's to choose.
vi.mock('../utils/openMeteo', async (actual) => ({
  ...(await actual<typeof import('../utils/openMeteo')>()),
  fetchWeather: vi.fn(),
}))
const fetched = vi.mocked(fetchWeather)

interface Call {
  model: string
  signal: AbortSignal
  answer: (results: WeatherResult[]) => void
  fail: (error: unknown) => void
}
const calls: Call[] = []
fetched.mockImplementation(
  (_points, _start, _end, opts) =>
    new Promise<WeatherResult[]>((resolve, reject) => {
      calls.push({ model: opts?.model ?? '', signal: opts!.signal!, answer: resolve, fail: reject })
    }),
)

afterEach(() => {
  calls.length = 0
  fetched.mockClear()
})

const ROW = resultRow()
const KEY = chartKey(ROW)
const DESTINATIONS: CompareDestination[] = [
  {
    key: KEY,
    latitude: ROW.latitude,
    longitude: ROW.longitude,
    elevationFt: ROW.elevation_ft,
    terrainFallback: false,
    rank: 1,
    name: ROW.name,
    color: '#38bdf8',
  },
]
const MODELS = [forecastModel(), forecastModel({ id: 'icon_seamless', label: 'DWD ICON' })]
const ICON = ['icon_seamless']
const SNAPSHOT = analyzedSnapshot()
const ANALYZED = { window: SNAPSHOT.window, forecastModel: SNAPSHOT.forecastModel }
const HELD = { [KEY]: series({ precip_in: [0.1] }) }
const NO_COLORS = {}
const HOURS = [SNAPSHOT.window.startMs]

function options(over: Partial<ModelCompareOptions> = {}): ModelCompareOptions {
  return {
    enabled: true,
    destinations: DESTINATIONS,
    rows: DESTINATIONS,
    heldSeries: HELD,
    analyzed: ANALYZED,
    analysisSeq: 1,
    models: MODELS,
    picked: ICON,
    fetchable: ICON,
    colors: NO_COLORS,
    times: HOURS,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    ...over,
  }
}

function mount(initial: ModelCompareOptions = options()) {
  return renderHook((props: ModelCompareOptions) => useModelCompare(props), { initialProps: initial })
}

const noteFor = (result: { current: ReturnType<typeof useModelCompare> }, id: string) =>
  result.current.compared.find((m) => m.id === id)?.note

describe('useModelCompare', () => {
  it('holds the answer for each compared pair once it lands', async () => {
    const { result } = mount()
    expect(calls).toHaveLength(1)
    expect(calls[0].model).toBe('icon_seamless')
    const answer = weatherResult({ precip_total_in: 0.4, series: fetchedSeries({ times: HOURS, precip_in: [0.4] }) })
    await act(async () => calls[0].answer([answer]))
    expect(result.current.results[pairKey('icon_seamless', KEY)]).toEqual(answer)
    // The ranking model's line and the compared model's, one each.
    expect(result.current.lines).toHaveLength(2)
  })

  // A new analysis is a new question. An answer to the old one that lands
  // after it must not be filed under the new one.
  it('drops a late answer to an analysis that has been replaced', async () => {
    const { result, rerender } = mount()
    const first = calls[0]
    rerender(options({ analysisSeq: 2 }))
    expect(calls).toHaveLength(2)

    await act(async () => first.answer([weatherResult({ precip_total_in: 9 })]))
    expect(result.current.results).toEqual({})

    const fresh = weatherResult({ precip_total_in: 0.1 })
    await act(async () => calls[1].answer([fresh]))
    expect(result.current.results[pairKey('icon_seamless', KEY)]).toEqual(fresh)
  })

  it('aborts what is in the air when the analysis changes or the chart goes away', () => {
    const { rerender, unmount } = mount()
    const first = calls[0]
    expect(first.signal.aborted).toBe(false)
    rerender(options({ analysisSeq: 2 }))
    expect(first.signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)
    unmount()
    expect(calls[1].signal.aborted).toBe(true)
  })

  // An abort is the hook's own doing, not the model's failure, so its
  // rejection leaves nothing to explain on the analysis that caused it.
  it('says nothing about a request it aborted', async () => {
    const { result, rerender } = mount()
    const first = calls[0]
    rerender(options({ analysisSeq: 2 }))
    await act(async () => first.fail(new DOMException('aborted', 'AbortError')))
    expect(noteFor(result, 'icon_seamless')).toBeNull()
    const answer = weatherResult({ precip_total_in: 0.3 })
    await act(async () => calls[1].answer([answer]))
    expect(result.current.results[pairKey('icon_seamless', KEY)]).toEqual(answer)
  })

  it('names a model with no coverage for the area', async () => {
    const { result } = mount()
    await act(async () => calls[0].fail(new OpenMeteoModelCoverage('icon_seamless')))
    expect(noteFor(result, 'icon_seamless')).toBe(`DWD ICON ${COVERAGE_PHRASE}`)
    expect(result.current.results).toEqual({})
  })

  // A failed batch is not held against the model: ticking it again asks once
  // more, and the note clears while that request is in the air.
  it('asks again after a failure once the model is ticked again', async () => {
    const { result, rerender } = mount()
    await act(async () => calls[0].fail(new Error('Open-Meteo request failed. Try again later.')))
    expect(noteFor(result, 'icon_seamless')).toBe('Open-Meteo request failed. Try again later.')

    rerender(options({ picked: [], fetchable: ICON }))
    rerender(options())
    expect(calls).toHaveLength(2)
    expect(noteFor(result, 'icon_seamless')).toBeNull()
    const answer = weatherResult({ precip_total_in: 0.2 })
    await act(async () => calls[1].answer([answer]))
    expect(result.current.results[pairKey('icon_seamless', KEY)]).toEqual(answer)
  })
})
