import { describe, expect, it } from 'vitest'
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
    expect(nowLocal()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
