/**
 * One hour's score: 100 times the weighted geometric mean of its factors.
 *
 * Geometric rather than arithmetic so one bad factor sinks the hour: a calm,
 * dry hour with the summit in the cloud is not a good hour two thirds of the
 * way. Each factor is floored at `FACTOR_FLOOR` first, because a zero would
 * make every such hour score exactly 0 and leave nothing to rank among the
 * bad ones. A factor with no answer (null) drops out and the weights of the
 * rest are renormalized, so an hour past the air-quality horizon is scored on
 * what the forecast does say.
 */
import type { Factor, Weights } from './lenses'

export const FACTOR_FLOOR = 0.05

export function hourScore(factors: Readonly<Partial<Record<Factor, number | null>>>, weights: Weights): number | null {
  let logSum = 0
  let weightSum = 0
  for (const [name, weight] of Object.entries(weights) as [Factor, number][]) {
    if (!weight) continue
    const value = factors[name]
    if (value == null) continue
    logSum += weight * Math.log(Math.max(FACTOR_FLOOR, value))
    weightSum += weight
  }
  if (weightSum === 0) return null
  return 100 * Math.exp(logSum / weightSum)
}
