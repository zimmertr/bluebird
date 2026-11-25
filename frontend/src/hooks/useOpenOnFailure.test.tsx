import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOpenOnFailure } from './useOpenOnFailure'

// #803: a run that fails opens the message list. Keyed on `useAnalysisRun`'s
// failure count, so each failure opens once and nothing else opens anything.
describe('useOpenOnFailure', () => {
  const opener = (seq: number) => {
    const open = vi.fn()
    const view = renderHook(({ seq }) => useOpenOnFailure(seq, open), { initialProps: { seq } })
    return { open, ...view }
  }

  it('opens once for each failure', () => {
    const { open, rerender } = opener(0)
    expect(open).not.toHaveBeenCalled()
    rerender({ seq: 1 })
    expect(open).toHaveBeenCalledOnce()
    rerender({ seq: 1 })
    expect(open).toHaveBeenCalledOnce()
    rerender({ seq: 2 })
    expect(open).toHaveBeenCalledTimes(2)
  })

  // A panel mounted after a failure does not open on it: the reader saw it
  // where it landed, or moved on.
  it('takes the count at mount as seen', () => {
    const { open } = opener(3)
    expect(open).not.toHaveBeenCalled()
  })
})
