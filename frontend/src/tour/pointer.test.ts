import { describe, expect, it } from 'vitest'
import { PACE } from './act'
import { glideAt, glideMs } from './pointer'

// A reader follows the pointer only as fast as the eye can track it (#536):
// its speed at the curve's steepest, not its average, is what is capped.
describe('glideMs', () => {
  it.each([100, 400, 800, 1600])('keeps a glide of %i px under the top speed, sampled every 16 ms', (px) => {
    const ms = glideMs(px)
    let fastest = 0
    for (let t = 0; t + 16 <= ms; t += 16) {
      const step = (glideAt((t + 16) / ms) - glideAt(t / ms)) * px
      fastest = Math.max(fastest, (step * 1000) / 16)
    }
    expect(fastest).toBeLessThanOrEqual(PACE.glidePeakPxPerS)
  })

  it('takes about a second and a half over 800 px, and longer for further, with no ceiling', () => {
    expect(glideMs(800)).toBeGreaterThan(1400)
    expect(glideMs(800)).toBeLessThan(1700)
    expect(glideMs(1600)).toBeGreaterThan(glideMs(800) * 1.9)
  })

  it('eases in and out, from the start to the end', () => {
    expect(glideAt(0)).toBeCloseTo(0)
    expect(glideAt(1)).toBeCloseTo(1)
    expect(glideAt(0.5)).toBeCloseTo(0.5, 2)
  })
})
