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
    let done!: Promise<boolean>
    act(() => {
      done = result.current.run('Searching…', () => new Promise<void>((r) => (release = r)), hooks())
    })
    expect(result.current.loading).toBe(true)
    expect(result.current.statusMessage).toBe('Searching…')
    act(() => result.current.onProgress(3, 4, 'Retrieving forecasts (3 of 4)…'))
    expect(result.current.progress).toEqual({ processed: 3, total: 4, percent: 75 })
    await act(async () => {
      release()
      await done
    })
    expect(result.current).toMatchObject({ loading: false, statusMessage: null, progress: null, error: null })
  })

  it('shows the tail label over a full bar', () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    act(() => result.current.onProgress(4, 4, 'Retrieving forecasts: 4 of 4 peaks…'))
    act(() => result.current.onTail('Retrieving air quality…'))
    expect(result.current.statusMessage).toBe('Retrieving air quality…')
    expect(result.current.progress).toEqual({ processed: 4, total: 4, percent: 100 })
  })

  it('announces the counted field at zero, and reads an empty field as done', () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    act(() => result.current.announce(12))
    expect(result.current.progress).toEqual({ processed: 0, total: 12, percent: 0 })
    act(() => result.current.onProgress(0, 0, 'x'))
    expect(result.current.progress?.percent).toBe(100)
  })

  // The failure hook is told the kind, since a failed polygon run keeps the
  // field it found and a cancel drops it (#782).
  it('puts a failure in the error box and calls both hooks, naming the kind', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const h = hooks()
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), h))
    expect(result.current.error).toEqual({ message: 'Broken.', retry: true })
    expect(h.onFailure).toHaveBeenCalledExactlyOnceWith('error')
    expect(h.onSettled).toHaveBeenCalledOnce()
  })

  // #736: a dismissed event line clears its state, so the Analyze button that
  // reads `Try again` off the error reads `Analyze` again at once.
  // A refusal is a blocker since #803, which no dismissal reaches.
  it('clears the error on its dismissal, and never the refusal', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), hooks()))
    act(() => result.current.dismissEvent('error'))
    expect(result.current.error).toBeNull()
    await act(() => result.current.run('s', async () => Promise.reject(new AnalysisRefusalError('Too many.')), hooks()))
    act(() => result.current.dismissEvent('error'))
    expect(result.current.refusal).toEqual({ message: 'Too many.' })
  })

  it('holds a refusal apart from the run error', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const h = hooks()
    await act(() => result.current.run('s', async () => Promise.reject(new AnalysisRefusalError('Too many.')), h))
    expect(result.current.refusal).toEqual({ message: 'Too many.' })
    expect(result.current.error).toBeNull()
    expect(h.onFailure).toHaveBeenCalledExactlyOnceWith('refusal')
  })

  // #803: the message list opens on a failure, keyed on this count. Each
  // error and each refusal moves it, the same one twice included; a cancel
  // and a run that finished do not.
  it('counts each run that ends in an error or a refusal, and nothing else', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    expect(result.current.failureSeq).toBe(0)
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), hooks()))
    expect(result.current.failureSeq).toBe(1)
    await act(() => result.current.run('s', async () => Promise.reject(new Error('Broken.')), hooks()))
    expect(result.current.failureSeq).toBe(2)
    await act(() => result.current.run('s', async () => Promise.reject(new AnalysisRefusalError('Too many.')), hooks()))
    expect(result.current.failureSeq).toBe(3)
    await act(() => result.current.run('s', async () => Promise.reject(new DOMException('stop', 'AbortError')), hooks()))
    await act(() => result.current.run('s', async () => {}, hooks()))
    expect(result.current.failureSeq).toBe(3)
  })

  it('aborts the run on cancel and shows nothing for it', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const h = hooks()
    let seen: AbortSignal | undefined
    let done!: Promise<boolean>
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
    expect(h.onFailure).toHaveBeenCalledExactlyOnceWith('cancel')
  })

  // #560: the caller keeps its own bookkeeping off a run that changed nothing,
  // so the run has to say which kind it was.
  it('resolves true only when the body finished', async () => {
    const { result } = renderHook(() => useAnalysisRun(MODELS))
    const outcomes: boolean[] = []
    await act(async () => {
      outcomes.push(await result.current.run('s', async () => {}, hooks()))
      outcomes.push(await result.current.run('s', async () => Promise.reject(new Error('Broken.')), hooks()))
      outcomes.push(await result.current.run('s', async () => Promise.reject(new DOMException('stop', 'AbortError')), hooks()))
    })
    expect(outcomes).toEqual([true, false, false])
  })

  it('clears the last error and refusal as the next run starts', async () => {
    for (const failure of [new Error('Broken.'), new AnalysisRefusalError('Too many.')]) {
      const { result } = renderHook(() => useAnalysisRun(MODELS))
      await act(() => result.current.run('s', async () => Promise.reject(failure), hooks()))
      expect(result.current.error ?? result.current.refusal, failure.message).not.toBeNull()
      let release!: () => void
      let done!: Promise<boolean>
      act(() => {
        done = result.current.run('s', () => new Promise<void>((r) => (release = r)), hooks())
      })
      expect(result.current.error, failure.message).toBeNull()
      expect(result.current.refusal, failure.message).toBeNull()
      await act(async () => {
        release()
        await done
      })
    }
  })
})
