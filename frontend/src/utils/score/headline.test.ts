import { describe, expect, it } from 'vitest'
import { bestHoursText, headline, headlineText, hourShort, scoreRange } from './headline'

describe('headline', () => {
  it('counts the places at 80 or better', () => {
    expect(headline([92, 85, 80, 79, null])).toEqual({ bar: 80, count: 3, total: 4 })
  })

  it('drops the bar to the best ten anything reached on a bad day', () => {
    expect(headline([67, 61, 58, 40])).toEqual({ bar: 60, count: 2, total: 4 })
  })

  it('has nothing to say with no score', () => {
    expect(headline([null, null])).toBeNull()
  })
})

describe('scoreRange', () => {
  it('stretches from the fifth percentile to the best', () => {
    const scores = Array.from({ length: 40 }, (_, i) => 40 + i)
    expect(scoreRange(scores)).toEqual({ lo: 42, hi: 79 })
  })

  it('is null for a field with no spread', () => {
    expect(scoreRange([70])).toBeNull()
    expect(scoreRange([70, 70, 70])).toBeNull()
  })
})

describe('headlineText', () => {
  it('counts places, one in the singular', () => {
    expect(headlineText({ bar: 80, count: 12, total: 230 })).toBe('12 of 230 score 80 or more')
    expect(headlineText({ bar: 60, count: 1, total: 9 })).toBe('1 of 9 scores 60 or more')
    expect(headlineText({ bar: 80, count: 1500, total: 1500 })).toBe('1,500 of 1,500 score 80 or more')
  })
})

// Vitest runs in America/Los_Angeles, so these are Pacific hours.
describe('bestHoursText', () => {
  const at = (iso: string) => Date.parse(iso)
  it('names the day most best stretches fall on, and that day\'s middle start', () => {
    const starts = [at('2026-11-21T13:00:00-08:00'), at('2026-11-21T11:00:00-08:00'), at('2026-11-21T14:00:00-08:00'), at('2026-11-22T09:00:00-08:00')]
    expect(bestHoursText(starts, 4)).toBe('Best hours mostly Sat, 1p–5p')
  })

  it('says nothing with no stretch to read', () => {
    expect(bestHoursText([], 4)).toBeNull()
  })

  it('writes an hour the prototype\'s way', () => {
    expect([0, 11, 12, 13, 23].map((h) => hourShort(at(`2026-11-21T${String(h).padStart(2, '0')}:00:00-08:00`)))).toEqual(['12a', '11a', '12p', '1p', '11p'])
  })
})
