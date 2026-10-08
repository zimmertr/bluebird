import { describe, expect, it } from 'vitest'
import { CLOUD_DECK_CEILING_SHOWN_FT, CLOUD_DECK_FLOOR_FT, cloudDeckMark } from './cloudDeckMark'
import { CLOUD_DECK_CEILING_FT } from './openMeteoAggregate'
import { COLUMNS } from './tableColumns'
import { formatTooltipValue } from './chartData'

// The two edges of the cloud deck's walk print as bounds (TJ, 2026-10-08):
// the ceiling, a column that never saturated, and the floor, a saturated
// bottom level.
describe('cloudDeckMark', () => {
  it('reads its edges off the level table', () => {
    expect(CLOUD_DECK_FLOOR_FT).toBe(364)
    expect(CLOUD_DECK_CEILING_FT).toBe(30066)
    // The shown ceiling is a round number under the real one, never above it.
    expect(CLOUD_DECK_CEILING_SHOWN_FT).toBeLessThanOrEqual(CLOUD_DECK_CEILING_FT)
  })

  it('marks the ceiling and the floor with the approved strings', () => {
    expect(cloudDeckMark(30066)).toBe('≥30,000')
    expect(cloudDeckMark(364)).toBe('≤364')
    // An average of hours that all sat at an edge is that edge.
    expect(cloudDeckMark(30065.7)).toBe('≥30,000')
    expect(cloudDeckMark(364.2)).toBe('≤364')
  })

  it('leaves a deck the walk found alone', () => {
    for (const v of [363, 365, 4210, 11850, 30065]) expect(cloudDeckMark(v)).toBeNull()
    // Below the floor is a low destination's own 2 m point, a real reading.
    expect(cloudDeckMark(164)).toBeNull()
    expect(cloudDeckMark(null)).toBeNull()
    expect(cloudDeckMark(undefined)).toBeNull()
    expect(cloudDeckMark(Number.NaN)).toBeNull()
  })

  it('groups no thousands where its neighbours do not', () => {
    expect(cloudDeckMark(30066, false)).toBe('≥30000')
    expect(cloudDeckMark(364, false)).toBe('≤364')
  })

  // One formatter per surface, so the table, the popup and the file agree.
  it('is what every cloud column prints, on screen and in the file', () => {
    const deck = COLUMNS.filter((c) => (c.key as string).startsWith('cloud_deck_'))
    expect(deck).toHaveLength(3)
    for (const col of deck) {
      expect(col.format!(30066)).toBe('≥30,000')
      expect(col.format!(364)).toBe('≤364')
      expect(col.format!(4210)).toBe('4,210')
      expect(col.format!(null)).toBe('—')
      expect(col.csv!(30066)).toBe('≥30000')
      expect(col.csv!(4210)).toBe('4210')
    }
  })

  it('marks the chart tooltip but not another metric', () => {
    expect(formatTooltipValue(30066, 'cloud_deck')).toBe('≥30000')
    expect(formatTooltipValue(4210, 'cloud_deck')).toBe('4210')
    expect(formatTooltipValue(364, 'freeze')).toBe('364')
  })
})
