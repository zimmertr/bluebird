import { describe, expect, it } from 'vitest'
import { resultRow, series } from '../../testSupport/fixtures'
import { CLOUD_DECK_CEILING_FT } from '../openMeteoAggregate'
import { hoursInCloud, profileFacts, summitProfile } from './summitProfile'

// Four hours across a local midnight, the summit at 6,000 ft: a dry hour, an
// hour with the summit inside the deck, one with the deck below it and a
// night hour.
const H = 3_600_000
const t0 = new Date(2026, 10, 21, 22).getTime()
const GRID = [t0, t0 + H, t0 + 2 * H, t0 + 3 * H]

function row() {
  return resultRow({
    elevation_ft: 6000,
    score_lit: [true, true, true, false],
    score_best: [1, 3],
    best_start_ms: t0 + H,
    best_end_ms: t0 + 3 * H,
    temp_min_f: 17.4,
    wind_max_mph: 18.2,
    freeze_min_ft: 1800,
    precip_total_in: 0,
    snowfall_total_in: 0,
    aqi_max: 48,
    series: series({
      cloud_deck_ft: [CLOUD_DECK_CEILING_FT, 5000, 3000, null],
      cloud_top_ft: [CLOUD_DECK_CEILING_FT, 7000, 4500, null],
      freeze_ft: [8000, null, 7000, 7500],
    }),
  })
}

describe('summitProfile', () => {
  it('draws a band for each hour with a deck, none for a dry or unanswered one, and shades the nights', () => {
    const p = summitProfile(row(), GRID)!
    expect(p.hours.map((h) => h.cloud === null)).toEqual([true, false, false, true])
    expect(p.hours.map((h) => h.lit)).toEqual([true, true, true, false])
    // The band runs from its top down to its base, and the summit stands inside the second.
    const band = p.hours[1].cloud!
    expect(band.top).toBeLessThan(p.summit)
    expect(band.base).toBeGreaterThan(p.summit)
    expect(p.hours[2].cloud!.top).toBeGreaterThan(p.summit)
  })

  it('stands the summit two thirds up a box of half again its height, and boxes the best hours', () => {
    const p = summitProfile(row(), GRID)!
    // 6,000 ft against a box of 8,000 ft x 1.05 (the freezing level is the highest mark).
    expect(p.summit).toBeCloseTo(1 - 6000 / 8400, 6)
    expect(p.best).toEqual({ x0: 0.25, x1: 0.75 })
    expect(p.freeze).toEqual([
      { x: 0, w: 0.25, y: 1 - 8000 / 8400 },
      { x: 0.5, w: 0.25, y: 1 - 7000 / 8400 },
      { x: 0.75, w: 0.25, y: 1 - 7500 / 8400 },
    ])
  })

  it('names each local day after the first where it begins', () => {
    expect(summitProfile(row(), GRID)!.days.map((d) => d.x)).toEqual([0.5])
  })

  it('draws nothing for a row with no height or no series', () => {
    expect(summitProfile(resultRow({ elevation_ft: null, series: series() }), GRID)).toBeNull()
    expect(summitProfile(resultRow({ elevation_ft: 6000, series: undefined }), GRID)).toBeNull()
  })
})

describe('hoursInCloud', () => {
  it('counts the daylight hours the summit stands between a deck\'s base and top', () => {
    expect(hoursInCloud(row())).toBe(1)
  })
})

describe('profileFacts', () => {
  it('reads the eight facts in the prototype\'s order, each as its column prints it', () => {
    const facts = profileFacts(row())
    expect(facts.map((f) => f.label)).toEqual(['Best hours', 'Low', 'Wind', 'In cloud', 'Freezing', 'Precip', 'New snow', 'AQI'])
    const value = Object.fromEntries(facts.map((f) => [f.label, f.value]))
    expect(value.Low).toBe('17.4°F')
    expect(value.Wind).toBe('18.2 mph')
    expect(value.Freezing).toBe('1,800 ft')
    expect(value['In cloud']).toBe('1 h of daylight')
    expect(value.AQI).toBe('48')
  })
})
