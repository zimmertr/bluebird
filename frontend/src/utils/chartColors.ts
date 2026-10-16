// Categorical line colors for the comparison chart. Deliberately separate from
// colors.ts, which encodes metric *intensity* (green→red) on the map and table.
// Here each destination just needs its own distinguishable hue.
//
// The chart's CHROME lives here too (#365): Recharts takes a `stroke` or a
// `fill` as a prop, not a class, so the design system in styles.ts cannot
// reach it, and the axis colour was spelled five times in two files before it
// had a name. Since #706 every value here comes in a pair, one per theme,
// and is resolved by the theme at render time: Recharts writes them as SVG
// presentation attributes, which do not resolve `var()`, so the CSS tokens
// that theme every class cannot reach them. The dark values are the Tailwind
// slate steps the surrounding panel wears, as Tailwind v4 computes them from
// its oklch steps (#687); the light ones are the light theme's tokens in
// `index.css`, spelled as the hexes they are there.
import type { Theme } from './viewPrefs'

/** The chart's chrome in one theme. */
export interface ChartChrome {
  /** Axes, their tick labels, and the dashed seams (Now, a model's end): the secondary ink. */
  axis: string
  /** The grid behind the lines: the quiet rule, a step off the panel and under the axes. */
  grid: string
  /**
   * The ground the chart draws on: the results panel, the one surface under
   * the plot on a desktop and a phone alike. Named so a chrome label can wear
   * it as a halo: a label stroked in the panel's own colour cuts the series
   * lines away under its letters and reads over any of them, where the bare
   * axis-colour text was lost over a line crossing it (#699).
   * `chartColors.test.ts` holds the axis colour to 4.5:1 on it in each theme.
   */
  surface: string
  /**
   * The map's playhead: solid and in the accent text colour where the Now
   * seam is dashed and in the axis colour, because this one is a control's
   * position and that one is a fact about the data.
   */
  playhead: string
  /**
   * A line asked for its colour before the allocator has given it one: a
   * render in the moment between a selection and the effect that persists
   * its colours. The axis colour, so an unassigned line reads as chrome
   * rather than as a destination that happens to be grey.
   */
  unassigned: string
  /**
   * The thin edge every series line and every mark in a line's colour wears
   * (PR #733), or null where the lines need none. The light lines are pastels
   * that read 1.16 to 1.62:1 on the light panel, under the 3:1 a graphic owes
   * its ground (WCAG 1.4.11), so the boundary is carried by this edge, which
   * every pastel reads 3:1 or better against and which reads 8.34:1 on the
   * panel. The dark lines read 3:1 on their panel by themselves.
   */
  lineEdge: string | null
}

// slate-400, slate-700, slate-800 and sky-400.
const DARK_CHROME: ChartChrome = {
  axis: '#90a1b9',
  grid: '#314158',
  surface: '#1d293d',
  playhead: '#00bcff',
  unassigned: '#90a1b9',
  lineEdge: null,
}
// The secondary ink (`ink-soft`), the quiet rule, the panel and the accent ink.
const LIGHT_INK_SOFT = '#42474e'
const LIGHT_CHROME: ChartChrome = {
  axis: LIGHT_INK_SOFT,
  grid: '#c2c8d1',
  surface: '#eef2f9',
  playhead: '#00639b',
  unassigned: LIGHT_INK_SOFT,
  lineEdge: LIGHT_INK_SOFT,
}

export const CHART_CHROME: Record<Theme, ChartChrome> = { dark: DARK_CHROME, light: LIGHT_CHROME }

/**
 * How much wider a line's edge is drawn than the line: a pixel each side, so
 * the edge shows as a 1px rim and the colour inside it keeps the line's width.
 */
export const LINE_EDGE_EXTRA_PX = 2

/**
 * How the chart draws that rim (PR #733): one SVG filter over every series
 * line at once, rather than a second, wider line under each. Measured
 * 2026-10-15 against the built image at 946 charted lines over a three-day
 * window, a theme switch took about 1.1 s with the filter, the same as
 * before the rim, and 2.3 s with a second line each, which doubles what
 * Recharts lays out; a hover's raster work stayed at the no-rim figure with
 * the filter and doubled with the second lines.
 *
 * Recharts 3 draws each z-index into its own SVG group, so the series lines
 * stand one above its line layer (`DefaultZIndexes.line`, 400), alone in a
 * group of their own, and `index.css` filters that group in light: the
 * reference lines, the dots and the hover dots stay unfiltered at their
 * own layers. Both numbers are spelled here rather than read from Recharts,
 * which this module must not import (it would pull Recharts into the entry
 * chunk); `chartColors.test.ts` holds the layer to Recharts' own constant
 * and the id and the layer to the stylesheet's rule.
 */
export const LINE_LAYER_Z = 401
export const LINE_RIM_FILTER_ID = 'chart-line-rim'

/**
 * The type size of every word the chart draws: its tick labels and the Now and
 * model-end labels on its seams. The ramp's smallest step, `MICRO_SIZE` in
 * styles.ts, as the number Recharts takes; it spelled 10 four times before it
 * had a name (#687), and `styles.test.ts` holds it to the ramp.
 */
export const CHART_TICK_PX = 11
// A curated, reasonably colorblind-aware palette used first — where distinction
// matters most (the common case of a handful of lines). The light theme's is
// the same ten hues at Tailwind's 300 step (PR #733): the maintainer found
// the 600/700 twin too dark, and a pastel reads 3:1 or better against the
// dark edge it is drawn over (`lineEdge`), which is what stands it off the
// light panel. The dark ones stand 3:1 on the dark panel by themselves.
// `chartColors.test.ts` measures both. An index means the same hue in either
// theme, which is what lets a switch recolour a line rather than re-allocate
// it.
const BASE_PALETTE: Record<Theme, readonly string[]> = {
  dark: [
    '#38bdf8', // sky
    '#f472b6', // pink
    '#a3e635', // lime
    '#fbbf24', // amber
    '#c084fc', // purple
    '#34d399', // emerald
    '#fb923c', // orange
    '#60a5fa', // blue
    '#e879f9', // fuchsia
    '#2dd4bf', // teal
  ],
  light: [
    '#74d4ff', // sky-300
    '#fda5d5', // pink-300
    '#bbf451', // lime-300
    '#ffd230', // amber-300
    '#dab2ff', // purple-300
    '#5ee9b5', // emerald-300
    '#ffb86a', // orange-300
    '#8ec5ff', // blue-300
    '#f4a8ff', // fuchsia-300
    '#46ecd5', // teal-300
  ],
}

export const BASE_PALETTE_SIZE = BASE_PALETTE.dark.length

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Past the curated palette, walk the hue wheel by the golden angle so each new
// line lands ~137.5° from the previous — maximally spaced for any count. Always
// hex, so the same value drives the swatch, the table's checkbox tint, and the
// Recharts stroke. The chart can carry a line per displayed row, hundreds of
// them, so these are most of a big chart's colours and every one owes 3:1 to
// whatever stands it off the panel, at any hue the walk lands on.
//
// Saturation 70 in both themes. Dark walks at 64, the lowest whole lightness
// at which the worst hue on the wheel (pure blue) still clears 3:1 on
// slate-800, at 3.08:1; the 60 it walked at before bottomed out at 2.53.
// Light walks at 78, the maintainer's pastel (PR #733), against the dark edge
// rather than the panel: pure blue is again the worst at 3.90:1 and the best
// reads 7.75, so a line clears 3:1 however many there are. A higher
// saturation fails sooner there (80 bottoms at 3.70, 90 at about 3.5).
const GENERATED_SATURATION = 70
const GENERATED_LIGHTNESS: Record<Theme, number> = { dark: 64, light: 78 }

function generatedHex(index: number, theme: Theme): string {
  return hslToHex((index * 137.508) % 360, GENERATED_SATURATION, GENERATED_LIGHTNESS[theme])
}

/** The hex an allocated index paints in a theme. */
export function colorForIndex(index: number, theme: Theme): string {
  const palette = BASE_PALETTE[theme]
  return index < palette.length ? palette[index] : generatedHex(index, theme)
}

/**
 * Every allocated index as the hex it paints in a theme, for a reader that
 * wants colours by key (the comparison's pairs, `seedPairColors`).
 */
export function paletteColors(
  indices: Readonly<Record<string, number>>,
  theme: Theme,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, index] of Object.entries(indices)) out[key] = colorForIndex(index, theme)
  return out
}

/**
 * Give every key that has none a colour, continuing one session-long sequence.
 *
 * What it hands out is a palette INDEX rather than a hex (#706): a theme
 * switch must recolour the lines a reader has already charted, and a stored
 * hex would keep the old theme's. The hex is resolved where it is read
 * (`colorForIndex`), so a line keeps its place in the palette and takes the
 * theme's shade of it.
 *
 * This is the app's ONE colour allocator and it hands out to two kinds of key:
 * a charted destination (by `chartKey`), and a (destination, compared model)
 * pair on the comparison chart (by `pairKey`). One counter for both is the
 * whole point — two allocators over one palette would eventually hand the same
 * colour to a destination and to a line standing beside it, which is exactly
 * what a comparison must never do.
 *
 * Monotonic in what is already assigned, so a colour is allocated once and
 * kept: a line never changes hue because another was added or taken away, and
 * a destination unselected and selected again comes back the colour it was.
 * That memory is the caller's — it holds the map — and this only ever adds.
 *
 * Returns the map it was given when every key already has one, so a caller can
 * skip the write rather than setting state on a render that allocated nothing.
 */
export function allocateColors(
  assigned: Readonly<Record<string, number>>,
  keys: readonly string[],
): Record<string, number> {
  const missing = keys.filter((key, i) => assigned[key] === undefined && keys.indexOf(key) === i)
  if (missing.length === 0) return assigned as Record<string, number>
  const next = { ...assigned }
  let n = Object.keys(next).length
  for (const key of missing) {
    next[key] = n
    n++
  }
  return next
}
