import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHeldFailure, useOpenOnFailure } from './useOpenOnFailure'
import { panelMessages } from '../testSupport/fixtures'

// #803: a run that fails opens the message list, and a desk's panel when it
// is shut. Keyed on `useAnalysisRun`'s failure count, so each failure opens
// once and nothing else opens anything.
describe('useOpenOnFailure', () => {
  const opener = (seq: number, enabled = true) => {
    const open = vi.fn()
    const view = renderHook(({ seq, enabled }) => useOpenOnFailure(seq, open, enabled), {
      initialProps: { seq, enabled },
    })
    return { open, ...view }
  }

  it('opens once for each failure', () => {
    const { open, rerender } = opener(0)
    expect(open).not.toHaveBeenCalled()
    rerender({ seq: 1, enabled: true })
    expect(open).toHaveBeenCalledOnce()
    rerender({ seq: 1, enabled: true })
    expect(open).toHaveBeenCalledOnce()
    rerender({ seq: 2, enabled: true })
    expect(open).toHaveBeenCalledTimes(2)
  })

  // A panel mounted after a failure does not open on it: the reader saw it
  // where it landed, or moved on.
  it('takes the count at mount as seen', () => {
    const { open } = opener(3)
    expect(open).not.toHaveBeenCalled()
  })

  // The phone's panel footer has no list, and a phone's panel never reopens:
  // a failure there is passed over, not saved for a later change.
  it('passes a failure over while it is not enabled, and does not save it', () => {
    const { open, rerender } = opener(0, false)
    rerender({ seq: 1, enabled: false })
    rerender({ seq: 1, enabled: true })
    expect(open).not.toHaveBeenCalled()
    rerender({ seq: 2, enabled: true })
    expect(open).toHaveBeenCalledOnce()
  })
})

// A desk's panel shut or sliding holds the failure back until it stands
// still, so its list is placed against a button on the screen.
describe('useHeldFailure', () => {
  const held = (seq: number, hold: boolean) =>
    renderHook(({ seq, hold }) => useHeldFailure(panelMessages({ failureSeq: seq }), hold), {
      initialProps: { seq, hold },
    })

  it('passes the messages through while nothing holds them', () => {
    const { result, rerender } = held(0, false)
    expect(result.current.failureSeq).toBe(0)
    rerender({ seq: 1, hold: false })
    expect(result.current.failureSeq).toBe(1)
  })

  it('holds a failure while the panel is shut or moving, and lets it through once it stands', () => {
    const { result, rerender } = held(0, true)
    rerender({ seq: 1, hold: true })
    expect(result.current.failureSeq).toBe(0)
    rerender({ seq: 1, hold: false })
    expect(result.current.failureSeq).toBe(1)
    // And holds the one it let through, not the one before, the next time.
    rerender({ seq: 2, hold: true })
    expect(result.current.failureSeq).toBe(1)
  })

  // #834: a check or basemap failure reopens a shut panel too, and is held
  // the same way, apart from the run's count.
  it('holds a check or basemap failure the same way', () => {
    const { result, rerender } = renderHook(
      ({ seq, hold }) => useHeldFailure(panelMessages({ openingSeq: seq }), hold),
      { initialProps: { seq: 0, hold: true } },
    )
    rerender({ seq: 1, hold: true })
    expect(result.current.openingSeq).toBe(0)
    expect(result.current.failureSeq).toBe(0)
    rerender({ seq: 1, hold: false })
    expect(result.current.openingSeq).toBe(1)
  })

  it('holds nothing but the count', () => {
    const messages = panelMessages({ failureSeq: 4, count: 2, analyzeEnabled: false })
    const { result } = renderHook(() => useHeldFailure(messages, false))
    expect(result.current).toBe(messages)
  })
})
