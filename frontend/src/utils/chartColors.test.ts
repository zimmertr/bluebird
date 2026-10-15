import { describe, it, expect } from 'vitest'
import {
  allocateColors,
  colorForIndex,
  paletteColors,
  BASE_PALETTE_SIZE,
  CHART_CHROME,
} from './chartColors'

const THEMES = ['dark', 'light'] as const

describe('colorForIndex', () => {
  it('uses the curated palette for the first indices', () => {
    expect(colorForIndex(0, 'dark')).toBe('#38bdf8')
    expect(colorForIndex(0, 'light')).toBe('#0084d1')
    expect(colorForIndex(1, 'dark')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('generates distinct hex hues past the curated palette', () => {
    for (const theme of THEMES) {
      const a = colorForIndex(BASE_PALETTE_SIZE, theme)
      const b = colorForIndex(BASE_PALETTE_SIZE + 1, theme)
      expect(a).toMatch(/^#[0-9a-f]{6}$/)
      expect(b).toMatch(/^#[0-9a-f]{6}$/)
      expect(a).not.toBe(b)
    }
  })

  it('is deterministic for a given index', () => {
    expect(colorForIndex(20, 'dark')).toBe(colorForIndex(20, 'dark'))
  })

  // The light walk is the dark one's hue at lightness 40 rather than 60
  // (#706): a generated line keeps its hue across a switch and takes the
  // ground's side of middle grey.
  it('walks the same hues past the palette in both themes, darker in light', () => {
    for (const index of [BASE_PALETTE_SIZE, 17, 42]) {
      const dark = colorForIndex(index, 'dark')
      const light = colorForIndex(index, 'light')
      expect(hue(light)).toBeCloseTo(hue(dark), -1)
      expect(luminance(light)).toBeLessThan(luminance(dark))
    }
  })
})

describe('the palette in each theme (#706)', () => {
  // Ten hues a theme, at the same index in each, so a switch recolours a line
  // without moving it along the palette.
  it('keeps ten curated hues a theme, one for one', () => {
    for (let i = 0; i < BASE_PALETTE_SIZE; i++) {
      for (const theme of THEMES) expect(colorForIndex(i, theme)).toMatch(/^#[0-9a-f]{6}$/)
    }
    const light = Array.from({ length: BASE_PALETTE_SIZE }, (_, i) => colorForIndex(i, 'light'))
    expect(new Set(light).size).toBe(BASE_PALETTE_SIZE)
  })

  // A series line is a graphic the reader tells apart from its ground, so
  // 3:1 (WCAG 1.4.11) on the panel it is drawn on. Measured 2026-10-15: dark
  // 5.52 (pink) to 9.69 (lime) on slate-800, light 3.21 (orange-600) to 4.94
  // (purple-600) on the light panel.
  it('stands every curated line at 3:1 or better on its own panel', () => {
    for (const theme of THEMES) {
      const ratios = Array.from({ length: BASE_PALETTE_SIZE }, (_, i) =>
        contrast(colorForIndex(i, theme), CHART_CHROME[theme].surface),
      )
      for (const ratio of ratios) expect(ratio, theme).toBeGreaterThanOrEqual(3)
      expect(Math.round(Math.min(...ratios) * 100) / 100).toBe(theme === 'dark' ? 5.52 : 3.21)
    }
  })

  it('resolves a whole allocation for one theme', () => {
    const held = allocateColors({}, ['a', 'b'])
    expect(paletteColors(held, 'dark')).toEqual({ a: '#38bdf8', b: '#f472b6' })
    expect(paletteColors(held, 'light')).toEqual({ a: '#0084d1', b: '#e60076' })
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

  // An index rather than a hex (#706), so a theme switch repaints it.
  it('starts at the front of the curated palette', () => {
    expect(allocateColors({}, ['a|46,-121'])['a|46,-121']).toBe(0)
  })
})

describe('chart chrome contrast', () => {
  // The chrome labels (Now, a model's end, the extreme value) are text in the
  // axis colour haloed in the panel's, so where a series line crosses one the
  // letters stand on the surface colour: text, so 4.5:1 (WCAG 1.4.3).
  // Measured 2026-10-13 on Tailwind v4's oklch steps: slate-400 on slate-800
  // is 5.56:1 (5.71 on the v3 hexes these were before #687).
  // The light theme's axis is its secondary ink on its panel: 8.34:1
  // (2026-10-15, #706).
  it('sets the chrome labels at 4.5:1 or better on their halo', () => {
    const ratio = contrast(CHART_CHROME.dark.axis, CHART_CHROME.dark.surface)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(Math.round(ratio * 100) / 100).toBe(5.56)
    const light = contrast(CHART_CHROME.light.axis, CHART_CHROME.light.surface)
    expect(Math.round(light * 100) / 100).toBe(8.34)
  })

  // Each theme's chrome is that theme's tokens: an unassigned line reads as
  // the axis, and the playhead is the accent's text colour.
  it('draws an unassigned line as chrome and the playhead in the accent ink', () => {
    for (const theme of THEMES) expect(CHART_CHROME[theme].unassigned).toBe(CHART_CHROME[theme].axis)
    expect(CHART_CHROME.light.playhead).toBe('#00639b')
    expect(CHART_CHROME.light.surface).toBe('#eef2f9')
  })
})

function rgbOf(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}

function hue(hex: string): number {
  const [r, g, b] = rgbOf(hex)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

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
