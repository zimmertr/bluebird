import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ColDef } from '../utils/tableColumns'
import { dragBegins, dropEdge, keyAtPosition, travel } from '../utils/columnDrag'
import { headerSpans, insertLine } from '../utils/columnMeasure'

// A press on a results-table header that becomes a column move. Apart from the
// resize because the two share no state: this one changes the column ORDER,
// the other a column's width.

export interface Carry {
  key: string
  label: ReactNode
  x: number
  y: number
}

export function useColumnDrag(columns: ColDef[], onColumnMove?: (fromKey: string, toKey: string) => void) {
  // What a drag is carrying and where it would put it. Both are drawn (the
  // ghost under the pointer and the line in the gap), so both are state.
  //
  // The move is made on release rather than on every frame. Reordering live
  // means the columns shuffle under the reader's hand while they are still
  // choosing, which on a wide table is a lot of movement to read; the ghost and
  // the line say the same thing without moving anything until it is decided.
  const [carry, setCarry] = useState<Carry | null>(null)
  const [insert, setInsert] = useState<{ x: number; top: number; height: number } | null>(null)
  // Set while a drag is ending, and read by the click that may follow it: a
  // pointerup on the cell the press began in still fires a click, and without
  // this a reorder would sort the table as well as move the column.
  //
  // Cleared on a timeout rather than by that click, because the click only
  // happens when the pointer went down and up on the SAME cell. A drag that
  // ended anywhere else fires none, and a flag waiting to be consumed would sit
  // there and swallow the reader's next real click instead.
  const draggedRef = useRef(false)

  // A press on a header. It is a sort until it has travelled far enough (a
  // mouse) or been held long enough (a finger); `columnDrag.ts` owns which
  // question each pointer is asked. The resize handle stops its own
  // pointerdown, so a grab of the edge never reaches here.
  const begin = useCallback(
    (e: React.PointerEvent, key: string) => {
      if (!onColumnMove) return
      const th = e.currentTarget as HTMLElement
      const row = th.parentElement
      const startedAt = performance.now()
      const startX = e.clientX
      const startY = e.clientY
      const label = columns.find((c) => c.key === key)?.label ?? key
      let live = false
      let landing: string | null = null

      const move = (ev: PointerEvent) => {
        if (!live) {
          const far = travel(ev.clientX - startX, ev.clientY - startY)
          if (!dragBegins(ev.pointerType, far, performance.now() - startedAt)) return
          live = true
          draggedRef.current = true
        }
        const here = headerSpans(row)
        landing = keyAtPosition(here, ev.clientX)
        setCarry({ key, label, x: ev.clientX, y: ev.clientY })
        const line = insertLine(row, dropEdge(here, key, ev.clientX))
        if (line) setInsert(line)
      }

      const end = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', end)
        document.removeEventListener('pointercancel', end)
        if (live) {
          window.setTimeout(() => (draggedRef.current = false), 0)
          if (landing && landing !== key) onColumnMove(key, landing)
        }
        setCarry(null)
        setInsert(null)
      }

      // On document rather than on the header, which is what the resize does
      // and for the same reason: a drag leaves the cell it started in on its
      // first frame, and a pointermove over a sibling cell never reaches it.
      // Pointer capture would answer it too, but capturing before the press is
      // known to be a drag changes where an ordinary click lands.
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', end)
      document.addEventListener('pointercancel', end)
    },
    [columns, onColumnMove],
  )

  // Whether the click now arriving is the tail of a drag rather than a sort.
  const endedDrag = useCallback(() => draggedRef.current, [])

  return { begin, endedDrag, carry, insert }
}
