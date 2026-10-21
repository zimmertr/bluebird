import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import ModelPicker from './ModelPicker'
import { forecastModel } from '../testSupport/fixtures'
import { placeAt, render } from '../testSupport/render'

// The picker is controlled: App holds the ranking model and the compared set.
// This holds them the way App does, so a gesture's answer lands back in the
// picker, and hands every change to spies the assertions read.

const MODELS = [
  forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' }),
  forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
  forecastModel({ id: 'icon_seamless', label: 'DWD ICON' }),
]

function Picker({
  value = 'gfs_seamless',
  compared = [],
  disabled = false,
  sheet = false,
}: {
  value?: string
  compared?: string[]
  disabled?: boolean
  sheet?: boolean
}) {
  const [ranking, setRanking] = useState(value)
  const [extra, setExtra] = useState(compared)
  return (
    <ModelPicker
      models={MODELS}
      value={ranking}
      defaultId="gfs_seamless"
      onChange={(id) => {
        onChange(id)
        setRanking(id)
      }}
      compared={extra}
      onComparedChange={(ids) => {
        onComparedChange(ids)
        setExtra(ids)
      }}
      disabled={disabled}
      sheet={sheet}
    />
  )
}

const onChange = vi.fn()
const onComparedChange = vi.fn()

function setup(props: Parameters<typeof Picker>[0] = {}) {
  onChange.mockClear()
  onComparedChange.mockClear()
  const view = render(<Picker {...props} />)
  const trigger = screen.getByRole('button', { name: /^Forecast model:/ })
  return { ...view, trigger }
}

const list = () => screen.getByRole('listbox', { name: 'Forecast model' })
const option = (label: string) => screen.getByRole('option', { name: new RegExp(label) })

describe('opening and closing', () => {
  it('opens on a click and puts the keyboard in the list', async () => {
    const { user, trigger } = setup()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(list())
  })

  it('puts the keyboard in the list on every open, not only after the first', async () => {
    const { user, trigger } = setup()
    for (let visit = 0; visit < 2; visit++) {
      await user.click(trigger)
      expect(document.activeElement).toBe(list())
      await user.keyboard('{Escape}')
    }
  })

  it('opens on an arrow key from the trigger', async () => {
    const { user, trigger } = setup()
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(list()).toBeTruthy()
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on a press outside', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not open while the window takes the model out of play', () => {
    const { trigger } = setup({ disabled: true })
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
  })
})

// A phone's list is a bottom sheet headed by the label's word (record 0136),
// the same chips and the same listbox in it, and the sheet's ways out.
describe('on a phone', () => {
  it('opens a sheet headed Model rather than a card, holding the one list', async () => {
    const { user, trigger } = setup({ sheet: true })
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    await user.click(trigger)
    const sheet = screen.getByRole('dialog', { name: 'Model' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(within(sheet).getByRole('listbox', { name: 'Forecast model' }).getAttribute('aria-multiselectable')).toBe('true')
    expect(within(sheet).getAllByRole('option')).toHaveLength(MODELS.length)
    expect(within(sheet).getByRole('toolbar')).toBeTruthy()
    expect(document.querySelector('body > [data-side]')).toBeNull()
  })

  // The sheet closes on an Enter pressed on its body, which a row's Enter
  // must not reach; and Tab walks on inside a modal sheet.
  it('ticks a row on Enter and keeps the sheet open, and Tab does not close it', async () => {
    const { user, trigger } = setup({ sheet: true })
    await user.click(trigger)
    list().focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onComparedChange).toHaveBeenLastCalledWith(['ecmwf_ifs025'])
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeTruthy()
    list().focus()
    await user.tab()
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeTruthy()
  })

  it('closes on Done with the keyboard back on the field', async () => {
    const { user, trigger } = setup({ sheet: true })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })
})

describe('the list', () => {
  it('walks the rows with the arrow keys through aria-activedescendant', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    // Opens on the ranking model's row.
    expect(list().getAttribute('aria-activedescendant')).toBe(option('NOAA GFS').id)
    await user.keyboard('{ArrowDown}')
    expect(list().getAttribute('aria-activedescendant')).toBe(option('ECMWF IFS').id)
    await user.keyboard('{End}')
    expect(list().getAttribute('aria-activedescendant')).toBe(option('DWD ICON').id)
  })

  it('ticks the active row on Enter and stays open', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onComparedChange).toHaveBeenLastCalledWith(['ecmwf_ifs025'])
    // Ticking selects; it never changes which model ranks.
    expect(onChange).not.toHaveBeenCalled()
    expect(option('ECMWF IFS').getAttribute('aria-selected')).toBe('true')
    expect(trigger.getAttribute('aria-label')).toBe('Forecast model: NOAA GFS +1')
  })

  it('ticks a row on a click', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(option('DWD ICON'))
    expect(onComparedChange).toHaveBeenLastCalledWith(['icon_seamless'])
  })

  it('will not give up the last selected model', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    const ranking = option('NOAA GFS')
    expect(ranking.getAttribute('aria-disabled')).toBe('true')
    await user.click(ranking)
    await user.keyboard('{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(onComparedChange).not.toHaveBeenCalled()
    expect(ranking.getAttribute('aria-selected')).toBe('true')
  })

  it('passes the ranking on when the ranking model is unticked beside another', async () => {
    const { user, trigger } = setup({ compared: ['icon_seamless'] })
    await user.click(trigger)
    await user.click(option('NOAA GFS'))
    expect(onChange).toHaveBeenLastCalledWith('icon_seamless')
    expect(onComparedChange).toHaveBeenLastCalledWith([])
  })
})

describe('the chip row', () => {
  const toolbar = () => screen.getByRole('toolbar')
  const chip = (label: string) => within(toolbar()).getByRole('button', { name: label })

  it('draws one chip per selected model, the ranking one first', async () => {
    const { user, trigger } = setup({ compared: ['icon_seamless', 'ecmwf_ifs025'] })
    await user.click(trigger)
    const labels = within(toolbar())
      .getAllByRole('button')
      .filter((b) => !b.getAttribute('aria-label'))
      .map((b) => b.textContent)
    // Ranking first, then the compared ones in the published order.
    expect(labels).toEqual(['NOAA GFS', 'ECMWF IFS', 'DWD ICON'])
  })

  it('ranks by a chip on a click and keeps the old ranking model selected', async () => {
    const { user, trigger } = setup({ compared: ['ecmwf_ifs025'] })
    await user.click(trigger)
    await user.click(chip('ECMWF IFS'))
    expect(onChange).toHaveBeenLastCalledWith('ecmwf_ifs025')
    expect(onComparedChange).toHaveBeenLastCalledWith(['gfs_seamless'])
  })

  it('moves along the chips with the arrow keys', async () => {
    const { user, trigger } = setup({ compared: ['ecmwf_ifs025'] })
    await user.click(trigger)
    chip('NOAA GFS').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(chip('ECMWF IFS'))
  })

  it('removes a compared chip with Delete and keeps the keyboard on the row', async () => {
    const { user, trigger } = setup({ compared: ['ecmwf_ifs025'] })
    await user.click(trigger)
    chip('ECMWF IFS').focus()
    await user.keyboard('{Delete}')
    expect(onComparedChange).toHaveBeenLastCalledWith([])
    expect(document.activeElement).toBe(chip('NOAA GFS'))
  })

  it('offers no remove on the only chip', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    // Held open for alignment and out of the accessibility tree, so it is
    // found by its label rather than by role.
    const remove = toolbar().querySelector<HTMLButtonElement>('[aria-label="Remove NOAA GFS"]')
    expect(remove?.disabled).toBe(true)
    expect(remove?.getAttribute('aria-hidden')).toBe('true')
    chip('NOAA GFS').focus()
    await user.keyboard('{Delete}')
    expect(onComparedChange).not.toHaveBeenCalled()
  })
})

// The list runs the Model row's width rather than the trigger's 118px, and
// stands 4px under the trigger like every menu (record 0201). The trigger is
// on the panel's right edge, so the card lines up with its right edge and
// reaches back to the row's left.
describe('the list across its row', () => {
  function InRow() {
    const rowRef = useRef<HTMLDivElement>(null)
    return (
      <div data-menu-bound="" data-testid="panel">
        <div ref={rowRef} data-testid="row">
          <ModelPicker
            models={MODELS}
            value="gfs_seamless"
            defaultId="gfs_seamless"
            onChange={() => {}}
            compared={[]}
            onComparedChange={() => {}}
            rowRef={rowRef}
          />
        </div>
      </div>
    )
  }

  it('takes the row\'s width and lines up with the trigger\'s right edge', async () => {
    const { user } = render(<InRow />)
    placeAt(screen.getByTestId('panel'), { left: 0, top: 0, width: 360, height: 768 })
    placeAt(screen.getByTestId('row'), { left: 16, top: 400, width: 327, height: 30 })
    const trigger = screen.getByRole('button', { name: /^Forecast model:/ })
    placeAt(trigger, { left: 225, top: 400, width: 118, height: 30 })
    await user.click(trigger)
    const card = list().closest<HTMLElement>('[style]')!
    expect(card.style.right).toBe(`${window.innerWidth - 343}px`)
    expect(card.style.left).toBe('')
    expect(card.style.width).toBe('327px')
    expect(card.style.top).toBe('434px')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
