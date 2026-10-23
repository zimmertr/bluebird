import { describe, it, expect } from 'vitest'
import {
  allocateColors,
  colorForIndex,
  lineColor,
  paletteColors,
  BASE_PALETTE_SIZE,
  CHART_CHROME,
  CHROME,
  LINE_DRAW,
} from './chartColors'
import { contrast, mixOver, round2 } from '../testSupport/contrast'
import { themed } from './themeColor'

const THEMES = ['dark', 'light'] as const

// Tableau 10 (#801), in its own order: blue, orange, red, teal, green,
// yellow, purple, pink, brown, grey. Dark as published; light with the six
// that fall under 3:1 on the light panel darkened, hue kept, until they clear.
const TABLEAU_10 = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac']
const ten = (theme: (typeof THEMES)[number]) => Array.from({ length: BASE_PALETTE_SIZE }, (_, i) => colorForIndex(i, theme))

describe('colorForIndex', () => {
  it('paints Tableau 10, fitted to 3:1 in light', () => {
    expect(ten('dark')).toEqual(TABLEAU_10)
    expect(ten('light')).toEqual([
      '#4e79a7', '#cf7200', '#e15759', '#559591', '#529a48', '#a68700', '#b07aa1', '#cc6f7a', '#9c755f', '#928884',
    ])
  })

  // Past ten the palette comes round again, as Tableau's does.
  it('repeats the ten past the tenth line', () => {
    for (const theme of THEMES) {
      for (const index of [BASE_PALETTE_SIZE, 17, 42, 999]) {
        expect(colorForIndex(index, theme)).toBe(colorForIndex(index % BASE_PALETTE_SIZE, theme))
      }
    }
  })
})

describe('the palette in each theme (#706)', () => {
  // Ten colours a theme, at the same index in each, so a switch recolours a
  // line without moving it along the palette.
  it('keeps ten colours a theme, all different', () => {
    for (const theme of THEMES) expect(new Set(ten(theme)).size).toBe(BASE_PALETTE_SIZE)
  })

  // A series line is a graphic the reader tells apart from its ground, so at
  // full strength it owes the panel 3:1 (WCAG 1.4.11) by itself, in both
  // themes (#801). Measured 2026-10-22: light 3.04 to 4.05 on the light panel,
  // dark 3.21 to 9.08 on slate-800.
  it('stands every colour at 3:1 or better on the panel', () => {
    const ratios = (theme: (typeof THEMES)[number]) => ten(theme).map((c) => contrast(c, CHART_CHROME[theme].surface))
    for (const theme of THEMES) for (const ratio of ratios(theme)) expect(ratio, theme).toBeGreaterThanOrEqual(3)
    const span = (xs: number[]) => [round2(Math.min(...xs)), round2(Math.max(...xs))]
    expect(span(ratios('light'))).toEqual([3.04, 4.05])
    expect(span(ratios('dark'))).toEqual([3.21, 9.08])
  })

  // Past ten lines each is drawn at 55%, which the maintainer accepted under
  // 3:1 with Tableau's lead (#801). Pinned so a change to the palette or the
  // fade re-measures the claim in `LINE_DRAW`'s comment.
  it('measures a crowded line at its fade', () => {
    const faded = (theme: (typeof THEMES)[number]) =>
      ten(theme).map((c) => contrast(mixOver(c, CHART_CHROME[theme].surface, LINE_DRAW.crowdedOpacity), CHART_CHROME[theme].surface))
    const span = (xs: number[]) => [round2(Math.min(...xs)), round2(Math.max(...xs))]
    expect(span(faded('light'))).toEqual([1.75, 2.01])
    expect(span(faded('dark'))).toEqual([1.9, 3.75])
  })

  // A line's colour is both themes' shades of its index at once, light
  // first, which the root's colour scheme picks between (#786). Tableau's
  // blue is the same in both, so it is written once.
  it('resolves a whole allocation to both themes\' shades at once', () => {
    const held = allocateColors({}, ['a', 'b'])
    expect(paletteColors(held)).toEqual({
      a: '#4e79a7',
      b: 'light-dark(#cf7200, #f28e2b)',
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
      expect(colors[key]).toBe(themed(colorForIndex(held[key], 'light'), colorForIndex(held[key], 'dark')))
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
