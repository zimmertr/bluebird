import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import MetricsTable from './MetricsTable'
import { AGGREGATE, DEFAULT_FAMILY_KEY, FAMILY_KEYS, NOUN, RANKED_FAMILIES } from '../metrics'
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
    expect(screen.getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(
      RANKED_FAMILIES.map((f) => NOUN[f]),
    )
  })

  it('ranks by a new aggregate from the dropdown', () => {
    const setSortBy = vi.fn()
    render(<MetricsTable {...props({ setSortBy })} />)
    const other = FAMILY_KEYS.temp.find((k) => k !== DEFAULT_FAMILY_KEY.temp)!
    fireEvent.change(screen.getByRole('combobox', { name: `${NOUN.temp} aggregate` }), {
      target: { value: other },
    })
    expect(setSortBy).toHaveBeenCalledWith(other)
  })

  it('hides every dropdown for a single-hour window', () => {
    render(<MetricsTable {...props({ pointSample: true })} />)
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
})
