import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ForecastGridInputs, useForecastGrid } from './useForecastGrid'
import { analyzedSnapshot, resultRow, weatherResult } from '../testSupport/fixtures'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { fetchAqi, fetchCloud, fetchWeather, type WeatherResult } from '../utils/openMeteo'

// The three fetches have their own suite. Here the weather is held open until
// the test answers it, so the order in which answers land is the test's to
// choose; air quality answers at once with nothing, which the grid tolerates.
vi.mock('../utils/openMeteo', async (actual) => ({
  ...(await actual<typeof import('../utils/openMeteo')>()),
  fetchWeather: vi.fn(),
  fetchAqi: vi.fn(),
  fetchCloud: vi.fn(),
}))
const weather = vi.mocked(fetchWeather)

interface Call {
  points: number
  signal: AbortSignal
  answer: (results: WeatherResult[]) => void
  fail: (error: unknown) => void
}
const calls: Call[] = []
weather.mockImplementation(
  (points, _start, _end, opts) =>
    new Promise<WeatherResult[]>((resolve, reject) => {
      calls.push({ points: points.length, signal: opts!.signal!, answer: resolve, fail: reject })
    }),
)
vi.mocked(fetchAqi).mockResolvedValue({ results: [], failed: [] })
vi.mocked(fetchCloud).mockResolvedValue([])

let warned: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  calls.length = 0
  weather.mockClear()
  warned.mockRestore()
})

// One destination at a 13 km pitch and the smallest reach: a lattice of a
// handful of samples, all in one chunk.
const FIELD = [resultRow()]
const SNAPSHOT = analyzedSnapshot()
const NO_TIMES: number[] = []

function inputs(over: Partial<ForecastGridInputs> = {}): ForecastGridInputs {
  return {
    enabled: true,
    field: FIELD,
    window: SNAPSHOT.window,
    model: SNAPSHOT.forecastModel,
    times: NO_TIMES,
    pitchKm: 13,
    reachFrac: 0,
    displayReachFrac: 0,
    analysisSeq: 1,
    arriving: false,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    aqiForecastDays: 5,
    cloud: false,
    ...over,
  }
}

function mount(initial: ForecastGridInputs = inputs()) {
  return renderHook((props: ForecastGridInputs) => useForecastGrid(props), { initialProps: initial })
}

/** One forecast per sample the call asked for. */
const answers = (call: Call, over: Partial<NonNullable<WeatherResult>> = {}) =>
  Array.from({ length: call.points }, () => weatherResult(over))

describe('useForecastGrid', () => {
  it('paints the lattice once its forecasts land', async () => {
    const { result } = mount()
    expect(result.current.status).toBe('loading')
    expect(calls).toHaveLength(1)
    await act(async () => calls[0].answer(answers(calls[0])))
    expect(result.current.status).toBe('ready')
    expect(result.current.complete).toBe(true)
    expect(result.current.cells).toHaveLength(calls[0].points)
  })

  // A new analysis grids a new field over a new window. An answer to the old
  // one that lands after it must not paint under the new markers.
  it('drops a late answer to an analysis that has been replaced', async () => {
    const { result, rerender } = mount()
    const first = calls[0]
    rerender(inputs({ analysisSeq: 2 }))
    expect(calls).toHaveLength(2)

    await act(async () => first.answer(answers(first, { precip_total_in: 9 })))
    expect(result.current.status).toBe('loading')
    expect(result.current.cells).toEqual([])

    await act(async () => calls[1].answer(answers(calls[1], { precip_total_in: 0.1 })))
    expect(result.current.status).toBe('ready')
    expect(result.current.cells.every((c) => c.row.precip_total_in === 0.1)).toBe(true)
  })

  // #560: the snapshot of a run still arriving may never stand as a report.
  // A lattice fetched for it would be held under the sequence of the report a
  // cancel puts back, and served under that report's markers.
  it('fetches nothing while a run arrives, and keeps its lattice when the run is put back', async () => {
    const { result, rerender } = mount()
    await act(async () => calls[0].answer(answers(calls[0])))
    const held = result.current.cells
    rerender(inputs({ arriving: true, pitchKm: 25, field: [resultRow({ latitude: 40 })] }))
    expect(calls).toHaveLength(1)
    rerender(inputs())
    expect(calls).toHaveLength(1)
    expect(result.current.cells).toEqual(held)
    expect(result.current.status).toBe('ready')
  })

  it('aborts the fetch when the layer is switched off, and goes back to idle', async () => {
    const { result, rerender } = mount()
    const first = calls[0]
    rerender(inputs({ enabled: false }))
    expect(first.signal.aborted).toBe(true)
    expect(result.current.status).toBe('idle')

    // The abort's own rejection is the hook's doing, not a failure to report.
    await act(async () => first.fail(new DOMException('aborted', 'AbortError')))
    expect(result.current.status).toBe('idle')
    expect(warned).not.toHaveBeenCalled()
  })

  it('aborts the fetch when the analysis changes', () => {
    const { rerender } = mount()
    const first = calls[0]
    rerender(inputs({ analysisSeq: 2 }))
    expect(first.signal.aborted).toBe(true)
    expect(calls[1].signal.aborted).toBe(false)
  })

  it('reports a failure when nothing was painted', async () => {
    const { result } = mount()
    await act(async () => calls[0].fail(new Error('Open-Meteo request failed. Try again later.')))
    expect(result.current.status).toBe('failed')
    expect(result.current.paceRemainingS).toBeNull()
    expect(warned).toHaveBeenCalledOnce()
  })
})
