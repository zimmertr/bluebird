import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import RemovedPicker from './RemovedPicker'
import type { RemovedEntry } from '../utils/removals'
import { resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

// The desk's Removed menu: the card that unfurls from the results bar's button
// group. The phone's sheet is `menuSheets.test.tsx`'s.
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
        anchorRef={triggerRef}
      />
    </>
  )
}

describe('RemovedPicker', () => {
  // Restoring the last row empties the list under the card.
  it('closes itself once the last row is restored', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Picker entries={[entry('Mount Baker')]} onOpenChange={onOpenChange} />)
    expect(onOpenChange).not.toHaveBeenCalled()
    rerender(<Picker entries={[]} onOpenChange={onOpenChange} />)
    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('lists the removed rows in a card headed Removed rows on a desk, with Restore all under them', () => {
    const onRestore = vi.fn()
    const onRestoreAll = vi.fn()
    const { rerender } = render(
      <Picker entries={[entry('Mount Baker'), entry('Mount Shuksan')]} onRestore={onRestore} onRestoreAll={onRestoreAll} />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    const card = screen.getByText('Removed rows').parentElement as HTMLElement
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

    rerender(<Picker entries={[entry('Mount Baker')]} />)
    expect(screen.queryByRole('button', { name: 'Restore all' })).toBeNull()
  })
})
