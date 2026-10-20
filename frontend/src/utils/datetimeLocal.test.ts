import { describe, expect, it, vi } from 'vitest'
import { nowLocal } from './datetimeLocal'

describe('nowLocal', () => {
  // The moment is a parameter rather than the clock now: the calendar's
  // current-hour selection resolves against an injected `now`, so this stopped
  // needing fake timers to be deterministic.
  it('formats a local moment as a datetime-local value', () => {
    expect(nowLocal(new Date(2026, 6, 24, 23, 5))).toBe('2026-07-24T23:05')
  })

  it('zero-pads month, day, hour, and minute', () => {
    expect(nowLocal(new Date(2026, 0, 3, 4, 7))).toBe('2026-01-03T04:07')
  })

  it('reads the clock when handed no moment', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 6, 24, 23, 5))
      expect(nowLocal()).toBe('2026-07-24T23:05')
    } finally {
      vi.useRealTimers()
    }
  })
})
