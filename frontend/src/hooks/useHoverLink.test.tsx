import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHoverLink } from './useHoverLink'
import type { MapViewHandle } from '../components/MapView'

// The map and the table point at one place (record 0318).
function table() {
  const wrap = document.createElement('div')
  wrap.setAttribute('data-results-table', '')
  wrap.innerHTML =
    '<table><tbody><tr data-key="47.5,-121.5"><td><span>Mount Si</span></td></tr><tr data-key="46.85,-121.76"><td>Rainier</td></tr></tbody></table>'
  document.body.append(wrap)
  return wrap
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useHoverLink', () => {
  it('rings the marker of the row under the pointer, and none once it leaves the rows', () => {
    const wrap = table()
    const hotMarker = vi.fn()
    renderHook(() => useHoverLink({ current: { hotMarker } as unknown as MapViewHandle }))
    // jsdom's events carry no pointer type of their own, so it is laid on.
    const over = (el: Element, pointerType = 'mouse') => {
      const event = new MouseEvent('pointerover', { bubbles: true })
      Object.defineProperty(event, 'pointerType', { value: pointerType })
      el.dispatchEvent(event)
    }
    over(wrap.querySelector('span')!)
    expect(hotMarker).toHaveBeenLastCalledWith('47.5,-121.5')
    over(wrap.querySelector('td')!)
    expect(hotMarker).toHaveBeenCalledTimes(1)
    over(document.body)
    expect(hotMarker).toHaveBeenLastCalledWith(null)
    // A finger has no hover: a tap opens the row's card instead.
    over(wrap.querySelectorAll('td')[1], 'touch')
    expect(hotMarker).toHaveBeenCalledTimes(2)
  })

  it('rests the ring on the row opened in place once the pointer leaves the rows', () => {
    const wrap = table()
    wrap.querySelectorAll('tr')[1].setAttribute('data-open', '')
    const hotMarker = vi.fn()
    renderHook(() => useHoverLink({ current: { hotMarker } as unknown as MapViewHandle }))
    const over = (el: Element) => {
      const event = new MouseEvent('pointerover', { bubbles: true })
      Object.defineProperty(event, 'pointerType', { value: 'mouse' })
      el.dispatchEvent(event)
    }
    over(wrap.querySelector('span')!)
    expect(hotMarker).toHaveBeenLastCalledWith('47.5,-121.5')
    over(document.body)
    expect(hotMarker).toHaveBeenLastCalledWith('46.85,-121.76')
  })

  it('marks the row of the marker under the pointer, and clears it as the pointer leaves', () => {
    const wrap = table()
    const { result } = renderHook(() => useHoverLink({ current: null }))
    const rows = wrap.querySelectorAll<HTMLElement>('tr')
    result.current('46.85,-121.76')
    expect([...rows].map((r) => 'hot' in r.dataset)).toEqual([false, true])
    result.current('47.5,-121.5')
    expect([...rows].map((r) => 'hot' in r.dataset)).toEqual([true, false])
    result.current(null)
    expect([...rows].map((r) => 'hot' in r.dataset)).toEqual([false, false])
  })
})
