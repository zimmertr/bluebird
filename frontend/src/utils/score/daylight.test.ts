import { describe, expect, it } from 'vitest'
import { daylightMinutes, isDaylightHour, solarDay, sunTimes } from './daylight'

// Seattle, whose almanac times are easy to check: the US Naval Observatory
// gives 05:11 and 21:11 PDT on the June solstice and 07:55 and 16:20 PST on the
// December one.
const SEA = { lat: 47.6062, lon: -122.3321 }
const MIN = 60_000
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(4 * MIN)
const dayOf = (ms: number) => solarDay(ms, SEA.lon)

describe('sunTimes', () => {
  it('matches the almanac on the June solstice', () => {
    const { riseMs, setMs } = sunTimes(SEA.lat, SEA.lon, dayOf(Date.UTC(2026, 5, 21, 20)))
    near(riseMs, Date.UTC(2026, 5, 21, 12, 11))
    near(setMs, Date.UTC(2026, 5, 22, 4, 11))
  })

  it('matches the almanac on the December solstice', () => {
    const { riseMs, setMs } = sunTimes(SEA.lat, SEA.lon, dayOf(Date.UTC(2026, 11, 21, 20)))
    near(riseMs, Date.UTC(2026, 11, 21, 15, 55))
    near(setMs, Date.UTC(2026, 11, 22, 0, 20))
  })

  it('answers a day the sun never sets and one it never rises', () => {
    const tromso = { lat: 69.65, lon: 18.96 }
    const june = sunTimes(tromso.lat, tromso.lon, solarDay(Date.UTC(2026, 5, 21, 11), tromso.lon))
    expect(june.riseMs).toBe(-Infinity)
    expect(june.setMs).toBe(Infinity)
    const dec = sunTimes(tromso.lat, tromso.lon, solarDay(Date.UTC(2026, 11, 21, 11), tromso.lon))
    expect(dec.riseMs).toBe(dec.setMs)
  })
})

describe('daylightMinutes', () => {
  it('counts a whole hour at noon, none at midnight and part of the sunrise hour', () => {
    expect(daylightMinutes(SEA.lat, SEA.lon, Date.UTC(2026, 5, 21, 20))).toBe(60)
    expect(daylightMinutes(SEA.lat, SEA.lon, Date.UTC(2026, 5, 21, 8))).toBe(0)
    // 12:00 to 13:00 UTC, sunrise at about 12:11.
    const dawn = daylightMinutes(SEA.lat, SEA.lon, Date.UTC(2026, 5, 21, 12))
    expect(dawn).toBeGreaterThan(45)
    expect(dawn).toBeLessThan(53)
  })

  it('reads an hour as daylight when the sun is up for half of it', () => {
    expect(isDaylightHour(SEA.lat, SEA.lon, Date.UTC(2026, 5, 21, 12))).toBe(true)
    // 03:00 to 04:00 UTC ends before the 04:11 sunset.
    expect(isDaylightHour(SEA.lat, SEA.lon, Date.UTC(2026, 5, 22, 3))).toBe(true)
    expect(isDaylightHour(SEA.lat, SEA.lon, Date.UTC(2026, 5, 22, 5))).toBe(false)
  })
})
