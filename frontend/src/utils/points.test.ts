import { describe, expect, it } from 'vitest'
import { geoKey, setKey } from './points'

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
