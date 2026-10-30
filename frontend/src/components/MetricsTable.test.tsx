import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MetricsTable from './MetricsTable'
import { AGGREGATE, DEFAULT_FAMILY_KEY, FAMILY_KEYS, NOUN, RANKED_FAMILIES, windowAggregate } from '../metrics'
import { NO_CONSTRAINTS } from '../utils/clientAnalyze'
import { DEFAULT_LIMIT } from '../utils/urlState'
import { render } from '../testSupport/render'

// The ranking and the bounds in one table: the direction, the results cap,
// one row per metric with its radio, its aggregate dropdown and its two
// boxes, and Clear filters under them. Every control here reports to App and
// nothing needs an Analyze.

type Props = ComponentProps<typeof MetricsTable>

function props(over: Partial<Props> = {}): Props {
  const noop = () => {}
  return {
    sortBy: DEFAULT_FAMILY_KEY.precip,
    setSortBy: noop,
    sortDesc: false,
    setSortDesc: noop,
    rowKeys: { ...DEFAULT_FAMILY_KEY },
    pointSample: false,
    constraints: NO_CONSTRAINTS,
    setConstraints: noop,
    onClearFilters: noop,
    limit: DEFAULT_LIMIT,
    setLimit: noop,
    maxLimit: 1500,
    ...over,
  }
}

const results = () => screen.getByRole('spinbutton', { name: /results$/ })
const clear = () => screen.getByRole('button', { name: 'Clear filters' }) as HTMLButtonElement

describe('MetricsTable', () => {
  it('sets the direction from the pressed half', async () => {
    const setSortDesc = vi.fn()
    const { user } = render(<MetricsTable {...props({ setSortDesc })} />)
    expect(screen.getByRole('button', { name: 'Lowest' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Highest' }))
    expect(setSortDesc).toHaveBeenCalledWith(true)
  })

  it('ranks by a row through its own aggregate choice', async () => {
    const setSortBy = vi.fn()
    const { user } = render(<MetricsTable {...props({ setSortBy })} />)
    await user.click(screen.getByRole('radio', { name: NOUN.wind }))
    expect(setSortBy).toHaveBeenCalledWith(DEFAULT_FAMILY_KEY.wind)
  })

  it('draws one row per ranked metric, in order', () => {
    render(<MetricsTable {...props()} />)
    // By identity per index: toEqual compares DOM nodes structurally, and the
    // radios are alike, so it would pass a reversed list.
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(RANKED_FAMILIES.length)
    RANKED_FAMILIES.forEach((f, i) => expect(radios[i]).toBe(screen.getByRole('radio', { name: NOUN[f] })))
  })

  // A desk picks the aggregate from the one menu (record 0201), and a phone
  // from its own native picker (record 0149). Both name the choice alike.
  it('ranks by a new aggregate from the menu', async () => {
    const setSortBy = vi.fn()
    const { user } = render(<MetricsTable {...props({ setSortBy })} />)
    const other = FAMILY_KEYS.temp.find((k) => k !== DEFAULT_FAMILY_KEY.temp)!
    expect(screen.queryAllByRole('combobox')).toEqual([])
    const field = screen.getByRole('button', { name: new RegExp(`^${NOUN.temp} aggregate `) })
    await user.click(field)
    await user.click(screen.getByRole('option', { name: windowAggregate(other) }))
    expect(setSortBy).toHaveBeenCalledWith(other)
    expect(document.activeElement).toBe(field)
  })

  it('ranks by a new aggregate from the native select on a phone', () => {
    const setSortBy = vi.fn()
    render(<MetricsTable {...props({ setSortBy, phone: true })} />)
    const other = FAMILY_KEYS.temp.find((k) => k !== DEFAULT_FAMILY_KEY.temp)!
    fireEvent.change(screen.getByRole('combobox', { name: `${NOUN.temp} aggregate` }), {
      target: { value: other },
    })
    expect(setSortBy).toHaveBeenCalledWith(other)
  })

  it('hides every aggregate choice for a single-hour window', () => {
    render(<MetricsTable {...props({ pointSample: true })} />)
    expect(screen.queryAllByRole('button', { name: / aggregate / })).toEqual([])
    render(<MetricsTable {...props({ pointSample: true, phone: true })} />)
    expect(screen.queryAllByRole('combobox')).toEqual([])
  })

  it('sets a bound from its box and clears it from an empty one', () => {
    const setConstraints = vi.fn()
    const { rerender } = render(<MetricsTable {...props({ setConstraints })} />)
    const ceiling = screen.getByRole('spinbutton', { name: new RegExp(`^${NOUN.wind} ${AGGREGATE.maximum}\\.`) })
    fireEvent.change(ceiling, { target: { value: '20' } })
    expect(setConstraints).toHaveBeenLastCalledWith({ ...NO_CONSTRAINTS, maxWindMph: 20 })
    rerender(<MetricsTable {...props({ setConstraints, constraints: { ...NO_CONSTRAINTS, maxWindMph: 20 } })} />)
    fireEvent.change(ceiling, { target: { value: '' } })
    expect(setConstraints).toHaveBeenLastCalledWith({ ...NO_CONSTRAINTS, maxWindMph: null })
  })

  // The wind's ceiling reads the windiest sustained hour (#584): the app holds
  // no gust (record 0124), so the hint names what the box compares.
  it('names the windiest hour in the wind ceiling and the calmest in its floor', () => {
    render(<MetricsTable {...props()} />)
    expect(
      screen.getByRole('spinbutton', {
        name: `${NOUN.wind} ${AGGREGATE.maximum}. The windiest hour must be at most this.`,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('spinbutton', {
        name: `${NOUN.wind} ${AGGREGATE.minimum}. The calmest hour must be at least this.`,
      }),
    ).toBeTruthy()
  })

  it('clamps the results cap to the published ceiling, and reads empty as the default', () => {
    const setLimit = vi.fn()
    const { rerender } = render(<MetricsTable {...props({ setLimit })} />)
    expect((results() as HTMLInputElement).value).toBe('')
    fireEvent.change(results(), { target: { value: '99999' } })
    expect(setLimit).toHaveBeenLastCalledWith(1500)
    rerender(<MetricsTable {...props({ setLimit, limit: 300 })} />)
    fireEvent.change(results(), { target: { value: '' } })
    expect(setLimit).toHaveBeenLastCalledWith(DEFAULT_LIMIT)
  })

  describe('Clear filters', () => {
    it('is drawn and disabled with nothing to clear', () => {
      render(<MetricsTable {...props()} />)
      expect(clear().disabled).toBe(true)
    })

    it.each([
      ['a bound', { constraints: { ...NO_CONSTRAINTS, minTempF: 10 } }],
      ['the results cap', { limit: DEFAULT_LIMIT + 1 }],
    ] as [string, Partial<Props>][])('clears %s', async (_case, over) => {
      const onClearFilters = vi.fn()
      const { user } = render(<MetricsTable {...props({ ...over, onClearFilters })} />)
      expect(clear().disabled).toBe(false)
      await user.click(clear())
      expect(onClearFilters).toHaveBeenCalledOnce()
    })
  })

  // --- #803, W6 and W7 (record 0236): a metric the window or the models
  // cannot answer greys its row, the way a Layers row greys outside its
  // coverage, and a floor above its ceiling is marked invalid.
  describe('a metric the window cannot answer', () => {
    const ARCHIVE = new Map([
      ['cloud_deck', 'archive'],
      ['freeze', 'archive'],
    ] as const)
    const box = (family: 'cloud_deck' | 'temp', aggregate: string) =>
      screen.getByRole('spinbutton', { name: new RegExp(`^${NOUN[family]} ${aggregate}\\.`) }) as HTMLInputElement

    it('greys its radio, its aggregate and both boxes, and leaves the rest live', () => {
      render(<MetricsTable {...props({ unanswered: ARCHIVE })} />)
      for (const family of ['cloud_deck', 'freeze'] as const) {
        expect((screen.getByRole('radio', { name: NOUN[family] }) as HTMLInputElement).disabled).toBe(true)
        expect(
          (screen.getByRole('button', { name: new RegExp(`^${NOUN[family]} aggregate `) }) as HTMLButtonElement).disabled,
        ).toBe(true)
      }
      expect(box('cloud_deck', AGGREGATE.minimum).disabled).toBe(true)
      expect(box('cloud_deck', AGGREGATE.maximum).disabled).toBe(true)
      expect((screen.getByRole('radio', { name: NOUN.temp }) as HTMLInputElement).disabled).toBe(false)
      expect(box('temp', AGGREGATE.minimum).disabled).toBe(false)
    })

    it('cannot be picked, from its radio or its aggregate', async () => {
      const setSortBy = vi.fn()
      const { user } = render(<MetricsTable {...props({ setSortBy, unanswered: ARCHIVE })} />)
      await user.click(screen.getByRole('radio', { name: NOUN.cloud_deck }))
      await user.click(screen.getByRole('button', { name: new RegExp(`^${NOUN.cloud_deck} aggregate `) }))
      expect(setSortBy).not.toHaveBeenCalled()
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('greys the native aggregate on a phone too', () => {
      render(<MetricsTable {...props({ unanswered: ARCHIVE, phone: true })} />)
      expect(
        (screen.getByRole('combobox', { name: `${NOUN.cloud_deck} aggregate` }) as HTMLSelectElement).disabled,
      ).toBe(true)
    })

    // The ranking the reader set before the window moved stays checked; the
    // Analyze button's line says why it is held.
    it('keeps a ranking already on it checked', () => {
      render(<MetricsTable {...props({ sortBy: DEFAULT_FAMILY_KEY.cloud_deck, unanswered: ARCHIVE })} />)
      const radio = screen.getByRole('radio', { name: NOUN.cloud_deck }) as HTMLInputElement
      expect(radio.checked).toBe(true)
      expect(radio.disabled).toBe(true)
    })

    // A greyed box keeps its value, and Clear filters is the way to empty it.
    it('keeps the value an inert box holds, which Clear filters still clears', () => {
      const constraints = { ...NO_CONSTRAINTS, minCloudDeckFt: 3000 }
      render(<MetricsTable {...props({ constraints, unanswered: ARCHIVE })} />)
      expect(box('cloud_deck', AGGREGATE.minimum).value).toBe('3000')
      expect(clear().disabled).toBe(false)
    })

    // The grey row is the whole message: the air-quality row's note goes too.
    it('carries no note on a greyed row', () => {
      const { container } = render(<MetricsTable {...props({ unanswered: new Map([['aqi', 'horizon']]) })} />)
      expect(container.querySelector('#air-quality-lower')?.getAttribute('title')).toBeNull()
      const live = render(<MetricsTable {...props()} />)
      expect(live.container.querySelector('#air-quality-lower')?.getAttribute('title')).toBeTruthy()
    })
  })

  describe('a floor above its ceiling', () => {
    it('marks both of its boxes invalid, and no other', () => {
      const constraints = { ...NO_CONSTRAINTS, minTempF: 50, maxTempF: 20 }
      render(<MetricsTable {...props({ constraints })} />)
      const temp = (aggregate: string) =>
        screen.getByRole('spinbutton', { name: new RegExp(`^${NOUN.temp} ${aggregate}\\.`) })
      expect(temp(AGGREGATE.minimum).getAttribute('aria-invalid')).toBe('true')
      expect(temp(AGGREGATE.maximum).getAttribute('aria-invalid')).toBe('true')
      expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(2)
    })

    it('marks nothing on an inert row', () => {
      const constraints = { ...NO_CONSTRAINTS, minCloudDeckFt: 9000, maxCloudDeckFt: 3000 }
      render(<MetricsTable {...props({ constraints, unanswered: new Map([['cloud_deck', 'archive']]) })} />)
      expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0)
    })
  })
  // --- end #803 W6 and W7
})
