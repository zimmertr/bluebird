import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import ModelPicker from './ModelPicker'
import { forecastModel } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

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
}: {
  value?: string
  compared?: string[]
  disabled?: boolean
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
