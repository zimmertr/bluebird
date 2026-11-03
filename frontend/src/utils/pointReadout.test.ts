import { describe, expect, it } from 'vitest'
import { inBounds } from './pointReadout'

// A section's place on the spot's card is `destinationCard.test.ts`'s (#832).
describe('inBounds', () => {
  it('takes a point on or inside the box', () => {
    expect(inBounds(-121, 47, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(-130, 24, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(10, 46, [-130, 24, -62, 58])).toBe(false)
  })
})
