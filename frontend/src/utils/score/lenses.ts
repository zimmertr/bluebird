/**
 * The five lenses a reader ranks by: the same hour factors weighted for a
 * different day out. The weights are the approved formula's (record 0307); a
 * lens with a weight of 0 on a factor never reads it.
 */

export const LENSES = ['bluebird', 'calm', 'clean', 'fresh', 'warm'] as const
export type Lens = (typeof LENSES)[number]

export const DEFAULT_LENS: Lens = 'bluebird'

export type Factor = 'sky' | 'wind' | 'comfort' | 'warmth' | 'dry' | 'air' | 'fresh'

export type Weights = Readonly<Partial<Record<Factor, number>>>

export const LENS_WEIGHTS: Readonly<Record<Lens, Weights>> = {
  bluebird: { sky: 0.4, wind: 0.2, comfort: 0.1, dry: 0.2, air: 0.1 },
  calm: { sky: 0.15, wind: 0.5, comfort: 0.15, dry: 0.15, air: 0.05 },
  clean: { sky: 0.2, wind: 0.1, comfort: 0.1, dry: 0.1, air: 0.5 },
  fresh: { sky: 0.3, wind: 0.15, comfort: 0.1, dry: 0.05, fresh: 0.4 },
  // Warmth stands in for comfort: on this lens hotter is better up to 60 °F.
  warm: { sky: 0.15, wind: 0.15, warmth: 0.5, dry: 0.15, air: 0.05 },
}

export function isLens(value: unknown): value is Lens {
  return typeof value === 'string' && (LENSES as readonly string[]).includes(value)
}
