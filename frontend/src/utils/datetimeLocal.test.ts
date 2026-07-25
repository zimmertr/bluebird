import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WINDOW_HOURS, nowLocal } from './datetimeLocal'

describe('nowLocal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats the current local time as a datetime-local value', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 23, 5)) // local Jul 24 2026 23:05
    expect(nowLocal()).toBe('2026-07-24T23:05')
  })

  it('zero-pads month, day, hour, and minute', () => {
    vi.setSystemTime(new Date(2026, 0, 3, 4, 7)) // local Jan 3 2026 04:07
    expect(nowLocal()).toBe('2026-01-03T04:07')
  })

  it('applies the hour offset across day and month boundaries', () => {
    vi.setSystemTime(new Date(2026, 0, 31, 23, 30)) // local Jan 31 2026 23:30
    expect(nowLocal(72)).toBe('2026-02-03T23:30')
  })

  it('default window is a real multi-day span', () => {
    vi.setSystemTime(new Date(2026, 6, 24, 12, 0))
    const start = nowLocal()
    const end = nowLocal(DEFAULT_WINDOW_HOURS)
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(
      DEFAULT_WINDOW_HOURS * 3_600_000,
    )
  })
})
