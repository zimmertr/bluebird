import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ColumnsPicker from './ColumnsPicker'
import { displayedColumns } from '../utils/tableColumns'
import { DRAG_THRESHOLD_PX } from '../utils/columnDrag'
import { placeAt, render } from '../testSupport/render'

// The real column list, ranked by the total precipitation, so the ranked group
// is the four precipitation columns and everything else is free to hide.
const SORT_BY = 'precip_total_in'
const COLUMNS = displayedColumns(false, SORT_BY)
const ALL = new Set(COLUMNS.map((c) => c.key as string))

function Picker(props: {
  open?: boolean
  onVisibilityChange?: (keys: Set<string>) => void
  onColumnMove?: (from: string, to: string) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef}>Columns</button>
      <ColumnsPicker
        open={props.open ?? true}
        onOpenChange={() => {}}
        columns={COLUMNS}
        sortBy={SORT_BY}
        visibleKeys={ALL}
        onVisibilityChange={props.onVisibilityChange ?? (() => {})}
        onColumnMove={props.onColumnMove}
        triggerRef={triggerRef}
      />
    </>
  )
}

const box = (label: string) => screen.getByRole('checkbox', { name: `${label} column` })
const grip = (label: string) =>
  screen.getByRole('button', { name: `Move the ${label} column. Use the arrow keys.` })

describe('visibility', () => {
  it('draws nothing while closed', () => {
    render(<Picker open={false} />)
    expect(screen.queryByText('Display columns')).toBeNull()
  })

  it('lists every column under its header', () => {
    render(<Picker />)
    expect(screen.getByText('Display columns')).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(COLUMNS.length)
  })

  it('holds the ranked group on screen', () => {
    render(<Picker />)
    const ranked = COLUMNS.filter((c) => (c.key as string).startsWith('precip_'))
    expect(ranked.length).toBeGreaterThan(0)
    for (const col of ranked) expect((box(col.label as string) as HTMLInputElement).disabled).toBe(true)
    expect((box('Name') as HTMLInputElement).disabled).toBe(false)
  })

  it('hides a column when it is unticked', async () => {
    const onVisibilityChange = vi.fn()
    const { user } = render(<Picker onVisibilityChange={onVisibilityChange} />)
    await user.click(box('Type'))
    const next = onVisibilityChange.mock.lastCall?.[0] as Set<string>
    expect(next.has('type')).toBe(false)
    expect(next.size).toBe(ALL.size - 1)
  })
})

describe('reordering', () => {
  it('draws no grip where the surface cannot reorder', () => {
    render(<Picker />)
    expect(screen.queryByRole('button', { name: /^Move the/ })).toBeNull()
  })

  it('moves a column one place per arrow key', async () => {
    const onColumnMove = vi.fn()
    const { user } = render(<Picker onColumnMove={onColumnMove} />)
    grip('Type').focus()
    await user.keyboard('{ArrowUp}')
    expect(onColumnMove).toHaveBeenLastCalledWith('type', COLUMNS[COLUMNS.findIndex((c) => c.key === 'type') - 1].key)
    await user.keyboard('{ArrowDown}')
    expect(onColumnMove).toHaveBeenLastCalledWith('type', COLUMNS[COLUMNS.findIndex((c) => c.key === 'type') + 1].key)
  })

  it('moves a column to the row a drag is released over', () => {
    const onColumnMove = vi.fn()
    render(<Picker onColumnMove={onColumnMove} />)
    // One 24px row per column, top to bottom in list order.
    COLUMNS.forEach((col, i) => {
      placeAt(box(col.label as string).closest('label') as Element, { left: 0, top: i * 24, width: 200, height: 24 })
    })
    const from = grip('Name')
    const target = COLUMNS[3]
    fireEvent.pointerDown(from, { clientX: 190, clientY: 12, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(from, { clientX: 190, clientY: 3 * 24 + 12, pointerType: 'mouse' })
    // The ghost follows the pointer while the row is carried.
    expect(screen.getAllByText('Name')).toHaveLength(2)
    fireEvent.pointerUp(from)
    expect(onColumnMove).toHaveBeenCalledWith('name', target.key)
    expect(screen.getAllByText('Name')).toHaveLength(1)
  })

  it('treats a press that barely moves as no drag at all', () => {
    const onColumnMove = vi.fn()
    render(<Picker onColumnMove={onColumnMove} />)
    COLUMNS.forEach((col, i) => {
      placeAt(box(col.label as string).closest('label') as Element, { left: 0, top: i * 24, width: 200, height: 24 })
    })
    const from = grip('Name')
    fireEvent.pointerDown(from, { clientX: 190, clientY: 12, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(from, { clientX: 190, clientY: 12 + DRAG_THRESHOLD_PX - 1, pointerType: 'mouse' })
    fireEvent.pointerUp(from)
    expect(onColumnMove).not.toHaveBeenCalled()
  })
})
