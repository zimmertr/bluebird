import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { autoFitWidth, dragWidth } from '../utils/columnResize'
import { contentWidth, fitContents } from '../utils/columnMeasure'

// A results-table column's width, set by dragging the header's edge or fitted
// by double-clicking it. Apart from the drag because the two share no state:
// this one changes a width, the other the column order.

export function useColumnResize(
  columnWidths: Record<string, number> | undefined,
  onColumnWidthsChange: ((widths: Record<string, number>) => void) | undefined,
  tableRef: RefObject<HTMLTableElement | null>,
) {
  // The widths as last drawn. Read only by the pointer listeners, which run
  // after the commit that set it, so every frame of a drag spreads the widths
  // on screen rather than the ones the press began with.
  const widthsRef = useRef(columnWidths ?? {})
  useLayoutEffect(() => {
    widthsRef.current = columnWidths ?? {}
  }, [columnWidths])
  // Removes the listeners of the resize in flight, if one is, for the reason
  // useColumnDrag keeps one: the table can unmount mid-gesture.
  const detachRef = useRef<(() => void) | null>(null)
  useEffect(() => () => detachRef.current?.(), [])

  const begin = useCallback(
    function beginColumnResize(e: React.PointerEvent, key: string) {
      if (!onColumnWidthsChange) return
      e.preventDefault()
      // A grab of the edge is never also a sort or a column move.
      e.stopPropagation()
      const th = (e.currentTarget as HTMLElement).closest('th') as HTMLElement
      const start = widthsRef.current[key] ?? contentWidth(th)
      const startX = e.clientX
      const onMove = (ev: PointerEvent) =>
        onColumnWidthsChange({ ...widthsRef.current, [key]: dragWidth(start, ev.clientX - startX) })
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
        detachRef.current = null
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
      detachRef.current = onUp
    },
    [onColumnWidthsChange],
  )

  // Double-click on a handle: fit the longest cell in the column.
  const fit = useCallback(
    (e: React.MouseEvent, key: string) => {
      if (!onColumnWidthsChange || !tableRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const th = (e.currentTarget as HTMLElement).closest('th') as HTMLTableCellElement
      const contents = fitContents(tableRef.current, th)
      onColumnWidthsChange({ ...widthsRef.current, [key]: autoFitWidth(contents) })
    },
    [onColumnWidthsChange, tableRef],
  )

  return { begin, fit }
}
