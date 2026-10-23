// Categorical line colors for the comparison chart. Deliberately separate from
// colors.ts, which encodes metric *intensity* (green→red) on the map and table.
// Here each destination just needs its own distinguishable hue.
//
// The chart's CHROME lives here too (#365): Recharts takes a `stroke` or a
// `fill` as a prop, not a class, so the design system in styles.ts cannot
// reach it, and the axis colour was spelled five times in two files before it
// had a name. Since #706 every value here comes in a pair, one per theme.
// Recharts writes them as SVG presentation attributes, which do not resolve
// `var()`, so the CSS tokens that theme every class cannot reach them; since
// #786 the chart is handed both at once as `light-dark()` (`themed`), which an
// attribute does resolve, against the root's colour scheme, so a theme
// switch repaints the chart without re-rendering it. The dark values are the
// Tailwind slate steps the surrounding panel wears, as Tailwind v4 computes
// them from its oklch steps (#687); the light ones are the light theme's
// tokens in `index.css`, spelled as the hexes they are there.
import type { Theme } from './viewPrefs'
import { themed } from './themeColor'

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
}

// slate-400, slate-700, slate-800 and sky-400.
const DARK_CHROME: ChartChrome = {
  axis: '#90a1b9',
  grid: '#314158',
  surface: '#1d293d',
  playhead: '#00bcff',
  unassigned: '#90a1b9',
}
// The secondary ink (`ink-soft`), the quiet rule, the panel and the accent ink.
const LIGHT_INK_SOFT = '#42474e'
const LIGHT_CHROME: ChartChrome = {
  axis: LIGHT_INK_SOFT,
  grid: '#c2c8d1',
  surface: '#eef2f9',
  playhead: '#00639b',
  unassigned: LIGHT_INK_SOFT,
}

export const CHART_CHROME: Record<Theme, ChartChrome> = { dark: DARK_CHROME, light: LIGHT_CHROME }

/**
 * The chrome as the chart draws it (#786): every value both themes' at once,
 * resolved by the root's colour scheme.
 */
export const CHROME: Record<keyof ChartChrome, string> = {
  axis: themed(LIGHT_CHROME.axis, DARK_CHROME.axis),
  grid: themed(LIGHT_CHROME.grid, DARK_CHROME.grid),
  surface: themed(LIGHT_CHROME.surface, DARK_CHROME.surface),
  playhead: themed(LIGHT_CHROME.playhead, DARK_CHROME.playhead),
  unassigned: themed(LIGHT_CHROME.unassigned, DARK_CHROME.unassigned),
}

/**
 * The type size of every word the chart draws: its tick labels and the Now and
 * model-end labels on its seams. The ramp's smallest step, `MICRO_SIZE` in
 * styles.ts, as the number Recharts takes; it spelled 10 four times before it
 * had a name (#687), and `styles.test.ts` holds it to the ramp.
 */
export const CHART_TICK_PX = 11
// Tableau 10 (#801): ten colours of middling lightness and saturation, made
// to be told apart and to sit on a light page or a dark one alike. A chart
// past ten lines repeats them, as Tableau does, because no reader matches a
// fortieth colour to a legend; the hover box names the line, and
// `TimeSeriesChart` thins and fades a crowded chart's lines so the repeats
// blend into a band. Each owes the panel 3:1 (WCAG 1.4.11) at full strength.
// Dark is Tableau 10 as published, 3.21 to 9.08:1 on slate-800. On the light
// panel six of them fall under 3:1, so each of those is darkened in OKLCH,
// hue and chroma kept, only until it clears it (3.06 to 3.09:1), and the light ten read 3.04 to 4.05:1. The
// maintainer picked this from mockups at five lines and at seventy-one in
// both themes, 2026-10-22. `chartColors.test.ts` measures every one. An index
// means the same colour family in either theme, which is what lets a switch
// recolour a line rather than re-allocate it.
const BASE_PALETTE: Record<Theme, readonly string[]> = {
  light: [
    '#4e79a7', // blue
    '#cf7200', // orange, darkened from #f28e2b
    '#e15759', // red
    '#559591', // teal, darkened from #76b7b2
    '#529a48', // green, darkened from #59a14f
    '#a68700', // yellow, darkened from #edc948
    '#b07aa1', // purple
    '#cc6f7a', // pink, darkened from #ff9da7
    '#9c755f', // brown
    '#928884', // grey, darkened from #bab0ac
  ],
  dark: [
    '#4e79a7', // blue
    '#f28e2b', // orange
    '#e15759', // red
    '#76b7b2', // teal
    '#59a14f', // green
    '#edc948', // yellow
    '#b07aa1', // purple
    '#ff9da7', // pink
    '#9c755f', // brown
    '#bab0ac', // grey
  ],
}

export const BASE_PALETTE_SIZE = BASE_PALETTE.dark.length

/**
 * How a series line is drawn (#801), following Tableau. Up to the palette's
 * ten, every line has a colour of its own and is drawn at 1.5px, full
 * strength. Past ten the colours come round again, so every line drops to
 * 1px at 55% and a crowd blends into one band rather than a tangle of
 * repeats; at 55% a line reads under 3:1 on its panel (1.75 to 2.01 in light,
 * 1.90 to 3.75 in dark), which the maintainer accepted with Tableau's lead
 * (2026-10-22). The focused line stands at 2.5px and full strength either
 * way, and the rest dim to a quarter while it does.
 */
export const LINE_DRAW = { width: 1.5, crowdedWidth: 1, focusedWidth: 2.5, crowdedOpacity: 0.55, dimmedOpacity: 0.25 } as const

/**
 * The hex an allocated index paints in a theme: the palette, round again past
 * its tenth. Always hex, so the same value drives the swatch, the table's
 * checkbox tint and the Recharts stroke.
 */
export function colorForIndex(index: number, theme: Theme): string {
  const palette = BASE_PALETTE[theme]
  return palette[index % palette.length]
}

/**
 * An allocated index as the chart and its swatches paint it: both themes'
 * shades at once (`themed`, #786), so a line, its legend chip and its table
 * checkbox keep one value across a switch.
 */
export function lineColor(index: number): string {
  return themed(colorForIndex(index, 'light'), colorForIndex(index, 'dark'))
}

/**
 * Every allocated index as the colour it paints, for a reader that wants
 * colours by key (the comparison's pairs, `seedPairColors`).
 */
export function paletteColors(indices: Readonly<Record<string, number>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, index] of Object.entries(indices)) out[key] = lineColor(index)
  return out
}

/**
 * Give every key that has none a colour, continuing one session-long sequence.
 *
 * What it hands out is a palette INDEX rather than a hex (#706): a theme
 * switch must recolour the lines a reader has already charted, and a stored
 * hex would keep the old theme's. The colour is resolved where it is read
 * (`lineColor`), so a line keeps its place in the palette and takes the
 * theme's shade of it.
 *
 * This is the app's ONE colour allocator and it hands out to two kinds of key:
 * a charted destination (by `chartKey`), and a (destination, compared model)
 * pair on the comparison chart (by `pairKey`). One counter for both is the
 * whole point — two allocators over one palette would hand the same colour to
 * a destination and to a line standing beside it while the chart still had
 * colours to spare. One counter keeps the first ten lines, of either kind,
 * ten colours; only past ten does the palette come round again (#801).
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
