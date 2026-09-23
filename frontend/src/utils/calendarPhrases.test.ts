import { describe, expect, it } from 'vitest'
import {
  isWholeDaySpan,
  snapshotCaption,
  windowCaption,
  windowPhrase,
  archiveSeamPhrase,
  needsYear,
} from './calendarPhrases'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

describe('saying what is selected', () => {
  const localMs = (s: string) => Date.parse(s)

  it('leaves the clock out of a whole-day window', () => {
    expect(
      windowPhrase(localMs('2026-07-15T00:00'), localMs('2026-07-15T23:59'), false, NOW),
    ).toBe('Wed, Jul 15')
    expect(
      windowPhrase(localMs('2026-07-15T00:00'), localMs('2026-07-19T23:59'), false, NOW),
    ).toBe('Wed, Jul 15 to Sun, Jul 19')
  })

  it('names both hours on a narrowed day, and the second date only when it differs', () => {
    expect(
      windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-15T18:00'), false, NOW),
    ).toBe('Wed, Jul 15, 6:00 AM to 6:00 PM')
    expect(
      windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-19T18:00'), false, NOW),
    ).toBe('Wed, Jul 15, 6:00 AM to Sun, Jul 19, 6:00 PM')
  })

  it('states a single moment once', () => {
    expect(
      windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-15T06:00'), true, NOW),
    ).toBe('Wed, Jul 15, 6:00 AM')
  })

  it('captions the current hour by when it was taken, and a window by what it covers', () => {
    expect(
      windowCaption('now', localMs('2026-07-15T12:34'), localMs('2026-07-15T12:34'), true, NOW),
    ).toBe('as of 12:34 PM')
    expect(
      windowCaption('days', localMs('2026-07-15T00:00'), localMs('2026-07-19T23:59'), false, NOW),
    ).toBe('Wed, Jul 15 to Sun, Jul 19')
  })

  it('recognizes a whole-day span by its edges', () => {
    expect(isWholeDaySpan(localMs('2026-07-15T00:00'), localMs('2026-07-15T23:59'))).toBe(true)
    expect(isWholeDaySpan(localMs('2026-07-15T00:00'), localMs('2026-07-15T18:00'))).toBe(false)
    expect(isWholeDaySpan(localMs('2026-07-15T06:00'), localMs('2026-07-15T23:59'))).toBe(false)
  })
})

// A snapshot metric is not a reading of the window at all (#449), so the
// results header names the day its grid is from instead. Same year rule, same
// injected clock.
describe('snapshotCaption', () => {
  it('names the day the grid was analyzed', () => {
    expect(snapshotCaption('Snow depth', '2026-09-22', NOW)).toBe('Snow depth as of Sep 22')
  })

  // Parsed as a LOCAL day. `Date.parse` reads a bare date as UTC midnight,
  // which prints the day before everywhere west of Greenwich — and this suite
  // runs in UTC, so the assertion that catches it is the one below on a date
  // whose local and UTC days would differ.
  it('reads the date as a local day, not as UTC midnight', () => {
    expect(snapshotCaption('Snow depth', '2026-01-01', NOW)).toContain('Jan 1')
  })

  // The archive reaches a year back, so a grid from another year has to say
  // which — the same predicate the window caption asks.
  it('spells the year when the grid is from another one', () => {
    expect(snapshotCaption('Snow depth', '2025-09-22', NOW)).toBe('Snow depth as of Sep 22 2025')
  })

  // The noun comes from the caller, which reads it out of `metrics.ts`, so a
  // renamed metric renames its own caption.
  it('takes the noun rather than spelling one', () => {
    expect(snapshotCaption('Anything', '2026-09-22', NOW)).toBe('Anything as of Sep 22')
  })

  // A date this build cannot read is a server saying something unexpected. No
  // caption beats "as of Invalid Date".
  it('answers null for a date it cannot read', () => {
    expect(snapshotCaption('Snow depth', 'yesterday', NOW)).toBeNull()
    expect(snapshotCaption('Snow depth', '', NOW)).toBeNull()
    expect(snapshotCaption('Snow depth', '2026-13-40', NOW)).not.toBe('Snow depth as of Invalid Date')
  })
})

// The archive reaches a year back (#123), so a report can describe last
// September while the panel sits in this one — and "Sat, Sep 13" is then a date
// the reader cannot place. The clock is injected, because a test that reads the
// wall clock would start passing for the wrong reason each New Year.
describe('a window in another year', () => {
  const localMs = (s: string) => Date.parse(s)

  it('spells the year on both ends of an hourly window', () => {
    expect(
      windowPhrase(localMs('2025-09-13T12:00'), localMs('2025-09-14T23:59'), false, NOW),
    ).toBe('Sat, Sep 13 2025, 12:00 PM to Sun, Sep 14 2025, 11:59 PM')
  })

  it('spells it on both ends of a whole-day window', () => {
    expect(
      windowPhrase(localMs('2025-09-14T00:00'), localMs('2025-09-16T23:59'), false, NOW),
    ).toBe('Sun, Sep 14 2025 to Tue, Sep 16 2025')
  })

  it('spells it on a single moment, and in the caption', () => {
    expect(
      windowPhrase(localMs('2025-09-13T12:00'), localMs('2025-09-13T12:00'), true, NOW),
    ).toBe('Sat, Sep 13 2025, 12:00 PM')
    expect(
      windowCaption('days', localMs('2025-09-14T00:00'), localMs('2025-09-16T23:59'), false, NOW),
    ).toBe('Sun, Sep 14 2025 to Tue, Sep 16 2025')
  })

  // Both ends or neither: one date wearing a year beside one without reads as a
  // range that spans the New Year, which is the one case it must be clearest on.
  it('spells it on both ends when only one of them is in another year', () => {
    expect(
      windowPhrase(localMs('2026-12-31T00:00'), localMs('2027-01-01T23:59'), false, NOW),
    ).toBe('Thu, Dec 31 2026 to Fri, Jan 1 2027')
    expect(needsYear(localMs('2026-12-31T00:00'), localMs('2027-01-01T23:59'), NOW)).toBe(true)
  })

  it('says nothing about the year a window shares with today', () => {
    expect(needsYear(localMs('2026-01-01T00:00'), localMs('2026-12-31T23:59'), NOW)).toBe(false)
  })
})

// Where a window crossing the archive boundary changes source. The two dates
// are consecutive local days: the boundary is a UTC instant, and the
// one-local-day straddle tolerance is what makes the day it lands in wholly the
// forecast endpoint's. NOW is local noon on July 15 and the pinned zone is
// Pacific, so the boundary instant (2026-05-21T00:00Z) lands on the afternoon of
// May 20 there — the first local day the forecast endpoint answers whole.
describe('naming the archive seam', () => {
  const localMs = (s: string) => Date.parse(s)

  it('names the last archive day and the first forecast day, with the model', () => {
    expect(
      archiveSeamPhrase(
        localMs('2026-05-18T00:00'),
        localMs('2026-05-22T23:59'),
        'NOAA GFS',
        NOW,
      ),
    ).toBe('Archive data to May 19, NOAA GFS from May 20.')
  })

  it('carries the year when the window does', () => {
    const now = new Date(2026, 0, 15, 12, 0)
    expect(
      archiveSeamPhrase(
        localMs('2025-11-18T00:00'),
        localMs('2025-11-25T23:59'),
        'NOAA GFS',
        now,
      ),
    ).toBe('Archive data to Nov 19 2025, NOAA GFS from Nov 20 2025.')
  })
})
