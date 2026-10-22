import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ModelsPicker from './ModelsPicker'
import { toggleHidden } from '../utils/modelVisibility'
import { render } from '../testSupport/render'

// The desk's Models menu: the card 4px under the results bar's own button
// (record 0201). The phone's sheet is `menuSheets.test.tsx`'s.
const MODELS = [
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
]

function Picker({
  open = true,
  hidden = new Set(['ecmwf_ifs025']),
  onToggle = () => {},
  onReset = () => {},
}: {
  open?: boolean
  hidden?: Set<string>
  onToggle?: (id: string) => void
  onReset?: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef}>Models</button>
      <ModelsPicker
        open={open}
        onOpenChange={() => {}}
        models={MODELS}
        hidden={hidden}
        onToggle={onToggle}
        onReset={onReset}
        triggerRef={triggerRef}
      />
    </>
  )
}

// The picker as the chart holds it: the hidden set moving with each toggle,
// so a Shift range reads the rows as they stand after the press before it.
const THREE = [...MODELS, { id: 'icon_seamless', label: 'DWD ICON' }]
function Held({ onToggle }: { onToggle: (id: string) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  return (
    <>
      <button ref={triggerRef}>Models</button>
      <ModelsPicker
        open
        onOpenChange={() => {}}
        models={THREE}
        hidden={hidden}
        onToggle={(id) => {
          onToggle(id)
          setHidden((h) => toggleHidden(h, id))
        }}
        onReset={() => setHidden(new Set())}
        triggerRef={triggerRef}
      />
    </>
  )
}

describe('ModelsPicker', () => {
  it('lists the compared models in the card under the bar\'s button on a desk, and toggles one', () => {
    const onToggle = vi.fn()
    render(<Picker onToggle={onToggle} />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([true, false])
    expect(boxes.map((b) => b.labels?.[0].textContent)).toEqual(['NOAA GFS', 'ECMWF IFS'])
    // The popover's portalled card, not the phone's modal sheet.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(boxes[0].closest('[style]')?.parentElement).toBe(document.body)
    fireEvent.click(boxes[1])
    expect(onToggle).toHaveBeenCalledWith('ecmwf_ifs025')
  })

  it('draws nothing while closed', () => {
    render(<Picker open={false} />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  // A press with Shift held reaches every row from the last pressed to this
  // one (record 0209), toggling only the rows that differ from the pressed
  // box, so the run ends up as it does.
  it('hides every row between the last press and a Shift-click, and shows them back the same way', () => {
    const onToggle = vi.fn()
    render(<Held onToggle={onToggle} />)
    const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(boxes()[0])
    expect(onToggle.mock.calls).toEqual([['gfs_seamless']])
    fireEvent.click(boxes()[2], { shiftKey: true })
    expect(onToggle.mock.calls.slice(1)).toEqual([['ecmwf_ifs025'], ['icon_seamless']])
    expect(boxes().map((b) => b.checked)).toEqual([false, false, false])
    // The anchor is now the last row; a Shift-click on the first ticks all three.
    fireEvent.click(boxes()[0], { shiftKey: true })
    expect(boxes().map((b) => b.checked)).toEqual([true, true, true])
  })

  // Always drawn and greyed while nothing is hidden (record 0209), under the
  // rows.
  it('stands Reset all greyed under the rows while nothing is hidden, and resets otherwise', () => {
    const onReset = vi.fn()
    const { rerender } = render(<Picker hidden={new Set()} onReset={onReset} />)
    const reset = () => screen.getByRole('button', { name: 'Reset all' }) as HTMLButtonElement
    expect(reset().disabled).toBe(true)
    const lastBox = screen.getAllByRole('checkbox')[1]
    expect(lastBox.compareDocumentPosition(reset()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lastBox.closest('[style]')!.contains(reset())).toBe(true)
    rerender(<Picker hidden={new Set(['ecmwf_ifs025'])} onReset={onReset} />)
    expect(reset().disabled).toBe(false)
    fireEvent.click(reset())
    expect(onReset).toHaveBeenCalledOnce()
  })
})
