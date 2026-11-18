import { describe, expect, it } from 'vitest'
import HourStrip from './HourStrip'
import { HOUR_STRIP } from '../styles'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'

// The Score cell's hour strip (record 0306): a bar per lit hour, the best
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
})
