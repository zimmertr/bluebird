/**
 * Sunrise and sunset at a destination, computed in the browser from NOAA's
 * solar position equations (the General Solar Position spreadsheet's), so the
 * score can leave the dark hours out without asking any service.
 *
 * A day here is the destination's own solar day: the 24 hours centred on its
 * local mean noon, which is what "one day" means to the best-four-hours run in
 * `windowScore.ts`. It differs from the reader's calendar day only for a
 * destination far from the reader's meridian, and the hours it groups are the
 * ones the sun actually lights there.
 */

import { DAY_MS, HOUR_MS, MINUTE_MS } from '../forecastWindow'

const RAD = Math.PI / 180

/** The sun's declination (radians) and the equation of time (minutes) at an instant. */
function solar(ms: number): { decl: number; eqTimeMin: number } {
  const t = (ms / DAY_MS + 2440587.5 - 2451545) / 36525
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * t
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const eps = (eps0 + 0.00256 * Math.cos(omega * RAD)) * RAD
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda * RAD))
  const y = Math.tan(eps / 2) ** 2
  const l0r = l0 * RAD
  const mr = m * RAD
  const eqTime =
    y * Math.sin(2 * l0r) -
    2 * e * Math.sin(mr) +
    4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
    0.5 * y * y * Math.sin(4 * l0r) -
    1.25 * e * e * Math.sin(2 * mr)
  return { decl, eqTimeMin: (4 * eqTime) / RAD }
}

/** The solar day an instant falls in at a longitude: whole days since the epoch, local mean time. */
export function solarDay(ms: number, lonDeg: number): number {
  return Math.floor((ms + (lonDeg / 15) * HOUR_MS) / DAY_MS)
}

export interface SunTimes {
  // -Infinity and Infinity for a day the sun never sets; equal for one it
  // never rises.
  riseMs: number
  setMs: number
}

/**
 * Sunrise and sunset on one solar day, with the standard 0.833° allowance for
 * refraction and the sun's radius, so "up" means the top of the disc clears a
 * flat horizon. Terrain is not counted: a peak's east face sees the sun before
 * the formula does, and a valley after.
 */
export function sunTimes(latDeg: number, lonDeg: number, day: number): SunTimes {
  // Evaluated at the day's mean noon: the declination moves under half a
  // degree a day, well inside a minute of rise or set.
  const meanNoonMs = day * DAY_MS + DAY_MS / 2 - (lonDeg / 15) * HOUR_MS
  const { decl, eqTimeMin } = solar(meanNoonMs)
  // Solar noon is the mean noon corrected by the equation of time.
  const noonMs = meanNoonMs - eqTimeMin * MINUTE_MS
  const lat = latDeg * RAD
  const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)
  if (cosH <= -1) return { riseMs: -Infinity, setMs: Infinity }
  if (cosH >= 1) return { riseMs: noonMs, setMs: noonMs }
  const halfMs = (Math.acos(cosH) / RAD) * 4 * MINUTE_MS
  return { riseMs: noonMs - halfMs, setMs: noonMs + halfMs }
}

/** Minutes of the hour starting at `hourMs` that the sun is up for. */
export function daylightMinutes(latDeg: number, lonDeg: number, hourMs: number): number {
  const day = solarDay(hourMs + HOUR_MS / 2, lonDeg)
  let lit = 0
  // The neighbouring days too: an hour near local midnight in a long summer
  // day can touch the previous day's sunset.
  for (const d of [day - 1, day, day + 1]) {
    const { riseMs, setMs } = sunTimes(latDeg, lonDeg, d)
    lit += Math.max(0, Math.min(setMs, hourMs + HOUR_MS) - Math.max(riseMs, hourMs))
  }
  return Math.min(60, lit / MINUTE_MS)
}

/** At least half the hour in daylight: the hours the score reads. */
export function isDaylightHour(latDeg: number, lonDeg: number, hourMs: number): boolean {
  return daylightMinutes(latDeg, lonDeg, hourMs) >= 30
}

/**
 * Which hours of a grid are daylight hours at one coordinate: `isDaylightHour`
 * for each, with each solar day's sunrise and sunset worked out once. A
 * sixteen-day window reads about fifty days' worth rather than three per hour,
 * which is what lets a lens change rescore a 1,500-row field in one frame.
 */
export function litHours(latDeg: number, lonDeg: number, times: readonly number[]): boolean[] {
  const days = new Map<number, SunTimes>()
  const sun = (d: number) => {
    let t = days.get(d)
    if (t === undefined) {
      t = sunTimes(latDeg, lonDeg, d)
      days.set(d, t)
    }
    return t
  }
  return times.map((hourMs) => {
    const day = solarDay(hourMs + HOUR_MS / 2, lonDeg)
    let lit = 0
    for (const d of [day - 1, day, day + 1]) {
      const { riseMs, setMs } = sun(d)
      lit += Math.max(0, Math.min(setMs, hourMs + HOUR_MS) - Math.max(riseMs, hourMs))
    }
    return lit >= 30 * MINUTE_MS
  })
}
