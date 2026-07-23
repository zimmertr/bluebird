import { describe, it, expect } from 'vitest'
import { colorForIndex, BASE_PALETTE_SIZE } from './chartColors'

describe('colorForIndex', () => {
  it('uses the curated palette for the first indices', () => {
    expect(colorForIndex(0)).toBe('#38bdf8')
    expect(colorForIndex(1)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('generates distinct hex hues past the curated palette', () => {
    const a = colorForIndex(BASE_PALETTE_SIZE)
    const b = colorForIndex(BASE_PALETTE_SIZE + 1)
    expect(a).toMatch(/^#[0-9a-f]{6}$/)
    expect(b).toMatch(/^#[0-9a-f]{6}$/)
    expect(a).not.toBe(b)
  })

  it('is deterministic for a given index', () => {
    expect(colorForIndex(20)).toBe(colorForIndex(20))
  })
})
