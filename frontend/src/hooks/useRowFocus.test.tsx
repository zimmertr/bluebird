import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { useRowFocus } from './useRowFocus'
import type { MapViewHandle } from '../components/MapView'
import { resultRow } from '../testSupport/fixtures'

type Props = { isDesktop: boolean; resultsCollapsed: boolean }

function start(initialProps: Props) {
  const focusResult = vi.fn()
  const focusPoint = vi.fn()
  const collapse = vi.fn()
  const mapRef = { current: { focusResult, focusPoint } } as unknown as RefObject<MapViewHandle | null>
  const hook = renderHook((p: Props) => useRowFocus({ ...p, collapse, mapRef }), { initialProps })
  return { ...hook, focusResult, focusPoint, collapse }
}

// A row's press opens its marker's popup; a phone lowers its sheet first
// (#696; record 0143).
describe('useRowFocus', () => {
  it('opens the popup at once at a desk', () => {
    const { result, focusResult, collapse } = start({ isDesktop: true, resultsCollapsed: false })
    const row = resultRow()
    act(() => result.current.onFocusResult(row))
    expect(focusResult).toHaveBeenCalledWith(row)
    expect(collapse).not.toHaveBeenCalled()
  })

  it('lowers a phone\'s sheet first and opens the popup once it is down', () => {
    const { result, rerender, focusResult, collapse } = start({ isDesktop: false, resultsCollapsed: false })
    const row = resultRow()
    act(() => result.current.onFocusResult(row))
    expect(collapse).toHaveBeenCalled()
    expect(focusResult).not.toHaveBeenCalled()
    rerender({ isDesktop: false, resultsCollapsed: true })
    expect(focusResult).toHaveBeenCalledWith(row)
  })

  // A pending row's press opens its dot's card, which wants the same room.
  it('lowers a phone\'s sheet before a pending row opens its dot\'s card', () => {
    const { result, rerender, focusPoint, collapse } = start({ isDesktop: false, resultsCollapsed: false })
    act(() => result.current.onFocusPending({ latitude: 1, longitude: 2 }))
    expect(collapse).toHaveBeenCalled()
    expect(focusPoint).not.toHaveBeenCalled()
    rerender({ isDesktop: false, resultsCollapsed: true })
    expect(focusPoint).toHaveBeenCalledWith({ latitude: 1, longitude: 2 })
  })

  // A tap on the map that opens a card, a marker's, a dot's, a label's or
  // the spot's, lowers a phone's sheet as a row's press does, so the card
  // has room (TJ, 2026-11-04), and opens it once the sheet is down.
  it('lowers a phone\'s sheet before a tap on the map opens its card', () => {
    const { result, rerender, collapse } = start({ isDesktop: false, resultsCollapsed: false })
    const open = vi.fn()
    act(() => result.current.lowerSheetFirst(open))
    expect(collapse).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    rerender({ isDesktop: false, resultsCollapsed: true })
    expect(open).toHaveBeenCalledTimes(1)
    // With the sheet already down, the next tap's card opens at once.
    const next = vi.fn()
    act(() => result.current.lowerSheetFirst(next))
    expect(next).toHaveBeenCalledTimes(1)
    expect(collapse).toHaveBeenCalledTimes(1)
  })

  it('opens a tap\'s card at once at a desk', () => {
    const { result, collapse } = start({ isDesktop: true, resultsCollapsed: false })
    const open = vi.fn()
    act(() => result.current.lowerSheetFirst(open))
    expect(open).toHaveBeenCalledTimes(1)
    expect(collapse).not.toHaveBeenCalled()
  })

  // The table stays drawn while a desk's panes shut (record 0202), and every
  // row takes these callbacks, so the chevron must not hand them new ones.
  it('keeps one callback across a desk\'s collapse', () => {
    const { result, rerender } = start({ isDesktop: true, resultsCollapsed: false })
    const before = result.current
    rerender({ isDesktop: true, resultsCollapsed: true })
    expect(result.current.onFocusResult).toBe(before.onFocusResult)
    expect(result.current.onFocusPending).toBe(before.onFocusPending)
    expect(result.current.lowerSheetFirst).toBe(before.lowerSheetFirst)
  })
})
