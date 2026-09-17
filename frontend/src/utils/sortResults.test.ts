import { describe, it, expect } from 'vitest'
import { DestinationResult } from '../types'
import { rankComparator } from './clientAnalyze'
import { compareValues } from './sortResults'

describe('compareValues', () => {
  it('orders numbered names naturally, not lexicographically', () => {
    const names = ['10. B', '1. A', '100. D', '2. C', '11. E']
    const asc = [...names].sort((a, b) => compareValues(a, b, 'asc'))
    expect(asc).toEqual(['1. A', '2. C', '10. B', '11. E', '100. D'])
  })

  it('reverses natural order when descending', () => {
    const names = ['1. A', '2. C', '10. B', '100. D']
    const desc = [...names].sort((a, b) => compareValues(a, b, 'desc'))
    expect(desc).toEqual(['100. D', '10. B', '2. C', '1. A'])
  })

  it('compares plain numbers numerically', () => {
    expect(compareValues(2, 10, 'asc')).toBeLessThan(0)
    expect(compareValues(10, 2, 'asc')).toBeGreaterThan(0)
    expect(compareValues(5, 5, 'asc')).toBe(0)
  })

  it('sorts nulls last in ascending order', () => {
    expect(compareValues(null, 5, 'asc')).toBe(1)
    expect(compareValues(5, null, 'asc')).toBe(-1)
  })

  // The key regression guard: a descending sort must not float null rows to the
  // top — they stay last whichever way the column points.
  it('keeps nulls last in descending order too', () => {
    expect(compareValues(null, 5, 'desc')).toBe(1)
    expect(compareValues(5, null, 'desc')).toBe(-1)
    expect(compareValues(null, null, 'desc')).toBe(0)
  })

  it('still orders ordinary strings alphabetically', () => {
    expect(compareValues('Apple', 'Banana', 'asc')).toBeLessThan(0)
  })
})

// The app orders rows twice with two comparators: this file's column sort, and
// `rankComparator` in clientAnalyze.ts, the port of the backend's `_sort_key`.
// They share one rule — a null is last whichever way the order points — and
// they now share the `nullsLast` primitive that states it. This is the guard on
// the pair: if either side re-derives the rule, the two stop agreeing here
// before a user finds nulls at the top of a descending column.
describe('null placement, shared with the ranking comparator', () => {
  const row = (aqi_max: number | null) => ({ aqi_max }) as DestinationResult

  it('agrees with rankComparator in both directions', () => {
    for (const desc of [false, true]) {
      const dir = desc ? 'desc' : 'asc'
      const rank = rankComparator('aqi_max', desc)
      expect(rank(row(null), row(5))).toBe(compareValues(null, 5, dir))
      expect(rank(row(5), row(null))).toBe(compareValues(5, null, dir))
      expect(rank(row(null), row(null))).toBe(compareValues(null, null, dir))
      // Agreeing on the wrong answer would also pass the three above, so pin
      // the answer itself: the null row goes after the one with a number.
      expect(rank(row(null), row(5))).toBeGreaterThan(0)
      expect(rank(row(5), row(null))).toBeLessThan(0)
    }
  })
})
