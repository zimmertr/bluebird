import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { TransitionEvent } from 'react'
import { useHeldWhile, usePaneMotion } from './usePaneMotion'
import { PANEL_MS } from '../styles'

const reduced = vi.hoisted(() => ({ on: false }))
vi.mock('../utils/motion', () => ({ prefersReducedMotion: () => reduced.on }))

type Props = { shown: boolean; px: number; animated: boolean; moving?: boolean }
const start = (initialProps: Props) =>
  renderHook(({ shown, px, animated, moving }: Props) => usePaneMotion(shown, px, animated, moving), { initialProps })

// A transition's end on the frame itself, or on something inside it.
const ended = (own: boolean) => {
  const frame = document.createElement('div')
  return { target: own ? frame : document.createElement('div'), currentTarget: frame } as unknown as TransitionEvent<HTMLDivElement>
}

// A results pane at a desk opens and closes over the panel's speed. An
// opening pane mounts its body once its frame has opened, a closing one keeps
// its body, at the height it had, until its frame is shut, and a mounted body
// keeps the height it was drawn at while a pane moves (#714; record 0202).
describe('usePaneMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reduced.on = false
  })
  afterEach(() => vi.useRealTimers())

  it('starts as it is shown, with no movement on the first render', () => {
    expect(start({ shown: true, px: 220, animated: true }).result.current).toMatchObject({
      mounted: true,
      ready: true,
      open: true,
      px: 220,
    })
    expect(start({ shown: false, px: 0, animated: true }).result.current).toMatchObject({
      mounted: false,
      ready: false,
      open: false,
    })
  })

  it('opens a shown pane\'s frame at once and mounts its body once the frame has opened', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true, moving: true })
    // The grip and an empty box of the pane's height, which the frame opens to.
    expect(result.current).toMatchObject({ mounted: true, ready: false, open: true, px: 220 })
    // A colour fading on a control inside the frame is not the frame opening.
    act(() => result.current.onTransitionEnd(ended(false)))
    expect(result.current.ready).toBe(false)
    act(() => result.current.onTransitionEnd(ended(true)))
    expect(result.current.ready).toBe(true)
  })

  it('mounts an opened body after the transition when no end event comes', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS))
    expect(result.current.ready).toBe(false)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.ready).toBe(true)
  })

  it('shuts a hidden pane at once and keeps its body, at the height it had, until the frame is shut', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    // Hidden, the layout gives the pane no height at all.
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current).toMatchObject({ mounted: true, ready: true, open: false, px: 220, drawnPx: 220 })
    act(() => result.current.onTransitionEnd(ended(false)))
    expect(result.current.mounted).toBe(true)
    act(() => result.current.onTransitionEnd(ended(true)))
    expect(result.current).toMatchObject({ mounted: false, ready: false })
  })

  it('unmounts a closed body after the transition when no end event comes', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS))
    expect(result.current.mounted).toBe(true)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.mounted).toBe(false)
  })

  it('keeps the body of a pane shown again before its frame shut', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS / 2))
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, ready: true, open: true, px: 220 })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current).toMatchObject({ mounted: true, ready: true, open: true, px: 220 })
  })

  it('keeps the box of a pane hidden again before its frame had opened, until the frame is shut', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS / 2))
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current).toMatchObject({ mounted: true, ready: false, open: false, px: 220 })
    act(() => result.current.onTransitionEnd(ended(true)))
    expect(result.current.mounted).toBe(false)
  })

  it('opens a pane shown again whole after its last end came late', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current.mounted).toBe(false)
    // The late end finds nothing moving and settles nothing.
    act(() => result.current.onTransitionEnd(ended(true)))
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, ready: false, open: true, px: 220 })
    act(() => result.current.onTransitionEnd(ended(true)))
    expect(result.current.ready).toBe(true)
  })

  it('follows a drag while shown', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: true, px: 260, animated: true })
    expect(result.current).toMatchObject({ px: 260, drawnPx: 260 })
  })

  it('holds a body at the height it was drawn at while a pane moves, and lets go where the move ends', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: true, px: 140, animated: true, moving: true })
    expect(result.current).toMatchObject({ px: 140, drawnPx: 220 })
    rerender({ shown: true, px: 140, animated: true, moving: false })
    expect(result.current).toMatchObject({ px: 140, drawnPx: 140 })
  })

  it('draws a body that mounts while a pane still moves at its box\'s height', () => {
    const { result, rerender } = start({ shown: false, px: 0, animated: true })
    rerender({ shown: true, px: 220, animated: true, moving: true })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current).toMatchObject({ ready: true, drawnPx: 220 })
  })

  it('opens and shuts at once under a reduced-motion setting', () => {
    reduced.on = true
    const { result, rerender } = start({ shown: true, px: 220, animated: true })
    rerender({ shown: false, px: 0, animated: true })
    expect(result.current.mounted).toBe(false)
    rerender({ shown: true, px: 220, animated: true })
    expect(result.current).toMatchObject({ mounted: true, ready: true, open: true })
  })

  it('changes at once where panes do not move, a phone', () => {
    const { result, rerender } = start({ shown: true, px: 220, animated: false })
    rerender({ shown: false, px: 0, animated: false })
    expect(result.current).toMatchObject({ mounted: false, ready: false, open: false })
    rerender({ shown: true, px: 220, animated: false })
    expect(result.current).toMatchObject({ mounted: true, ready: true, open: true })
  })
})

describe('useHeldWhile', () => {
  it('follows its value, and holds the last one while told to', () => {
    const { result, rerender } = renderHook(({ value, holding }) => useHeldWhile(value, holding), {
      initialProps: { value: 'chart', holding: false },
    })
    rerender({ value: 'both', holding: false })
    expect(result.current).toBe('both')
    rerender({ value: 'table', holding: true })
    expect(result.current).toBe('both')
    rerender({ value: 'table', holding: false })
    expect(result.current).toBe('table')
  })
})
