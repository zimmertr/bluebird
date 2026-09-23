import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { useColumnResize } from './useColumnResize'
import { autoFitWidth, dragWidth } from '../utils/columnResize'

// One header with its resize handle, and a table ref pointing at it.
function handle() {
  const { container } = render(
    <table>
      <thead>
        <tr>
          <th>
            <div data-col-inner>Name</div>
            <span data-handle />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div data-col-inner>Mount Rainier</div>
          </td>
        </tr>
      </tbody>
    </table>,
  )
  const span = container.querySelector('[data-handle]')!
  return { span, tableRef: { current: container.querySelector('table') } }
}

const pointer = (target: Element, x: number) => {
  const e = { currentTarget: target, clientX: x, preventDefault: vi.fn(), stopPropagation: vi.fn() }
  return e as unknown as React.PointerEvent & typeof e
}

describe('useColumnResize', () => {
  it('measures every frame from the start width and keeps the widths on screen', () => {
    const onChange = vi.fn()
    const { span, tableRef } = handle()
    let widths: Record<string, number> = { name: 100, elevation_ft: 50 }
    const { result, rerender } = renderHook(() => useColumnResize(widths, onChange, tableRef))
    const e = pointer(span, 200)
    act(() => result.current.begin(e, 'name'))
    expect(e.stopPropagation).toHaveBeenCalled()
    fireEvent.pointerMove(document, { clientX: 220 })
    expect(onChange).toHaveBeenLastCalledWith({ name: dragWidth(100, 20), elevation_ft: 50 })
    // Another column's width moved between frames: the next frame keeps it.
    widths = { name: 120, elevation_ft: 70 }
    rerender()
    fireEvent.pointerMove(document, { clientX: 230 })
    expect(onChange).toHaveBeenLastCalledWith({ name: dragWidth(100, 30), elevation_ft: 70 })
  })

  it('stops listening once the press ends, by release or by cancel', () => {
    for (const end of ['pointerUp', 'pointerCancel'] as const) {
      const onChange = vi.fn()
      const { span, tableRef } = handle()
      const { result } = renderHook(() => useColumnResize({ name: 100 }, onChange, tableRef))
      act(() => result.current.begin(pointer(span, 200), 'name'))
      fireEvent[end](document)
      fireEvent.pointerMove(document, { clientX: 260 })
      expect(onChange).not.toHaveBeenCalled()
    }
  })

  it('fits the column to its longest cell', () => {
    const onChange = vi.fn()
    const { span, tableRef } = handle()
    const inners = [...tableRef.current!.querySelectorAll<HTMLElement>('[data-col-inner]')]
    inners.forEach((el, i) => (el.getBoundingClientRect = () => ({ width: 60 + 30 * i }) as DOMRect))
    const { result } = renderHook(() => useColumnResize({ other: 40 }, onChange, tableRef))
    const e = pointer(span, 0)
    act(() => result.current.fit(e as unknown as React.MouseEvent, 'name'))
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith({ other: 40, name: autoFitWidth([60, 90]) })
  })

  it('does nothing when the table does not resize', () => {
    const { span, tableRef } = handle()
    const { result } = renderHook(() => useColumnResize({}, undefined, tableRef))
    const e = pointer(span, 0)
    act(() => result.current.begin(e, 'name'))
    expect(e.stopPropagation).not.toHaveBeenCalled()
  })

  it('returns the names the header reads, in order', () => {
    const { tableRef } = handle()
    const { result } = renderHook(() => useColumnResize({}, vi.fn(), tableRef))
    expect(Object.keys(result.current)).toEqual(['begin', 'fit'])
  })

  it('hands back the same callbacks across renders', () => {
    const onChange = vi.fn()
    const { tableRef } = handle()
    const { result, rerender } = renderHook(() => useColumnResize({}, onChange, tableRef))
    const first = result.current
    rerender()
    expect(result.current.begin).toBe(first.begin)
    expect(result.current.fit).toBe(first.fit)
  })
})
