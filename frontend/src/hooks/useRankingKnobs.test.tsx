import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRankingKnobs } from './useRankingKnobs'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from '../utils/clientAnalyze'
import { DEFAULT_LIMIT, DEFAULT_SORT } from '../utils/urlState'

describe('useRankingKnobs', () => {
  it('opens on the defaults with nothing restored', () => {
    const { result } = renderHook(() => useRankingKnobs(null, 1500))
    expect(result.current.sortBy).toBe(DEFAULT_SORT)
    expect(result.current.sortDesc).toBe(false)
    expect(result.current.rowKeys).toEqual(DEFAULT_FAMILY_KEY)
    expect(result.current.constraints).toBe(NO_CONSTRAINTS)
    expect(result.current.limit).toBe(DEFAULT_LIMIT)
  })

  // A dropdown choice IS a ranking choice, so the row follows the ranking.
  it('moves the metric row with the ranking', () => {
    const { result } = renderHook(() => useRankingKnobs(null, 1500))
    act(() => result.current.setSortBy('wind_max_mph'))
    expect(result.current.sortBy).toBe('wind_max_mph')
    expect(result.current.rowKeys.wind).toBe('wind_max_mph')
  })

  it('lowers a restored limit to the ceiling that lands, and never raises one', () => {
    const { result, rerender } = renderHook(({ max }) => useRankingKnobs({ limit: 1200 }, max), {
      initialProps: { max: 1500 },
    })
    expect(result.current.limit).toBe(1200)
    rerender({ max: 800 })
    expect(result.current.limit).toBe(800)
    rerender({ max: 1500 })
    expect(result.current.limit).toBe(800)
  })

  it('clears the bounds and the cap together', () => {
    const { result } = renderHook(() => useRankingKnobs({ limit: 50 }, 1500))
    act(() => result.current.setConstraints({ ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.1 }))
    act(() => result.current.clearFilters())
    expect(result.current.constraints).toBe(NO_CONSTRAINTS)
    expect(result.current.limit).toBe(DEFAULT_LIMIT)
  })

  // `present.ts` re-derives the table from this value, so a render that
  // changed no knob must hand back the same one.
  it('keeps liveKnobs and its callbacks stable across a render that changes no knob', () => {
    const { result, rerender } = renderHook(() => useRankingKnobs(null, 1500))
    const before = result.current
    rerender()
    expect(result.current.liveKnobs).toBe(before.liveKnobs)
    expect(result.current.setSortBy).toBe(before.setSortBy)
    expect(result.current.clearFilters).toBe(before.clearFilters)
  })
})
