import { describe, it, expect } from 'vitest'
import {
  allocateColors,
  colorForIndex,
  BASE_PALETTE_SIZE,
  CHART_AXIS_COLOR,
  CHART_SURFACE_COLOR,
} from './chartColors'

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

describe('allocateColors', () => {
  const pairs = (models: string[], destinations: string[]) =>
    models.flatMap((m) => destinations.map((d) => `${m}|${d}`))

  // The rule the whole encoding rests on (#232): a line is identified by its
  // colour, so every destination-and-model pair on the chart has to have one
  // no other pair is wearing.
  it('gives N destinations times M models N times M distinct colours', () => {
    const keys = pairs(['a', 'b', 'c'], ['46,-121', '48,-121', '46,-122', '47,-120'])
    const colors = allocateColors({}, keys)
    expect(Object.keys(colors)).toHaveLength(12)
    expect(new Set(Object.values(colors)).size).toBe(12)
  })

  // One counter for destinations and pairs alike is the point: allocate a
  // destination first and no pair after it can be handed that colour.
  it('never repeats a colour already handed out in the session', () => {
    const held = allocateColors({}, ['46,-121', '48,-121'])
    const colors = allocateColors(held, pairs(['a', 'b'], ['46,-121', '48,-121']))
    expect(new Set(Object.values(colors)).size).toBe(6)
    expect(colors['46,-121']).toBe(held['46,-121'])
    expect(colors['48,-121']).toBe(held['48,-121'])
  })

  // A colour is the key's for the whole session, so a pair that is hidden and
  // shown again, or that outlives the pairs beside it, draws as it did.
  it('keeps a key’s colour as other keys come and go', () => {
    const first = allocateColors({}, ['a|46,-121', 'b|46,-121'])
    const grown = allocateColors(first, ['a|46,-121', 'b|46,-121', 'c|46,-121'])
    const shrunk = allocateColors(grown, ['a|46,-121', 'c|46,-121'])
    expect(shrunk['a|46,-121']).toBe(first['a|46,-121'])
    expect(shrunk['b|46,-121']).toBe(first['b|46,-121'])
    expect(shrunk['c|46,-121']).toBe(grown['c|46,-121'])
  })

  // Callers set state with what comes back, so a render that allocated
  // nothing has to be able to see that and skip the write.
  it('returns the map it was given when nothing is missing', () => {
    const held = allocateColors({}, ['a|46,-121'])
    expect(allocateColors(held, ['a|46,-121'])).toBe(held)
    expect(allocateColors(held, [])).toBe(held)
  })

  // The same key twice in one batch is one line, not two.
  it('allocates one colour for a key repeated in the batch', () => {
    const colors = allocateColors({}, ['a|46,-121', 'a|46,-121'])
    expect(Object.keys(colors)).toHaveLength(1)
  })

  it('starts at the front of the curated palette', () => {
    expect(allocateColors({}, ['a|46,-121'])['a|46,-121']).toBe(colorForIndex(0))
  })
})

describe('chart chrome contrast', () => {
  // The chrome labels (Now, a model's end, the extreme value) are text in the
  // axis colour haloed in the panel's, so where a series line crosses one the
  // letters stand on the surface colour: text, so 4.5:1 (WCAG 1.4.3).
  // Measured 2026-10-13 on Tailwind v4's oklch steps: slate-400 on slate-800
  // is 5.56:1 (5.71 on the v3 hexes these were before #687).
  it('sets the chrome labels at 4.5:1 or better on their halo', () => {
    const ratio = contrast(CHART_AXIS_COLOR, CHART_SURFACE_COLOR)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(Math.round(ratio * 100) / 100).toBe(5.56)
  })
})

// WCAG relative luminance and contrast. Kept here, as `colors.test.ts` and
// `popupChrome.test.tsx` keep theirs, because no shared helper exists to reuse.
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
