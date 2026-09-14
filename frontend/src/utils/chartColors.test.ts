import { describe, it, expect } from 'vitest'
import { colorForIndex, modelColor, BASE_PALETTE_SIZE } from './chartColors'

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

describe('modelColor', () => {
  const destinations = (n: number) => Array.from({ length: n }, (_, i) => colorForIndex(i))

  // The rule the whole encoding rests on (#232): under a comparison the
  // ranking model's lines wear their destinations' colours and a compared
  // model's wear its own, so one colour meaning both facts at once would make
  // a line unreadable.
  it('never gives a model a colour a destination on the chart is wearing', () => {
    for (const charted of [0, 1, 2, 3, 5, 10, 12]) {
      const wearing = destinations(charted)
      for (let m = 0; m < 8; m++) {
        expect(wearing, `${charted} destinations, model ${m}`).not.toContain(
          modelColor(wearing, m),
        )
      }
    }
  })

  it('gives each model on one chart a colour of its own', () => {
    const wearing = destinations(3)
    const mine = [0, 1, 2, 3].map((m) => modelColor(wearing, m))
    expect(new Set(mine).size).toBe(mine.length)
  })

  // The gap a count cannot close: chart two destinations and uncheck the
  // first, and the one left is wearing index 1 while the count is 1.
  it('skips a colour still on the chart after an earlier one left', () => {
    const wearing = [colorForIndex(1)]
    expect(modelColor(wearing, 0)).not.toBe(colorForIndex(1))
    expect(modelColor(wearing, 0)).toBe(colorForIndex(0))
  })

  it('is deterministic for the same chart', () => {
    const wearing = destinations(4)
    expect(modelColor(wearing, 1)).toBe(modelColor(wearing, 1))
  })

  // The consequence worth knowing, recorded rather than worked around: a
  // model's colour is not its own property, so charting a destination can move
  // it.
  it('moves a model’s colour when the charted set changes', () => {
    expect(modelColor(destinations(2), 0)).not.toBe(modelColor(destinations(3), 0))
  })
})
