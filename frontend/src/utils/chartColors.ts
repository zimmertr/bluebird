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
// Every line, curated or generated, is one OKLCH lightness per theme (#801):
// equal lightness is what lets ten hues read as ten lines rather than three
// loud ones and seven quiet ones, and it is one ratio against the panel, so
// every line owes the panel its 3:1 (WCAG 1.4.11) by itself and needs no
// edge. Light walks at 0.61, where the worst hue on the wheel reads 3.13:1 on
// the light panel (0.62 leaves it 3.01, too close to round on), and dark at
// 0.75, where the worst reads 6.10:1 on slate-800. The chroma is capped (0.16
// in light, 0.15 in dark) so no hue shouts over the rest, and taken lower
// wherever sRGB cannot show it.
// The maintainer picked this from ten published chart palettes mocked side by
// side on #801 (2026-10-22): it was the only one whose every line cleared
// 3:1 in both themes. `chartColors.test.ts` measures every curated line and
// the first thousand generated ones.
const LINE_LIGHTNESS: Record<Theme, number> = { light: 0.61, dark: 0.75 }
const LINE_CHROMA: Record<Theme, number> = { light: 0.16, dark: 0.15 }

// The first ten, the lines most charts draw, at hues picked by hand so
// neighbours in the allocation order sit far apart on the wheel. Light's gold
// sits ten degrees warmer than dark's, the shade the maintainer saw in the
// mockups. An index means the same hue in either theme, which is what lets a
// switch recolour a line rather than re-allocate it. `chartColors.test.ts`
// spells the hexes these paint.
const CURATED_HUES: Record<Theme, readonly number[]> = {
  // blue, red, green, purple, orange, teal, pink, gold, indigo, olive
  light: [245, 30, 150, 310, 65, 195, 350, 85, 275, 125],
  dark: [245, 30, 150, 310, 65, 195, 350, 95, 275, 125],
}

export const BASE_PALETTE_SIZE = CURATED_HUES.dark.length

// OKLCH to linear sRGB, through Björn Ottosson's published OKLab matrices.
function oklchToLinearRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
}

const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6)

// A colour sRGB cannot show keeps its lightness and hue and gives up chroma,
// found by halving: clipping a channel instead would move the lightness, and
// the lightness is what holds the 3:1.
function oklchHex(l: number, cap: number, h: number): string {
  let rgb = oklchToLinearRgb(l, cap, h)
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = cap
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinearRgb(l, mid, h))) lo = mid
      else hi = mid
    }
    rgb = oklchToLinearRgb(l, lo, h)
  }
  const channel = (v: number) => {
    const x = Math.min(1, Math.max(0, v))
    const encoded = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.round(255 * encoded)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${rgb.map(channel).join('')}`
}

// Past the curated ten, walk the hue wheel by the golden angle from the first
// line's hue, so each new line lands ~137.5° from the one before, maximally
// spaced for any count. The chart can carry a line per displayed row,
// hundreds of them, so these are most of a big chart's colours.
function hueAt(index: number, theme: Theme): number {
  const curated = CURATED_HUES[theme]
  return index < curated.length ? curated[index] : (curated[0] + index * 137.508) % 360
}

// Kept once worked out, because a long chart asks for the same few hundred
// colours on every render.
const painted = new Map<string, string>()

/**
 * The hex an allocated index paints in a theme. Always hex, so the same value
 * drives the swatch, the table's checkbox tint and the Recharts stroke.
 */
export function colorForIndex(index: number, theme: Theme): string {
  const key = `${theme}${index}`
  let hex = painted.get(key)
  if (hex === undefined) {
    hex = oklchHex(LINE_LIGHTNESS[theme], LINE_CHROMA[theme], hueAt(index, theme))
    painted.set(key, hex)
  }
  return hex
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
