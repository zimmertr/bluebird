import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAnalysisRun } from './useAnalysisRun'
import { AnalysisRefusalError } from '../utils/clientAnalyze'
import { forecastModel } from '../testSupport/fixtures'

const MODELS = [forecastModel()]
const hooks = () => ({ onFailure: vi.fn(), onSettled: vi.fn() })

describe('useAnalysisRun', () => {
  it('shows the seed while a run is in flight, and clears every status when it ends', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    let release!: () => void
    let done!: Promise<void>
    act(() => {
      done = result.current.run('Searching…', () => new Promise<void>((r) => (release = r)), hooks())
    })
    expect(result.current.loading).toBe(true)
    expect(result.current.statusMessage).toBe('Searching…')
    act(() => result.current.onProgress(3, 4, 'Retrieving Forecasts (3 of 4)…'))
    expect(result.current.progress).toEqual({ processed: 3, total: 4, percent: 75 })
    await act(async () => {
      release()
      await done
    })
    expect(result.current).toMatchObject({ loading: false, statusMessage: null, progress: null, error: null })
  })

  it('announces the counted field at zero, and reads an empty field as done', () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    act(() => result.current.announce(12))
    expect(result.current.progress).toEqual({ processed: 0, total: 12, percent: 0 })
    act(() => result.current.onProgress(0, 0, 'x'))
    expect(result.current.progress?.percent).toBe(100)
  })

  it('puts a failure in the error box and calls both hooks', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const h = hooks()
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), h))
    expect(result.current.error).toBe('Broken.')
    expect(h.onFailure).toHaveBeenCalledOnce()
    expect(h.onSettled).toHaveBeenCalledOnce()
  })

  it('puts a refusal in the warn box, not the error box', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    await act(() => result.current.run('s', async () => Promise.reject(new AnalysisRefusalError('Too many.')), hooks()))
    expect(result.current.refusal).toEqual({ message: 'Too many.' })
    expect(result.current.error).toBeNull()
  })

  it('aborts the run on cancel and shows nothing for it', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const h = hooks()
    let seen: AbortSignal | undefined
    let done!: Promise<void>
    act(() => {
      done = result.current.run(
        's',
        (signal) =>
          new Promise<void>((_, reject) => {
            seen = signal
            signal.addEventListener('abort', () => reject(new DOMException('stop', 'AbortError')))
          }),
        h,
      )
    })
    await act(async () => {
      result.current.cancel()
      await done
    })
    expect(seen?.aborted).toBe(true)
    expect(result.current).toMatchObject({ error: null, refusal: null, statusMessage: null, loading: false })
    expect(h.onFailure).toHaveBeenCalledOnce()
  })

  it('clears the last error and refusal as the next run starts, so an identical one shows again', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), hooks()))
    let release!: () => void
    let done!: Promise<void>
    act(() => {
      done = result.current.run('s', () => new Promise<void>((r) => (release = r)), hooks())
    })
    expect(result.current.error).toBeNull()
    await act(async () => {
      release()
      await done
    })
  })
})
