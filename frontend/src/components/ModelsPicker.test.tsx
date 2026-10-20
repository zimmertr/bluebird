import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ModelsPicker from './ModelsPicker'
import { render } from '../testSupport/render'

// The desk's Models menu: the card that unfurls from the results bar's button
// group. The phone's sheet is `menuSheets.test.tsx`'s.
const MODELS = [
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
]

function Picker({ open = true, onToggle = () => {} }: { open?: boolean; onToggle?: (id: string) => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef}>Models</button>
      <ModelsPicker
        open={open}
        onOpenChange={() => {}}
        models={MODELS}
        hidden={new Set(['ecmwf_ifs025'])}
        onToggle={onToggle}
        triggerRef={triggerRef}
        anchorRef={triggerRef}
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
})
