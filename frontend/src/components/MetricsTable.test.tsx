import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import MetricsTable from './MetricsTable'
import { AGGREGATE, DEFAULT_FAMILY_KEY, FAMILY_KEYS, NOUN, RANKED_FAMILIES, windowAggregate } from '../metrics'
import { NO_CONSTRAINTS } from '../utils/clientAnalyze'
import { DEFAULT_LIMIT } from '../utils/urlState'
import { render } from '../testSupport/render'

// The ranking and the bounds in one table (#498; record 0242): Metric,
// Aggregate, Order, Max results and the Bound adder, then a row for each
// metric with a bound set or just added, and Clear filters only when there is
// something to clear. Every control here reports to App and nothing needs an
// Analyze.

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
const clear = () => screen.queryByRole('button', { name: 'Clear filters' })
// A desk's menu field is named by its label and the value it shows.
const field = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label} `) }) as HTMLButtonElement
const box = (family: keyof typeof NOUN, aggregate: string) =>
  screen.queryByRole('spinbutton', { name: new RegExp(`^${NOUN[family]} ${aggregate}\\.`) }) as HTMLInputElement | null
const boundRows = () =>
  RANKED_FAMILIES.filter((family) => box(family, AGGREGATE.minimum) !== null)

describe('MetricsTable', () => {
  it('sets the direction from the pressed half', async () => {
    const setSortDesc = vi.fn()
    const { user } = render(<MetricsTable {...props({ setSortDesc })} />)
    expect(screen.getByRole('group', { name: 'Order' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lowest' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Highest' }))
    expect(setSortDesc).toHaveBeenCalledWith(true)
  })

  describe('the Metric menu', () => {
    it('offers every ranked metric, in order, and shows the one ranking', async () => {
      const { user } = render(<MetricsTable {...props({ sortBy: DEFAULT_FAMILY_KEY.wind })} />)
      expect(field('Metric').textContent).toContain(NOUN.wind)
      await user.click(field('Metric'))
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(RANKED_FAMILIES.map((f) => NOUN[f]))
    })

    // The aggregate a metric last held, so the useRankingKnobs invariant holds.
    it('ranks by the picked metric at its own aggregate', async () => {
      const setSortBy = vi.fn()
      const rowKeys = { ...DEFAULT_FAMILY_KEY, wind: 'wind_max_mph' as const }
      const { user } = render(<MetricsTable {...props({ setSortBy, rowKeys })} />)
      await user.click(field('Metric'))
      await user.click(screen.getByRole('option', { name: NOUN.wind }))
      expect(setSortBy).toHaveBeenCalledWith('wind_max_mph')
    })

    it('is the native select on a phone', () => {
      const setSortBy = vi.fn()
      render(<MetricsTable {...props({ setSortBy, phone: true })} />)
      fireEvent.change(screen.getByRole('combobox', { name: 'Metric' }), { target: { value: 'temp' } })
      expect(setSortBy).toHaveBeenCalledWith(DEFAULT_FAMILY_KEY.temp)
    })
  })

  describe('the Aggregate menu', () => {
    it('ranks by a new aggregate of the ranking metric', async () => {
      const setSortBy = vi.fn()
      const { user } = render(<MetricsTable {...props({ setSortBy, sortBy: DEFAULT_FAMILY_KEY.temp })} />)
      const other = FAMILY_KEYS.temp.find((k) => k !== DEFAULT_FAMILY_KEY.temp)!
      expect(screen.queryAllByRole('combobox')).toEqual([])
      const aggregate = field('Aggregate')
      await user.click(aggregate)
      await user.click(screen.getByRole('option', { name: windowAggregate(other) }))
      expect(setSortBy).toHaveBeenCalledWith(other)
      expect(document.activeElement).toBe(aggregate)
    })

    it('is the native select on a phone', () => {
      const setSortBy = vi.fn()
      render(<MetricsTable {...props({ setSortBy, sortBy: DEFAULT_FAMILY_KEY.temp, phone: true })} />)
      const other = FAMILY_KEYS.temp.find((k) => k !== DEFAULT_FAMILY_KEY.temp)!
      fireEvent.change(screen.getByRole('combobox', { name: 'Aggregate' }), { target: { value: other } })
      expect(setSortBy).toHaveBeenCalledWith(other)
    })

    it('hides for a single-hour window', () => {
      render(<MetricsTable {...props({ pointSample: true })} />)
      expect(screen.queryByRole('button', { name: /^Aggregate / })).toBeNull()
      expect(screen.queryByText('Aggregate')).toBeNull()
      render(<MetricsTable {...props({ pointSample: true, phone: true })} />)
      expect(screen.queryByRole('combobox', { name: 'Aggregate' })).toBeNull()
    })
  })

  describe('the bound rows', () => {
    it('draws none at rest, and no headings over them', () => {
      render(<MetricsTable {...props()} />)
      expect(boundRows()).toEqual([])
      expect(screen.queryByText(AGGREGATE.minimum)).toBeNull()
      expect(field('Bound').textContent).toContain('Add a bound')
    })

    // A share link carrying a bound opens with its row, and no pending one.
    it('draws a row for every bound set, in the ranked order', () => {
      const constraints = { ...NO_CONSTRAINTS, maxWindMph: 20, minAqi: 10 }
      render(<MetricsTable {...props({ constraints })} />)
      expect(boundRows()).toEqual(['aqi', 'wind'])
      expect(box('wind', AGGREGATE.maximum)!.value).toBe('20')
      expect(screen.getAllByText(AGGREGATE.minimum)).toHaveLength(1)
    })

    it('adds a row from the Bound menu and puts the keyboard in its floor box', async () => {
      const { user } = render(<MetricsTable {...props()} />)
      await user.click(field('Bound'))
      await user.click(screen.getByRole('option', { name: NOUN.wind }))
      expect(boundRows()).toEqual(['wind'])
      expect(document.activeElement).toBe(box('wind', AGGREGATE.minimum))
      // And the adder goes back to empty.
      expect(field('Bound').textContent).toContain('Add a bound')
    })

    it('offers only the metrics not already drawn', async () => {
      const { user } = render(<MetricsTable {...props({ constraints: { ...NO_CONSTRAINTS, maxWindMph: 20 } })} />)
      await user.click(field('Bound'))
      const offered = screen.getAllByRole('option').map((o) => o.textContent)
      expect(offered).toEqual(RANKED_FAMILIES.filter((f) => f !== 'wind').map((f) => NOUN[f]))
    })

    it('keeps an empty added row while the keyboard is in it, and drops it when it leaves', async () => {
      const { user } = render(<MetricsTable {...props()} />)
      await user.click(field('Bound'))
      await user.click(screen.getByRole('option', { name: NOUN.temp }))
      act(() => box('temp', AGGREGATE.maximum)!.focus())
      expect(boundRows()).toEqual(['temp'])
      act(() => box('temp', AGGREGATE.maximum)!.blur())
      expect(boundRows()).toEqual([])
    })

    it('swaps an empty added row for the next one added', () => {
      render(<MetricsTable {...props({ phone: true })} />)
      const adder = screen.getByRole('combobox', { name: 'Bound' })
      fireEvent.change(adder, { target: { value: 'temp' } })
      expect(boundRows()).toEqual(['temp'])
      expect(document.activeElement).toBe(box('temp', AGGREGATE.minimum))
      fireEvent.change(adder, { target: { value: 'wind' } })
      expect(boundRows()).toEqual(['wind'])
    })

    it('sets a bound from its box and clears it from an empty one', () => {
      const setConstraints = vi.fn()
      const constraints = { ...NO_CONSTRAINTS, minWindMph: 5 }
      const { rerender } = render(<MetricsTable {...props({ setConstraints, constraints })} />)
      fireEvent.change(box('wind', AGGREGATE.maximum)!, { target: { value: '20' } })
      expect(setConstraints).toHaveBeenLastCalledWith({ ...constraints, maxWindMph: 20 })
      rerender(<MetricsTable {...props({ setConstraints, constraints: { ...constraints, maxWindMph: 20 } })} />)
      fireEvent.change(box('wind', AGGREGATE.maximum)!, { target: { value: '' } })
      expect(setConstraints).toHaveBeenLastCalledWith({ ...constraints, maxWindMph: null })
    })

    // The wind's ceiling reads the windiest sustained hour (#584): the app
    // holds no gust (record 0124), so the hint names what the box compares.
    it('names the windiest hour in the wind ceiling and the calmest in its floor', () => {
      render(<MetricsTable {...props({ constraints: { ...NO_CONSTRAINTS, maxWindMph: 20 } })} />)
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
    it('is not drawn with nothing to clear, an empty added row included', async () => {
      const { user } = render(<MetricsTable {...props()} />)
      expect(clear()).toBeNull()
      await user.click(field('Bound'))
      await user.click(screen.getByRole('option', { name: NOUN.wind }))
      expect(clear()).toBeNull()
    })

    it.each([
      ['a bound', { constraints: { ...NO_CONSTRAINTS, minTempF: 10 } }],
      ['the results cap', { limit: DEFAULT_LIMIT + 1 }],
    ] as [string, Partial<Props>][])('clears %s', async (_case, over) => {
      const onClearFilters = vi.fn()
      const { user } = render(<MetricsTable {...props({ ...over, onClearFilters })} />)
      await user.click(clear()!)
      expect(onClearFilters).toHaveBeenCalledOnce()
    })

    it('drops the added row too', async () => {
      const { user } = render(<MetricsTable {...props({ limit: DEFAULT_LIMIT + 1 })} />)
      await user.click(field('Bound'))
      await user.click(screen.getByRole('option', { name: NOUN.wind }))
      expect(boundRows()).toEqual(['wind'])
      await user.click(clear()!)
      expect(boundRows()).toEqual([])
    })
  })

  // --- #803, W6 and W7 (record 0236), carried into #498's shape: a metric
  // the window or the models cannot answer is a disabled option and greys its
  // bound row, and a floor above its ceiling is marked invalid.
  describe('a metric the window cannot answer', () => {
    const ARCHIVE = new Map([
      ['cloud_deck', 'archive'],
      ['freeze', 'archive'],
    ] as const)

    it('is a disabled option in the Metric and Bound menus', async () => {
      const setSortBy = vi.fn()
      const { user } = render(<MetricsTable {...props({ setSortBy, unanswered: ARCHIVE })} />)
      for (const label of ['Metric', 'Bound']) {
        await user.click(field(label))
        const option = screen.getByRole('option', { name: NOUN.cloud_deck })
        expect(option.getAttribute('aria-disabled')).toBe('true')
        expect(screen.getByRole('option', { name: NOUN.temp }).getAttribute('aria-disabled')).toBeNull()
        await user.click(option)
        expect(screen.getByRole('listbox')).toBeTruthy()
        await user.keyboard('{Escape}')
      }
      expect(setSortBy).not.toHaveBeenCalled()
      expect(boundRows()).toEqual([])
    })

    it('is a disabled option in the native selects on a phone', () => {
      render(<MetricsTable {...props({ unanswered: ARCHIVE, phone: true })} />)
      for (const label of ['Metric', 'Bound']) {
        const select = screen.getByRole('combobox', { name: label })
        const option = [...select.querySelectorAll('option')].find((o) => o.value === 'cloud_deck')!
        expect(option.disabled).toBe(true)
      }
    })

    // The ranking the reader set before the window moved stays shown; the
    // Analyze button's line says why it is held.
    it('keeps a ranking already on it, with its aggregate greyed', () => {
      render(<MetricsTable {...props({ sortBy: DEFAULT_FAMILY_KEY.cloud_deck, unanswered: ARCHIVE })} />)
      expect(field('Metric').textContent).toContain(NOUN.cloud_deck)
      expect(field('Aggregate').disabled).toBe(true)
    })

    // A greyed box keeps its value, and Clear filters is the way to empty it.
    it('greys its bound row and keeps the value, which Clear filters still clears', () => {
      const constraints = { ...NO_CONSTRAINTS, minCloudDeckFt: 3000, minTempF: 10 }
      render(<MetricsTable {...props({ constraints, unanswered: ARCHIVE })} />)
      expect(box('cloud_deck', AGGREGATE.minimum)!.value).toBe('3000')
      expect(box('cloud_deck', AGGREGATE.minimum)!.disabled).toBe(true)
      expect(box('cloud_deck', AGGREGATE.maximum)!.disabled).toBe(true)
      expect(box('temp', AGGREGATE.minimum)!.disabled).toBe(false)
      expect(clear()).toBeTruthy()
    })

    // The grey row is the whole message: the air-quality row's note goes too.
    it('carries no note on a greyed row', () => {
      const constraints = { ...NO_CONSTRAINTS, minAqi: 10 }
      const { container } = render(
        <MetricsTable {...props({ constraints, unanswered: new Map([['aqi', 'horizon']]) })} />,
      )
      expect(container.querySelector('#air-quality-lower')?.getAttribute('title')).toBeNull()
      const live = render(<MetricsTable {...props({ constraints })} />)
      expect(live.container.querySelector('#air-quality-lower')?.getAttribute('title')).toBeTruthy()
    })
  })

  describe('a floor above its ceiling', () => {
    it('marks both of its boxes invalid, and no other', () => {
      const constraints = { ...NO_CONSTRAINTS, minTempF: 50, maxTempF: 20, minWindMph: 5 }
      render(<MetricsTable {...props({ constraints })} />)
      expect(box('temp', AGGREGATE.minimum)!.getAttribute('aria-invalid')).toBe('true')
      expect(box('temp', AGGREGATE.maximum)!.getAttribute('aria-invalid')).toBe('true')
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
