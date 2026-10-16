import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ModelsPicker from './ModelsPicker'
import RemovedPicker from './RemovedPicker'
import type { RemovedEntry } from '../utils/removals'
import { resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

// The results bar's Models and Removed menus on a phone (#696; record 0136):
// the same rows in a bottom sheet named by the menu's own words, closed by
// the sheet's Done rather than by the popover's press outside.
const refs = () => ({ triggerRef: createRef<HTMLButtonElement>(), anchorRef: createRef<HTMLElement>() })
const MODELS = [
  { id: 'gfs_seamless', label: 'NOAA GFS' },
  { id: 'ecmwf_ifs025', label: 'ECMWF IFS' },
]
const entry = (name: string): [string, RemovedEntry] => [name, { row: resultRow({ name }) } as RemovedEntry]

describe('the Models sheet', () => {
  it('lists every model in a sheet headed Models, and toggles one', () => {
    const onToggle = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ModelsPicker open onOpenChange={onOpenChange} models={MODELS} hidden={new Set(['ecmwf_ifs025'])} onToggle={onToggle} sheet {...refs()} />,
    )
    expect(screen.getByRole('dialog', { name: 'Models' })).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([true, false])
    fireEvent.click(boxes[1])
    expect(onToggle).toHaveBeenCalledWith('ecmwf_ifs025')
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('draws nothing while closed', () => {
    render(<ModelsPicker open={false} onOpenChange={() => {}} models={MODELS} hidden={new Set()} onToggle={() => {}} sheet {...refs()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the Removed sheet', () => {
  // The desk card's overline is the sheet's heading, and Restore all is the
  // last row while there is more than one to restore.
  it('lists the removed rows under the desk card\'s words, with Restore all last', () => {
    const onRestore = vi.fn()
    const onRestoreAll = vi.fn()
    render(
      <RemovedPicker
        open
        onOpenChange={() => {}}
        entries={[entry('Mount Baker'), entry('Mount Shuksan')]}
        onRestore={onRestore}
        onRestoreAll={onRestoreAll}
        sheet
        {...refs()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Removed rows' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore Mount Shuksan' }))
    expect(onRestore).toHaveBeenCalledWith('Mount Shuksan')
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }))
    expect(onRestoreAll).toHaveBeenCalledOnce()
  })

  // A crag and the peak it is named for, both removed (#715): each names its
  // type, as the chart does, so the two Restore buttons are not one name twice.
  it('names the type beside a name two removed places share', () => {
    const tooth = (type: 'peak' | 'crag', latitude: number): [string, RemovedEntry] => [
      type,
      { row: resultRow({ name: 'The Tooth', type, latitude }) } as RemovedEntry,
    ]
    render(
      <RemovedPicker
        open
        onOpenChange={() => {}}
        entries={[tooth('peak', 47.41), tooth('crag', 47.4108), entry('Mount Baker')]}
        onRestore={() => {}}
        onRestoreAll={() => {}}
        sheet
        {...refs()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Restore The Tooth (Peak)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore The Tooth (Crag)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore Mount Baker' })).toBeTruthy()
  })

  it('offers no Restore all for one row', () => {
    render(
      <RemovedPicker open onOpenChange={() => {}} entries={[entry('Mount Baker')]} onRestore={() => {}} onRestoreAll={() => {}} sheet {...refs()} />,
    )
    expect(screen.queryByRole('button', { name: 'Restore all' })).toBeNull()
  })
})
