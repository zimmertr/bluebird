import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { TransitionEvent } from 'react'
import { usePaneMotion } from './usePaneMotion'
import { PANEL_MS } from '../styles'

const reduced = vi.hoisted(() => ({ on: false }))
vi.mock('../utils/motion', () => ({ prefersReducedMotion: () => reduced.on }))

type Props = { shown: boolean; px: number; animated: boolean }
const start = (initialProps: Props) =>
  renderHook(({ shown, px, animated }: Props) => usePaneMotion(shown, px, animated), { initialProps })

// A transition's end on the frame itself, or on something inside it.
const ended = (own: boolean) => {
  const frame = document.createElement('div')
  return { target: own ? frame : document.createElement('div'), currentTarget: frame } as unknown as TransitionEvent<HTMLDivElement>
}

// A results pane at a desk opens and closes over the panel's speed, and the
// body it clips keeps its height and stays mounted while it closes (#714;
// record 0202).
describe('usePaneMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reduced.on = false
  })
  afterEach(() => vi.useRealTimers())

  it('starts as it is shown, with no movement on the first render', () => {
    expect(start({ shown: true, px: 220, animated: true }).result.current).toMatchObject({ mounted: true, open: true, px: 220 })
    expect(start({ shown: false, px: 0, animated: true }).result.current).toMatchObject({ mounted: false, open: false })
  })

  it('mounts a shown pane at once and opens its frame in the same paint', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: true, px: 220 })
  })

  it('shuts a hidden pane at once and keeps its body, at the height it had, until the frame is shut', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    // Hidden, the layout gives the pane no height at all.
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: false, px: 220 })
    // A colour fading on a control inside the frame is not the frame shutting.
    act(() => result.current.onTransitionEnd(ended(false)))
    expect(result.current.mounted).toBe(true)
    act(() => result.current.onTransitionEnd(ended(true)))
    expect(result.current.mounted).toBe(false)
  })

  it('unmounts a closed body after the transition when no end event comes', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS))
    expect(result.current.mounted).toBe(true)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.mounted).toBe(false)
  })

  it('keeps a pane shown again before its frame shut', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS / 2))
    rerender({ shown: true, px: 220, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current).toMatchObject({ mounted: true, open: true, px: 220 })
  })

  it('keeps a pane shown again whole after its last end came late', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current.mounted).toBe(false)
    act(() => result.current.onTransitionEnd(ended(true)))
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, open: true, px: 220 })
  })

  it('follows a drag while shown', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: true, px: 260, animated: true })
    expect(result.current.px).toBe(260)
  })

  it('unmounts at once under a reduced-motion setting', () => {
    reduced.on = true
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(0))
    expect(result.current.mounted).toBe(false)
  })

  it('changes at once where panes do not move, a phone', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: false })
    rerender({ shown: false, px: 0, animated: false })
    expect(result.current).toMatchObject({ mounted: false, open: false })
    rerender({ shown: true, px: 220, animated: false })
    expect(result.current).toMatchObject({ mounted: true, open: true })
  })
})
