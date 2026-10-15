import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSafeAreaBottom } from './useSafeAreaBottom'
import { SAFE_AREA } from '../styles'

// jsdom resolves no `env()`, so the probe's height is stood in for: 34px, an
// iPhone's home indicator band at 390x844, on the element wearing the probe.
function probeHeight(px: () => number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.className === SAFE_AREA.probe ? px() : 0
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: h, width: 0, height: h, toJSON: () => ({}) } as DOMRect
  })
}

afterEach(() => vi.restoreAllMocks())

describe('useSafeAreaBottom', () => {
  it('reads the band off its probe, follows a resize, and takes the probe away', () => {
    let px = 34
    probeHeight(() => px)
    const { result, unmount } = renderHook(() => useSafeAreaBottom())
    expect(result.current).toBe(34)
    expect(document.querySelectorAll(`[aria-hidden="true"]`).length).toBeGreaterThan(0)
    px = 21
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(21)
    unmount()
    expect([...document.body.children].some((el) => el.className === SAFE_AREA.probe)).toBe(false)
  })

  it('is 0 where the browser reports no band', () => {
    probeHeight(() => 0)
    const { result } = renderHook(() => useSafeAreaBottom())
    expect(result.current).toBe(0)
  })
})
