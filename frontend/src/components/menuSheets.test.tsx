import { createRef, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import ForecastSection from './ForecastSection'
import ModelsPicker from './ModelsPicker'
import RemovedPicker from './RemovedPicker'
import type { RemovedEntry } from '../utils/removals'
import type { ForecastSelection } from '../utils/calendar'
import { forecastModel, resultRow } from '../testSupport/fixtures'
import { render } from '../testSupport/render'
import { MENU } from '../styles'

// The results bar's Models and Removed menus on a phone (#696; record 0136):
// the same rows in a bottom sheet named by the menu's own words, closed by
// the sheet's Done rather than by the popover's press outside.
const refs = () => ({ triggerRef: createRef<HTMLButtonElement>() })
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
      <ModelsPicker open onOpenChange={onOpenChange} models={MODELS} hidden={new Set(['ecmwf_ifs025'])} onToggle={onToggle} onReset={() => {}} sheet {...refs()} />,
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
    render(<ModelsPicker open={false} onOpenChange={() => {}} models={MODELS} hidden={new Set()} onToggle={() => {}} onReset={() => {}} sheet {...refs()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // A sheet's rows take no hover fill; a desk card's every row does (record
  // 0201), since a press anywhere on one toggles it.
  it('lights a row under the pointer on a desk and not in the sheet', () => {
    const lit = () => screen.getAllByRole('checkbox').map((b) => b.closest('label')!.className.split(' ').includes(MENU.hover))
    const { unmount } = render(
      <ModelsPicker open onOpenChange={() => {}} models={MODELS} hidden={new Set()} onToggle={() => {}} onReset={() => {}} sheet {...refs()} />,
    )
    expect(lit()).toEqual([false, false])
    unmount()
    // A desk card stands under a trigger, which it needs on screen to place.
    function Desk() {
      const triggerRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={triggerRef}>Models</button>
          <ModelsPicker open onOpenChange={() => {}} models={MODELS} hidden={new Set()} onToggle={() => {}} onReset={() => {}} triggerRef={triggerRef} />
        </>
      )
    }
    render(<Desk />)
    expect(lit()).toEqual([true, true])
  })
})

describe('the Removed sheet', () => {
  // The desk card's overline is the sheet's heading, and Restore all is the
  // last row, greyed with nothing to restore (record 0209).
  it('stands Restore all greyed as the last row with nothing to restore', () => {
    render(<RemovedPicker open onOpenChange={() => {}} entries={[]} onRestore={() => {}} onRestoreAll={() => {}} sheet {...refs()} />)
    const sheet = screen.getByRole('dialog', { name: 'Removed rows' })
    const all = screen.getByRole('button', { name: 'Restore all' }) as HTMLButtonElement
    expect(sheet.contains(all)).toBe(true)
    expect(all.disabled).toBe(true)
  })

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

  it('closes on Done', () => {
    const onOpenChange = vi.fn()
    render(
      <RemovedPicker open onOpenChange={onOpenChange} entries={[entry('Mount Baker')]} onRestore={() => {}} onRestoreAll={() => {}} sheet {...refs()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // One row is still something to restore all of (record 0209).
  it('offers Restore all live for one row', () => {
    render(
      <RemovedPicker open onOpenChange={() => {}} entries={[entry('Mount Baker')]} onRestore={() => {}} onRestoreAll={() => {}} sheet {...refs()} />,
    )
    expect((screen.getByRole('button', { name: 'Restore all' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

// The Controls sheet's two field menus (#714; record 0136): the model list and
// the calendar are bottom sheets on a phone like every other phone menu,
// headed by the words of the labels their fields stand beside.
describe('the Model and When sheets', () => {
  function Forecast({ phone }: { phone: boolean }) {
    const [selection, setSelection] = useState<ForecastSelection>({ kind: 'now' })
    return (
      <ForecastSection
        forecastModel="gfs_seamless"
        setForecastModel={() => {}}
        forecastModels={[forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' })]}
        comparedModels={[]}
        setComparedModels={() => {}}
        defaultForecastModel="gfs_seamless"
        modelDisabled={false}
        selection={selection}
        setSelection={setSelection}
        archiveDays={365}
        aqiForecastDays={5}
        phone={phone}
      />
    )
  }

  it('opens the model list in a sheet headed Model, the listbox kept', () => {
    render(<Forecast phone />)
    fireEvent.click(screen.getByRole('button', { name: /^Forecast model:/ }))
    const sheet = screen.getByRole('dialog', { name: 'Model' })
    expect(within(sheet).getByRole('listbox', { name: 'Forecast model' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the calendar in a sheet headed When', () => {
    render(<Forecast phone />)
    fireEvent.click(screen.getByRole('button', { name: 'Dates' }))
    const sheet = screen.getByRole('dialog', { name: 'When' })
    expect(within(sheet).getByRole('grid', { name: 'Forecast day' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // A desk keeps the card under each field (record 0201).
  it('opens no sheet at a desk', () => {
    render(<Forecast phone={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dates' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('grid', { name: 'Forecast day' })).toBeTruthy()
  })
})
