import { useRef, useState } from 'react'
import { SortBy } from '../types'
import { ColDef } from '../utils/tableColumns'
import { FAMILY_KEYS, familyOf } from '../metrics'
import { usePopover } from '../hooks/usePopover'
import Popover from './Popover'
import {
  CARRIED,
  CHOICE_INPUT,
  CHOICE_ROW,
  DRAG_GHOST,
  DRAG_GRIP,
  DRAG_GRIP_ACTIVE,
  DRAG_INSERT,
} from '../styles'
import { IconGrip } from './icons'
import {
  GHOST_MAX_PX,
  dragBegins,
  dropEdge,
  ghostLeft,
  keyAtPosition,
  travel,
  type ColumnSpan,
} from '../utils/columnDrag'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ColDef[]
  sortBy: SortBy
  visibleKeys: Set<string>
  onVisibilityChange: (keys: Set<string>) => void
  // Move one column to where another sits. The picker names the two columns
  // and nothing else: the key list is `useTableView`'s, and `moveColumn` owns the move.
  onColumnMove?: (fromKey: string, toKey: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function ColumnsPicker({
  open,
  onOpenChange,
  columns,
  sortBy,
  visibleKeys,
  onVisibilityChange,
  onColumnMove,
  triggerRef,
}: Props) {
  const { popoverRef, box } = usePopover({ open, onOpenChange, triggerRef })

  const rankedGroup = new Set<string>(FAMILY_KEYS[familyOf(sortBy)])

  // The row elements, so a drag can ask which one the pointer is over. A ref
  // rather than state: it is read during a pointer move and never rendered.
  const rowsRef = useRef(new Map<string, HTMLElement>())
  // What a drag is carrying and where it would put it, drawn as a ghost under
  // the pointer and a line in the gap. The move itself lands on release, the
  // same as the table's: reordering on every frame moves the list under the
  // reader's hand while they are still choosing.
  const [carry, setCarry] = useState<{
    key: string
    label: string
    x: number
    y: number
  } | null>(null)
  const [insert, setInsert] = useState<{ y: number; left: number; width: number } | null>(
    null,
  )

  // A press on a grip. It is not a drag until it has travelled far enough (a
  // mouse) or been held long enough (a finger) — `columnDrag.ts` owns which
  // question each pointer is asked, and the answer is what keeps a tap on the
  // grip from stealing the row's own click.
  function beginDrag(e: React.PointerEvent, key: string) {
    if (!onColumnMove) return
    e.preventDefault()
    const grip = e.currentTarget as HTMLElement
    grip.setPointerCapture(e.pointerId)
    const startedAt = performance.now()
    const startX = e.clientX
    const startY = e.clientY
    const label = columns.find((c) => c.key === key)?.label ?? key
    let landing: string | null = null
    let live = false

    const spans = (): ColumnSpan[] =>
      [...rowsRef.current.entries()].map(([rowKey, el]) => {
        const rect = el.getBoundingClientRect()
        return { key: rowKey, start: rect.top, end: rect.bottom }
      })

    const move = (ev: PointerEvent) => {
      if (!live) {
        const far = travel(ev.clientX - startX, ev.clientY - startY)
        if (!dragBegins(ev.pointerType, far, performance.now() - startedAt)) return
        live = true
      }
      const here = spans()
      landing = keyAtPosition(here, ev.clientY)
      setCarry({ key, label, x: ev.clientX, y: ev.clientY })

      const edge = dropEdge(here, key, ev.clientY)
      const row = edge && rowsRef.current.get(edge.key)
      if (row) {
        const rect = row.getBoundingClientRect()
        setInsert({
          y: edge.after ? rect.bottom : rect.top,
          left: rect.left,
          width: rect.width,
        })
      }
    }

    const end = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', end)
      grip.removeEventListener('pointercancel', end)
      if (live && landing && landing !== key) onColumnMove(key, landing)
      setCarry(null)
      setInsert(null)
    }

    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

  if (!open || !box) return null

  return (
    <Popover box={box} popoverRef={popoverRef} header="Display columns">
      <div className="min-h-0 flex-1 overflow-y-auto p-1 space-y-1">
        {columns.map((col) => {
          const isRanked = rankedGroup.has(col.key)
          const isVisible = visibleKeys.has(col.key)

          const isCarried = carry?.key === col.key

          return (
            <label
              key={col.key}
              ref={(el) => {
                if (el) rowsRef.current.set(col.key, el)
                else rowsRef.current.delete(col.key)
              }}
              className={`${CHOICE_ROW} px-1 ${isCarried ? CARRIED : ''}`}
            >
              <input
                type="checkbox"
                checked={isVisible}
                disabled={isRanked}
                onChange={(e) => {
                  const next = new Set(visibleKeys)
                  if (e.target.checked) {
                    next.add(col.key)
                  } else {
                    next.delete(col.key)
                  }
                  onVisibilityChange(next)
                }}
                className={CHOICE_INPUT}
                aria-label={`${col.label} column`}
              />
              <span className="flex-1">{col.label}</span>
              {/* The grip: a drag moves the column, and the arrow keys move it
                  one place at a time, which is the whole keyboard path for
                  reordering on either surface. It is a button so it can be
                  reached at all. */}
              {onColumnMove && (
                <button
                  type="button"
                  onPointerDown={(e) => beginDrag(e, col.key)}
                  onClick={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    const at = columns.findIndex((c) => c.key === col.key)
                    if (e.key === 'ArrowUp' && at > 0) {
                      e.preventDefault()
                      onColumnMove(col.key, columns[at - 1].key)
                    } else if (e.key === 'ArrowDown' && at < columns.length - 1) {
                      e.preventDefault()
                      onColumnMove(col.key, columns[at + 1].key)
                    }
                  }}
                  aria-label={`Move the ${col.label} column. Use the arrow keys.`}
                  className={`${DRAG_GRIP} ${isCarried ? DRAG_GRIP_ACTIVE : ''} px-1`}
                >
                  <IconGrip />
                </button>
              )}
            </label>
          )
        })}
      </div>

      {carry && (
        <>
          <div
            className={DRAG_GHOST}
            style={{
              left: ghostLeft(carry.x, window.innerWidth),
              top: carry.y - 10,
              maxWidth: GHOST_MAX_PX,
            }}
          >
            {carry.label}
          </div>
          {insert && (
            <div
              className={DRAG_INSERT}
              style={{ left: insert.left, top: insert.y - 1, width: insert.width, height: 2 }}
            />
          )}
        </>
      )}
    </Popover>
  )
}
