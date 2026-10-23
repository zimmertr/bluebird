import { describe, it, expect } from 'vitest'
import {
  allocateColors,
  colorForIndex,
  lineColor,
  paletteColors,
  BASE_PALETTE_SIZE,
  CHART_CHROME,
  CHROME,
} from './chartColors'
import { contrast, relativeLuminance, round2 } from '../testSupport/contrast'

const THEMES = ['dark', 'light'] as const

describe('colorForIndex', () => {
  // The curated ten, spelled as the hexes their hues paint at each theme's
  // lightness (#801), in allocation order: blue, red, green, purple, orange,
  // teal, pink, gold, indigo, olive.
  it('paints the curated ten', () => {
    const ten = (theme: (typeof THEMES)[number]) => Array.from({ length: BASE_PALETTE_SIZE }, (_, i) => colorForIndex(i, theme))
    expect(ten('light')).toEqual([
      '#0089d8', '#d25645', '#1a9d4b', '#a063ca', '#ba6f00', '#009696', '#c65491', '#a57c00', '#6977e1', '#6e9200',
    ])
    expect(ten('dark')).toEqual([
      '#59b6ff', '#fe8674', '#5dc879', '#cb91f4', '#ee9733', '#00c7c7', '#f383bb', '#ccac16', '#96a7ff', '#98be49',
    ])
  })

  // Past the ten the walk carries on round the wheel at the same lightness,
  // darker in light than in dark, as the curated ten are.
  it('generates distinct hex colours past the curated palette, darker in light', () => {
    expect([colorForIndex(BASE_PALETTE_SIZE, 'light'), colorForIndex(BASE_PALETTE_SIZE, 'dark')]).toEqual(['#009886', '#00c9b1'])
    for (const theme of THEMES) {
      const a = colorForIndex(BASE_PALETTE_SIZE, theme)
      const b = colorForIndex(BASE_PALETTE_SIZE + 1, theme)
      expect(a).toMatch(/^#[0-9a-f]{6}$/)
      expect(a).not.toBe(b)
    }
    for (const index of [BASE_PALETTE_SIZE, 17, 42]) {
      expect(relativeLuminance(colorForIndex(index, 'light'))).toBeLessThan(relativeLuminance(colorForIndex(index, 'dark')))
    }
  })

  // Worked out once and kept, so a long chart's renders read the same string.
  it('answers the same colour for an index every time', () => {
    for (const theme of THEMES) expect(colorForIndex(123, theme)).toBe(colorForIndex(123, theme))
  })
})

describe('the palette in each theme (#706)', () => {
  // Ten colours a theme, at the same index in each, so a switch recolours a
  // line without moving it along the palette.
  it('keeps ten curated colours a theme, all different', () => {
    for (const theme of THEMES) {
      const ten = Array.from({ length: BASE_PALETTE_SIZE }, (_, i) => colorForIndex(i, theme))
      expect(new Set(ten).size).toBe(BASE_PALETTE_SIZE)
    }
  })

  // A series line is a graphic the reader tells apart from its ground, so it
  // owes the panel 3:1 (WCAG 1.4.11), by itself, in both themes (#801). One
  // lightness a theme keeps the ten close together: measured 2026-10-22,
  // light 3.13 to 3.68 on the light panel and dark 6.11 to 6.96 on slate-800.
  it('stands every curated line at 3:1 or better on the panel', () => {
    const ratios = (theme: (typeof THEMES)[number]) =>
      Array.from({ length: BASE_PALETTE_SIZE }, (_, i) => contrast(colorForIndex(i, theme), CHART_CHROME[theme].surface))
    for (const theme of THEMES) for (const ratio of ratios(theme)) expect(ratio, theme).toBeGreaterThanOrEqual(3)
    const span = (xs: number[]) => [round2(Math.min(...xs)), round2(Math.max(...xs))]
    expect(span(ratios('light'))).toEqual([3.13, 3.68])
    expect(span(ratios('dark'))).toEqual([6.11, 6.96])
  })

  // The chart draws a line per displayed row, hundreds of them, so the
  // generated colours past the tenth are most of a big chart and owe the
  // same 3:1. The first thousand allocator indices in each theme, measured
  // 2026-10-22: light 3.13 to 3.70 on the light panel, dark 6.10 to 7.05 on
  // slate-800.
  it('stands every generated line at 3:1 or better for the first thousand indices', () => {
    const indices = Array.from({ length: 1000 }, (_, i) => i).slice(BASE_PALETTE_SIZE)
    const ratios = (theme: (typeof THEMES)[number]) => indices.map((i) => contrast(colorForIndex(i, theme), CHART_CHROME[theme].surface))
    for (const theme of THEMES) for (const ratio of ratios(theme)) expect(ratio, theme).toBeGreaterThanOrEqual(3)
    const span = (xs: number[]) => [round2(Math.min(...xs)), round2(Math.max(...xs))]
    expect(span(ratios('light'))).toEqual([3.13, 3.7])
    expect(span(ratios('dark'))).toEqual([6.1, 7.05])
  })

  // A line's colour is both themes' shades of its index at once, light
  // first, which the root's colour scheme picks between (#786).
  it('resolves a whole allocation to both themes\' shades at once', () => {
    const held = allocateColors({}, ['a', 'b'])
    expect(paletteColors(held)).toEqual({
      a: 'light-dark(#0089d8, #59b6ff)',
      b: 'light-dark(#d25645, #fe8674)',
    })
  })

  // The allocator knows nothing of the theme: a key keeps its index, past the
  // curated ten as well, and its colour carries that index's shade in each.
  it('keeps a key on the same index, its colour carrying both shades', () => {
    const keys = Array.from({ length: 25 }, (_, i) => `k${i}`)
    const held = allocateColors({}, keys)
    expect(allocateColors(held, keys)).toBe(held)
    const colors = paletteColors(held)
    for (const key of keys) {
      expect(colors[key]).toBe(lineColor(held[key]))
      expect(colors[key]).toBe(`light-dark(${colorForIndex(held[key], 'light')}, ${colorForIndex(held[key], 'dark')})`)
    }
    expect(held.k24).toBe(24)
  })

  // The chrome the chart draws is the measured pair above, both at once.
  it('draws the chrome as the measured pairs, light first', () => {
    expect(CHROME.axis).toBe(`light-dark(${CHART_CHROME.light.axis}, ${CHART_CHROME.dark.axis})`)
    expect(CHROME.grid).toBe(`light-dark(${CHART_CHROME.light.grid}, ${CHART_CHROME.dark.grid})`)
    expect(CHROME.surface).toBe(`light-dark(${CHART_CHROME.light.surface}, ${CHART_CHROME.dark.surface})`)
    expect(CHROME.playhead).toBe(`light-dark(${CHART_CHROME.light.playhead}, ${CHART_CHROME.dark.playhead})`)
    expect(CHROME.unassigned).toBe(`light-dark(${CHART_CHROME.light.unassigned}, ${CHART_CHROME.dark.unassigned})`)
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
    expect(round2(ratio)).toBe(5.56)
    const light = contrast(CHART_CHROME.light.axis, CHART_CHROME.light.surface)
    expect(round2(light)).toBe(8.34)
  })

  // Each theme's chrome is that theme's tokens: an unassigned line reads as
  // the axis, and the playhead is the accent's text colour.
  it('draws an unassigned line as chrome and the playhead in the accent ink', () => {
    for (const theme of THEMES) expect(CHART_CHROME[theme].unassigned).toBe(CHART_CHROME[theme].axis)
    expect(CHART_CHROME.light.playhead).toBe('#00639b')
    expect(CHART_CHROME.light.surface).toBe('#eef2f9')
  })
})
