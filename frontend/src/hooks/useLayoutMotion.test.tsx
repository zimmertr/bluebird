import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { TransitionEvent } from 'react'
import { useLayoutMotion } from './useLayoutMotion'
import { PANEL_MS } from '../styles'
import type { ResultsMode } from '../utils/viewPrefs'

const reduced = vi.hoisted(() => ({ on: false }))
vi.mock('../utils/motion', () => ({ prefersReducedMotion: () => reduced.on }))

type Props = { isDesktop: boolean; open: boolean; mode: ResultsMode; collapsed?: boolean }
const start = (initialProps: Props) => renderHook((p: Props) => useLayoutMotion(p), { initialProps })
const ended = (propertyName: string) => ({ propertyName }) as TransitionEvent<HTMLElement>

// While a desk's layout moves, the map and the results hold one size, from
// the render that starts the move until it ends (#714; record 0202).
describe('useLayoutMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reduced.on = false
  })
  afterEach(() => vi.useRealTimers())

  it('holds nothing at rest', () => {
    expect(start({ isDesktop: true, open: true, mode: 'table' }).result.current.motion).toBeNull()
  })

  it('names the panel closing and opening in the render that moves it', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: false, mode: 'table' })
    expect(result.current.motion).toBe('closing')
    act(() => result.current.onTransitionEnd(ended('margin-left')))
    expect(result.current.motion).toBeNull()
    rerender({ isDesktop: true, open: true, mode: 'table' })
    expect(result.current.motion).toBe('opening')
  })

  it('names a results pane moving on a mode change', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: true, mode: 'both' })
    expect(result.current.motion).toBe('panes')
    act(() => result.current.onTransitionEnd(ended('grid-template-rows')))
    expect(result.current.motion).toBeNull()
  })

  // The collapse chevron shuts and opens the panes at the press's speed.
  it('names the results panes moving on the collapse chevron, both ways', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'both', collapsed: false })
    rerender({ isDesktop: true, open: true, mode: 'both', collapsed: true })
    expect(result.current.motion).toBe('panes')
    act(() => result.current.onTransitionEnd(ended('grid-template-rows')))
    expect(result.current.motion).toBeNull()
    rerender({ isDesktop: true, open: true, mode: 'both', collapsed: false })
    expect(result.current.motion).toBe('panes')
  })

  it('lets go at a move\'s end and at nothing else', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: false, mode: 'table' })
    act(() => result.current.onTransitionEnd(ended('background-color')))
    expect(result.current.motion).toBe('closing')
  })

  it('lets go after a while when no end comes', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: false, mode: 'table' })
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current.motion).toBe('closing')
    act(() => vi.advanceTimersByTime(PANEL_MS * 2))
    expect(result.current.motion).toBeNull()
  })

  // A move whose end comes after the fallback let go (a slow frame, a
  // background tab) must leave the next move held from its first frame: an
  // end with nothing moving settles nothing.
  it('holds the next move whole after an end that came late', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: false, mode: 'table' })
    act(() => vi.advanceTimersByTime(PANEL_MS * 4))
    expect(result.current.motion).toBeNull()
    act(() => result.current.onTransitionEnd(ended('margin-left')))
    rerender({ isDesktop: true, open: true, mode: 'table' })
    expect(result.current.motion).toBe('opening')
    act(() => vi.advanceTimersByTime(PANEL_MS))
    expect(result.current.motion).toBe('opening')
  })

  // A panel shut and reopened before its slide ends asks for the layout it
  // last settled at, and slides back from wherever it got to: a failed run
  // reopens it that way (#803), and its message list waits for it to stand
  // still before it is placed against Analyze.
  it('holds a move that turns back until the slide back ends', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: false, mode: 'table' })
    expect(result.current.motion).toBe('closing')
    rerender({ isDesktop: true, open: true, mode: 'table' })
    expect(result.current.motion).toBe('opening')
    act(() => vi.advanceTimersByTime(PANEL_MS))
    expect(result.current.motion).toBe('opening')
    act(() => result.current.onTransitionEnd(ended('margin-left')))
    expect(result.current.motion).toBeNull()
    // Settled open, so a later close is a close again.
    rerender({ isDesktop: true, open: false, mode: 'table' })
    expect(result.current.motion).toBe('closing')
  })

  it('lets a move that turned back go after a while when no end comes', () => {
    const { result, rerender } = start({ isDesktop: true, open: true, mode: 'both' })
    rerender({ isDesktop: true, open: true, mode: 'table' })
    rerender({ isDesktop: true, open: true, mode: 'both' })
    expect(result.current.motion).toBe('panes')
    act(() => vi.advanceTimersByTime(PANEL_MS * 3))
    expect(result.current.motion).toBeNull()
  })

  it('holds nothing on a phone or under a reduced-motion setting', () => {
    const phone = start({ isDesktop: false, open: false, mode: 'table' })
    phone.rerender({ isDesktop: false, open: true, mode: 'chart' })
    expect(phone.result.current.motion).toBeNull()
    reduced.on = true
    const desk = start({ isDesktop: true, open: true, mode: 'table' })
    desk.rerender({ isDesktop: true, open: false, mode: 'table' })
    expect(desk.result.current.motion).toBeNull()
    // Settled where it stands, so the setting turned off later starts no move.
    reduced.on = false
    desk.rerender({ isDesktop: true, open: false, mode: 'table' })
    expect(desk.result.current.motion).toBeNull()
  })
})
