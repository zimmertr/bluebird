import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import RemovedPicker from './RemovedPicker'
import type { RemovedEntry } from '../utils/removals'
import { resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

// The desk's Removed menu: the card 4px under the results bar's own button
// (record 0201). The phone's sheet is `menuSheets.test.tsx`'s.
const entry = (name: string): [string, RemovedEntry] => [name, { row: resultRow({ name }) } as RemovedEntry]

interface PickerProps {
  entries: [string, RemovedEntry][]
  onOpenChange?: (open: boolean) => void
  onRestore?: (key: string) => void
  onRestoreAll?: () => void
}

function Picker({ entries, onOpenChange = () => {}, onRestore = () => {}, onRestoreAll = () => {} }: PickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef}>Removed</button>
      <RemovedPicker
        open
        onOpenChange={onOpenChange}
        entries={entries}
        onRestore={onRestore}
        onRestoreAll={onRestoreAll}
        triggerRef={triggerRef}
      />
    </>
  )
}

describe('RemovedPicker', () => {
  // Restore all always stands (record 0209) and greys on an empty list. The
  // menu leaves closing to its caller: `ResultsSheet` shuts it at zero
  // (record 0224).
  it('leaves closing to its caller, with Restore all greyed on an empty list', () => {
    const onOpenChange = vi.fn()
    const onRestoreAll = vi.fn()
    const { rerender } = render(<Picker entries={[entry('Mount Baker')]} onOpenChange={onOpenChange} onRestoreAll={onRestoreAll} />)
    const all = () => screen.getByRole('button', { name: 'Restore all' }) as HTMLButtonElement
    expect(all().disabled).toBe(false)
    rerender(<Picker entries={[]} onOpenChange={onOpenChange} onRestoreAll={onRestoreAll} />)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(all().disabled).toBe(true)
    expect(screen.queryAllByRole('button', { name: /^Restore Mount/ })).toEqual([])
    fireEvent.click(all())
    expect(onRestoreAll).not.toHaveBeenCalled()
  })

  it('lists the removed rows in a card with no header on a desk, with Restore all under them', () => {
    const onRestore = vi.fn()
    const onRestoreAll = vi.fn()
    const { rerender } = render(
      <Picker entries={[entry('Mount Baker'), entry('Mount Shuksan')]} onRestore={onRestore} onRestoreAll={onRestoreAll} />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    // Named by its trigger rather than by a header of its own (record 0222).
    expect(screen.queryByText('Removed rows')).toBeNull()
    const card = screen.getByRole('button', { name: 'Restore all' }).closest<HTMLElement>(`[data-state]`)!
    expect(card.parentElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: 'Restore Mount Baker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Mount Shuksan' }))
    expect(onRestore.mock.calls).toEqual([['Mount Baker'], ['Mount Shuksan']])
    const all = screen.getByRole('button', { name: 'Restore all' })
    const lastRow = screen.getByRole('button', { name: 'Restore Mount Shuksan' })
    expect(lastRow.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.contains(all)).toBe(true)
    fireEvent.click(all)
    expect(onRestoreAll).toHaveBeenCalledOnce()

    // One row is still something to restore all of.
    rerender(<Picker entries={[entry('Mount Baker')]} />)
    expect((screen.getByRole('button', { name: 'Restore all' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
