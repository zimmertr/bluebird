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
// ColorBrewer Set1 (#801), twenty colours: Brewer's nine strong primaries,
// then a lighter shade of each, then a darker shade of the first two, every
// one turned five degrees of hue toward red. The maintainer chose it in the
// Chart Palette Lab (2026-10-23) from forty-two palettes drawn live on a
// hundred-line chart in both themes, and these hexes are the lab's own
// output, so what ships is what was chosen. The chart repeats the twenty past
// the twentieth line, as Tableau does, because no reader matches a fortieth
// colour to a legend; the hover box names the line.
//
// Dark is that output as drawn: on a dark ground the lab makes the lighter
// shades first. Light makes the darker shades first, and eight of its twenty
// fell under the 3:1 a graphic owes its ground (WCAG 1.4.11), Brewer's yellow
// at 1.04:1, which cannot be seen on the light panel; each of those drops in
// OKLCH lightness alone, hue and chroma kept, until it clears 3:1, so the
// yellow lands at a gold. Dark keeps the four of its twenty that read under
// 3:1 (2.13 to 2.77), which the maintainer accepted with Tableau's lead.
// `chartColors.test.ts` spells all forty and measures them. An index means
// the same colour family in either theme, which is what lets a switch
// recolour a line rather than re-allocate it.
const BASE_PALETTE: Record<Theme, readonly string[]> = {
  dark: [
    '#e41534', // red
    '#2c80b6', // blue
    '#5dad3d', // green
    '#9350a9', // purple
    '#ff7e30', // orange
    '#fff9a8', // yellow
    '#a85430', // brown
    '#f382c8', // pink
    '#999999', // grey
    '#fe5a4a', // light red
    '#619cd1', // light blue
    '#76cd77', // light green
    '#b471bc', // light purple
    '#ffb484', // light orange
    '#f5f859', // light yellow
    '#c07850', // light brown
    '#fdb6d7', // light pink
    '#b8b8b8', // light grey
    '#a33417', // dark red
    '#365f8d', // dark blue
  ],
  light: [
    '#e41534', // red
    '#2c80b6', // blue
    '#4d9d2a', // green, darkened from #5dad3d
    '#9350a9', // purple
    '#e46602', // orange, darkened from #ff7e30
    '#958e3f', // yellow, darkened from #fff9a8
    '#a85430', // brown
    '#d365ab', // pink, darkened from #f382c8
    '#8a8a8a', // grey, darkened from #999999
    '#ac221a', // dark red
    '#256092', // dark blue
    '#368e3a', // dark green
    '#76367d', // dark purple
    '#cd6b19', // dark orange
    '#8f9000', // dark yellow, darkened from #dbdd35
    '#803d13', // dark brown
    '#ce699d', // dark pink
    '#7b7b7b', // dark grey
    '#e9603f', // light red, darkened from #f26847
    '#648ebf', // light blue, darkened from #709acc
  ],
}

export const BASE_PALETTE_SIZE = BASE_PALETTE.dark.length

/**
 * How many lines a chart may hold before it is crowded, chosen in the lab
 * with the palette (#801): past it every line is thinner.
 */
export const CROWDED_PAST = 30

/**
 * How a series line is drawn (#801), chosen in the lab with the palette. Up
 * to `CROWDED_PAST` lines each is 1.5px; past it each is 1px, so a hundred
 * lines read as a weave rather than a wall. Every line is full
 * strength at any count: a fade sinks the palette's darker colours into the
 * slate and leaves its yellow and orange, so a crowd reads as its two
 * loudest hues. The focused line stands at 2.5px either way, and the rest
 * fall to half while it does.
 */
export const LINE_DRAW = { width: 1.5, crowdedWidth: 1, focusedWidth: 2.5, dimmedOpacity: 0.5 } as const

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
 * colours to spare. One counter keeps the first twenty lines, of either kind,
 * twenty colours; only past twenty does the palette come round again (#801).
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
