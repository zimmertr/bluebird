/**
 * The hour factors the score multiplies: each reads one hour of one row and
 * answers between 0 (the hour is ruined by it) and 1 (it costs the hour
 * nothing), or null where the forecast has nothing to say, which leaves the
 * factor out of that hour rather than guessing.
 *
 * Every curve is piecewise linear through the points written beside it, and
 * those points are the formula the maintainer approves in the PR that
 * introduced the score (record 0307), so a change here is a change to that
 * table.
 */
import { CLOUD_DECK_CEILING_FT } from '../openMeteoAggregate'

export type Curve = readonly (readonly [number, number])[]

/** A piecewise-linear curve through ascending points, clamped at both ends. */
export function ramp(points: Curve, x: number): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return 0
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let k = 1; k < points.length; k++) {
    const [x1, y1] = points[k]
    const [x0, y0] = points[k - 1]
    // A point is its own value exactly, never a sum that rounds beside it.
    if (x === x1) return y1
    if (x < x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return last[1]
}

export const WIND_CURVE: Curve = [
  [10, 1],
  [20, 0.7],
  [30, 0.3],
  [40, 0],
]

// Flat from 40 °F to 70 °F, the range a day out feels neither cold nor hot.
export const COMFORT_CURVE: Curve = [
  [-10, 0],
  [10, 0.4],
  [25, 0.75],
  [40, 1],
  [70, 1],
  [85, 0.6],
]

// The Warmest lens's own curve: warmer is better all the way to 60 °F.
export const WARMTH_CURVE: Curve = [
  [0, 0],
  [60, 1],
]

// Inches in the hour.
export const DRY_CURVE: Curve = [
  [0, 1],
  [0.01, 0.7],
  [0.05, 0.3],
  [0.1, 0],
]

// US AQI: the EPA's Good ends at 50 and Unhealthy starts at 151.
export const AIR_CURVE: Curve = [
  [50, 1],
  [100, 0.6],
  [150, 0.2],
  [200, 0],
]

/** How far above a summit a deck's base must stand before it costs nothing more. */
const SKY_CLEARANCE_FT = 5000

/**
 * Whether the summit is in the cloud, above it, or under a deck above it.
 *
 * A dry column, or a summit above the layer's top, is a clear sky from the
 * summit: 1. A deck above the summit is a grey sky that gets brighter the
 * higher it stands, from 0.5 at the summit to 1 at `SKY_CLEARANCE_FT` over it.
 * A summit between the base and the top is in the cloud: 0. With no elevation
 * known there is no telling which, so a deck anywhere reads 0.5.
 */
export function skyFactor(
  elevationFt: number | null,
  deckFt: number | null | undefined,
  topFt: number | null | undefined,
): number | null {
  if (deckFt == null) return null
  if (deckFt >= CLOUD_DECK_CEILING_FT) return 1
  if (elevationFt == null) return 0.5
  if (topFt != null && elevationFt > topFt) return 1
  if (deckFt > elevationFt) return 0.5 + 0.5 * Math.min(1, (deckFt - elevationFt) / SKY_CLEARANCE_FT)
  return 0
}

/** How much the new snow is worth on the Fresh snow lens. */
const FRESH_SNOW_FULL_IN = 6
const STILL_SNOWING = 0.3

/**
 * Snow in the 24 hours before this one, against `FRESH_SNOW_FULL_IN`, and
 * worth less than a third while it is still falling, since fresh snow is for
 * the morning after. The series starts at the window, so the first day's hours
 * see only the snow the window holds before them.
 */
export function freshFactor(snowfall: readonly (number | null)[], i: number): number | null {
  const now = snowfall[i]
  if (now === undefined) return null
  let prior = 0
  for (let k = Math.max(0, i - 24); k < i; k++) prior += snowfall[k] ?? 0
  const base = Math.min(1, prior / FRESH_SNOW_FULL_IN)
  return (now ?? 0) > 0 ? base * STILL_SNOWING : base
}
