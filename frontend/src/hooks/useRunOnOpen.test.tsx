import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type RunOnOpenInputs, useRunOnOpen } from './useRunOnOpen'

const NOOP = () => {}

function openAt(search: string) {
  window.history.replaceState(null, '', `/${search}`)
}

afterEach(() => openAt(''))

describe('useRunOnOpen', () => {
  it('reads the flag off the link once, at mount', () => {
    openAt('?analyze=1')
    const { result } = renderHook(() => useRunOnOpen({ settled: false, flushUrl: NOOP, analyze: NOOP }))
    expect(result.current.autoAnalyze).toBe(true)
    openAt('')
    expect(renderHook(() => useRunOnOpen({ settled: false, flushUrl: NOOP, analyze: NOOP })).result.current.autoAnalyze).toBe(
      false,
    )
  })

  // The tutorial's demo copy of the app (#536) is told, and never reads the
  // reader's link.
  it('takes the flag it is given over the link', () => {
    openAt('?analyze=1')
    const told = (initial: boolean) =>
      renderHook(() => useRunOnOpen({ settled: false, flushUrl: NOOP, analyze: NOOP, initial })).result.current
    expect(told(false).autoAnalyze).toBe(false)
    openAt('')
    expect(told(true).autoAnalyze).toBe(true)
  })

  // The render where the live limits land still holds the pre-clamp model
  // and results cap, so the run must wait one commit: the flag rises in the
  // render after `settled` does, never in the same one.
  it('rises one commit after the limits settle', () => {
    const seen: { settled: boolean; capsApplied: boolean }[] = []
    const { rerender } = renderHook(
      ({ settled }: Pick<RunOnOpenInputs, 'settled'>) => {
        const r = useRunOnOpen({ settled, flushUrl: NOOP, analyze: NOOP })
        seen.push({ settled, capsApplied: r.capsApplied })
        return r
      },
      { initialProps: { settled: false } },
    )
    expect(seen.every((s) => !s.capsApplied)).toBe(true)
    rerender({ settled: true })
    const settledRenders = seen.filter((s) => s.settled)
    expect(settledRenders[0]).toEqual({ settled: true, capsApplied: false })
    expect(settledRenders[settledRenders.length - 1]).toEqual({ settled: true, capsApplied: true })
  })

  // The address bar loses the flag before the run spends, so a reload during
  // the run is an ordinary restore.
  it('clears the flag, flushes the address, then runs', () => {
    openAt('?analyze=1')
    const calls: string[] = []
    const flushUrl = vi.fn(() => calls.push('flush'))
    const analyze = vi.fn(() => {
      calls.push('analyze')
    })
    const { result } = renderHook(() => useRunOnOpen({ settled: true, flushUrl, analyze }))
    act(() => result.current.runAutoAnalyze())
    expect(calls).toEqual(['flush', 'analyze'])
    expect(result.current.autoAnalyze).toBe(false)
  })
})
