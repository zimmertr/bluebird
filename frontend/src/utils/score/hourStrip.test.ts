import { describe, expect, it } from 'vitest'
import { stripHours } from './hourStrip'

// The Score cell's strip (record 0306): the lit hours, a gap after a night,
// and the best stretch marked.
describe('stripHours', () => {
  it('keeps the lit hours, marks the gap a night leaves, and the best stretch', () => {
    const hours = [10, 20, 30, null, 50, 60, 70]
    const lit = [false, true, true, false, false, true, true]
    expect(stripHours(hours, lit, [5, 7])).toEqual([
      { score: 20, gap: false, best: false },
      { score: 30, gap: false, best: false },
      { score: 60, gap: true, best: true },
      { score: 70, gap: false, best: true },
    ])
  })

  it('draws nothing for a row the lens never scored', () => {
    expect(stripHours(null, null, null)).toEqual([])
    expect(stripHours([1, 2], undefined, null)).toEqual([])
  })
})
