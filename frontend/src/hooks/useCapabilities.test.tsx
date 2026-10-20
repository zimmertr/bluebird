import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { parseCapabilities, useCapabilities, type LiveCapabilities } from './useCapabilities'
import { fakeResponse } from '../testSupport/fixtures'

// The hook around `parseCapabilities`, whose own suite is node-only. Every
// render's value is kept, because what must not happen is one render that
// says settled over the compiled stand-ins.
const FALLBACK = parseCapabilities(null)

function setup(answer: (signal: AbortSignal) => Promise<Response>) {
  const signals: AbortSignal[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((_path: string, init: RequestInit) => {
      signals.push(init.signal!)
      return answer(init.signal!)
    }),
  )
  const renders: LiveCapabilities[] = []
  const view = renderHook(() => {
    const caps = useCapabilities()
    renders.push(caps)
    return caps
  })
  return { ...view, renders, signals }
}

// A promise the test resolves, for the answer that has not come yet.
function pending() {
  let resolve!: (res: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

afterEach(() => vi.unstubAllGlobals())

describe('useCapabilities', () => {
  it('holds the fallback until the deployment answers, then its limits', async () => {
    const answer = pending()
    const { result, renders } = setup(() => answer.promise)
    expect(result.current).toEqual({ ...FALLBACK, settled: false })
    answer.resolve(fakeResponse({ limits: { max_limit: 800 } }))
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.maxLimit).toBe(800)
    expect(renders.some((r) => r.settled && r.maxLimit === FALLBACK.maxLimit)).toBe(false)
  })

  // Metadata only: the stand-ins keep the app working, so a failure is as
  // settled as an answer.
  it.each([
    ['a rejected fetch', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 500', () => Promise.resolve(fakeResponse({ detail: 'boom' }, 500))],
  ])('settles on the fallback after %s', async (_name, answer) => {
    const { result } = setup(answer)
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current).toEqual({ ...FALLBACK, settled: true })
  })

  // The stub rejects on its signal the way fetch does, so the hook's catch
  // sees the abort it caused.
  it('aborts the request when it unmounts before the answer', () => {
    const { unmount, signals } = setup(
      (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    )
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(false)
    unmount()
    expect(signals[0].aborted).toBe(true)
  })
})
