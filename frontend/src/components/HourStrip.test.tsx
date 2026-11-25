import { describe, expect, it } from 'vitest'
import HourStrip from './HourStrip'
import { HOUR_STRIP } from '../styles'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'

// The Score cell's hour strip (record 0307): a bar per lit hour, the best
// stretch taller, hidden from a screen reader beside the number it explains.
describe('HourStrip', () => {
  it('draws a bar per lit hour, the best ones taller', () => {
    const row = { ...resultRow(), score_hours: [10, 80, 90, 40], score_lit: [false, true, true, true], score_best: [1, 3] as [number, number] }
    const { container } = render(<HourStrip row={row} />)
    const strip = container.firstElementChild as HTMLElement
    expect(strip.getAttribute('aria-hidden')).toBe('true')
    const bars = [...strip.children] as HTMLElement[]
    expect(bars).toHaveLength(3)
    expect(bars.map((b) => b.className.includes(HOUR_STRIP.best))).toEqual([true, true, false])
  })

  it('draws nothing for a row with no score', () => {
    const { container } = render(<HourStrip row={resultRow()} />)
    expect(container.firstElementChild).toBeNull()
  })

  // The compact table's strip (record 0320): one block per day, every hour
  // one height, the best stretch bracketed.
  it('draws a block per day with the field\'s grid, and brackets the best stretch', () => {
    const sat8 = Date.parse('2026-11-21T08:00:00-08:00')
    const times = [sat8, sat8 + 3_600_000, sat8 + 86_400_000]
    const row = { ...resultRow(), score_hours: [40, 80, 90], score_lit: [true, true, true], score_best: [1, 2] as [number, number] }
    const { container } = render(<HourStrip row={row} times={times} />)
    const strip = container.firstElementChild as HTMLElement
    expect(strip.className).toBe(HOUR_STRIP.days)
    expect(strip.children).toHaveLength(2)
    expect([...strip.querySelectorAll('span')].filter((s) => s.className === HOUR_STRIP.bracket)).toHaveLength(1)
  })
})

