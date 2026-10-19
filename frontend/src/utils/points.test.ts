import { describe, expect, it } from 'vitest'
import { coordinateLabel, geoKey, onGlobe, setKey } from './points'

// Both of these used to be asserted from whichever module owned the alias, so
// the same function was described twice under two names (#388). They belong to
// points.ts now, and so do their tests.

describe('geoKey', () => {
  it('rounds to 5 decimals (~1 m) so near-identical coords collide', () => {
    expect(geoKey(46.852891, -121.760408)).toBe(geoKey(46.85289, -121.76041))
  })

  it('is a stable 5-decimal coordinate key', () => {
    expect(geoKey(46.85289, -121.76042)).toBe('46.85289,-121.76042')
  })
})

// Asserted on the generic rather than through `pointsKey` or `candidateSetKey`,
// which each pin their own projection as well as this rule. Every caller is an
// effect dependency, so what matters is that a re-rank of the same items, or a
// fresh array holding them, is not a new question.
describe('setKey', () => {
  it('reads the projection, not the order or the objects carrying it', () => {
    const idOf = (item: { id: string }) => item.id
    expect(setKey([{ id: 'b' }, { id: 'a' }], idOf)).toBe(setKey([{ id: 'a' }, { id: 'b' }], idOf))
  })
})

describe('onGlobe', () => {
  it('takes a finite coordinate inside both bounds, the poles and the antimeridian included', () => {
    expect(onGlobe(46.85, -121.76)).toBe(true)
    expect(onGlobe(90, 180)).toBe(true)
    expect(onGlobe(-90, -180)).toBe(true)
  })

  // Latitude first: a transposed pair that is in range either way round is
  // indistinguishable, and one that is not is caught by the latitude bound.
  it('refuses a latitude past a pole, a longitude past the antimeridian, and a value that is no number', () => {
    expect(onGlobe(-121.76, 46.85)).toBe(false)
    expect(onGlobe(0, 180.5)).toBe(false)
    for (const v of [Number.NaN, Infinity, -Infinity]) {
      expect(onGlobe(v, 0)).toBe(false)
      expect(onGlobe(0, v)).toBe(false)
    }
  })
})

describe('coordinateLabel', () => {
  it('names a coordinate latitude first, at five decimals', () => {
    expect(coordinateLabel(46.852891, -121.760408)).toBe('46.85289, -121.76041')
    expect(coordinateLabel(47, -121.5)).toBe('47.00000, -121.50000')
  })
})
