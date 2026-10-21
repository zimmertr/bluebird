import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { useRowFocus } from './useRowFocus'
import type { MapViewHandle } from '../components/MapView'
import { resultRow } from '../testSupport/fixtures'

type Props = { isDesktop: boolean; resultsCollapsed: boolean }

function start(initialProps: Props) {
  const focusResult = vi.fn()
  const collapse = vi.fn()
  const mapRef = { current: { focusResult } } as unknown as RefObject<MapViewHandle | null>
  const hook = renderHook((p: Props) => useRowFocus({ ...p, collapse, mapRef }), { initialProps })
  return { ...hook, focusResult, collapse }
}

// A row's press opens its marker's popup; a phone lowers its sheet first
// (#696; record 0143).
describe('useRowFocus', () => {
  it('opens the popup at once at a desk', () => {
    const { result, focusResult, collapse } = start({ isDesktop: true, resultsCollapsed: false })
    const row = resultRow()
    act(() => result.current(row))
    expect(focusResult).toHaveBeenCalledWith(row)
    expect(collapse).not.toHaveBeenCalled()
  })

  it('lowers a phone\'s sheet first and opens the popup once it is down', () => {
    const { result, rerender, focusResult, collapse } = start({ isDesktop: false, resultsCollapsed: false })
    const row = resultRow()
    act(() => result.current(row))
    expect(collapse).toHaveBeenCalled()
    expect(focusResult).not.toHaveBeenCalled()
    rerender({ isDesktop: false, resultsCollapsed: true })
    expect(focusResult).toHaveBeenCalledWith(row)
  })

  // The table stays drawn while a desk's panes shut (record 0202), and every
  // row takes this callback, so the chevron must not hand them a new one.
  it('keeps one callback across a desk\'s collapse', () => {
    const { result, rerender } = start({ isDesktop: true, resultsCollapsed: false })
    const before = result.current
    rerender({ isDesktop: true, resultsCollapsed: true })
    expect(result.current).toBe(before)
  })
})
