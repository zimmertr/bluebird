import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { useColumnDrag } from './useColumnDrag'
import { displayedColumns } from '../utils/tableColumns'
import { placeAt } from '../testSupport/render'

const COLUMNS = displayedColumns(false, 'precip_total_in').filter((c) =>
  ['name', 'elevation_ft', 'precip_total_in'].includes(c.key as string),
)

// The header row the gesture reads, 100px per column.
function headerRow() {
  const { container } = render(
    <table>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} data-col={c.key} />
          ))}
        </tr>
      </thead>
    </table>,
  )
  const ths = [...container.querySelectorAll('th')]
  ths.forEach((th, i) => placeAt(th, { left: i * 100, top: 0, width: 100, height: 24 }))
  return ths
}

const press = (th: Element, x: number, pointerType = 'mouse') =>
  ({ currentTarget: th, clientX: x, clientY: 12, pointerType }) as unknown as React.PointerEvent

afterEach(() => vi.useRealTimers())

describe('useColumnDrag', () => {
  it('carries the column, draws the line, and moves it on release', () => {
    const onColumnMove = vi.fn()
    const ths = headerRow()
    const { result } = renderHook(() => useColumnDrag(COLUMNS, onColumnMove))
    act(() => result.current.begin(press(ths[0], 50), 'name'))
    act(() => void fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' }))
    expect(result.current.carry).toMatchObject({ key: 'name', x: 250 })
    expect(result.current.insert).toEqual({ x: 300, top: 0, height: 24 })
    act(() => void fireEvent.pointerUp(document))
    expect(onColumnMove).toHaveBeenCalledWith('name', 'precip_total_in')
    expect(result.current.carry).toBeNull()
    expect(result.current.insert).toBeNull()
  })

  it('moves nothing when the column is released over itself', () => {
    const onColumnMove = vi.fn()
    const ths = headerRow()
    const { result } = renderHook(() => useColumnDrag(COLUMNS, onColumnMove))
    act(() => result.current.begin(press(ths[0], 50), 'name'))
    act(() => void fireEvent.pointerMove(document, { clientX: 90, clientY: 12, pointerType: 'mouse' }))
    act(() => void fireEvent.pointerUp(document))
    expect(onColumnMove).not.toHaveBeenCalled()
  })

  it('does not drag a finger that moves before the hold', () => {
    const onColumnMove = vi.fn()
    const ths = headerRow()
    const { result } = renderHook(() => useColumnDrag(COLUMNS, onColumnMove))
    act(() => result.current.begin(press(ths[0], 50, 'touch'), 'name'))
    act(() => void fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'touch' }))
    expect(result.current.carry).toBeNull()
    act(() => void fireEvent.pointerUp(document))
    expect(onColumnMove).not.toHaveBeenCalled()
    expect(result.current.endedDrag()).toBe(false)
  })

  it('swallows the click that ends a drag, and only until the next tick', () => {
    vi.useFakeTimers()
    const ths = headerRow()
    const { result } = renderHook(() => useColumnDrag(COLUMNS, vi.fn()))
    act(() => result.current.begin(press(ths[0], 50), 'name'))
    act(() => void fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' }))
    act(() => void fireEvent.pointerUp(document))
    expect(result.current.endedDrag()).toBe(true)
    act(() => void vi.runAllTimers())
    expect(result.current.endedDrag()).toBe(false)
  })

  it('stops listening once the press ends, by release or by cancel', () => {
    for (const end of ['pointerUp', 'pointerCancel'] as const) {
      const onColumnMove = vi.fn()
      const ths = headerRow()
      const { result } = renderHook(() => useColumnDrag(COLUMNS, onColumnMove))
      act(() => result.current.begin(press(ths[0], 50), 'name'))
      act(() => void fireEvent[end](document))
      act(() => void fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' }))
      expect(result.current.carry).toBeNull()
      act(() => void fireEvent.pointerUp(document))
      expect(onColumnMove).not.toHaveBeenCalled()
    }
  })

  it('does nothing when the table does not reorder', () => {
    const ths = headerRow()
    const { result } = renderHook(() => useColumnDrag(COLUMNS, undefined))
    act(() => result.current.begin(press(ths[0], 50), 'name'))
    act(() => void fireEvent.pointerMove(document, { clientX: 250, clientY: 12, pointerType: 'mouse' }))
    expect(result.current.carry).toBeNull()
  })

  it('returns the names the header reads, in order', () => {
    const { result } = renderHook(() => useColumnDrag(COLUMNS, vi.fn()))
    expect(Object.keys(result.current)).toEqual(['begin', 'endedDrag', 'carry', 'insert'])
  })

  it('hands back the same callbacks across renders', () => {
    const onColumnMove = vi.fn()
    const { result, rerender } = renderHook(() => useColumnDrag(COLUMNS, onColumnMove))
    const first = result.current
    rerender()
    expect(result.current.begin).toBe(first.begin)
    expect(result.current.endedDrag).toBe(first.endedDrag)
  })
})
