import { describe, expect, it } from 'vitest'
import { hourlyStampCount, isPointSample, resolveWindow } from './forecastWindow'

const NOW = Date.parse('2026-07-21T12:00:00Z')
const HOUR = 3_600_000
const DAY = 86_400_000

describe('resolveWindow', () => {
  it('passes an ordered window through unchanged', () => {
    const w = resolveWindow('2026-07-21T00:00:00Z', '2026-07-22T00:00:00Z', NOW)
    expect(w.startMs).toBe(Date.parse('2026-07-21T00:00:00Z'))
    expect(w.endMs).toBe(Date.parse('2026-07-22T00:00:00Z'))
  })

  it('normalizes a point sample to its floored hour plus one minute', () => {
    // The backend's rule: equal timestamps mean "the hour containing this
    // moment", spanned by one minute so the hourly filter catches one stamp.
    const moment = '2026-07-21T12:34:56.789Z'
    const w = resolveWindow(moment, moment, NOW)
    expect(w.startMs).toBe(Date.parse('2026-07-21T12:00:00Z'))
    expect(w.endMs).toBe(w.startMs + 60_000)
  })

  it('floors a point sample already on the hour to itself', () => {
    const moment = '2026-07-21T12:00:00Z'
    const w = resolveWindow(moment, moment, NOW)
    expect(w.startMs).toBe(Date.parse('2026-07-21T12:00:00Z'))
    expect(w.endMs - w.startMs).toBe(60_000)
  })

  it('reads a naive timestamp as UTC, like the backend', () => {
    const w = resolveWindow('2026-07-21T00:00', '2026-07-21T06:00', NOW)
    expect(w.startMs).toBe(Date.parse('2026-07-21T00:00:00Z'))
  })

  it('rejects an inverted window with the server wording', () => {
    expect(() =>
      resolveWindow('2026-07-22T00:00:00Z', '2026-07-21T00:00:00Z', NOW),
    ).toThrow('The start date must be before the end date.')
  })

  it('rejects a start beyond the history horizon', () => {
    const past = new Date(NOW - 96 * DAY).toISOString()
    expect(() => resolveWindow(past, new Date(NOW).toISOString(), NOW)).toThrow(
      /90-day history limit/,
    )
  })

  it('rejects an end beyond the forecast horizon', () => {
    const future = new Date(NOW + 18 * DAY).toISOString()
    expect(() => resolveWindow(new Date(NOW).toISOString(), future, NOW)).toThrow(
      /16-day forecast horizon/,
    )
  })

  it('accepts windows just inside both horizons', () => {
    const start = new Date(NOW - 94 * DAY).toISOString()
    const end = new Date(NOW + 16 * DAY).toISOString()
    const w = resolveWindow(start, end, NOW)
    expect(w.endMs - w.startMs).toBe(110 * DAY)
  })

  it('rejects garbage timestamps', () => {
    expect(() => resolveWindow('not-a-time', '2026-07-21T00:00:00Z', NOW)).toThrow(
      /Unparseable/,
    )
  })

  it('an hour-boundary point sample spans exactly one hourly stamp', () => {
    // The +1 minute (not +1 hour) rule: a moment exactly on an hour boundary
    // must not capture two stamps.
    const w = resolveWindow('2026-07-21T05:00:00Z', '2026-07-21T05:00:00Z', NOW)
    const stamps = [
      Date.parse('2026-07-21T05:00:00Z'),
      Date.parse('2026-07-21T06:00:00Z'),
    ]
    const caught = stamps.filter((t) => t >= w.startMs && t <= w.endMs)
    expect(caught).toEqual([Date.parse('2026-07-21T05:00:00Z')])
  })
})

describe('resolveWindow parity with the hour filter', () => {
  it(`${HOUR} keeps epoch math honest`, () => {
    // UTC hours align with epoch-hour multiples; the floor relies on it.
    expect(Date.parse('2026-07-21T12:00:00Z') % HOUR).toBe(0)
  })
})

// What replaced "which mode was this?" for the results table. The count is the
// honest question: the aggregates collapse exactly when the window covered one
// hourly stamp, whatever picked it.
describe('hourlyStampCount', () => {
  const at = (iso: string) => Date.parse(iso)

  it('counts a point sample as one, before any normalization', () => {
    const moment = at('2026-07-21T12:34:00Z')
    expect(hourlyStampCount(moment, moment)).toBe(1)
    expect(isPointSample(moment, moment)).toBe(true)
  })

  // The filter is inclusive at both ends, which is the whole reason a whole day
  // ends at 23:59: midnight to midnight would count the boundary hour twice.
  it('counts a whole local day as 24, and midnight-to-midnight as 25', () => {
    expect(hourlyStampCount(at('2026-07-21T00:00:00Z'), at('2026-07-21T23:59:00Z'))).toBe(24)
    expect(hourlyStampCount(at('2026-07-21T00:00:00Z'), at('2026-07-22T00:00:00Z'))).toBe(25)
  })

  it('counts an inclusive hour pair as two, and an hour minus a minute as one', () => {
    expect(hourlyStampCount(at('2026-07-21T06:00:00Z'), at('2026-07-21T07:00:00Z'))).toBe(2)
    expect(isPointSample(at('2026-07-21T06:00:00Z'), at('2026-07-21T07:00:00Z'))).toBe(false)
    expect(hourlyStampCount(at('2026-07-21T06:00:00Z'), at('2026-07-21T06:59:00Z'))).toBe(1)
    expect(isPointSample(at('2026-07-21T06:00:00Z'), at('2026-07-21T06:59:00Z'))).toBe(true)
  })

  // A local calendar day is not always 24 hours. Written with explicit offsets
  // rather than a local-time constructor so the assertion means the same thing
  // whatever zone the runner is in: these are the instants a Pacific browser
  // sends for "March 8" and "November 1".
  it('counts a spring-forward day as 23 hours and a fall-back day as 25', () => {
    expect(hourlyStampCount(at('2026-03-08T00:00:00-08:00'), at('2026-03-08T23:59:00-07:00'))).toBe(
      23,
    )
    expect(hourlyStampCount(at('2026-11-01T00:00:00-07:00'), at('2026-11-01T23:59:00-08:00'))).toBe(
      25,
    )
  })

  it('counts a 16-day range as sixteen days of hours', () => {
    // 16 days inclusive of both ends: 16 x 24 stamps.
    expect(hourlyStampCount(at('2026-07-01T00:00:00Z'), at('2026-07-16T23:59:00Z'))).toBe(16 * 24)
  })

  it('counts a window that spans no whole hour as none', () => {
    expect(hourlyStampCount(at('2026-07-21T06:10:00Z'), at('2026-07-21T06:50:00Z'))).toBe(0)
  })
})
