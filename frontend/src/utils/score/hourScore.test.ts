import { describe, expect, it } from 'vitest'
import { FACTOR_FLOOR, hourScore } from './hourScore'
import { LENS_WEIGHTS, LENSES, isLens } from './lenses'

describe('hourScore', () => {
  it('scores a perfect hour 100', () => {
    expect(hourScore({ sky: 1, wind: 1, comfort: 1, dry: 1, air: 1 }, LENS_WEIGHTS.bluebird)).toBeCloseTo(100)
  })

  it('lets one ruined factor sink the hour', () => {
    const inCloud = hourScore({ sky: 0, wind: 1, comfort: 1, dry: 1, air: 1 }, LENS_WEIGHTS.bluebird)
    // 0.05 ^ 0.4 is about 0.30.
    expect(inCloud).toBeCloseTo(100 * FACTOR_FLOOR ** 0.4, 5)
    expect(inCloud).toBeLessThan(31)
  })

  it('leaves out a factor with no answer and weighs the rest', () => {
    const noAir = hourScore({ sky: 1, wind: 0.5, comfort: 1, dry: 1, air: null }, LENS_WEIGHTS.bluebird)
    expect(noAir).toBeCloseTo(100 * 0.5 ** (0.2 / 0.9), 5)
  })

  it('reads only the factors its lens weighs', () => {
    // Bluebird gives fresh snow no weight, so a missing fresh factor changes nothing.
    const a = hourScore({ sky: 1, wind: 1, comfort: 1, dry: 1, air: 1, fresh: 0 }, LENS_WEIGHTS.bluebird)
    expect(a).toBeCloseTo(100)
    expect(hourScore({}, LENS_WEIGHTS.bluebird)).toBeNull()
  })
})

describe('the lenses', () => {
  it('each weigh to one', () => {
    for (const lens of LENSES) {
      const sum = Object.values(LENS_WEIGHTS[lens]).reduce((a, b) => a + (b ?? 0), 0)
      expect(sum).toBeCloseTo(1)
    }
  })

  it('recognise their own names and nothing else', () => {
    expect(isLens('calm')).toBe(true)
    expect(isLens('sunny')).toBe(false)
    expect(isLens(null)).toBe(false)
  })
})
