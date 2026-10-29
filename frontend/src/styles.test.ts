// Vitest runs on node; the project ships no node types, and this is the one
// place in src/ that reads a file, so the suppression stays local to it.
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACCENT,
  ACCENT_RING,
  BADGE_ACCENT,
  BADGE_STEP,
  LAYER,
  BUTTON_ACCENT,
  BUTTON_FLOATING,
  ACTION_GROUP,
  ACTION_ITEM,
  BAR_GROUP,
  BAR_LABEL,
  BAR_PRESS,
  DIALOG_FOOT,
  DRAG,
  DRAW_BAR,
  ELEVATION,
  SLIDER,
  BANNER_PREVIEW,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHIP,
  CHOICE_INPUT,
  CHOICE_ROW,
  DAY,
  CHART_LEGEND,
  CHART_METRIC_W,
  CONTROL_W,
  FIELD,
  FIELD_NUMERIC,
  FOCUS_RING,
  FOCUS_RING_INSET,
  ICON,
  ICON_ADORNMENT,
  METRICS_GRID,
  METRIC_BOX_W,
  METRIC_HEAD_GAP,
  ICON_ACTION,
  ICON_BUTTON,
  NOTICE,
  NOTICE_DISMISS,
  NOTICE_DIVIDER,
  SCRUBBER,
  CONTROL_SIZE,
  SEGMENT,
  SEGMENT_FLUID,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  DISABLED,
  SELECT,
  SEGMENT_FILL,
  SELECT_W_AGGREGATE,
  SPINNER,
  STATUS,
  TRANSPORT_AXIS_ITEM,
  TRANSPORT_PLAY,
  HEADER_BUTTON,
  CALENDAR_FIELD,
  CALENDAR_GROUND,
  DRAW_ROW,
  METRIC_LABEL_PITCH,
  MOTION,
  PANEL_MS,
  DESK_PANEL,
  RESULTS_PANE,
  LAYOUT_HOLD,
  PANEL_BODY,
  PANEL_HEADER,
  SCROLL_BARS,
  SCROLL_SHADOW,
  LINK,
  LINK_ACTION,
  CAPTION_LIFTED,
  SEARCH_KIND,
  BOTTOM_SHEET,
  CONTROLS_SHEET,
  SAFE_AREA,
  CHART_PLOT_TOUCH,
  CHART_TITLE,
  MENU,
  MENU_GROUP,
  LAYER_ROW,
  SHEET_ASIDE,
  MODEL_ROW,
  MENU_CHEVRON,
  MENU_TRIGGER,
  MAP_CHIP_MENU,
  MAP_CHIP_SUMMARY,
  MAP_CHIP_SUMMARY_TEXT,
  MAP_FAB,
  MAP_FAB_SLOT,
  MAP_FAB_WORDS,
  MESSAGE_BADGE,
  MESSAGE_LIST,
  BLOCKED,
  MAP_ROUND_BUTTON,
  MAP_TERRAIN_BUTTON,
  MAP_SLOT,
  MAP_CORNER,
  MAP_ZOOM_PAIR,
  MAP_CREDIT,
  MAP_PILL,
  MAP_PILL_FIELD,
  CHIP_CARD_W,
  MAP_ROWS,
  SEARCH_LIST,
  MICRO_SIZE,
  MUTED,
  PANEL_EDGE,
  PANEL_RULE,
  MAP_EDGE,
  PROSE,
  RADIUS,
  SURFACE_CARD,
  SURFACE_DIVIDER,
  SURFACE_FLOATING,
  SURFACE_CHIP_CARD,
  SURFACE_SHEET,
  SWATCH_CHIP,
  SWATCH_STAR,
  SWATCH_EDGE,
  SWATCH_LINE,
  SWATCH_RAMP,
  SWATCH_RAMP_SCRIM,
  SWATCH_RAMP_TICK,
  TAP,
  TEXT,
  YIELD_EMPTY,
} from './styles'
import * as STYLES from './styles'
import { EXTERNAL_LINK_PX } from './iconPaths'
import { CHART_TICK_PX } from './utils/chart/chartColors'
import { THEME_SWITCHING_CLASS } from './hooks/useTheme'
import { CHART_TITLE_INSET_PX, CHART_TITLE_PX, TITLED_PLOT_MARGIN, TOP_LABEL_RISE_PX } from './utils/chart/chartPointer'
import { SCRUBBER_THUMB_PX } from './utils/timeline'
import { CHIP_MENU_GAP_PX } from './utils/results/resultsSheet'
import { PANEL_FLOOR_PX } from './utils/layout'
import { SCALE_MAX_WIDTH_PX } from './map/controls'
import { MARKER_HALO, MARKER_LABEL_PAINT, MARKER_STROKE } from './map/mapStyles'
import { TRAIL_CASING_COLOR, TRAIL_COLOR, TRAIL_OPACITY } from './map/basemap'
import { FIRE_ACTIVITY_FILLS } from './utils/fireActivity'
import {
  CONTOUR_EDGE_OPACITY,
  CONTOUR_IMAGERY_EDGE,
  CONTOUR_IMAGERY_INK,
  CONTOUR_IMAGERY_OPACITY,
  CONTOUR_INK,
  CONTOUR_INK_ON,
  CONTOUR_LAYER,
} from './map/terrain'
import { METRIC_SCALE, hexToRgb } from './utils/colors'
import { SNOW_RAMP } from './utils/snowDepth'
import { contrast, mixOver, relativeLuminance, round2 } from './testSupport/contrast'
import {
  FINE_COLOR,
  GRID_BAND_COLOR,
  GRID_GUTTER_COLOR,
  GRID_LINE_COLOR,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  HEADER_EDGE_COLOR,
  HEADER_ICON_COLOR,
  LABEL_COLOR,
  RULE_COLOR,
  WARNING_COLOR,
  popupButton,
} from './utils/popup/popupChrome'
// The map's chip is the chip shape of the one menu trigger (record 0201), and
// that is the only name it is exported under.
const MAP_CHIP = MENU_TRIGGER.chip
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'
import destinationsSource from './components/DestinationsSection.tsx?raw'
import forecastSectionSource from './components/ForecastSection.tsx?raw'
import metricsTableSource from './components/MetricsTable.tsx?raw'
import panelFooterSource from './components/PanelFooter.tsx?raw'
import appSource from './App.tsx?raw'
import searchBoxSource from './components/SearchBox.tsx?raw'
import layersPopoverSource from './components/LayersPopover.tsx?raw'
import columnsPickerSource from './components/ColumnsPicker.tsx?raw'
import modelsPickerSource from './components/ModelsPicker.tsx?raw'
import mapLegendSource from './components/MapLegend.tsx?raw'
import mapRowsSource from './components/MapRows.tsx?raw'
import bottomSheetSource from './components/BottomSheet.tsx?raw'
import phoneFootSource from './components/PhoneFoot.tsx?raw'
import mapStageSource from './components/MapStage.tsx?raw'
import appDrawerSource from './components/AppDrawer.tsx?raw'
import analysisOverlaySource from './components/AnalysisOverlay.tsx?raw'
import resultsPanelsSource from './components/ResultsPanels.tsx?raw'
import forecastCalendarSource from './components/ForecastCalendar.tsx?raw'
import timeSeriesChartSource from './components/TimeSeriesChart.tsx?raw'
import resultsBarSource from './components/ResultsBar.tsx?raw'
import welcomeSource from './components/WelcomeModal.tsx?raw'
// The one stylesheet with a decision in it: the vendor's own controls have no
// call site to hand a role to, so what they take is written there. Read off
// the disk rather than imported — Vitest stubs a CSS import, `?raw` included,
// to an empty string.
const mapCss: string = readFileSync(new URL('./map.css', import.meta.url), 'utf8')
// The other stylesheet with a decision in it, read the same way and for the
// same reason.
const indexCss: string = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

// The theme layer (#706; record 0158). Every colour role names a semantic
// token (`text-ink-mid`, `bg-panel`), and `index.css` gives each one two
// values: the dark theme's Tailwind step and the light theme's hex. The dark
// assertions below read a role's token back to its step, so every slate and
// sky claim this file made before the themes still holds word for word; the
// light ones read the hex and measure it. Steps are named bare (`slate-300`),
// never as a utility, because Tailwind scans this file as text and a quoted
// utility would emit CSS for a class nothing draws.
function tokenBlock(block: RegExp): Record<string, string> {
  const body = indexCss.match(block)![1]
  return Object.fromEntries([...body.matchAll(/--ui-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const DARK_TOKENS = tokenBlock(/:root \{\n  color-scheme: dark;([\s\S]*?)\n\}/)
const LIGHT_TOKENS = tokenBlock(/:root\[data-theme="light"\] \{\n  color-scheme: light;([\s\S]*?)\n\}/)
const TOKENS = Object.keys(DARK_TOKENS)
/**
 * The token a recipe paints through one utility, `text` or `hover:bg` or
 * `[&>*+*]:border`, with or without an opacity.
 */
function token(recipe: string, utility: string): string {
  for (const cls of recipe.split(/\s+/)) {
    if (!cls.startsWith(`${utility}-`)) continue
    const name = cls.slice(utility.length + 1).replace(/\/.*$/, '')
    if (TOKENS.includes(name)) return name
  }
  throw new Error(`no ${utility} token in ${recipe}`)
}
/** The Tailwind step a token paints in the dark theme: `slate-300`, `sky-650`. */
const darkStep = (name: string): string => DARK_TOKENS[name].match(/^var\(--color-([\w-]+)\)$/)?.[1] ?? DARK_TOKENS[name]
// A layer's stacking number, from its z utility: `z-30` or `z-[15]`.
const zOf = (layer: string): number => Number(layer.match(/^z-\[?(\d+)\]?$/)![1])
/**
 * The hex a token paints in the light theme. A light token that names one of
 * this app's own colours (`var(--color-sky-650)`, the accent the two themes
 * share) is resolved through its oklch declaration in `index.css`, so the
 * light assertions measure the colour the browser paints rather than a copy
 * of its hex.
 */
const light = (name: string): string => {
  const own = LIGHT_TOKENS[name].match(/^var\(--color-([\w-]+)\)$/)
  return own ? paletteHex(own[1]) : LIGHT_TOKENS[name]
}
/** CSS Color 4's oklch to sRGB, gamut-clipped, as the hex a browser paints. */
function oklchHex(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3)
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ]
  return `#${linear
    .map((v) => Math.min(1, Math.max(0, v)))
    .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('')}`
}
/**
 * `a` at weight `w` mixed with `b`, as `color-mix(in oklab, a w, b)` paints
 * it: both to oklab, the weighted sum, and back through `oklchHex`'s path.
 */
function mixOklab(a: string, w: number, b: string): string {
  const oklab = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    const [l, m, s] = [
      0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl,
      0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl,
      0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl,
    ].map(Math.cbrt)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
  }
  const [x, y] = [oklab(a), oklab(b)]
  const [L, A, B] = x.map((v, i) => w * v + (1 - w) * y[i])
  return oklchHex(L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI)
}
// The WCAG 2 ratio of two hexes at the two places the measured tables are
// written at, for the light theme's measurements and the accent's light half.
const ratio = (a: string, b: string) => round2(contrast(a, b))

// Tailwind's own palette, read off the disk for the reason the stylesheets
// above are, so the dark theme's steps are measured rather than copied.
const palette: string = readFileSync(new URL('../node_modules/tailwindcss/theme.css', import.meta.url), 'utf8')
/**
 * The hex a palette step paints: one of Tailwind's (`slate-700`, an oklch in
 * percent in its theme.css), one of this app's own (`sky-650`, an oklch in
 * `index.css`), or white and black, which the palette spells as hexes.
 */
function paletteHex(name: string): string {
  if (name === 'white') return '#ffffff'
  if (name === 'black') return '#000000'
  const stock = palette.match(new RegExp(String.raw`--color-${name}: oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\);`))
  if (stock) return oklchHex(Number(stock[1]) / 100, Number(stock[2]), Number(stock[3]))
  const own = indexCss.match(new RegExp(String.raw`--color-${name}: oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);`))
  if (own) return oklchHex(Number(own[1]), Number(own[2]), Number(own[3]))
  throw new Error(`no oklch declaration for --color-${name} in tailwindcss/theme.css or index.css`)
}
/**
 * `top` at `alpha` over `under`, the way an opacity or a `/NN` composites,
 * to the 8-bit hex the browser paints.
 */
const over = (top: string, alpha: number, under: string) => mixOver(top, under, alpha)
/**
 * The hex a token paints in the dark theme, measured the way the light theme
 * is: on the 8-bit hex the browser paints. A token that is a step at a
 * fraction (`color-mix(in oklab, var(--color-red-950) 40%, transparent)`, a
 * notice tint) is that step composited over the ground it lands on, which
 * the caller names.
 */
function dark(name: string, ground?: string): string {
  const value = DARK_TOKENS[name]
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  const mix = value.match(/^color-mix\(in oklab, var\(--color-([\w-]+)\) (\d+)%, transparent\)$/)
  if (!mix) return paletteHex(darkStep(name))
  if (ground === undefined) throw new Error(`--ui-${name} is translucent; name the ground it lands on`)
  return over(paletteHex(mix[1]), Number(mix[2]) / 100, ground)
}
/** The alpha a recipe's `/NN` puts on one utility, `bg` or `hover:bg`. */
const alphaOf = (recipe: string, utility: string): number =>
  Number(recipe.match(new RegExp(String.raw`(?:^|\s)${utility}-[\w-]+/(\d+)(?:\s|$)`))![1]) / 100

// The arbitrary branch cannot carry a trailing \b: `text-[10px]` ends in `]`, a
// non-word character, so a boundary there would require the *next* character to
// be a word one — which it never is, mid-class-list.
// Tailwind's spacing scale is 4px a step, so every width sum below reads its
// numbers off the roles rather than restating them in a comment that rots.
const stepPx = (cls: string, prefix: string): number =>
  (Number(cls.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`))![1]) / 4) * 16
// What SELECT keeps clear on the right: the arrow's own box and nothing more.
const ICON_PX = stepPx(ICON.control, 'w')
const selectArrowPx = (): number => stepPx(SELECT, 'pr')
// The panel's control column, and the Metrics box pair it now measures.
const controlWPx = (): number => Number(CONTROL_W.match(/w-\[(\d+)px\]/)![1])
const metricPairPx = (): number =>
  2 * stepPx(METRIC_BOX_W, 'w') + (Number(METRICS_GRID.match(/gap-x-([\d.]+)/)![1]) / 4) * 16

// The building blocks `styles.ts` does not export (#687), read back off the
// roles that compose them, so every assertion below tests what a call site is
// actually handed.
const RECESSED_EDGE = SEGMENT_FLUID.split(' ').filter((c) => c.startsWith('border')).join(' ')
const RECESSED_FILL = SEGMENT_IDLE.split(' ').find((c) => c.startsWith('bg-'))!
const TRANSPORT_AXIS_W = (TRANSPORT_AXIS_ITEM.match(/(?:^|\s)((?:touch:)?min-w-\[\d+px\])/g) ?? [])
  .map((c) => c.trim())
  .join(' ')

const SIZE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b|\btext-\[[^\]]+\]/g

function sizes(classes: string): string[] {
  return classes.match(SIZE) ?? []
}

describe('the compact tier', () => {
  it('gives each role exactly one size, and no two roles the same recipe', () => {
    for (const [role, classes] of Object.entries(TEXT)) {
      expect(sizes(classes), `${role} must set exactly one size`).toHaveLength(1)
    }
    expect(new Set(Object.values(TEXT)).size).toBe(Object.keys(TEXT).length)
  })

  // The one place the ramp deliberately reuses a size and color. Weight alone
  // separates "Elevation range (ft)" from "Peaks", which keeps a heading
  // readable as a heading without spending a fifth size on it.
  it('separates a sub-heading from control text by weight alone', () => {
    expect(TEXT.subheading.split(' ').filter((c) => c !== 'font-semibold')).toEqual(
      TEXT.control.split(' '),
    )
  })

  // The same relationship one step down: an overline is the micro step wearing
  // emphasis, so the legend's metric name and a search result's kind cannot
  // drift apart from the credits sharing their size.
  it('separates an overline from micro text by emphasis alone', () => {
    const emphasis = ['font-semibold', 'uppercase', 'tracking-wider']
    expect(TEXT.overline.split(' ').filter((c) => !emphasis.includes(c))).toEqual(
      TEXT.micro.split(' '),
    )
  })

  it('keeps clarifying prose italic, and a caption the same minus the italic', () => {
    expect(TEXT.helper).toContain('italic')
    expect(TEXT.helper.split(' ').filter((c) => c !== 'italic')).toEqual(TEXT.caption.split(' '))
  })

  // The 11px step lands on three background lightnesses, the lightest of them
  // the slate-700 table header bar carrying a required CC-BY credit. slate-300
  // is the dimmest step clearing 4.5:1 on all three (6.97:1 on that bar);
  // slate-400 manages 3.94:1 there and slate-500 only 2.17:1. Dimming this
  // role is not a style change, it is an accessibility regression, and a call
  // site cannot undo it: Tailwind resolves competing color utilities by
  // stylesheet order, not class-list order.
  it('keeps the micro step legible on the lightest surface it lands on', () => {
    expect(darkStep(token(TEXT.micro, 'text'))).toBe('slate-300')
  })

  // The 12px secondary step lands on the slate-800 panel, cards and dialogs.
  // slate-400 is the dimmest step clearing 4.5:1 there (5.7, and 7.0 on the
  // slate-900 fields); slate-500, where this tier sat, managed 3.1:1 — a
  // deliberate recession, but below what AA permits for text. Same rule as
  // the micro step: a call site cannot dim this back, so the floor is here.
  it('keeps the caption step legible on the panel it lands on', () => {
    expect(darkStep(token(TEXT.caption, 'text'))).toBe('slate-400')
  })

  // A section heading was slate-400, the caption's step (5.56:1 on the
  // slate-800 panel), over a slate-200 subheading, so DESTINATIONS read dimmer
  // than the Polygon under it (#687). slate-300 is 9.83:1 and sits between the
  // two steps it orders: brighter than any caption, and still a step under the
  // subheading's brightness so the size, weight and case carry the rank, not
  // a glare.
  it('brightens the section heading past the caption and keeps its size', () => {
    const MEASURED = { section: 9.83, wasBefore: 5.56 }
    const step = (c: string) => Number(darkStep(token(c, 'text')).match(/slate-(\d+)/)![1])
    expect(darkStep(token(TEXT.section, 'text'))).toBe('slate-300')
    expect(TEXT.section).toContain('text-sm')
    expect(step(TEXT.section)).toBeLessThan(step(TEXT.caption))
    expect(step(TEXT.section)).toBeGreaterThan(step(TEXT.subheading))
    const panel = dark('panel')
    expect(ratio(dark(token(TEXT.section, 'text')), panel)).toBe(MEASURED.section)
    expect(ratio(dark(token(TEXT.caption, 'text')), panel)).toBe(MEASURED.wasBefore)
    expect(MEASURED.section).toBeGreaterThan(MEASURED.wasBefore)
    expect(MEASURED.section).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the reading tier', () => {
  it('gives each role at most one size, and no two roles the same recipe', () => {
    for (const [role, classes] of Object.entries(PROSE)) {
      expect(sizes(classes).length, `${role} must not set two sizes`).toBeLessThanOrEqual(1)
    }
    expect(new Set(Object.values(PROSE)).size).toBe(Object.keys(PROSE).length)
  })

  // `strong` is the one inline modifier: it emphasizes whatever it sits inside
  // rather than setting a step of its own. That is also why it must never be
  // composed onto an element that already carries a body class — two colors in
  // one class list resolve by stylesheet order.
  it('leaves inline emphasis size-less', () => {
    expect(sizes(PROSE.strong)).toHaveLength(0)
    expect(Object.entries(PROSE).filter(([, c]) => sizes(c).length === 0)).toHaveLength(1)
  })

  // Where the two densities meet. If this ever stops holding, the dialogs have
  // become a second scale rather than the same one a step up.
  it('shares its small step with the compact tier base', () => {
    expect(PROSE.note).toBe(TEXT.caption)
  })

  // The dialog subtitle is the caption step one size up — the recipe the app
  // tagline wears since the two roles merged in #165. If this drifts, the
  // tiers have stopped rhyming and the tagline needs a role of its own again.
  it('keeps the dialog subtitle one size up from the caption step', () => {
    expect(PROSE.subtitle.replace('text-sm', 'text-xs')).toBe(TEXT.caption)
  })

  // The tagline is each surface's secondary line, upright: the maintainer
  // tried it in italics and had it put back (#801, record 0229).
  it('keeps the tagline upright on the roles it wears', () => {
    expect(TEXT.caption).not.toContain('italic')
    expect(PROSE.subtitle).not.toContain('italic')
    expect(controlPanelSource).toContain('<p className={TEXT.caption}>Weather Window Finder</p>')
    expect(welcomeSource).toContain('<p className={PROSE.subtitle}>Weather Window Finder</p>')
  })

})

// Every text-bearing source in the app, so a component added later is covered
// by default rather than by remembering to list it. A component's test sits
// beside it and is not a component: it renders the rules rather than breaking
// them, and counting it would put its queries in the tallies below. The map's
// modules under `map/` are in it too: they were cut out of `MapView.tsx`, and
// a folder of its own must not be a way out of the rules the component kept.
const sources: Record<string, string> = {
  ...(import.meta.glob(
    [
      './components/*.tsx',
      './map/**/*.ts',
      './map/**/*.tsx',
      '!./components/*.test.tsx',
      '!./map/**/*.test.ts',
      '!./map/**/*.test.tsx',
    ],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>),
  './App.tsx': appSource,
}

// The control panel's frame and every section it renders: the files that
// together are what `ControlPanel.tsx` alone used to be.
const PANEL_SOURCES = [
  controlPanelSource,
  destinationsSource,
  forecastSectionSource,
  metricsTableSource,
  panelFooterSource,
]

// Everything the app SHIPS that could import a role. Wider than either set
// above, because a role is dead only if NOTHING renders it — and narrower than
// all of `src/`, because a test is not a renderer. A suite that counted itself
// could not have caught the role it was written for (#438).
const roleImporters: Record<string, string> = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '!./styles.ts', '!./**/*.test.ts', '!./**/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

describe('every component', () => {
  it('found the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(6)
  })

  // The glob is vacuous for the map's folder if it stops matching there.
  it('reads the map modules beside the components', () => {
    expect(sources['./map/basemap.ts']).toContain('export function enhanceBasemap(')
    expect(Object.keys(sources).filter((path) => path.endsWith('.test.ts'))).toEqual([])
  })

  // The ESLint config and the fixtures beside it spell classes verbatim, which
  // is only safe while Tailwind cannot see them. v4 auto-detects sources BESIDE
  // the config's `content` list, so the exclusion is the load-bearing line:
  // without it the fixtures emitted five real utilities into the text-page
  // bundle. A build is the only thing that would otherwise notice.
  it('keeps the linter fixtures out of Tailwind\'s reach', () => {
    expect(indexCss).toMatch(/@source not ["']\.\.\/tools["']/)
  })

  // The same hazard one directory in: a component test may quote a class to
  // find what it asserts on, and nothing it quotes is drawn by the app.
  it('keeps the component tests out of Tailwind\'s reach', () => {
    expect(indexCss).toMatch(/@source not ["']\.\/\*\*\/\*\.test\.tsx["']/)
  })

  // The layout guides quote class names in prose, and there is one in src/
  // and one in each directory under it. A pattern for src/ alone would let
  // the others emit CSS no page draws.
  it('keeps every layout guide out of Tailwind\'s reach', () => {
    expect(indexCss).toMatch(/@source not ["']\.\/\*\*\/CLAUDE\.md["']/)
  })

  // Derived from the scale rather than blocking a list of names, so a utility
  // nobody thought to forbid still fails. Deliberately written without quoting
  // any deleted class: v4 scans this file as raw text and would re-emit it.
  it.each(Object.entries(sources))('%s stays on the radius scale', (_path, source) => {
    const scale = new Set<string>(Object.values(RADIUS))
    const used = new Set(source.match(/\brounded(?:-[a-z0-9]+)?\b/g) ?? [])

    expect([...used].filter((c) => !scale.has(c))).toEqual([])
  })

  // The hue ban in eslint.config.js lets slate through, because slate is the surface system
  // — and that exemption is how a third divider weight reached eleven call
  // sites in eight files with no name and no owner (#390). A rule between two
  // blocks of one surface is `SURFACE_DIVIDER` now, so the one place it is
  // spelled is the one place it can be changed. Written through a character
  // class so the class name never appears in this file as text, which Tailwind
  // would otherwise compile. Since #706 the line is the `rule` token, which
  // is the spelling a call site would now reach for, so both are held.
  it.each(Object.entries(sources))('%s spells no divider of its own', (_path, source) => {
    expect(source).not.toMatch(/border-(slate-[7]00|rul[e])(?![\w-])/)
  })

  // How faded a thing is says WHY it is faded — 40 percent is out of reach or
  // out of the room, 50 percent is working but not in force — so it is the
  // design system's answer, the way a hue is. Spelling the number at the call
  // site is how one chip came to fade its dot by 40 and its label by 50 while
  // meaning one thing (#437). Left open-ended so it forbids a step nobody
  // thought of, and so the pattern is not itself a class name: v4 scans this
  // file as raw text and would compile one.
  it.each(Object.entries(sources))('%s fades by no number of its own', (_path, source) => {
    expect(source).not.toMatch(/\bopacity-/)
  })

  // A shadow says how far a surface stands off what is under it, which is the
  // elevation scale's answer (#687): five sizes on eight surfaces is what a
  // call site choosing its own produced. Written as an alternation so no class
  // name appears here as text.
  it.each(Object.entries(sources))('%s casts no shadow of its own', (_path, source) => {
    expect(source).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|none)\b/)
  })

  // The role is a colour and nothing else, so a call site that forgets the
  // side draws no line at all and nothing says so. Every use is read back with
  // its own template literal around it.
  it('pairs every divider with a side to draw on', () => {
    const uses = Object.values(sources).flatMap(
      (source) => source.match(/`[^`]*\$\{SURFACE_DIVIDER\}[^`]*`/g) ?? [],
    )

    expect(uses.length).toBeGreaterThan(5)
    for (const use of uses) expect(use).toMatch(/\bborder-[trbl]\b/)
    // The menu's foot draws its own inside the design system now.
    expect(MENU.foot).toMatch(/\bborder-[trbl]\b/)
  })

  // L6 used to fail any `title=` outright. Tooltips are now an approved LIST
  // rather than a ban (TJ, 2026-08-04), so this pins the list instead: adding
  // one without asking fails here, and so does losing one by accident — which
  // is how the smoke chips shipped without theirs, an edit that silently did
  // not apply and was reported as done.
  //
  // Read the tooltip section in docs/STYLES.md before changing these numbers.
  // The count is the point: a tooltip does not exist on touch, so each one is
  // a decision someone made and can defend, not a habit.
  const APPROVED_TOOLTIPS: Record<string, number> = {
    // None since #409: the map's two moved with the chrome that carries them.
    './App.tsx': 0,
    // None: the map column's tooltips are its children's.
    './components/MapStage.tsx': 0,
    // The Light/Medium/Heavy chips in the map's layer legend.
    './components/MapLegend.tsx': 1,
    // Why the Forecast grid row is faded over a report carrying archive hours
    // (#123).
    './components/LayersPopover.tsx': 1,
    // None. The panel's two tooltips are drawn by its Metrics section, below,
    // and a zero here is pinned like every count: a tooltip arriving in the
    // frame is a decision.
    './components/ControlPanel.tsx': 0,
    // Max results (label + field), and the unknown-value note on the AQI row
    // (label + both boxes). Four `title=` in the source for those two
    // tooltips, because the AQI row is one of five the table maps and its
    // note is spelled once for the label and once for the mapped box.
    './components/MetricsTable.tsx': 4,
    // What Hourly actually does to a multi-day window (label + segment).
    './components/ForecastCalendar.tsx': 2,
    // None. Why the control is faded for an archive window (#123) was a
    // tooltip here until TJ moved it into the panel's message block
    // (2026-09-14): a sentence no phone could reach, sitting away from the one
    // place this panel explains itself. The zero is pinned like every count
    // above — a tooltip coming BACK here is as much a decision as one leaving.
    './components/ModelPicker.tsx': 0,
    // Three cells carry four. The Wildfire (mi) cell: which of its two causes
    // an N/A carries (TJ, PR #275 review); a warned row is a link and wears
    // none. The Closure cell, two: the same three notes for the closure
    // check (TJ, 2026-09-30, approved with the column in #550), and the
    // order's whole title on a linked row, because the cell clips a long one
    // (TJ, 2026-09-30, "clip and ellipses", #551). And the freezing-level
    // cell: why it reads N/A, which is the forecast model rather than the
    // weather (TJ, 2026-09-12, asked for with the metric itself in #295).
    './components/ResultsTableRow.tsx': 4,
  }

  it.each(Object.entries(sources))('%s carries only its approved tooltips', (path, source) => {
    const found = (source.match(/\btitle=/g) ?? []).length
    expect(found).toBe(APPROVED_TOOLTIPS[path] ?? 0)
  })
})

describe('control panel sizing', () => {
  // The size used to live beside the tint at every call site, which is how the
  // chart's metric radio ended up wearing the tint at the browser's default
  // size. Both now come from ACCENT.input, which CHOICE_INPUT composes, so what
  // is left to check is that no input re-sizes itself after taking it (the
  // style-call-site-classes check), and that the panel reaches for the row that
  // wraps it, since that is what a finger actually lands on.
  it('builds every radio and checkbox from the shared recipe', () => {
    expect(ACCENT.input).toMatch(/\bh-[\d.]+ w-[\d.]+/)
    expect(CHOICE_INPUT).toContain(ACCENT.input)

    // Per file, because the panel's rows live in two of its sections.
    let total = 0
    for (const source of PANEL_SOURCES) {
      const rows = source.match(/CHOICE_ROW/g) ?? []
      const boxes = source.match(/CHOICE_INPUT/g) ?? []
      expect(boxes.length).toBe(rows.length)
      total += rows.length
    }
    expect(total).toBeGreaterThan(2)
  })
})

describe('the calendar day', () => {
  // The first three roles are one ramp, and what it encodes is how much of a day
  // the app can tell you about: weather and air quality, weather only, or nothing.
  // It has to stay monotonic, because a reader is being asked to compare two cells
  // by brightness alone.
  it('ramps from full data to none, in that order', () => {
    const step = (recipe: string) => Number(darkStep(token(recipe, 'text')).match(/slate-(\d+)/)![1])

    expect(step(DAY.full)).toBeLessThan(step(DAY.partial))
    expect(step(DAY.partial)).toBeLessThan(step(DAY.unservable))
  })

  // Both steps a user can click are content, so both hold the 4.5:1 floor on the
  // slate-800 panel: slate-200 far above it, slate-400 at 5.7:1. Dimming the
  // partial step to slate-500's 3.1:1 would put a live date below AA, which is
  // what #165 spent five PRs undoing.
  it('keeps every pickable day legible on the panel', () => {
    expect(darkStep(token(DAY.full, 'text'))).toBe('slate-200')
    expect(darkStep(token(DAY.partial, 'text'))).toBe('slate-400')
  })

  // The one role here deliberately below 4.5:1, and the only one with no hover:
  // WCAG 1.4.3 exempts inactive controls, and a day that read as text would
  // invite the click it cannot accept.
  it('sets a day outside the servable band apart as inactive', () => {
    expect(darkStep(token(DAY.unservable, 'text'))).toBe('slate-600')
    expect(DAY.unservable).not.toContain('hover:')
  })

  // The range is a fill and the ramp is a text color, which is what lets them
  // compose: a day with no air quality stays dim inside a selected range. If the
  // range fill ever sets a text color, it silently overrides that.
  it('leaves the ramp visible through a selected range', () => {
    expect(DAY.range).toMatch(/\bbg-/)
    expect(DAY.range).not.toMatch(/\btext-/)
  })

  // A ring rather than a fill, because today is frequently also selected and the
  // two have to be able to coexist on one cell.
  it('marks today without spending a fill on it', () => {
    expect(DAY.today).toContain('ring')
    expect(DAY.today).not.toMatch(/\bbg-/)
  })

  it('selects a day with the shared accent fill rather than its own', () => {
    expect(DAY.selected).toBe(ACCENT.fill)
  })
})

describe('grouping and segmenting', () => {
  // The panel's section dividers are slate-700, 1.4:1 on the slate-800 panel.
  // That is fine for a rule and useless for making a block of controls read as one
  // object, which is this role's whole job, so it takes the step that clears the
  // 3:1 asked of a boundary.
  //
  // The calendar left its well for a popover card (#687), which draws the
  // edge, so its ground keeps the well's fill and the card's radius and draws
  // no border of its own: two edges 8px apart would read as a card in a card.
  it('stands the calendar on the recessed fill inside the card edge', () => {
    expect(CALENDAR_GROUND).toContain(RECESSED_FILL)
    expect(CALENDAR_GROUND).not.toContain(RECESSED_EDGE)
    expect(CALENDAR_GROUND).not.toMatch(/(^|\s)border/)
    expect(CALENDAR_GROUND).toContain(RADIUS.surface)
    expect(SURFACE_CARD).toMatch(/(^|\s)border(\s|$)/)
    // The ground is what scrolls when a short window caps the card.
    expect(CALENDAR_GROUND).toContain('overflow-y-auto')
    expect(CALENDAR_GROUND).toContain(SCROLL_BARS)
  })

  // Every surface the panel sinks into is one recipe, so an input, the idle
  // half of a segmented control and the calendar cannot drift into three
  // near-identical looks the way they had.
  it('builds every recessed surface from the one fill and the one edge', () => {
    expect(FIELD).toContain(RECESSED_FILL)
    expect(FIELD).toContain(RECESSED_EDGE)
    expect(CALENDAR_GROUND).toContain(RECESSED_FILL)
    expect(SEGMENT_IDLE).toContain(RECESSED_FILL)
    expect(SEGMENT).toContain(RECESSED_EDGE)
    expect(SEGMENT_FILL).toContain(RECESSED_EDGE)
    expect(SLIDER.track).toContain(RECESSED_EDGE)
    expect(SLIDER.well).toContain(RECESSED_EDGE)
  })

  // The fluid segment is the panel segment minus the panel's width: same edge,
  // same radius, same clipping, no CONTROL_W. The width assertion is the
  // regression test for the results bar's mode switch, which overflow-hidden
  // clipped to two and a half buttons when it inherited the 144px column.
  it('sizes an out-of-panel segment by its content, not the panel column', () => {
    expect(SEGMENT_FLUID).toContain(RECESSED_EDGE)
    expect(SEGMENT_FLUID).toContain('overflow-hidden')
    expect(SEGMENT_FLUID).not.toContain(CONTROL_W)
  })

  // The edge separates two surfaces and owes 3:1 against BOTH (WCAG 1.4.11).
  // slate-600, which the inputs used to carry, reads 1.93:1 against the
  // slate-800 panel and 2.35:1 against the slate-900 fill; slate-500 reads
  // 3.07 and 3.74. The fill step alone is 1.22:1 and cannot carry it. Binding
  // the three therefore raised the inputs to spec rather than lowering the
  // calendar to meet them — pinned so a later 'tidy-up' has to re-measure.
  it('keeps that edge on the step that clears both sides', () => {
    const MEASURED = { panel: 3.07, fill: 3.74, wasBefore: { panel: 1.93, fill: 2.35 } }
    expect(darkStep(token(RECESSED_EDGE, 'border'))).toBe('slate-500')
    const [panel, fill] = [dark('panel'), dark(token(FIELD, 'bg'))]
    const edge = dark(token(RECESSED_EDGE, 'border'))
    expect({ panel: ratio(edge, panel), fill: ratio(edge, fill) }).toEqual({ panel: MEASURED.panel, fill: MEASURED.fill })
    const was = paletteHex('slate-600')
    expect({ panel: ratio(was, panel), fill: ratio(was, fill) }).toEqual(MEASURED.wasBefore)
    expect(ratio(fill, panel)).toBe(1.22)
    expect(Math.min(MEASURED.panel, MEASURED.fill)).toBeGreaterThanOrEqual(3)
    expect(Math.max(MEASURED.wasBefore.panel, MEASURED.wasBefore.fill)).toBeLessThan(3)
  })

  // The group recesses as well as bordering. It has to sit *under* the range
  // band without being the range band: if the two ever met on one step the
  // calendar would lose the only thing marking a selected span, and if the
  // group went lighter than the panel it would read as raised rather than
  // inset. Derived from the ramp rather than by naming a step, so a future
  // palette move that collapsed them fails here.
  it('recesses the calendar below the panel without colliding with the range band', () => {
    const step = (c: string) => Number(c.match(/-(\d+)$/)![1])
    const fill = darkStep(token(CALENDAR_GROUND, 'bg'))
    expect(fill).toMatch(/^slate-/)
    expect(step(fill)).toBeGreaterThan(800) // darker than the slate-800 panel
    expect(fill).not.toBe(darkStep(token(DAY.range, 'bg')))
    // The light theme's well is the white the fields are, still apart from
    // its range band.
    expect(light(token(CALENDAR_GROUND, 'bg'))).not.toBe(light(token(DAY.range, 'bg')))
  })

  // Two segmented controls in one panel: the ranking direction, and the
  // calendar's hours. ACCENT.fill is the chosen half, this is the other one, and
  // naming the pair is what stops the second one being a lookalike that drifts.
  it('pairs the idle segment with the accent fill', () => {
    expect(darkStep(token(SEGMENT_IDLE, 'text'))).toBe('slate-400')
    expect(SEGMENT_IDLE).not.toBe(ACCENT.fill)
  })

  // Pointing at a control from across the screen is a ring, not a border or a
  // fill: it has to layer onto something that already has both. DAY.today is
  // the other one, and it wears slate because it labels a day rather than
  // acting on it — this one wears the resting accent because it is the app
  // answering a hover.
  it('points with a ring in the resting accent', () => {
    expect(darkStep(token(ACCENT_RING, 'ring'))).toBe('sky-400')
    expect(ACCENT_RING).not.toContain('border')
    expect(darkStep(token(DAY.today, 'ring'))).toBe('slate-400')
  })

  // The ring is a box-shadow and fades; a radius does not. Bundling one in here
  // squared the corners the instant the ring began fading, so the outline spent
  // the transition as a rectangle standing off a rounded field. The element
  // wearing this keeps its own radius at all times.
  it('leaves the radius to whatever wears the ring', () => {
    expect(ACCENT_RING).not.toContain(RADIUS.surface)
    expect(ACCENT_RING).not.toMatch(/\brounded\b/)
  })
})

describe('shared recipes', () => {
  it('grows the primary action for coarse pointers wherever it appears', () => {
    expect(BUTTON_PRIMARY).toContain('touch:')
    expect(FIELD).toContain(TEXT.control)
  })

  // Every recipe a person can hit. Listed by name rather than derived from the
  // module, because the interesting failure is a *new* recipe that forgot one,
  // and a new recipe has to be added here to be covered — which is the prompt.
  it.each([
    ['BUTTON_PRIMARY', BUTTON_PRIMARY],
    ['BUTTON_SECONDARY', BUTTON_SECONDARY],
    ['BUTTON_ACCENT', BUTTON_ACCENT],
    ['CHOICE_ROW', CHOICE_ROW],
    ['SEGMENT_ITEM', SEGMENT_ITEM],
    ['FIELD', FIELD],
    ['SELECT', SELECT],
    ['DRAW_ROW.secondary', DRAW_ROW.secondary],
    ['DRAW_ROW.accent', DRAW_ROW.accent],
    ['DAY.cell', DAY.cell],
  ])('%s is a tap target on a coarse pointer', (_name, recipe) => {
    expect(recipe).toContain('touch:')
  })

  // A badge is not a button. It takes the accent fill so it survives a reader
  // who skims eight rows of prose without reading any of them, and it must not
  // take the tap target that would make an unpressable word look pressable.
  it('marks a row with a fill rather than with more accent text', () => {
    expect(BADGE_ACCENT).toContain(ACCENT.fill)
    expect(BADGE_ACCENT).not.toContain(ACCENT.text)
    expect(BADGE_ACCENT).not.toContain('touch:')
    expect(BADGE_ACCENT).toContain(RADIUS.pill)
  })

  // Step number badge in the welcome modal: takes the accent fill for visibility
  // and fixed size/weight so every step reads the same.
  it('sizes step badges consistently with fixed type and fill', () => {
    expect(BADGE_STEP).toContain(ACCENT.fill)
    expect(BADGE_STEP).toContain('text-xs')
    expect(BADGE_STEP).toContain('font-bold')
  })

  // The model picker opened behind the drawer that contains it, because the two
  // z values were chosen in different files and never compared. This asserts the
  // stack reads in the order the names claim, so the next layer has to say where
  // it belongs rather than pick a number.
  it('orders the stacking layers the way their names read', () => {
    const depth = (v: string) => Number(v.replace(/^z-\[?|\]$/g, ''))
    const stack = [
      LAYER.base,
      LAYER.sheet,
      LAYER.mapControls,
      LAYER.overlay,
      LAYER.scrim,
      LAYER.drawer,
      LAYER.popover,
      LAYER.modal,
    ]
    const depths = stack.map(depth)
    expect(depths).toEqual([...depths].sort((a, b) => a - b))
    expect(new Set(depths).size).toBe(depths.length)
    // The two that caused the bug, stated outright rather than left to the sort.
    expect(depth(LAYER.popover)).toBeGreaterThan(depth(LAYER.drawer))
    expect(depth(LAYER.modal)).toBeGreaterThan(depth(LAYER.popover))
    // The sheet covers map chrome and is covered by the drawer's scrim: it sits
    // on the map, not in front of the app.
    expect(depth(LAYER.sheet)).toBeGreaterThan(depth(LAYER.base))
    expect(depth(LAYER.sheet)).toBeLessThan(depth(LAYER.scrim))
    // The Layers popover hangs down across the timeline, the legends and the
    // sheet, so its cluster clears all three — and still stops below the
    // overlay an analysis puts over the whole map.
    expect(depth(LAYER.mapControls)).toBeGreaterThan(depth(LAYER.sheet))
    expect(depth(LAYER.mapControls)).toBeLessThan(depth(LAYER.overlay))
  })

  // The map timeline's scrubber (#121). A real range input arrives knowing
  // arrow keys and screen readers, and arrives painting itself from the system
  // palette — dark-on-light inside a dark map card on a light-mode OS, the same
  // trap SELECT documents. Suppressing that is only half done unless both
  // vendor thumb spellings are covered: WebKit and Blink read one, Firefox the
  // other, and each ignores the one it does not own, so a single spelling ships
  // a control that looks native on half the machines it runs on.
  it('suppresses the platform slider on every engine that draws one', () => {
    expect(SCRUBBER).toContain('appearance-none')
    expect(SCRUBBER).toContain('[&::-webkit-slider-thumb]:[appearance:none]')
    expect(SCRUBBER).toContain('[&::-moz-range-thumb]:[appearance:none]')
  })

  it('gives the scrubber a keyboard-visible focus ring like every other control', () => {
    expect(SCRUBBER).toContain(FOCUS_RING)
  })

  // The coverage slider (#288) is the scrubber's argument a second time: a real
  // range input, both vendor thumb spellings, a visible focus ring. Its track
  // is drawn by the caller, so the input itself must be transparent full-bleed.
  it('builds the coverage slider like the scrubber, transparent over its own track', () => {
    expect(SLIDER.overlay).toContain('appearance-none')
    expect(SLIDER.overlay).toContain('[&::-webkit-slider-thumb]:[appearance:none]')
    expect(SLIDER.overlay).toContain('[&::-moz-range-thumb]:[appearance:none]')
    expect(SLIDER.overlay).toContain(FOCUS_RING)
    expect(SLIDER.overlay).toContain('bg-transparent')
    expect(SLIDER.overlay).toContain('absolute inset-0')
  })

  // The wordmark has no color of its own: its line renders twice, muted on the
  // well and white inside the accent fill, and a baked-in color would race the
  // layer's by stylesheet order.
  it('keeps the slider wordmark colorless so each layer supplies its own', () => {
    expect(SLIDER.wordmark).not.toMatch(/text-(slate|white)/)
  })

  // Both halves of the slider's one line are one size, and the wordmark is
  // sentence case like the segment above it (TJ, 2026-09-14). It carried
  // `TEXT.overline`'s 10px uppercase until then, which is the shape of a
  // heading over a group rather than a label inside a control — and it made
  // "COVERAGE" the one shouted word in the popover.
  it('sets the wordmark at the value size, in sentence case', () => {
    expect(SLIDER.wordmark).toContain(CONTROL_SIZE)
    expect(SLIDER.value).toContain(CONTROL_SIZE)
    expect(SLIDER.wordmark).not.toMatch(/uppercase|tracking-/)
    // The weight is the only thing left separating a label from its value.
    expect(SLIDER.wordmark).toContain('font-semibold')
  })

  // The rail is a separate element rather than the input's own track
  // pseudo-element, because the filled portion has to be a third box on top of
  // it. What that must not become is a fourth spelling of the recessed well.
  it('builds the scrubber rail from the recessed surface every other well uses', () => {
    expect(SLIDER.track).toContain(RECESSED_FILL)
    expect(SLIDER.track).toContain(RECESSED_EDGE)
    expect(SLIDER.track).toContain(RADIUS.pill)
  })

  // The coverage slider's well is the same recessed surface at the segment's
  // corner, so the Blocks/Smooth segment above it and the well read as one
  // pair of controls.
  it("builds the coverage slider's well from the same surface at the segment's corner", () => {
    expect(SLIDER.well).toBe(`${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.control}`)
    expect(SEGMENT_FLUID).toContain(RADIUS.control)
  })

  // The timeline's axis halves are the one segment whose labels the design
  // system does not choose: the right one is the ranked metric's noun, and the
  // longest of them read as too wide for the half at the panel's inset. One
  // step more, the nowrap and the floor below, and only those: everything else
  // is the same half, so the bar cannot become a second kind of segment.
  it('gives the timeline axis halves room for a metric noun', () => {
    expect(TRANSPORT_AXIS_ITEM).toMatch(/(^|\s)px-3(\s|$)/)
    expect(SEGMENT_ITEM).toMatch(/(^|\s)px-1(\s|$)/)
    const shared = TRANSPORT_AXIS_ITEM.replace('px-3', 'px-1')
      .replace('flex-none', 'flex-1')
      .replace(TRANSPORT_AXIS_W, '')
      .replace(['whitespace', 'nowrap'].join('-'), '')
      .replace(/\s+/g, ' ')
      .trim()
    expect(shared).toBe(SEGMENT_ITEM)
  })

  // A metric noun is a phrase as readily as a word, and a phrase wraps: at the
  // old recipe `Freezing level` broke over two lines and made the whole bar
  // taller than the strings in it. The half holds one line and takes the width
  // that line needs.
  it('keeps an axis half on one line', () => {
    // Spelled from parts: v4 scans this file as raw text and would compile the
    // class for any utility quoted here.
    expect(TRANSPORT_AXIS_ITEM).toContain(['whitespace', 'nowrap'].join('-'))
  })

  // What a half may not do is shrink under `Radar` when the metric is short,
  // which is what sizing to the label alone would have done to `AQI`. The
  // floor is Radar's own width, and both halves wear it, so the pair reads as
  // one control rather than as a wide half beside a runt.
  //
  // The second spelling is the load-bearing one. `TAP.action` carries a
  // `touch:` min-width for the buttons that have no width of their own, v4
  // resolves competing utilities by stylesheet order, and the variant's rule
  // is the later one — so a plain `min-w` alone would lose on a coarse pointer
  // and the floor would drop to the tap target, which is under Radar.
  // A half takes the width its own label needs: the panel's `flex-1` split the
  // segment evenly, which is a box sized to the longer label twice over, and
  // under the floor below it squeezed the longer label instead (an explicit
  // min-width replaces the content floor a flex item has by default).
  it('sizes each axis half to its own label', () => {
    expect(TRANSPORT_AXIS_ITEM).toMatch(/(^|\s)flex-none(\s|$)/)
    expect(SEGMENT_ITEM).toMatch(/(^|\s)flex-1(\s|$)/)
  })

  it('floors an axis half at the width Radar takes', () => {
    // `Radar` at text-xs: 33.02px in Chrome on macOS, 2026-09-14, plus the
    // half's two insets and the pixel the divider takes.
    const RADAR_PX = 34
    const floors = [...TRANSPORT_AXIS_W.matchAll(/min-w-\[(\d+)px\]/g)].map((m) => Number(m[1]))
    const insetPx = stepPx(TRANSPORT_AXIS_ITEM, 'px')
    const tapPx = Number(TAP.action.match(/touch:min-w-(\d+)/)![1]) * 4

    expect(floors[0]).toBeGreaterThanOrEqual(RADAR_PX + 2 * insetPx)
    // One number, under both pointers, and the coarse one still clears the tap
    // target it is overriding.
    expect(floors).toHaveLength(2)
    expect(new Set(floors).size).toBe(1)
    expect(TRANSPORT_AXIS_W).toContain(`touch:min-w-[${floors[0]}px]`)
    expect(floors[0]).toBeGreaterThanOrEqual(tapPx)
  })

  // The segmented control had been built twice from scratch and matched only by
  // luck. Its colors were already roles; its box was not, which is why the two
  // copies could have carried different padding and nothing would have noticed.
  it('builds a segmented control from one box and one pair of colors', () => {
    expect(SEGMENT).toContain(RADIUS.control)
    expect(SEGMENT_ITEM).not.toMatch(/(^|\s)(bg|text)-(sky|slate)-/)
  })

  // Sized to their text, the panel's segments did not line up: Current/Dates
  // measured 111px against Lowest/Highest at 119px, with halves of 59/50 and
  // 56/61, and stacked in one card that read as three controls that failed to
  // agree. The box carries a width and the halves split it, so a segment added
  // later is the same size as the others without anyone remembering to make it
  // so — which is the whole difference between a role and a convention.
  it('gives every segment one width and every half an equal share of it', () => {
    expect(SEGMENT).toMatch(/(^|\s)w-\S+/)
    expect(SEGMENT_ITEM).toMatch(/(^|\s)flex-1(\s|$)/)
  })

  // The radio and its label are one strip, and the strip is the target. Move
  // the size onto the input and it draws a bigger checkbox rather than a
  // bigger place to hit one.
  it('puts the choice target on the row, not on the box', () => {
    expect(CHOICE_ROW).toContain(TAP.row)
    expect(CHOICE_INPUT).not.toContain('touch:')
  })

  // Placeholders are content, held to the same 4.5:1 as the text typed over
  // them. slate-400 is 7.0:1 on the field surface; the slate-600 the call
  // sites had drifted into read at 2.4:1, and the color lives in the recipe
  // because a call site cannot override it anyway.
  it('keeps every field placeholder legible', () => {
    expect(darkStep(token(FIELD, 'placeholder'))).toBe('slate-400')
  })

  // A dropdown is a field with two additions, not a second field. Built from
  // FIELD so the two cannot drift into different surfaces, borders or focus
  // rings the way the segmented control's two hand-built copies once could.
  it('builds the dropdown out of the field rather than beside it', () => {
    expect(SELECT).toContain(FIELD)
  })

  // The native control paints its own chrome from the SYSTEM palette, so on a
  // light-mode OS it renders dark-on-light inside a dark panel. Suppressing it
  // is what makes the arrow ours, and reserving the arrow's room is what stops
  // a long model name running underneath it.
  it('suppresses the platform chrome and keeps room for the arrow it replaces', () => {
    expect(SELECT).toContain('appearance-none')
    // Exactly the arrow's own box: ICON_ADORNMENT puts a 16px glyph 8px from
    // the edge, so it ends 24px in and a label may run to that line. More than
    // that is room taken from every label in the app; less runs under the mark.
    const reserve = (Number(SELECT.match(/pr-(\d+)/)![1]) / 4) * 16
    const offset = (Number(ICON_ADORNMENT.match(/right-(\d+)/)![1]) / 4) * 16
    expect(reserve).toBe(offset + ICON_PX)
  })

  // The disabled look is one role, not a pair of utilities re-spelled per call
  // site, which is what it was in four places before the model picker needed a
  // fifth (#123). It carries no color of its own, so it composes over any button
  // or field role without racing that role's color by stylesheet order.
  it('states the disabled look once, and in no colour of its own', () => {
    expect(DISABLED).toContain('disabled:opacity-40')
    expect(DISABLED).toContain('disabled:cursor-not-allowed')
    expect(DISABLED).not.toMatch(/text-|bg-|border-/)
  })

  // An inert link is the disabled look on the aria variant, and nothing else:
  // the same opacity and cursor, so a waiting link and a disabled button are
  // one state to the eye.
  it('says an inert link the way it says a disabled button', () => {
    expect([...STYLES.LINK_INERT.split(' ')].sort()).toEqual(
      [...DISABLED.split(' ').map((c) => c.replace('disabled:', 'aria-disabled:'))].sort(),
    )
  })

  // The other half of that pair, and the reason it cannot BE that pair: a
  // muted control still works, so the cursor must not promise it does not, and
  // the `disabled:` variant would never fire on an element that is not
  // disabled. Louder than off and quieter than in force, which is the whole
  // claim. Colourless for the same reason DISABLED is.
  it('quiets a control that still works, without the disabled claim', () => {
    expect(MUTED).toBe('opacity-(--ui-muted)')
    expect(MUTED).not.toContain('cursor')
    expect(MUTED).not.toContain('disabled:')
    expect(MUTED).not.toMatch(/text-|bg-|border-/)
  })

  // WCAG exempts only inactive controls from 1.4.3, and a muted control still
  // works, so its text owes 4.5:1. The slate-200 label composited at the
  // role's opacity, measured on each surface it lands on: the panel (Include
  // unnamed peaks), an idle metric row's select (the row fades as a whole, so
  // the select's fill fades over the panel with its label), and an unplotted
  // chart chip (the panel at 50% over the page at 50% over the panel, the
  // label alone faded). 50% failed two of the three, which is what axe found
  // in the browser suite.
  it('keeps a muted label above the text floor on every surface it fades on', () => {
    const MEASURED = {
      at60: { panel: 5.26, select: 5.98, chip: 5.41 },
      at50: { panel: 4.14, select: 4.61, chip: 4.23 },
    }
    const [panel, ink, fill] = [dark('panel'), dark(token(TEXT.control, 'text')), dark(token(SELECT, 'bg'))]
    const chip = over(panel, 0.5, over(dark('page'), 0.5, panel))
    const at = (a: number) => ({
      panel: ratio(over(ink, a, panel), panel),
      select: ratio(over(ink, a, panel), over(fill, a, panel)),
      chip: ratio(over(ink, a, chip), chip),
    })
    expect(at(0.6)).toEqual(MEASURED.at60)
    expect(at(0.5)).toEqual(MEASURED.at50)
    expect(MUTED).toBe('opacity-(--ui-muted)')
    expect(DARK_TOKENS.muted).toBe('0.6')
    expect(Math.min(...Object.values(MEASURED.at60))).toBeGreaterThanOrEqual(4.5)
    expect(Math.min(...Object.values(MEASURED.at50))).toBeLessThan(4.5)
    // Louder than off, still, in both themes: the whole claim that separates
    // it from DISABLED. The light theme's step is measured in its own block.
    const off = Number(DISABLED.match(/opacity-(\d+)/)![1]) / 100
    for (const fade of [DARK_TOKENS.muted, LIGHT_TOKENS.muted]) expect(Number(fade)).toBeGreaterThan(off)
  })

  // The third fade, and the one that reads as neither of the two above: a
  // column being dragged is not off and it is not out of force, it is simply
  // somewhere else for a moment. It borrows DISABLED's 40 percent because the
  // ghost under the pointer is what the reader is looking at, and deliberately
  // none of that role's cursor: the column still sorts the instant the drag
  // ends. Two surfaces drew the literal before it had a name (#437).
  it('fades a carried column without the disabled claim either', () => {
    expect(DRAG.carried).toBe('opacity-40')
    expect(DRAG.carried).toBe(DISABLED.replace(/disabled:/g, '').split(' ')[0])
    expect(DRAG.carried).not.toContain('cursor')
    expect(DRAG.carried).not.toContain('disabled:')
    expect(DRAG.carried).not.toMatch(/text-|bg-|border-/)
  })

  // The three weights of rule, in order. PANEL_EDGE is the only one that is
  // meant to be seen as a boundary (3.07:1 on the panel); the other two are
  // one quiet line at 1.41, and differ only in whether the stack or the call
  // site decides where it is drawn. SURFACE_DIVIDER carries no side, no width
  // and no spacing, so it composes into either.
  it('keeps the divider a colour and the panel rule a recipe', () => {
    expect(darkStep(token(SURFACE_DIVIDER, 'border'))).toBe('slate-700')
    expect(SURFACE_DIVIDER.split(' ')).toHaveLength(1)
    expect(darkStep(token(PANEL_EDGE, 'border'))).toBe('slate-500')
    expect(PANEL_EDGE.split(' ')).toHaveLength(1)
    expect(PANEL_RULE).toContain('[&>*+*]:border-t')
  })

  // Since #687 the panel's rule draws the divider's colour rather than
  // half-opacity slate-600, which composited to 1.37:1 beside the divider's
  // 1.41: the same line by eye, so it is the same line. Spelled under the
  // stack's variant because Tailwind cannot compile an interpolated one, and
  // held to the divider here.
  it('draws the panel rule in the divider colour', () => {
    expect(PANEL_RULE).toContain(`[&>*+*]:${SURFACE_DIVIDER}`)
    expect(token(PANEL_RULE, '[&>*+*]:border')).toBe(token(SURFACE_DIVIDER, 'border'))
  })

  // The panel's controls share a left edge as well as a right one. The segment
  // is where the width comes from, so it composes the token rather than
  // spelling a width that the model picker and Max Results would then have to
  // match by hand.
  it('builds the segmented control on the shared control width', () => {
    expect(SEGMENT).toContain(CONTROL_W)
  })

  // The panel is ONE column now (TJ, 2026-09-14). The Forecast section's model
  // picker and its two segments stand on exactly the edges the Metrics bound
  // boxes do, which is what the control width is: the two box columns plus the
  // grid gap between them. Derived rather than restated, so moving a box moves
  // the Forecast controls with it or fails here.
  it('measures the control column as the Metrics box pair', () => {
    expect(controlWPx()).toBe(metricPairPx())
  })

  // What that column costs the model picker, which is the control it binds.
  // The trigger spends 8px of left padding, SELECT's arrow reserve, and its
  // 2px border; the rest is label. The longest model label must fit, or the
  // one control whose job is telling eight similar things apart truncates.
  // Measured in Chrome on macOS at the panel's text-xs, 2026-09-14.
  it('leaves the model picker room for its longest label', () => {
    // `UK Met Office`: 79.69px. `Meteo-France ARPEGE` is 130.03px and fits no
    // trigger the panel can offer — it truncated at the old 144px too, and
    // shortening it is the maintainer's call, not this file's.
    const UK_MET_OFFICE_PX = 80
    expect(controlWPx() - 8 - selectArrowPx() - 2).toBeGreaterThanOrEqual(UK_MET_OFFICE_PX)
  })

  // The chart's metric select is the one control that borrowed CONTROL_W from
  // outside the panel, and it cannot follow it down: it lines up with nothing
  // above it, and its labels carry their units, where the panel column would
  // leave 84px.
  it('keeps the chart metric select off the panel column', () => {
    // `Precipitation (in/hr)`, the widest option (record 0222), measured
    // 109.03px; held with 8px to spare, about the margin it had at 144px.
    const WIDEST_OPTION_PX = 109.03
    const chartPx = stepPx(CHART_METRIC_W, 'w')
    expect(chartPx - 8 - selectArrowPx() - 2 - WIDEST_OPTION_PX).toBeGreaterThanOrEqual(8)
  })

  // The Metrics grid (#341) sizes no control itself: its three control columns
  // are `auto`, so the dropdown and the boxes are as wide as the roles they
  // wear and nothing else. A rem in the template would be a second copy of
  // METRIC_BOX_W or SELECT_W_AGGREGATE, and two spellings of one width drift
  // apart the moment either moves.
  it('sizes the Metrics grid columns by their controls, not by the grid', () => {
    const template = METRICS_GRID.match(/grid-cols-\[([^\]]+)\]/)![1]
    expect(template.split('_')).toEqual(['minmax(0,1fr)', 'auto', 'auto', 'auto'])
    expect(METRICS_GRID).not.toMatch(/\drem/)
  })

  // The metric row is the panel's widest, and the label pays for everything
  // else in it: radio (14px) + label gap (10px) + the grid's three gap-1.5
  // gaps (18px) + the dropdown + two boxes must leave `Freezing level` its
  // measured width at text-xs, inside the panel's measured 327px of content.
  // The old Ranking row budgeted for "Precipitation" (72px) and shipped
  // `Freezing le…` when the longer noun arrived, so the noun is named here.
  // The dropdown's other bound is its content: the widest aggregate word
  // (28px) plus the field's 8px left padding plus whatever the SELECT recipe
  // reserves for its arrow. Measured in the running app (2026-08-22 and
  // 2026-09-14); re-measure before moving either width, the gap, or the nouns.
  it('leaves the metric label room for its longest noun', () => {
    // `Freezing level` at text-xs: 78.03px in Chrome on macOS, 2026-09-14.
    const FREEZING_LEVEL_PX = 79
    const rem = Number(SELECT_W_AGGREGATE.match(/\[(\d+(?:\.\d+)?)rem\]/)![1])
    const dropdownPx = rem * 16
    const boxPx = (Number(METRIC_BOX_W.match(/-(\d+)$/)![1]) / 4) * 16
    const gapPx = (Number(METRICS_GRID.match(/gap-x-([\d.]+)/)![1]) / 4) * 16
    // The body reserves the shared bar's width whether or not it shows
    // (`PANEL_BODY`), so the budget is done at the narrower width: 327px of
    // content less the 10px Chromium draws for `scrollbar-width: thin`
    // (measured 2026-10-13; the browser's own bar was 15px).
    const SHARED_BAR_PX = 10
    expect(PANEL_BODY).toContain('[scrollbar-gutter:stable]')
    const labelPx = 327 - SHARED_BAR_PX - 14 - 10 - 3 * gapPx - dropdownPx - 2 * boxPx

    expect(labelPx).toBeGreaterThanOrEqual(FREEZING_LEVEL_PX)
    expect(dropdownPx).toBeGreaterThanOrEqual(28 + 8 + selectArrowPx())
  })

  // The Metrics direction segment is the section's one control that is not a
  // box, and it still shares the boxes' two edges: it spans the two box
  // columns, so it wears the fill variant rather than SEGMENT's CONTROL_W.
  // A CONTROL_W segment there hung 26px past the boxes on the left, which is
  // what the maintainer sent the first build back for (2026-09-14).
  it('sizes the fill segment by its container, never by the panel column', () => {
    expect(SEGMENT_FILL).toContain('w-full')
    expect(SEGMENT_FILL).not.toContain(CONTROL_W)
  })

  // What the column costs a segment half. Every segment in the panel is the
  // control width now, less the 2px border and the 1px divider, split in two.
  // The widest word in any of them must clear both insets inside that half.
  // An 8px inset leaves 41.5px, which two of the four words overrun, and that
  // is why there is one inset here rather than the panel's usual. Measured in
  // Chrome on macOS, 2026-09-14; re-measure before moving the column, the
  // inset, or the words.
  it('leaves every segment half room for its longest word', () => {
    // At text-xs: `Highest` 43.69px, `Current` 42.89px, `All day` 37.80px,
    // `Lowest` 39.88px, `Dates` 32.75px, `Hourly` 37.13px.
    const HIGHEST_PX = 44
    const insetPx = stepPx(SEGMENT_ITEM, 'px')
    const halfPx = (controlWPx() - 2 - 1) / 2

    expect(halfPx - 2 * insetPx).toBeGreaterThanOrEqual(HIGHEST_PX)
    expect(insetPx).toBeLessThan(8)
  })

  // The section's one deliberate break: space above the box headings, telling
  // the two controls that order the list from the table of bounds below. It is
  // padding on EVERY cell of that row, because the columns are grid tracks and
  // a margin on one item would shift that item alone. Named in styles.ts
  // because it is the only vertical space in the grid that `gap-y` does not
  // set.
  it('spaces the Metrics headings off the controls above them', () => {
    expect(METRIC_HEAD_GAP).toMatch(/^pt-[\d.]+$/)
  })

  // A numeric field is a field with the spinner arrows taken off, not a second
  // field, for the same reason the dropdown is built from FIELD.
  it('builds the numeric field out of the field rather than beside it', () => {
    expect(FIELD_NUMERIC).toContain(FIELD)
  })

  // Every control that can be focused by keyboard should show a visible focus
  // ring. FOCUS_RING fires on focus-visible, not on pointer focus, so mouse
  // users see no change while keyboard users get a clear outline.
  it.each([
    ['BUTTON_PRIMARY', BUTTON_PRIMARY],
    ['BUTTON_SECONDARY', BUTTON_SECONDARY],
    ['BUTTON_ACCENT', BUTTON_ACCENT],
    ['BUTTON_FLOATING', BUTTON_FLOATING],
    ['SEGMENT_ITEM', SEGMENT_ITEM],
    ['ICON_BUTTON', ICON_BUTTON],
    ['CHIP.label', CHIP.label],
    ['CHIP.remove', CHIP.remove],
  ])('%s composes the keyboard focus ring', (_name, recipe) => {
    expect(recipe).toContain(FOCUS_RING)
  })

  // CHOICE_ROW wraps a native checkbox/radio, so focus lands on the input
  // rather than on the row itself: it carries FOCUS_RING's exact recipe under
  // the has-[:focus-visible] variant, lighting the whole strip when its input
  // has keyboard focus. Derived from FOCUS_RING rather than restated, so the
  // two cannot drift apart — change the ring and this fails until the row's
  // hand-spelled copy follows (a variant cannot be composed at runtime because
  // Tailwind only generates CSS for class names it can read in the source).
  it('gives choice rows the focus ring through the has-[:focus-visible] variant', () => {
    const rowRing = FOCUS_RING.replace(/focus-visible:/g, 'has-[:focus-visible]:')
    expect(CHOICE_ROW).toContain(rowRing)
  })

  // The table header's ring is FOCUS_RING moved inside the edge and nothing
  // else, derived rather than restated so a new colour or width reaches both.
  // The ratios are sky-400 on what the ring can stand on, from Tailwind v4's
  // oklch steps: the header bar it is drawn on, and the two surfaces an outer
  // ring would have reached (the sheet, and a hovered row over it).
  it('draws the header ring inside the edge, on a bar it clears', () => {
    expect(FOCUS_RING_INSET).toBe(FOCUS_RING.replace('outline-offset-2', '-outline-offset-2'))
    const MEASURED = { headerBar: 4.75, sheet: 6.71, hoveredRow: 6.1 }
    const ring = dark(token(FOCUS_RING_INSET, 'focus-visible:outline'))
    const sheet = dark(token(SURFACE_SHEET, 'bg'))
    const grounds = {
      headerBar: dark(token(STYLES.TABLE.stickyNameHead, 'bg')),
      sheet,
      hoveredRow: over(dark(token(STYLES.TABLE.row, 'hover:bg')), alphaOf(STYLES.TABLE.row, 'hover:bg'), sheet),
    }
    for (const [ground, hex] of Object.entries(grounds)) {
      expect(ratio(ring, hex), ground).toBe(MEASURED[ground as keyof typeof MEASURED])
    }
    for (const [ground, r] of Object.entries(MEASURED)) {
      expect(r, `the ring on ${ground} must clear the 3:1 asked of a focus indicator`).toBeGreaterThanOrEqual(3)
    }
  })

  // Every message under the Analyze button is a NOTICE box wearing a STATUS
  // colour, so the two records have to offer the same severities. A hue in one
  // and not the other is a message that either has no box or no colour, which
  // is exactly the state the footer was in before this: an amber cue with no
  // box beside an amber box.
  it('gives every notice severity a matching status colour', () => {
    for (const severity of Object.keys(NOTICE)) {
      expect(STATUS, `STATUS has no ${severity}`).toHaveProperty(severity)
    }
  })

  // NOTICE sets a size and no colour, STATUS a colour and no size, which is
  // what lets the two compose rather than race by stylesheet order.
  it('keeps size and colour on opposite halves of a notice', () => {
    for (const recipe of Object.values(NOTICE)) expect(sizes(recipe)).toContain('text-xs')
    for (const recipe of Object.values(STATUS)) expect(sizes(recipe)).toEqual([])
  })

  // Three rules, none redundant: Firefox reads the appearance property, WebKit
  // and Blink read the two pseudo-elements. Dropping any one leaves the arrows
  // on somewhere, and the filters grid (#115) budgets its column widths on
  // their absence — a row that regains them wraps its label onto two lines.
  it('suppresses the spinner arrows in every engine that draws them', () => {
    expect(FIELD_NUMERIC).toContain('[appearance:textfield]')
    expect(FIELD_NUMERIC).toContain('outer-spin-button')
    expect(FIELD_NUMERIC).toContain('inner-spin-button')
  })

  // The arrow sits over the control it decorates. Without this the one place a
  // user aims for is the one place that does not open the dropdown.
  it('lets clicks through the glyph drawn over a control', () => {
    expect(ICON_ADORNMENT).toContain('pointer-events-none')
  })

  // The ramp every glyph in `components/icons.tsx` reads (#386). Pinned step by
  // step, because that module is now the only thing standing between these four
  // numbers and the nineteen call sites that used to pick their own: a step
  // that moves here moves an icon on screen.
  it('sizes every glyph from one ramp', () => {
    expect(stepPx(ICON.control, 'h')).toBe(16)
    expect(stepPx(ICON.inline, 'h')).toBe(14)
    expect(stepPx(ICON.chip, 'h')).toBe(12)
    expect(stepPx(ICON.micro, 'h')).toBe(10)
  })

  // The set as well as the values (#436). Every step above carries a measured
  // reason in its comment, so a fifth one arriving without one is the failure
  // this catches — and `stepPx` reads Tailwind's scale alone, so a step spelled
  // in arbitrary pixels throws here rather than passing quietly.
  it('keeps the ramp to the four steps that have a reason', () => {
    expect(Object.keys(ICON)).toEqual(['control', 'inline', 'chip', 'micro'])
  })

  // A glyph's box is its own viewBox, which is square in every icon the app
  // draws. A step that set one dimension would stretch the drawing rather than
  // resize it.
  it('keeps every step of that ramp square', () => {
    for (const [step, recipe] of Object.entries(ICON)) {
      expect(stepPx(recipe, 'w'), `${step} must be square`).toBe(stepPx(recipe, 'h'))
    }
  })

  // The one glyph the ramp cannot reach (#435). A map popup is an HTML string
  // handed to MapLibre's setHTML, and Tailwind generates CSS for class names it
  // finds in source, so the popup's copy of the link-out arrow has to carry a
  // number. This is what keeps that number the ramp's.
  it('draws the popup glyph at the step its React twin takes', () => {
    expect(EXTERNAL_LINK_PX).toBe(stepPx(ICON.inline, 'h'))
  })

  // Every floating box on the map is one surface: the search field and its
  // dropdown, the Controls button, both legends, the chart tooltip. The
  // legends used to run a darker fill and border, so the map carried two ideas
  // of "floating box" a few hundred pixels apart.
  it('builds both surfaces and both buttons on the radius scale', () => {
    for (const recipe of [SURFACE_FLOATING, SURFACE_CARD, BUTTON_PRIMARY]) {
      expect(recipe).toContain(RADIUS.surface)
    }
    expect(FIELD).toContain(RADIUS.control)
  })

  // The phone results sheet (#249). It is the docked panel's own fill so the
  // results do not change colour with the breakpoint, it takes the map's
  // floating edge because it now stands on the map, and it rounds the surface
  // step on its top corners only — the bottom pair are off the screen. The
  // radius is asserted against `RADIUS.surface` rather than spelled, so a move
  // on that scale carries the sheet with it. (Composed from the scale rather
  // than quoted: a `rounded-t-*` literal in this file would emit that CSS.)
  it('builds the phone sheet from the panel fill and the map edge', () => {
    expect(darkStep(token(SURFACE_SHEET, 'bg'))).toBe('slate-800')
    expect(darkStep(token(SURFACE_SHEET, 'border'))).toBe('slate-600')
    expect(SURFACE_SHEET).toContain(RADIUS.surface.replace('rounded', 'rounded-t'))
    // The header bar inside is a square block, so the corners only exist while
    // the sheet clips them.
    expect(SURFACE_SHEET).toContain('overflow-hidden')
    // Downward shadows have nothing to fall on under a bottom sheet, so it
    // stands at the docked step of the elevation scale.
    expect(SURFACE_SHEET).toContain(ELEVATION.none)
    expect(SURFACE_SHEET.match(/\bshadow-\S+/g)).toEqual([ELEVATION.none])
  })

  // The legend card is one fixed width and the Layers menu its content's
  // (#714, record 0174, amended 2026-10-29). Measured in the browser suite's
  // Chromium: the fire activity key's one line is the legend's widest, 169.4px
  // of content with 16px stars (2026-10-29), ahead of the grid's wait line at
  // 156.8; the
  // Layers menu came to 128.7px with its widest row, `Forecast player`, and
  // the coverage slider's line, `100 km` and `Coverage`, is 39.4 + 54.7px with
  // its own 8px of padding either side (2026-10-29).
  it('gives the legend card its width and the Layers menu its content\'s', () => {
    const MEASURED = { fireKey: 169.4, waitLine: 156.8, layersMenu: 128.7, sliderLine: 16 + 39.4 + 54.7 }
    const pad = 2 * stepPx(MAP_CHIP_MENU, 'px')
    expect(CHIP_CARD_W.key).toBe('w-56')
    expect(stepPx(CHIP_CARD_W.key, 'w')).toBeGreaterThanOrEqual(Math.max(MEASURED.fireKey, MEASURED.waitLine) + pad)
    // As wide as its widest row and never narrower than its chip.
    expect(CHIP_CARD_W.menu).toBe('w-max min-w-full')
    expect(MEASURED.layersMenu).toBeLessThan(stepPx(CHIP_CARD_W.key, 'w'))
    // The slider's line lies over its input and cannot size the menu, so the
    // well holds it, with room between the value and the wordmark.
    expect(stepPx(SLIDER.fit, 'min-w') - MEASURED.sliderLine).toBeGreaterThanOrEqual(8)
    expect(MAP_CHIP_MENU).not.toMatch(/(^|\s)w-/)
    expect(layersPopoverSource).toContain('${MAP_CHIP_MENU} ${CHIP_CARD_W.menu}')
    expect(layersPopoverSource).toContain('${SLIDER.well} ${SLIDER.fit}')
    expect(mapLegendSource).toContain('${MAP_CHIP_MENU} ${CHIP_CARD_W.key}')
  })

  // The floating button is the skip link's now, at the control size the map
  // column was set in (TJ, 2026-09-14): a 14px label beside 12px controls
  // read as a different kind of object rather than as a louder one.
  it('sets the floating button at the control size', () => {
    expect(sizes(BUTTON_FLOATING)).toEqual([CONTROL_SIZE])
    expect(sizes(BUTTON_FLOATING)).toEqual(sizes(TEXT.control))
    // Colorless on purpose: the label is white, and a second color utility
    // beside `TEXT.control`'s slate-200 would resolve by stylesheet order.
    expect(darkStep(token(BUTTON_FLOATING, 'text'))).toBe('white')
    expect(BUTTON_FLOATING).not.toContain(TEXT.cta)
  })

  // The search results moved onto the popover's fill, which is a step lighter
  // than the surface the caption tier was derived against.
  it('lifts the search results and the caption inside them together', () => {
    // slate-400 is 3.94:1 on that fill, under the 4.5:1 AA asks of text.
    // The results bar is the same slate-700, and its window caption measured
    // 3.93:1 on the caption tier; slate-300 is 6.97:1 there.
    expect(darkStep(token(CAPTION_LIFTED, 'text'))).not.toBe('slate-400')
    expect(sizes(CAPTION_LIFTED)).toEqual(sizes(TEXT.caption))
  })

  // A result's kind is the lifted caption, ink and size alike, set at the
  // heading weight so it reads apart from the name beside it (record 0222).
  it('sets a search result\'s kind in the lifted caption at the heading weight', () => {
    expect(SEARCH_KIND.split(' ').filter((c) => c !== 'font-semibold').join(' ')).toBe(CAPTION_LIFTED)
    expect(SEARCH_KIND.split(' ')).toContain('font-semibold')
    expect(TEXT.subheading.split(' ')).toContain('font-semibold')
  })

  // The search results list stands on the one menu card (record 0201), the
  // card the pill drops it onto lifted by the overlay shadow over the pill's
  // raised one.
  it('stands the search results on the menu card', () => {
    expect(searchBoxSource).toContain('const DROPDOWN = `${SURFACE_CHIP_CARD.menu} ')
    expect(SURFACE_CHIP_CARD.menu).toContain(ELEVATION.overlay)
    expect(SURFACE_FLOATING).not.toContain(ELEVATION.overlay)
  })

  // A desk chip's two cards are twins (#714; record 0174): one fill, the
  // chips' own, and one edge, the structural one, with only the shadow
  // telling the menu that opens across the legend from the legend under it
  // (TJ, 2026-10-18).
  it("gives a desk chip's two cards one surface and parts them by shadow", () => {
    const { key, menu } = SURFACE_CHIP_CARD
    expect(token(key, 'bg')).toBe(token(menu, 'bg'))
    expect(token(key, 'bg')).toBe(token(MAP_CHIP, 'bg'))
    // Opaque, every menu and both chip cards (TJ, 2026-10-20, record 0201):
    // under the calendar the frosted fill let the Analyze button show
    // through. Nothing is seen through them, so they carry no blur, where the
    // chips themselves stay frosted.
    for (const card of [key, menu]) {
      expect(card.split(' ')).toContain(`bg-${token(MAP_CHIP, 'bg')}`)
      expect(card).not.toMatch(/(^|\s)bg-\S+\/\d+/)
      expect(card).not.toContain('backdrop-blur')
    }
    expect(MAP_CHIP.split(' ')).toContain(`bg-${token(MAP_CHIP, 'bg')}/95`)
    expect(MAP_CHIP).toContain('backdrop-blur-sm')
    expect(token(key, 'border')).toBe(token(menu, 'border'))
    expect(`border-${token(menu, 'border')}`).toBe(PANEL_EDGE)
    for (const card of [key, menu]) expect(card).toContain(RADIUS.surface)
    expect(key).toContain(ELEVATION.raised)
    expect(menu).toContain(ELEVATION.overlay)
    expect(key.replace(ELEVATION.raised, ELEVATION.overlay)).toBe(menu)
  })

  // Where the menu opens across the legend card, its outline is the boundary
  // between them. Measured 2026-10-18 on the v4 oklch steps: slate-500 on the
  // slate-800 card, where the frame both cards wore before read 1.93:1. The
  // light theme's pair is measured in its own suite below. Re-measured
  // 2026-10-20 on the opaque card (record 0201): 3.07:1 again, and now the
  // ratio a reader sees, where the 95% fill let the map under it move it.
  it("draws a desk chip card's outline past 3:1 on the card it overlaps", () => {
    const MEASURED = { dark: 3.07, frameWas: 1.93 }
    expect(darkStep(token(SURFACE_CHIP_CARD.menu, 'border'))).toBe('slate-500')
    expect(darkStep(token(SURFACE_CHIP_CARD.key, 'bg'))).toBe('slate-800')
    const card = dark(token(SURFACE_CHIP_CARD.key, 'bg'))
    expect({
      dark: ratio(dark(token(SURFACE_CHIP_CARD.menu, 'border')), card),
      frameWas: ratio(dark('frame'), card),
    }).toEqual(MEASURED)
    expect(MEASURED.dark).toBeGreaterThanOrEqual(3)
    expect(MEASURED.frameWas).toBeLessThan(3)
  })

  // Sky at rest means "this acts here". Anything that leaves for someone
  // else's site rests in slate and only reaches for sky on hover, which is what
  // keeps the accent meaning one thing.
  it('reserves the resting accent for links that act in the app', () => {
    expect(darkStep(token(LINK_ACTION, 'text'))).toBe('sky-400')
    expect(darkStep(token(LINK, 'text'))).toMatch(/^slate-/)
    expect(darkStep(token(LINK, 'hover:text'))).toBe('sky-400')
    expect(token(LINK, 'hover:text')).toBe(token(LINK_ACTION, 'text'))
  })

  // A data credit is a link inside an 11px caption, so it wears
  // both roles at once. Two color utilities in one class list are decided by
  // stylesheet order, not by the order they were written, so composing them is
  // only safe while they agree. If one moves, the other has to move with it.
  it('lets a link and the micro step be worn together', () => {
    expect(token(LINK, 'text')).toBe(token(TEXT.micro, 'text'))
  })

  // The two secondary actions had been a filled button in the panel and an
  // outlined one on the overlay, same size and padding, same background.
  it('builds the secondary action from the ramp and the radius scale', () => {
    expect(BUTTON_SECONDARY).toContain(TEXT.control)
    expect(BUTTON_SECONDARY).toContain(RADIUS.control)
  })
})

// WCAG 2.2 gives two numbers: SC 2.5.8 (AA) wants 24x24 CSS px, SC 2.5.5 (AAA)
// wants 44x44. The app draws a finger's controls 32 tall (record 0223), presses
// 44 only in a band with nothing above or below, and holds the 24 floor inside
// the results grid, where taller rows would cost more ranking than the reach is
// worth. What these guard is that the two numbers
// stay two numbers rather than becoming a spectrum.
describe('tap targets', () => {
  const px = (recipe: string, axis: 'h' | 'w') => {
    const step = recipe.match(new RegExp(`min-${axis}-(\\d+)|(?<![-\\w])${axis}-(\\d+)`))

    return step ? Number(step[1] ?? step[2]) * 4 : null
  }

  // 32px on a finger, past AA's 24 and under the enhanced 44 (record 0223):
  // a stack of rows presses what it draws.
  it.each(['action', 'row', 'height'] as const)(
    'TAP.%s draws and presses 32 on a finger',
    (key) => {
      expect(px(TAP[key], 'h')).toBe(32)
    },
  )

  // A band of chrome with no target above or below it still presses 44 around
  // a 32px control: the chips and the results bar's buttons, each by a
  // pseudo-element 6px over and under, which a clipping group would cut off.
  it('presses 44 around the chips and the results bar', () => {
    expect(BAR_PRESS).toContain("touch:before:content-['']")
    expect(BAR_PRESS).toMatch(/touch:before:-inset-y-1\.5(\s|$)/)
    expect(32 + 2 * 6).toBe(44)
    expect(ACTION_ITEM).toContain(BAR_PRESS)
    expect(ACTION_GROUP).toBe(BAR_GROUP)
    expect(BAR_GROUP).not.toContain('overflow-hidden')
    // The ends round themselves where the group no longer clips them: its 4px
    // less its 1px edge.
    expect(BAR_PRESS).toContain('first:rounded-l-[3px]')
    expect(BAR_PRESS).toContain('last:rounded-r-[3px]')
    expect(resultsBarSource.match(/\$\{SEGMENT_ITEM\} \$\{BAR_PRESS\}/g)).toHaveLength(3)
  })

  // A round or square button draws its own box, so `TAP.action`'s 44px width
  // would stretch it into a capsule or a bar: it stays as wide as it is tall.
  it('keeps a round or square button as wide as it is tall', () => {
    expect(HEADER_BUTTON).not.toContain(TAP.action)
    expect(HEADER_BUTTON).not.toContain('touch:')
    expect(px(HEADER_BUTTON, 'h')).toBe(32)
    expect(px(HEADER_BUTTON, 'w')).toBe(32)
    expect(TRANSPORT_PLAY).not.toContain('min-w')
    expect(TRANSPORT_PLAY.split(' ')).toEqual(expect.arrayContaining(['h-7', 'w-7', 'touch:h-8', 'touch:w-8']))
  })

  // Height on every key, width only where the control has none of its own. A
  // full-width row is already wider than any thumb; a bare `min-w` on one
  // would set a floor under a strip that never needed it.
  it('widens only the controls that have no width to lean on', () => {
    expect(px(TAP.action, 'w')).toBe(44)
    expect(px(TAP.row, 'w')).toBeNull()
    expect(px(TAP.height, 'w')).toBeNull()
  })

  // The results panel is read, not operated: its rows, its two header bars and
  // the search field all keep their density, because every pixel a control
  // takes there is a pixel of ranking or of map a phone stops showing. The
  // exception is the point, so it is asserted rather than left to the absence
  // of a class somewhere.
  it('leaves the icon button out of the rule on purpose', () => {
    expect(ICON_BUTTON).not.toContain('touch:')
    expect(ICON_BUTTON).not.toMatch(/\bmin-[hw]-/)
  })

  // A drag handle is a strip: only the vertical axis is scarce, and 44px of
  // slate between the chart and the table would cost more than the grab.
  it('takes the minimum, not the enhanced target, for a full-width handle', () => {
    expect(px(TAP.grip, 'h')).toBe(24)
    expect(TAP.grip).toContain('touch:')
  })

  // Three reach 32 by different display values because three kinds of control
  // lay their contents out differently. A single one would have been wrong for
  // two of them, so the keys are layouts, not sizes.
  it('gives each layout the display its contents need', () => {
    expect(TAP.action).toContain('flex items-center justify-center')
    // Left-aligned: centering a row would move the label away from its radio.
    expect(TAP.row).not.toContain('justify-center')
    // Bare, so it composes with the element's own layout.
    expect(TAP.height.trim().split(/\s+/)).toHaveLength(1)
  })
})

describe('every role', () => {
  // Flattened so a role added later is covered without being listed.
  const recipes: [string, string][] = Object.entries(STYLES).flatMap(([name, value]) =>
    typeof value === 'string'
      ? [[name, value] as [string, string]]
      : Object.entries(value as Record<string, string>).map(
          ([k, v]) => [`${name}.${k}`, v] as [string, string],
        ),
  )

  // The file warns about this in five places and it still nearly shipped: the
  // error box's retry button (`BUTTON_DANGER`, gone with #736) was first built
  // out of TEXT.control, which carries slate-200, so its red label would have
  // raced a slate one and the winner would have been decided by Tailwind's
  // stylesheet order rather than by intent. A comment cannot catch that. Variants are excluded because a
  // `hover:` color does not compete with a resting one.
  // The theme's tokens are colours too (#706), so a role that put two of them
  // in one list, or a token beside a palette step, races the same way.
  const RESTING_COLOR = new RegExp(
    String.raw`(?:^|\s)text-(?:white|black|(?:slate|sky|blue|cyan|teal|emerald|green|lime|` +
      String.raw`yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|indigo)-\d{2,3}|` +
      `(?:${[...TOKENS].sort((a, b) => b.length - a.length).join('|')}))` +
      String.raw`(?:\/\d+)?(?=\s|$)`,
    'g',
  )

  it('never puts two competing text colors in one recipe', () => {
    for (const [name, recipe] of recipes) {
      const colors = recipe.match(RESTING_COLOR) ?? []
      expect(colors.length, `${name} sets ${colors.length} text colors: ${colors.join(', ')}`)
        .toBeLessThanOrEqual(1)
    }
  })

  it('found the roles', () => {
    expect(recipes.length).toBeGreaterThan(30)
  })

  // Every check above reads a role that something asked for. `DRAG_TARGET` was
  // exported for two years and asked for by nothing, so none of them ever
  // looked at it and the file kept documenting a treatment the app does not
  // have (#390). A role nobody imports is worse than a missing one: it reads
  // as the answer to a question it has never actually answered.
  //
  // The import list rather than any mention of the name, because a name in a
  // comment is not a use. This file is not an importer either (#438): counting
  // it let a role whose only reader is an assertion pass as used, which is the
  // exact state the check was written to fail.
  //
  // What that costs is the list below. It is an allowlist, and an allowlist is
  // the thing that rots, so it is held down from both ends: an entry that gains
  // a real importer fails here too, and every role outside it still owes one.
  //
  // Each of these is a half-recipe this file composes itself, so no call site
  // ever names it and the assertion is the only place the halves can be held
  // together.
  const TEST_ONLY: Record<string, string> = {
    // The ramp's smallest step, spelled a second time as `--map-credit-size` in
    // `MAP_EDGE.publish` because Tailwind cannot compile an interpolated class
    // and MapLibre's credit line has no call site. Components take `TEXT.micro`.
    MICRO_SIZE: 'binds the ramp step to the custom property map.css reads',
    // The three depths a surface may stand at (#687). Every surface composes
    // its step here, and a call site takes the finished surface; this file
    // asserts the steps are the three and that each surface wears its own.
    ELEVATION: 'the depth scale every surface in this file composes',
    // The map's buttons left with the column in #714, so the skip link is the
    // one recipe that composes the floating button, and the size it was set
    // at is held here.
    BUTTON_FLOATING: "the skip link's button, held at the control size",
    // The rows hand the map their gaps through this, and `MAP_ROWS` is its
    // one wearer since the legend stack became a card (#714).
    YIELD_EMPTY: 'the rows yield their gaps to the map',
  }

  it('exports no role nothing imports', () => {
    const imported = new Set<string>()
    for (const source of Object.values(roleImporters)) {
      for (const block of source.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'[^']*styles'/g) ??
        []) {
        for (const name of block.slice(block.indexOf('{') + 1, block.indexOf('}')).split(',')) {
          imported.add(name.trim().split(/\s+as\s+/)[0].trim())
        }
      }
    }

    expect(imported.size).toBeGreaterThan(30)
    expect(
      Object.keys(STYLES).filter((role) => !imported.has(role) && !(role in TEST_ONLY)),
    ).toEqual([])
  })

  // The other end of the same rule. A listed role that something renders is a
  // reason that has stopped being true, and the entry would then be hiding the
  // role from the check above rather than explaining it.
  it.each(Object.entries(TEST_ONLY))('%s is listed because %s', (role) => {
    const readers = Object.entries(roleImporters)
      .filter(([, source]) =>
        (source.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'[^']*styles'/g) ?? []).some(
          (block) =>
            block
              .slice(block.indexOf('{') + 1, block.indexOf('}'))
              .split(',')
              .some((name) => name.trim().split(/\s+as\s+/)[0].trim() === role),
        ),
      )
      .map(([path]) => path)

    expect(readers).toEqual([])
    expect(Object.keys(STYLES)).toContain(role)
  })
})

describe('the accent', () => {
  // #167. The fill is bounded from both sides — 1.4.3 caps it (a white label
  // needs 4.5:1) and 1.4.11 floors it (3:1 against its neighbours, tightest
  // against the calendar's sky-950 range band) — and the surviving window is
  // 0.0067 of relative luminance wide with no Tailwind step inside it. Hence a
  // custom token. The derivation lives on --color-sky-650 in index.css.
  //
  // These literals are load-bearing. The last time this recipe carried a
  // contrast claim, the claim was wrong (the comment said 4.6:1 where the truth
  // was 4.02) and an entire accessibility sweep believed it. Pinning them means
  // a change to the fill fails here and forces a re-measurement.
  const MEASURED = {
    fill: 'sky-650',
    labelOn: 'white',
    label: 4.56, // white on sky-650
    edges: { panel: 3.2, rangeBand: 3.04, segmentTrack: 3.91 },
  }

  it('rests on the one shade that clears the label and every edge at once', () => {
    expect(darkStep(token(ACCENT.fill, 'bg'))).toBe(MEASURED.fill)
    expect(darkStep(token(ACCENT.fill, 'text'))).toBe(MEASURED.labelOn)
    expect(ACCENT.fill.split(' ')).toHaveLength(2)
    const fill = dark(token(ACCENT.fill, 'bg'))
    expect(ratio(dark(token(ACCENT.fill, 'text')), fill)).toBe(MEASURED.label)
    const grounds = {
      panel: dark('panel'),
      rangeBand: dark(token(DAY.range, 'bg')),
      segmentTrack: dark(token(SEGMENT_IDLE, 'bg')),
    }
    for (const [edge, ground] of Object.entries(grounds)) {
      expect(ratio(fill, ground), edge).toBe(MEASURED.edges[edge as keyof typeof MEASURED.edges])
    }
    expect(MEASURED.label).toBeGreaterThanOrEqual(4.5)
    for (const [edge, r] of Object.entries(MEASURED.edges)) {
      expect(r, `${edge} must clear the 3:1 asked of a UI boundary`).toBeGreaterThanOrEqual(3)
    }
  })

  // The light half (the maintainer's call on PR #733): the same sky-650, so
  // the accent is one colour in both themes, measured on the light grounds it
  // lands on. The binding pair moves: the label still has the least room, and
  // the tightest edge is the range band's hover, where the dark fill's was the
  // band itself. Measured 2026-10-15.
  const LIGHT_MEASURED = {
    hex: '#007bc1',
    label: 4.56,
    edges: { panel: 4.06, rangeBand: 3.54, rangeHover: 3.17, segmentTrack: 4.56 },
  }

  it('rests on the same shade in light, which clears the label and every light edge', () => {
    const fill = token(ACCENT.fill, 'bg')
    expect(LIGHT_TOKENS[fill]).toBe(DARK_TOKENS[fill])
    const hex = light(fill)
    expect(hex).toBe(LIGHT_MEASURED.hex)
    expect(ratio(light(token(ACCENT.fill, 'text')), hex)).toBe(LIGHT_MEASURED.label)
    const grounds = {
      panel: light('panel'),
      rangeBand: light(token(DAY.range, 'bg')),
      rangeHover: light(token(DAY.range, 'hover:bg')),
      segmentTrack: light(token(SEGMENT_IDLE, 'bg')),
    }
    for (const [edge, ground] of Object.entries(grounds)) {
      expect(ratio(hex, ground), edge).toBe(LIGHT_MEASURED.edges[edge as keyof typeof LIGHT_MEASURED.edges])
      expect(contrast(hex, ground), `${edge} must clear the 3:1 asked of a UI boundary`).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(light(token(ACCENT.fill, 'text')), hex)).toBeGreaterThanOrEqual(4.5)
  })

  // The custom token is the whole point: a scale step here would mean someone
  // "simplified" the fill back onto sky-600 or sky-700, both of which fail.
  it('takes its fill from the custom token rather than the stock scale', () => {
    expect(darkStep(token(ACCENT.fill, 'bg'))).toBe('sky-650')
    expect(indexCss).toMatch(/--color-sky-650: oklch\(/)
  })

  // The one state still below AA, recorded rather than asserted away. With a
  // white label every lightening costs contrast, so a conformant hover would
  // have to darken — making the app's one primary action the only control that
  // dims under the pointer. 4.02:1 is what the *resting* fill measured before
  // #167, so no state is worse than what already shipped.
  // The hover before #167 was sky-500, at 2.71:1.
  const HOVER = { step: 'sky-600', ratio: 4.02, wasBefore: 2.71 }

  it('hovers lighter, at a contrast cost taken knowingly', () => {
    expect(darkStep(token(ACCENT.fillHover, 'hover:bg'))).toBe(HOVER.step)
    expect(ACCENT.fillHover.split(' ')).toHaveLength(1)
    const label = dark(token(ACCENT.fill, 'text'))
    expect(ratio(label, dark(token(ACCENT.fillHover, 'hover:bg')))).toBe(HOVER.ratio)
    expect(ratio(label, paletteHex('sky-500'))).toBe(HOVER.wasBefore)
    expect(HOVER.ratio).toBeLessThan(4.5)
    expect(HOVER.ratio).toBeGreaterThan(HOVER.wasBefore)
    expect(HOVER.ratio).toBeLessThan(MEASURED.label)
  })

  // The bug this whole issue is: the button spelled its own fill, so it and the
  // blocks it is meant to match could drift, and did.
  it('gives the primary button the same fill as every other accent block', () => {
    expect(BUTTON_PRIMARY).toContain(ACCENT.fill)
    expect(BUTTON_PRIMARY).toContain(ACCENT.fillHover)
    expect(DAY.selected).toBe(ACCENT.fill)
  })

  // The inline accent button is the second consumer of that fill, and the
  // reason it exists is that it must sit beside BUTTON_SECONDARY: same box,
  // different standing. Both halves are asserted, because a box that drifted
  // would put two buttons of different heights in one row, and a fill spelled
  // out here would be the exact drift #167 unwound.
  it('gives the inline accent button the primary fill on the secondary box', () => {
    expect(BUTTON_ACCENT).toContain(ACCENT.fill)
    expect(BUTTON_ACCENT).toContain(ACCENT.fillHover)
    for (const box of ['px-3', 'py-1.5', RADIUS.control, TAP.action]) {
      expect(BUTTON_ACCENT).toContain(box)
      expect(BUTTON_SECONDARY).toContain(box)
    }
    // Composing TEXT.control would race the fill's own label color by
    // stylesheet order — the trap the test above pins.
    expect(BUTTON_ACCENT).not.toContain(TEXT.control)
    expect(sizes(BUTTON_ACCENT)).toEqual(sizes(TEXT.control))
  })

  // Every other accent job routes through the same object, so there is one
  // place to change if the accent hue ever moves.
  it('sources every accent treatment from the one hue', () => {
    for (const recipe of [ICON_ACTION, BUTTON_FLOATING, SPINNER]) {
      expect(recipe).toMatch(/(^|[\s:])[a-z-]+-accent-ink(\s|$)/)
    }
    expect(darkStep('accent-ink')).toMatch(/^sky-/)
    expect(ICON_ACTION).toContain(ACCENT.hoverText)
    expect(BUTTON_FLOATING).toContain(ACCENT.edgeHover)
    expect(BUTTON_FLOATING).toContain(SURFACE_FLOATING)
  })
})

describe('status and notices', () => {
  // STATUS colors, NOTICE boxes, and neither does the other's job. Two color
  // utilities in one class list resolve by stylesheet order rather than by
  // intent, so a box that set a color would fight the line inside it; a status
  // that set a size would fight the box holding it.
  it('splits color and box so the two compose without colliding', () => {
    for (const tone of Object.values(STATUS)) {
      expect(sizes(tone)).toHaveLength(0)
      expect(tone.split(' ')).toHaveLength(1)
    }
    for (const box of Object.values(NOTICE)) {
      expect(sizes(box)).toHaveLength(1)
      expect(box).not.toMatch(/(^|\s)text-(?:ink|accent|ok|warn|danger|info|slate|sky|amber|red|green)\b/)
    }
  })

  // The error box ran a heavier fill behind an opaque border while the other
  // three shared one spelling, so the app shouted in a different shape than it
  // warned in. One shape now, tone being the only thing that varies.
  it('gives every notice tone the same box', () => {
    const shape = (box: string) => box.replace(/(warn|danger|info)/g, 'TONE')

    expect(new Set(Object.values(NOTICE).map(shape)).size).toBe(1)
    expect(Object.values(NOTICE)).toHaveLength(3)
    expect(NOTICE.warn).toContain(RADIUS.control)
  })

  // #253. The dismiss × inherits its box's STATUS color, so neither part of
  // the recipe may set a resting color of its own — one would override the
  // voice on every box at once. A bare glyph since record 0222, as every ×
  // inside a card is, so the ratios are the inherited glyph on the box's own
  // tint over the panel; literals so a fill or STATUS change fails here and
  // forces a re-measurement rather than inheriting a stale claim.
  const DISMISS_MEASURED = { warn: 10.53, error: 5.56, info: 8.68 }

  it('dismisses in the voice of the box it sits in', () => {
    expect(NOTICE_DISMISS.button).not.toMatch(/(^|\s)text-/)
    expect(NOTICE_DISMISS.pill).not.toMatch(/(^|\s)(text|bg)-/)
    const panel = dark('panel')
    const glyph = (tone: 'warn' | 'error' | 'info') =>
      ratio(dark(token(STATUS[tone], 'text')), dark(token(NOTICE[tone], 'bg'), panel))
    expect({ warn: glyph('warn'), error: glyph('error'), info: glyph('info') }).toEqual(DISMISS_MEASURED)
    for (const [tone, r] of Object.entries(DISMISS_MEASURED)) {
      expect(r, `${tone} glyph must clear the 3:1 asked of a UI glyph`).toBeGreaterThanOrEqual(3)
    }
  })

  // The Analyze button sits directly above the notices, so the 44px touch
  // target must grow the box in-flow rather than positioning itself over the
  // button's bottom edge. The glyph's own box is the separate, smaller part,
  // and bare (record 0222), so one recipe sits on all three tints.
  it('earns its touch target by growing the box, not by overhanging it', () => {
    expect(NOTICE_DISMISS.button).toContain(TAP.action)
    expect(NOTICE_DISMISS.button).toContain(FOCUS_RING)
    expect(NOTICE_DISMISS.button).not.toContain('absolute')
    expect(NOTICE_DISMISS.pill).not.toContain(RADIUS.pill)
    expect(NOTICE_DISMISS.pill).not.toMatch(/(^|\s)bg-/)
  })

  // The X rests hidden and appears when its own message is pointed at, so a
  // bulleted box does not open with a column of pills. Every reveal path must
  // exist together: the row hover for a mouse, focus for a keyboard, and
  // `touch:` unconditionally — where hover does not exist, a hover-only
  // control is a control that does not exist (the tooltip rule, applied to a
  // button). The row's group must be NAMED: the button's own `group` feeds
  // the pill's hover, and an unnamed row group would hand the pill every row
  // hover in the box.
  it('hides the X until its message is pointed at, and never on touch', () => {
    expect(NOTICE_DISMISS.button).toContain('opacity-0')
    expect(NOTICE_DISMISS.button).toContain('group-hover/notice:opacity-100')
    expect(NOTICE_DISMISS.button).toContain('focus-visible:opacity-100')
    expect(NOTICE_DISMISS.button).toContain('touch:opacity-100')
    expect(NOTICE_DISMISS.row).toContain('group/notice')
  })

  // The row's lift is the binding between a message and its X — in a stack of
  // messages the X alone does not say which one it belongs to. Hue-free like
  // the pill, and one step quieter than it, so the resting pill still reads
  // as the control on the lifted row.
  it('binds the X to its message with a hue-free lift', () => {
    expect(darkStep(token(NOTICE_DISMISS.row, 'hover:bg'))).toBe('white')
    expect(NOTICE_DISMISS.row).not.toMatch(/(^|\s)text-/)
    expect(NOTICE_DISMISS.row).toContain(RADIUS.control)
  })

  // The rule between two messages is the box's own border tint. A divider in
  // any other shade would read as a second decision inside a box that has
  // already made one, so the two are keyed alike and pinned to each other.
  it('rules between messages in the tint the box is bordered in', () => {
    const tones = Object.keys(NOTICE) as (keyof typeof NOTICE)[]
    expect(tones).toHaveLength(3)
    for (const tone of tones) {
      const border = NOTICE[tone].split(' ').find((c) => /^border-[a-z]+-line$/.test(c))
      expect(border, `${tone} must state a border to mirror`).toBeDefined()
      expect(NOTICE_DIVIDER[tone].split(' ')).toContain(
        (border as string).replace('border-', 'divide-'),
      )
    }
  })

  // The 6px each side of that rule is padding on the rows, because a gap would
  // only ever fall BETWEEN rows and the rule is drawn at a row's top edge. The
  // container then cancels what the first and last rows would add to the box,
  // so a box holding one message is exactly as tall as it was.
  it('clears the rule on both sides without growing a one-message box', () => {
    for (const tone of Object.keys(NOTICE_DIVIDER) as (keyof typeof NOTICE)[]) {
      expect(NOTICE_DIVIDER[tone]).toContain('divide-y')
      expect(NOTICE_DIVIDER[tone]).toContain('-my-1.5')
    }
    expect(NOTICE_DISMISS.row).toContain('py-1.5')
  })

  // The message and its X are centred against each other, so the text sits
  // level with the disc; the offset that used to pin the X to a wrapped
  // message's first line is gone with the wrap it existed for.
  it('sets the message level with the X it carries', () => {
    expect(NOTICE_DISMISS.row).toContain('items-center')
    expect(NOTICE_DISMISS.button).not.toContain('self-start')
    // No unprefixed sideways margin: the one the button carries is the
    // coarse-pointer overlay below, and a mouse must not inherit it.
    expect(NOTICE_DISMISS.button).not.toMatch(/(^|\s)-m[lrx]?-/)
  })

  // A box with an X stands exactly as tall as one without (the maintainer,
  // 2026-10-21 on PR #789): the button's negative block margins hand back
  // everything past the message's line, the disc's overhang on a mouse and the
  // 44px target's on touch, so the row is the line and its padding. The
  // browser suite's `messages.spec.ts` measures the boxes themselves.
  it('stands a box with an X as tall as one without', () => {
    const rem = (name: string) => {
      const value = palette.match(new RegExp(String.raw`--${name}:\s*([\d.]+)rem;`))
      return Number(value![1]) * 16
    }
    const ratio = palette.match(/--text-xs--line-height:\s*calc\(1 \/ ([\d.]+)\);/)
    for (const recipe of Object.values(NOTICE)) expect(recipe.split(' ')).toContain('text-xs')
    const line = rem('text-xs') / Number(ratio![1])
    expect(line).toBe(16)
    const step = (recipe: string, cls: RegExp) => Number(recipe.match(cls)![1]) * 4
    const disc = step(NOTICE_DISMISS.pill, /(?<![-\w])h-(\d+)(?:\s|$)/)
    const target = step(TAP.action, /touch:min-h-(\d+)/)
    const mouse = Number(NOTICE_DISMISS.button.match(/(?:^|\s)-my-([\d.]+)(?:\s|$)/)![1]) * 4
    const touch = Number(NOTICE_DISMISS.button.match(/(?:^|\s)touch:-my-([\d.]+)(?:\s|$)/)![1]) * 4
    expect(disc - 2 * mouse).toBe(line)
    expect(target - 2 * touch).toBe(line)
  })

  // The 44px target and the 20px disc differ by 24px, and that difference used
  // to be taken out of the message: a 257px column on a 360px panel, where the
  // longest commit cue needs 267. The target reaches back over the tail of the
  // text instead, which costs nothing because the text is not a target, and
  // the disc does not move — the button's box still ends at the row's right
  // edge. Only on a coarse pointer, where the target is 44px at all.
  it('takes the touch target out of the text, not out of the column', () => {
    const px = (recipe: string, cls: RegExp) => {
      const step = recipe.match(cls)
      return step ? Number(step[1]) * 4 : null
    }
    const target = px(TAP.action, /touch:min-w-(\d+)/)
    const disc = px(NOTICE_DISMISS.pill, /(?<![-\w])w-(\d+)/)
    const overlay = px(NOTICE_DISMISS.button, /touch:-ml-(\d+)/)
    expect(target).toBe(44)
    expect(disc).toBe(20)
    expect(overlay).toBe((target as number) - (disc as number))
    // The visible distance from the disc to the last word is the row's gap,
    // which the overlay must not eat.
    expect(NOTICE_DISMISS.row).toContain('gap-2')
  })
})

// The rank cell trades its number for the remove × on hover. Both faces share
// one grid cell, so the column is as wide as the wider face at all times;
// toggling display instead let the # column grow on every hover and shove
// every column to its right (#339).
// That the table wears these roles, and never toggles display on hover, is the
// style-rank-cell check.
describe('the results table rank cell', () => {
  it('pins both faces of the rank cell to one grid cell', () => {
    expect(STYLES.TABLE.rankFace.split(' ')).toEqual(['col-start-1', 'row-start-1'])
    expect(STYLES.TABLE.rankStack.split(' ')).toContain('inline-grid')
  })

  // A phone's Name column stands still and must leave the numbers room
  // (#696; record 0142): 45% of the sheet at most, the cell's padding inside
  // that, and only on a phone.
  it('caps a phone\'s Name column at 45% of the sheet, padding included', () => {
    expect(STYLES.TABLE.nameCap).toBe('max-lg:max-w-[calc(45cqi-1rem)]')
    // The cell's own padding, which the 1rem is: px-2 either side.
    expect(STYLES.TABLE.cell.split(' ')).toContain('px-2')
  })

  // A link in the table reads in its text's colour (#786, record 0212): no
  // underline at rest at a desk, one on hover and on keyboard focus, and on a
  // touch screen, which has no hover, a thin one at rest in the secondary ink
  // so a finger can find it. The marker popup's links read the same way.
  it('underlines a table link on hover and focus, and at rest on touch only', () => {
    const cls = STYLES.LINK_QUIET.split(' ')
    expect(cls).toEqual(expect.arrayContaining(['hover:underline', 'focus-visible:underline', 'touch:underline', 'touch:decoration-ink-soft', 'cursor-pointer']))
    expect(cls).not.toContain('underline')
    // The text's own colour: no ink of its own, so a ranked value keeps the
    // band's and a name the row's.
    expect(cls.some((c) => /^text-/.test(c))).toBe(false)
    expect('valueLink' in STYLES.TABLE).toBe(false)
  })

  // The popup's links say the same through `map.css`, since an inline style
  // cannot answer a hover, and its link-out glyph rests in the same grey and
  // takes the accent on hover and focus.
  it('gives the popup\'s links and glyph the table\'s hover, focus and touch rules', () => {
    expect(mapCss).toMatch(/\.maplibregl-popup \[data-popup-link\] \{\s*text-decoration: none;/)
    expect(mapCss).toMatch(/\.maplibregl-popup \[data-popup-link\]:focus-visible \{\s*text-decoration: underline;/)
    expect(mapCss).toMatch(/@media \(hover: hover\) \{\s*\.maplibregl-popup \[data-popup-link\]:hover \{\s*text-decoration: underline;/)
    expect(mapCss).toMatch(/@media \(hover: none\) \{\s*\.maplibregl-popup \[data-popup-link\] \{\s*text-decoration: underline;\s*text-decoration-color: var\(--popup-label\);/)
    expect(mapCss).toMatch(/\.maplibregl-popup \[data-popup-glyph\]:focus-visible \{\s*--popup-glyph: var\(--popup-glyph-hover\);/)
    expect(mapCss).toMatch(/\.maplibregl-popup \[data-popup-glyph\]:hover \{\s*--popup-glyph: var\(--popup-glyph-hover\);/)
  })

  // The tutorial's spotlight lit a section with a scroll shade lying across
  // it (#696): while a tour runs (`tour/Tour.tsx` sets the attribute), every
  // shade stands down.
  it('hides every scroll shadow while the tutorial runs', () => {
    // The rule's selector list and body, read by index rather than by one
    // repeated-group pattern, which backtracks badly on a long list.
    const start = indexCss.indexOf(':root[data-touring]')
    expect(start).toBeGreaterThan(-1)
    const open = indexCss.indexOf('{', start)
    const selectors = indexCss.slice(start, open)
    const body = indexCss.slice(open + 1, indexCss.indexOf('}', open))
    expect(body).toContain('visibility: hidden')
    for (const shade of ['.scroll-shadow-start::before', '.scroll-shadow-end::after', '.scroll-shadow-head th::after']) {
      expect(selectors).toContain(`:root[data-touring] ${shade}`)
    }
  })

  // A phone's tutorial cuts from card to card (#786): every transition, and
  // its pseudo-elements', stands down while the attribute says so.
  it('stands every transition down while a phone\'s tutorial cuts', () => {
    const start = indexCss.indexOf(':root[data-touring="cut"]')
    expect(start).toBeGreaterThan(-1)
    const open = indexCss.indexOf('{', start)
    const selectors = indexCss.slice(start, open).split(',').map((x) => x.trim())
    expect(selectors).toEqual([
      ':root[data-touring="cut"] *',
      ':root[data-touring="cut"] *::before',
      ':root[data-touring="cut"] *::after',
    ])
    expect(indexCss.slice(open + 1, indexCss.indexOf('}', open)).trim()).toBe('transition: none !important;')
  })

  // A finger removes from the marker card its row tap opens (#696), so the ×
  // is not drawn on a coarse pointer; an invisible button over the number
  // would take the tap aimed at the row and remove the row.
  it('draws no × on a coarse pointer, and keeps it in reach of a mouse and a keyboard', () => {
    const face = STYLES.TABLE.removeFace.split(' ')
    expect(face).toContain('touch:hidden')
    expect(face).toEqual(expect.arrayContaining(['opacity-0', 'group-hover:opacity-100', 'focus-visible:opacity-100']))
  })

  // Two kinds of row in one body: the pending destinations waiting on a
  // forecast, and the ranked results under them. They had spelled the recipe
  // twice, so the rule above a row and what it does under a pointer could have
  // come to mean two things in one table (#390). `group` is the load-bearing
  // part — the remove × above appears on `group-hover`, so a row without it
  // cannot be removed with a pointer.
  it('draws every row in the body from one recipe', () => {
    expect(STYLES.TABLE.row.split(' ')).toContain('group')
    expect(STYLES.TABLE.row).toMatch(/\bborder-t\b/)
  })
})

// The `*` on a Model cell whose model ends inside the window (#508). A footnote
// reference, so it must not move the row it sits in: a comparison would
// otherwise draw its marked rows taller than their unmarked neighbours.
describe('the results table cell mark', () => {
  // Tailwind's own reset, read off the disk for the reason indexCss is: it is
  // what raises a sup, and the raise is only free if it is an offset.
  const preflight: string = readFileSync(
    new URL('../node_modules/tailwindcss/preflight.css', import.meta.url),
    'utf8',
  )

  it('wears the footnote line\'s own size and color', () => {
    expect(STYLES.TABLE.mark).toContain(TEXT.micro)
  })

  it('adds no height to the row it marks', () => {
    // Raised by a relative offset from the baseline, which moves the glyph and
    // leaves the line box where it was.
    const sup = preflight.match(/sub,\s*sup\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(sup).toMatch(/line-height:\s*0;/)
    expect(sup).toMatch(/position:\s*relative;/)
    expect(sup).toMatch(/vertical-align:\s*baseline;/)
    // Zero line height of its own too, so a size step that carries leading
    // cannot put one back over preflight's.
    expect(STYLES.TABLE.mark.split(' ')).toContain('leading-0')
    // And no taller than the cell text it follows: the table sets 12px text
    // (text-xs), and the mark's glyph must fit inside that line.
    const markPx = Number(STYLES.TABLE.mark.match(/text-\[(\d+)px\]/)![1])
    expect(TEXT.control.split(' ')).toContain('text-xs')
    expect(markPx).toBeLessThan(12)
  })

  // The Closure cell's cap (#551). A clamp that let the text overflow would
  // widen the column anyway, and a block-level one would not clamp what the
  // column asks of auto table layout, so the three parts are pinned together.
  it('clips a long order title at a cap the column defends', () => {
    const parts = STYLES.TABLE.clip.split(' ')
    expect(parts).toContain('truncate')
    expect(parts).toContain('inline-block')
    expect(stepPx(STYLES.TABLE.clip, 'max-w')).toBe(256)
  })
})

// One vocabulary for both surfaces that reorder columns, so the same gesture
// looks the same in the table header and in the Columns picker.
describe('moving a column', () => {
  // The ghost and the insert bar are both drawn in viewport coordinates over
  // whatever surface the drag started in, so the stacking order is part of
  // what they are. Both call sites composed the layer beside the role, which
  // is a pair either of them could have got half of.
  it('carries its own stacking order rather than asking for one', () => {
    expect(DRAG.ghost).toContain(LAYER.popover)
    expect(DRAG.insert).toContain(LAYER.popover)
  })

  // The ghost is a card, so its depth is the card's; it spelled a shadow of
  // its own beside the card's until #687, two utilities racing by stylesheet
  // order.
  it('lifts the ghost at the depth of the card it is', () => {
    expect(DRAG.ghost).toContain(SURFACE_CARD)
    expect(DRAG.ghost.match(/\bshadow-\S+/g)).toEqual([ELEVATION.overlay])
  })
})

// One inset for everything that stands off the map's edges, the app's chrome
// and the library's alike.
describe('the map edge inset', () => {
  it('publishes one number and reads it everywhere', () => {
    expect(MAP_EDGE.publish).toContain('[--map-edge-inset:0.75rem]')
    for (const side of [MAP_EDGE.left, MAP_EDGE.right, MAP_EDGE.top]) {
      expect(side).toContain('var(--map-edge-inset)')
      // The number is published, never repeated: a fallback here would be a
      // second copy of it, and the two would drift.
      expect(side).not.toMatch(/rem|px/)
    }
  })

  // MapLibre's credit line is sized by map.css from a custom property, because
  // the library builds that markup itself and there is no call site to hand
  // `TEXT.micro` to. So the ramp's smallest step is spelled twice — Tailwind
  // compiles no interpolated class, so neither spelling can be built from the
  // other — and this is the one place that holds them to one number, which is
  // why the two are read off each other rather than off a third constant.
  it('publishes the credit size from the ramp', () => {
    const published = MAP_EDGE.publish.match(/--map-credit-size:(\d+)px/)
    expect(published).not.toBeNull()
    expect(MICRO_SIZE).toBe(`text-[${published![1]}px]`)
  })

  // The library's top-right stack takes the map's inset through `map.css`,
  // which reads the property and spells no number of its own. It stands there
  // only until the rows mount and take its buttons into their slots.
  it('is the one inset the vendor stack takes too', () => {
    expect(mapCss).toContain('.maplibregl-ctrl-top-right .maplibregl-ctrl')
    const rule = mapCss.slice(
      mapCss.indexOf('.maplibregl-ctrl-top-right .maplibregl-ctrl'),
    )
    const body = rule.slice(rule.indexOf('{'), rule.indexOf('}'))
    expect(body).toContain('var(--map-edge-inset)')
    expect(body).not.toMatch(/\d+(?:px|rem)/)
  })
})

// The search's result list (#696): ten places in a box that scrolls rather
// than running down the map, in the dark bar the results panels wear.
describe('the search result list', () => {
  it('is bounded, scrolls, and wears the shared scroll bar', () => {
    expect(SEARCH_LIST).toMatch(/(^|\s)max-h-\[min\(20rem,50dvh\)\](\s|$)/)
    expect(SEARCH_LIST).toContain('overflow-y-auto')
    expect(SEARCH_LIST).toContain(SCROLL_BARS)
    expect(searchBoxSource).toMatch(/\$\{SEARCH_LIST\} divide-y/)
  })
})

// The map's two rows across its top (#696; record 0135), at both widths since
// #714 (record 0174): the search pill with the locate button at its right, and
// the chip row under it. Every other anchor on the map's top is built from the
// rows' four numbers, so this holds each one to the sum rather than trusting a
// comment.
describe('the map rows', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)
  // A spacing step is a quarter of a rem: 4px.
  const step = (recipe: string, prefix: string): number => {
    const m = recipe.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`))
    expect(m, `${prefix} in ${recipe}`).not.toBeNull()
    return Number(m![1]) * 4
  }
  const px = (recipe: string, prefix: string): number => {
    const m = recipe.match(new RegExp(`${prefix}-\\[(\\d+)px\\]`))
    expect(m, `${prefix} in ${recipe}`).not.toBeNull()
    return Number(m![1])
  }
  const INSET = 12
  const ROW = step(MAP_ROWS.row, 'h')
  const GAP = step(MAP_ROWS.stack, 'gap')
  const CHIPS = step(MAP_ROWS.chips, 'h')
  const BOTTOM = INSET + ROW + GAP + CHIPS

  it('measures 40 and 32 with 8 between, so the rows end 92px down', () => {
    expect([ROW, GAP, CHIPS]).toEqual([40, 8, 32])
    expect(BOTTOM).toBe(92)
    expect(MAP_EDGE.publish).toContain(`[--map-edge-inset:${INSET / 16}rem]`)
    for (const part of [MAP_EDGE.top, MAP_EDGE.left, MAP_EDGE.right, 'pointer-events-none']) expect(MAP_ROWS.stack).toContain(part)
    // The rows yield their gaps; the stack must not hand them back.
    expect(MAP_ROWS.stack).not.toContain(YIELD_EMPTY)
    for (const row of [MAP_ROWS.row, MAP_ROWS.chips]) expect(row).toContain(YIELD_EMPTY)
    // At a desk the rows are as wide as the wider of the pill's 320px and
    // the chip row, so the map right of them stays the map's; the map's
    // buttons stand in its top-right corner (record 0174).
    expect(tokens(MAP_ROWS.stack)).toEqual(expect.arrayContaining(['lg:right-auto', 'lg:w-max']))
    expect(step(MAP_ROWS.stack.replace(/(^|\s)lg:/g, '$1'), 'min-w')).toBe(320)
    // The chips are 32px tall each, and 6px apart.
    expect(step(MAP_CHIP, 'h')).toBe(CHIPS)
    expect(step(MAP_ROWS.chips, 'gap')).toBe(6)
  })

  // A phone's pill leaves the 3D and locate buttons and the 8px before each
  // at rest (#799), and takes the whole row while it is searching. A desk's is 320px
  // either way, with no button beside it (record 0174).
  it('stands a phone\'s pill beside a 40px round locate button, and a desk\'s alone', () => {
    expect(step(MAP_SLOT.locate, 'size')).toBe(ROW)
    expect(tokens(MAP_SLOT.locate)).toEqual(expect.arrayContaining(['absolute', 'right-0', 'top-0']))
    // The 3D button's slot, one button and one gap left of the locate button.
    expect(step(MAP_SLOT.terrain, 'size')).toBe(ROW)
    expect(tokens(MAP_SLOT.terrain)).toEqual(expect.arrayContaining(['absolute', 'top-0']))
    expect(step(MAP_SLOT.terrain, 'right')).toBe(ROW + GAP)
    expect(step(MAP_ROUND_BUTTON, 'size')).toBe(ROW)
    expect(step(MAP_PILL, 'h')).toBe(ROW)
    expect(step(MAP_ROWS.pill, 'right')).toBe(2 * (ROW + GAP))
    expect(MAP_ROWS.pillWide).toMatch(/(^|\s)right-0(\s|$)/)
    for (const pill of [MAP_ROWS.pill, MAP_ROWS.pillWide]) {
      expect(tokens(pill)).toEqual(expect.arrayContaining(['lg:right-auto', 'lg:w-80']))
    }
    for (const recipe of [MAP_PILL, MAP_ROUND_BUTTON]) expect(tokens(recipe)).toContain(RADIUS.pill)
    // The class map.css keys the vendor group's margin on.
    for (const slot of Object.values(MAP_SLOT)) expect(tokens(slot)).toContain('map-slot')
    expect(mapCss).toContain('.map-slot .maplibregl-ctrl-group')
    expect(mapRowsSource).toContain('{!desk && <div ref={onLocateSlot} className={MAP_SLOT.locate} />}')
    expect(mapRowsSource).toContain('{!desk && <div ref={onTerrainSlot} className={MAP_SLOT.terrain} />}')
    // A phone's compass, the chip row's last member (record 0147): no size of
    // its own, so a hidden compass leaves the row's end to the map. A desk
    // has none of the three slots.
    expect(mapRowsSource).toContain('{!desk && <div ref={onCompassSlot} className={MAP_SLOT.compass} />}')
    expect(Object.keys(MAP_SLOT)).toEqual(['locate', 'terrain', 'compass'])
    expect(tokens(MAP_SLOT.compass)).toEqual(['map-slot', 'ml-auto', 'flex-shrink-0'])
  })

  // The 3D button (#799) is a map button whose glyph is a word: the round
  // button's chrome, the control size in bold in the chrome's ink, and the
  // hook map.css fills it on while it is pressed, with the accent fill's two
  // tokens, the fill and the label on it, as `ACCENT.fill` paints them.
  it('draws the 3D button as a map button, filled with the accent while pressed', () => {
    for (const t of tokens(MAP_ROUND_BUTTON)) expect(tokens(MAP_TERRAIN_BUTTON)).toContain(t)
    for (const t of tokens(TEXT.control)) expect(tokens(MAP_TERRAIN_BUTTON)).toContain(t)
    expect(tokens(MAP_TERRAIN_BUTTON)).toEqual(expect.arrayContaining(['map-terrain', 'font-bold']))
    const at = mapCss.indexOf('.map-terrain[aria-pressed="true"] {')
    expect(at).toBeGreaterThan(-1)
    const rule = mapCss.slice(at, mapCss.indexOf('}', at))
    expect(tokens(ACCENT.fill)).toEqual(['bg-accent', 'text-on-fill'])
    expect(rule).toContain('background-color: var(--ui-accent);')
    expect(rule).toContain('border-color: var(--ui-accent);')
    expect(rule).toContain('color: var(--ui-on-fill);')
    expect(mapCss).toMatch(/\.map-terrain\[aria-pressed="true"\]:hover \{\s*background-color: var\(--ui-accent-hover\);/)
  })

  // One floating chrome for the pill, the locate button and the chips: the
  // floating box's fill, edge, shadow and blur, at a capsule's radius rather
  // than the box's.
  it('dresses the pill, the map buttons and the chips in the floating box\'s chrome', () => {
    const chrome = tokens(SURFACE_FLOATING).filter((t) => t !== RADIUS.surface)
    for (const recipe of [MAP_PILL, MAP_ROUND_BUTTON, MAP_ZOOM_PAIR.in, MAP_ZOOM_PAIR.out, MAP_CHIP, MAP_CHIP_SUMMARY]) {
      for (const t of chrome) expect(tokens(recipe), `${t} in ${recipe}`).toContain(t)
      expect(tokens(recipe)).not.toContain(RADIUS.surface)
    }
  })

  // The search pill's size (record 0222) and 12px a side, at the normal
  // weight. The 13px the mockup drew them at (#696) was the one size off the
  // ramp, so no role may drift back onto it.
  it('sets the chips at the control size with 12px a side', () => {
    for (const recipe of [MAP_CHIP, MAP_CHIP_SUMMARY]) expect(sizes(recipe)).toEqual([CONTROL_SIZE])
    const recipes = Object.values(STYLES).flatMap((v) =>
      typeof v === 'string' ? [v] : Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string'),
    )
    expect(recipes.filter((r) => sizes(r).includes('text-[13px]'))).toEqual([])
    expect(step(MAP_CHIP, 'px')).toBe(12)
    expect(tokens(MAP_CHIP)).not.toContain('font-semibold')
  })

  // The summary is the one chip that gives way, by an ellipsis on its words;
  // every other chip keeps its width, and nothing claims the row's right end.
  it('lets the summary alone shrink, and leaves the right end empty', () => {
    expect(tokens(MAP_CHIP)).toContain('flex-shrink-0')
    expect(MAP_CHIP_SUMMARY).not.toMatch(/(^|\s)(flex-)?shrink-0(\s|$)/)
    expect(tokens(MAP_CHIP_SUMMARY)).toContain('min-w-0')
    expect(tokens(MAP_CHIP_SUMMARY_TEXT)).toEqual(expect.arrayContaining(['min-w-0', 'truncate']))
    // Lit, its words read white on the accent fill like every label there.
    expect(token(MAP_CHIP_SUMMARY_TEXT, 'in-aria-expanded:text')).toBe(token(ACCENT.fill, 'text'))
    expect(token(MAP_CHIP, 'aria-expanded:bg')).toBe(token(ACCENT.fill, 'bg'))
    for (const recipe of [MAP_CHIP, MAP_CHIP_SUMMARY, MAP_ROWS.chips]) expect(recipe).not.toMatch(/(^|\s)(ml-auto|justify-between)(\s|$)/)
  })

  // A chip lit for its open sheet takes the accent fill as a variant, so the
  // lit and the resting fills never race on stylesheet order.
  it('lights a chip in the accent fill while its sheet is open', () => {
    // A map chip keeps its pill whole while its menu is out (TJ, 2026-10-18),
    // and is the chip shape of the one menu trigger (record 0201).
    for (const source of [mapLegendSource, layersPopoverSource]) expect(source).toContain('shape="chip"')
    expect(mapLegendSource).toContain('className={DISABLED}')
    const fill = tokens(ACCENT.fill).find((t) => t.startsWith('bg-'))!
    expect(tokens(MAP_CHIP)).toContain(`aria-expanded:${fill}`)
    expect(tokens(MAP_CHIP)).toContain(`aria-expanded:${fill.replace(/^bg-/, 'border-')}`)
    for (const part of [ACCENT.edgeHover, ACCENT.hoverText, FOCUS_RING]) expect(MAP_CHIP).toContain(part)
  })

  // Everything else on a phone's top stands under the rows: the draw bar 8px
  // under the chips, the vendor's stack (the compass) one inset under the
  // rows or under the draw bar, and the bottom sheet's card at most to one
  // inset under the chips, so a long list leaves the top of the map in view.
  it('builds every anchor under the rows from the rows\' sum', () => {
    const drawBarTop = px(MAP_ROWS.drawBar, 'top')
    expect(drawBarTop).toBe(BOTTOM + GAP)
    const vendor = (cls: string) => Number(cls.match(/--map-vendor-top:(\d+)px/)![1])
    expect(vendor(MAP_EDGE.belowRows)).toBe(BOTTOM + INSET)
    // The draw bar: its 32px buttons (`TAP`) and its 6px of padding a side.
    const drawBarPx = 32 + 2 * step(DRAW_BAR, 'py')
    expect(drawBarPx).toBe(44)
    // Its 1px border, top and bottom, is the 46 the bar measures.
    expect(vendor(MAP_EDGE.belowDrawBar)).toBe(drawBarTop + drawBarPx + 2 + INSET)
    expect(BOTTOM_SHEET.card).toContain(`max-h-[calc(100dvh-${BOTTOM + INSET}px)]`)
    const rule = mapCss.slice(mapCss.indexOf('.maplibregl-ctrl-top-right .maplibregl-ctrl:first-child'))
    expect(rule.slice(rule.indexOf('{'), rule.indexOf('}'))).toContain('var(--map-vendor-top, var(--map-edge-inset))')
  })
})

// The phone's chrome is seen at one size and pressed at another (#696),
// the way Material's chips are: every target 44px on a coarse pointer
// (`TAP`), whatever it looks like.
describe('the phone chrome\'s hit areas', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)
  const steps = (recipe: string, re: RegExp) => Number(recipe.match(re)![1]) * 4

  // A pseudo-element's inset is measured from inside the 1px border.
  it('presses a 32px chip as 44, by a box 6px above and below it', () => {
    for (const recipe of [MAP_CHIP, MAP_CHIP_SUMMARY]) {
      const seen = steps(recipe, /(?:^|\s)h-(\d+)(?:\s|$)/)
      const rim = Number(recipe.match(/(?:^|\s)touch:before:-inset-y-\[(\d+)px\](?:\s|$)/)![1])
      expect(tokens(recipe)).toContain('border')
      expect(seen).toBe(32)
      expect(seen - 2 + 2 * rim).toBe(44)
      expect(tokens(recipe)).toEqual(expect.arrayContaining(['relative', 'touch:before:absolute', 'touch:before:inset-x-0']))
    }
  })

  it('presses the 40px pill\'s field as 44, 2px past each edge', () => {
    const seen = steps(MAP_PILL, /(?:^|\s)h-(\d+)(?:\s|$)/)
    const rim = Number(MAP_PILL_FIELD.match(/(?:^|\s)touch:-my-\[(\d+)px\](?:\s|$)/)![1])
    expect(tokens(MAP_PILL)).toContain('border')
    expect(seen - 2 + 2 * rim).toBe(44)
    expect(tokens(MAP_PILL_FIELD)).toContain('self-stretch')
    expect(searchBoxSource).toContain('${MAP_PILL_FIELD}')
  })

  // The vendor's buttons, so map.css spells it, on the query `touch` is: every
  // map button 40px seen and 44 pressed (record 0147), and the credit's 24px
  // (i) the same 44. An absolute ::before insets from the padding box, so each
  // button's size counts less its two borders before the rim is added.
  it('presses the 40px map buttons and the 24px (i) as 44, by a rim on a coarse pointer', () => {
    const size = (recipe: string) => steps(recipe, /(?:^|\s)size-(\d+)(?:\s|$)/)
    // Tailwind's bare `border` is 1px.
    const border = (recipe: string) => (tokens(recipe).includes('border') ? 1 : 0)
    const rim = (css: string, selector: string) =>
      Number(css.match(new RegExp(String.raw`${selector}::before \{\s*content: '';\s*position: absolute;\s*inset: -(\d+)px;`))![1])
    const block = mapCss.slice(mapCss.indexOf('@media (hover: none) {\n  .maplibregl-ctrl-group,'))
    const buttons = [
      { recipe: MAP_ROUND_BUTTON, seen: 40, inset: rim(block.slice(0, block.indexOf('\n}\n')), String.raw`\.maplibregl-ctrl-group button`) },
      { recipe: MAP_CREDIT.button, seen: 24, inset: rim(mapCss, String.raw`\.maplibregl-ctrl-attrib-button`) },
    ]
    for (const { recipe, seen, inset } of buttons) {
      expect(size(recipe)).toBe(seen)
      expect(border(recipe), recipe).toBe(1)
      expect(size(recipe) - 2 * border(recipe) + 2 * inset, recipe).toBe(44)
    }
  })

  // The (i)'s glyph is centred on its button's whole box (TJ, 2026-10-14):
  // the library places it at the padding box's top left, which the role's
  // 1px border moves 1px off centre and clips.
  it('centres the (i) glyph on its button', () => {
    const at = mapCss.indexOf('.maplibregl-ctrl-attrib.maplibregl-compact-show .maplibregl-ctrl-attrib-button {')
    const rule = mapCss.slice(at, mapCss.indexOf('}', at))
    expect(rule).toContain('background-origin: border-box;')
    expect(rule).toContain('background-position: center;')
    expect(rule).toContain('background-repeat: no-repeat;')
  })

  // The compass needle is redrawn, not inverted (TJ, 2026-10-14): inverting
  // the library's dark south half put it dark on the dark button. North red,
  // south light, both edged so a light button can carry it too. Measured
  // ratios, pinned so a colour change forces a re-measurement; the button's
  // fill is taken as opaque, as it nearly is at 95% over the map.
  it('draws the compass needle red to the north and light to the south, unfiltered', () => {
    const at = mapCss.indexOf('.maplibregl-ctrl-group .maplibregl-ctrl-compass .maplibregl-ctrl-icon {')
    expect(at).toBeGreaterThan(-1)
    const rule = mapCss.slice(at, mapCss.indexOf('}', at))
    expect(rule).toContain('filter: none;')
    const svg = decodeURIComponent(rule.slice(rule.indexOf('url("') + 5, rule.indexOf('")')))
    expect(svg).toContain('<path fill="#ef4444" d="m10.5 14 4-8 4 8z"/>')
    expect(svg).toContain('<path fill="#f8fafc" d="m10.5 16 4 8 4-8z"/>')
    expect(svg).toContain('stroke="#475569"')
    expect(svg).toContain('viewBox="0 0 29 29"')
    const MEASURED = { northOnButton: 3.88, northOnWhite: 3.76, southOnButton: 13.97, edgeOnWhite: 7.58 }
    const fill = (d: string) => svg.match(new RegExp(String.raw`<path fill="(#[0-9a-f]{6})" d="${d}"/>`))![1]
    const [north, south] = [fill('m10.5 14 4-8 4 8z'), fill('m10.5 16 4 8 4-8z')]
    const edge = svg.match(/stroke="(#[0-9a-f]{6})"/)![1]
    const button = dark(token(MAP_ROUND_BUTTON, 'bg'))
    expect({
      northOnButton: ratio(north, button),
      northOnWhite: ratio(north, '#ffffff'),
      southOnButton: ratio(south, button),
      edgeOnWhite: ratio(edge, '#ffffff'),
    }).toEqual(MEASURED)
    for (const [pair, r] of Object.entries(MEASURED)) expect(r, pair).toBeGreaterThanOrEqual(3)
  })

  // The library's white box comes off its buttons (record 0147): a group is
  // no surface of its own, its buttons 4px apart as the app's column is.
  it('draws the library\'s buttons as the app\'s, 4px apart, glyphs light', () => {
    const rule = (selector: string) => {
      const at = mapCss.indexOf(`${selector} {`)
      expect(at, selector).toBeGreaterThanOrEqual(0)
      return mapCss.slice(at, mapCss.indexOf('}', at))
    }
    const group = rule('.maplibregl-ctrl-group')
    for (const decl of ['background: transparent;', 'box-shadow: none;', 'gap: 4px;']) expect(group).toContain(decl)
    expect(rule('.maplibregl-ctrl-top-right .maplibregl-ctrl + .maplibregl-ctrl')).toContain('margin-top: 4px;')
    expect(rule('.maplibregl-ctrl-group .maplibregl-ctrl-icon')).toContain('filter: invert(1) hue-rotate(180deg);')
    // The light theme's buttons are light, so its glyphs keep the library's
    // own dark drawing (#706).
    expect(rule(':root[data-theme="light"] .maplibregl-ctrl-group .maplibregl-ctrl-icon')).toContain('filter: none;')
    // The idle compass hides by a class on the button itself (record 0147),
    // since a phone stands it outside the map's container: in the chip row's
    // slot while north-up. A desk's corner keeps it, greyed by `DISABLED`
    // alone rather than by the library's own fade of its glyph as well, as a
    // disabled zoom half is (record 0174).
    expect(rule('.map-slot .maplibregl-ctrl-compass.compass-idle')).toContain('display: none;')
    expect(
      rule(
        '.maplibregl-ctrl-compass:disabled .maplibregl-ctrl-icon,\n' +
          '.maplibregl-ctrl-zoom-in:disabled .maplibregl-ctrl-icon,\n' +
          '.maplibregl-ctrl-zoom-out:disabled .maplibregl-ctrl-icon',
      ),
    ).toContain('opacity: 1;')
    // The zoom pair's halves meet, and the pair shows nowhere but a desk's
    // corner: the one rule that hides it is keyed on the library's corner,
    // where a phone leaves it.
    const pair = '.maplibregl-ctrl-group:has(> .maplibregl-ctrl-zoom-in)'
    expect(rule(pair)).toContain('gap: 0;')
    const hiding = [...mapCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .map(([, selector, body]) => [selector.slice(selector.lastIndexOf('*/') + 1).replace(/^\/?\s*/, '').trim(), body])
      .filter(([selector, body]) => selector.includes('zoom') && body.includes('display: none'))
      .map(([selector]) => selector)
    expect(hiding).toEqual([`.maplibregl-ctrl-top-right ${pair}`])
  })

  // The credit line is the floating box, and its links read the way `LINK`
  // reads: map.css spells LINK's values because the library rewrites the links.
  it('draws the credit line as the floating box with LINK\'s links', () => {
    for (const t of tokens(SURFACE_FLOATING)) expect(tokens(MAP_CREDIT.card)).toContain(t)
    // Its (i) is a map button at the band's 24px: the same fill, edge and round.
    const floatingFill = `bg-${token(SURFACE_FLOATING, 'bg')}/95`
    const floatingEdge = `border-${token(SURFACE_FLOATING, 'border')}`
    for (const t of [floatingFill, 'border', floatingEdge, RADIUS.pill]) {
      expect(tokens(MAP_CREDIT.button)).toContain(t)
      expect(tokens(MAP_ROUND_BUTTON)).toContain(t)
    }
    // map.css reads LINK's two tokens by their variables, so the credit line
    // follows the theme with the rest (#706).
    expect(tokens(LINK)).toContain('underline')
    const linkInk = `--ui-${token(LINK, 'text')}`
    const linkHover = `--ui-${token(LINK, 'hover:text')}`
    expect(mapCss).toMatch(new RegExp(String.raw`\.maplibregl-ctrl-attrib a \{\s*color: var\(${linkInk}\);\s*text-decoration: underline;`))
    expect(mapCss).toMatch(new RegExp(String.raw`\.maplibregl-ctrl-attrib a:hover \{\s*color: var\(${linkHover}\);`))
    expect(mapCss).toMatch(new RegExp(String.raw`\.maplibregl-ctrl\.maplibregl-ctrl-attrib \{\s*color-scheme: dark;\s*color: var\(${linkInk}\);`))
    expect(mapCss).toMatch(/:root\[data-theme="light"\] \.maplibregl-ctrl\.maplibregl-ctrl-attrib \{\s*color-scheme: light;/)
    // A folded line is its button alone.
    expect(mapCss).toMatch(/\.maplibregl-ctrl-attrib\.maplibregl-compact:not\(\.maplibregl-compact-show\) \{\s*background: transparent;\s*border-width: 0;/)
  })

  it('leaves the Analyze button at 56, over the floor already', () => {
    expect(steps(MAP_FAB, /(?:^|\s)h-(\d+)(?:\s|$)/)).toBe(56)
  })
})

// The phone's Analyze (#696; record 0135): Material's extended floating
// action button, on the panel's primary fill and gate.
describe('the Analyze button on a phone', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)

  // The slot places the button and its badge together (record 0208); the
  // button itself is the slot's box, so the badge's corner is its corner.
  it('is 56px tall with a 16px corner, in a slot 16px off the right edge', () => {
    expect(tokens(MAP_FAB)).toEqual(expect.arrayContaining(['relative', 'h-14', 'rounded-2xl']))
    expect(tokens(MAP_FAB_SLOT)).toEqual(['absolute', 'right-4', LAYER.mapControls])
    expect(MAP_FAB).not.toMatch(/(^|\s)(absolute|right-|z-)/)
    expect(MAP_FAB).toContain(ELEVATION.overlay)
  })

  // A press shows on the button itself (TJ, 2026-10-14), Material's way: a
  // white state layer at 12% and the shadow dropping a step, on a mouse and a
  // finger alike, and never on a disabled button.
  it('shows a press with a state layer and a lower shadow', () => {
    const t = tokens(MAP_FAB)
    expect(t).toEqual(
      expect.arrayContaining([
        'after:absolute',
        'after:inset-0',
        `after:bg-${token(ACCENT.fill, 'text')}`,
        'after:opacity-0',
        'enabled:active:after:opacity-[0.12]',
        'after:pointer-events-none',
      ]),
    )
    expect(ELEVATION.raised).toBe('shadow-lg')
    expect(t).toContain(`enabled:active:${ELEVATION.raised}`)
    expect(t.some((c) => c.startsWith('disabled:') || c === 'active:after:opacity-[0.12]')).toBe(false)
  })

  // The primary fill, so the white label keeps record 0008's contrast; the
  // call to action's type; the panel's grey from the call site.
  it('wears BUTTON_PRIMARY\'s fill and the call to action\'s type', () => {
    for (const part of [ACCENT.fill, ACCENT.fillHover, FOCUS_RING, TEXT.cta]) expect(MAP_FAB).toContain(part)
    for (const part of [ACCENT.fill, TEXT.cta]) expect(BUTTON_PRIMARY).toContain(part)
    expect(phoneFootSource).toContain('${MAP_FAB} ${DISABLED} ${BLOCKED}')
  })

  // Both words in one grid cell, so the width is the wider word's.
  it('reserves the wider word\'s width by stacking both', () => {
    expect(tokens(MAP_FAB_WORDS.cell)).toEqual(['grid', 'place-items-center', '[&>*]:col-start-1', '[&>*]:row-start-1'])
    expect(MAP_FAB_WORDS.hidden).toBe('invisible')
    expect(phoneFootSource).toContain('aria-hidden="true" className={MAP_FAB_WORDS.hidden}')
  })
})

// The phone's one menu shape (#696; record 0136): a card from the bottom
// edge, over a dimmed map, with its title and Done and rows a finger tall.
describe('the bottom sheet', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)

  it('stands over everything a phone\'s map holds, modal over a dim', () => {
    for (const recipe of [BOTTOM_SHEET.scrim, BOTTOM_SHEET.card]) expect(recipe).toContain(LAYER.popover)
    // The Analyze button among it: every sheet's dim covers the button where
    // it stands, and the sheet's modality keeps it from a press, so the foot
    // neither hides it nor makes it inert (record 0207).
    expect(zOf(MAP_FAB_SLOT.match(/(?:^|\s)(z-\S+)/)![1])).toBeLessThan(zOf(LAYER.popover))
    expect(phoneFootSource).not.toMatch(/\binert\b/)
    expect(tokens(BOTTOM_SHEET.scrim)).toEqual(expect.arrayContaining(['fixed', 'inset-0']))
    expect(darkStep(token(BOTTOM_SHEET.dim, 'bg'))).toBe('black')
    expect(BOTTOM_SHEET.dim).toMatch(/(^|\s)bg-scrim\/\d+(\s|$)/)
    // The whole screen, chips and search row included, fixed to the viewport
    // with the scrim, so no banner above the map leaves a band of it bright.
    expect(BOTTOM_SHEET.dim.split(/\s+/)).toEqual(expect.arrayContaining(['absolute', 'inset-0']))
    expect(BOTTOM_SHEET.dim).not.toMatch(/(^|\s)top-/)
    expect(bottomSheetSource).toContain('role="dialog"')
    expect(bottomSheetSource).toContain('aria-modal="true"')
    // Modal unless the tutorial holds it open behind its own card (#696), or
    // the kept Controls sheet is shut or held by the tutorial (record 0207).
    expect(bottomSheetSource).toContain('useDialog(onClose, open && (kept ? !kept.tourRuns : tourAnchor === undefined))')
  })

  // The results sheet's surface, a step up, since it stands over that sheet.
  it('is the results sheet\'s surface lifted to the overlay depth', () => {
    const surface = tokens(SURFACE_SHEET).filter((t) => !t.startsWith('shadow') && t !== 'overflow-hidden')
    for (const t of surface) expect(tokens(BOTTOM_SHEET.card)).toContain(t)
    expect(tokens(BOTTOM_SHEET.card)).toContain(ELEVATION.overlay)
  })

  // Every row a finger's 44px, one rule between rows, and the body the one
  // part that scrolls, in the shared dark bar.
  it('gives every row a finger\'s height and the body the scroll', () => {
    expect(tokens(BOTTOM_SHEET.body)).toEqual(expect.arrayContaining(['[&>*]:min-h-8', 'overflow-y-auto', 'divide-y', SCROLL_BARS]))
    expect(BOTTOM_SHEET.title).toBe(TEXT.subheading)
    for (const part of [CONTROL_SIZE, TAP.action, LINK_ACTION, FOCUS_RING]) expect(BOTTOM_SHEET.done).toContain(part)
  })
})

// A recipe's classes, for the phone chrome checks below.
const words = (recipe: string) => recipe.split(/\s+/).filter(Boolean)

// The count on the Analyze button (#786; record 0208): a 20px disc at the
// button's corner, filled in the worst message's ink with the digit in the
// panel's colour, so the fill is the colour a notice's text would be and the
// digit stands out on it in either theme. The same badge on the panel's
// button at a desk and on the map's on a phone.
describe('the message badge', () => {
  // The digit on each fill, in each theme, measured on the hex the browser
  // paints; literals so a token change fails here and forces a re-measurement
  // rather than inheriting a stale claim.
  const MEASURED = {
    dark: { error: 5.06, warn: 10.1, info: 8.77 },
    light: { error: 8.33, warn: 6.31, info: 8.35 },
  }

  // A 20px disc inside a 2px edge, which is a border so the button is the 24px
  // a target owes (WCAG 2.5.8, Lighthouse's target-size audit), standing
  // where the disc and a ring outside it stood.
  it('is a 20px pill edged in the panel, a 24px button at the button\'s corner, 44px to a finger', () => {
    const t = words(MESSAGE_BADGE.base)
    expect(t).toEqual(
      expect.arrayContaining([
        'absolute',
        '-right-2.5',
        '-top-2.5',
        'h-6',
        'min-w-6',
        RADIUS.pill,
        'border-2',
        'border-panel',
        'font-bold',
        'tabular-nums',
        ...words(MICRO_SIZE),
        ...words(FOCUS_RING),
      ]),
    )
    expect(t).not.toContain('ring-2')
    // 24px plus 10px each side on touch: the 44px a finger needs, drawn by
    // nothing (`touch:before:-inset-2.5`), so the disc stays a disc.
    expect(t).toEqual(expect.arrayContaining(['touch:before:absolute', 'touch:before:-inset-2.5', "touch:before:content-['']"]))
    expect(MESSAGE_BADGE.slot).toBe('relative')
    // The phone's slot is the positioned box, so the badge's corner is the
    // button's there too.
    expect(words(MAP_FAB_SLOT)).toContain('absolute')
  })

  it('fills in the severity\'s ink with the panel\'s digit, clearing AA in both themes', () => {
    const measured = { dark: {} as Record<string, number>, light: {} as Record<string, number> }
    for (const tone of ['error', 'warn', 'info'] as const) {
      const fill = token(MESSAGE_BADGE[tone], 'bg')
      expect(MESSAGE_BADGE[tone]).toBe(`bg-${fill} text-panel`)
      // The fill is the ink a notice of that severity writes in.
      expect(fill).toBe(token(STATUS[tone], 'text'))
      measured.dark[tone] = ratio(dark('panel'), dark(fill))
      measured.light[tone] = ratio(light('panel'), light(fill))
    }
    expect(measured).toEqual(MEASURED)
    for (const theme of Object.values(MEASURED)) {
      for (const [tone, r] of Object.entries(theme)) {
        expect(r, `the ${tone} digit must clear the 4.5:1 asked of text`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

// A blocked Analyze and the line under its field (record 0208).
describe('a blocked Analyze and the message list', () => {
  // Greyed the way a disabled button is, under aria-disabled rather than
  // disabled, so it stays a button a press can open the list from.
  it('greys a blocked button as a disabled one is greyed', () => {
    expect(BLOCKED).toBe('aria-disabled:opacity-40')
    expect(DISABLED).toContain('disabled:opacity-40')
  })

  it('stacks the list\'s boxes on the menu\'s list inset at a desk', () => {
    expect(MESSAGE_LIST.card).toBe(`${MENU.list} space-y-2`)
    expect(MESSAGE_LIST.sheet).toBe('space-y-2 py-2')
  })
})

// The band a phone keeps for its home indicator (#336, #696; record 0145).
describe('the safe area', () => {
  it('pads by the bottom inset, and probes the same height', () => {
    expect(SAFE_AREA.pad).toBe('pb-[env(safe-area-inset-bottom)]')
    expect(words(SAFE_AREA.probe)).toEqual(
      expect.arrayContaining(['h-[env(safe-area-inset-bottom)]', 'fixed', 'bottom-0', 'invisible', 'pointer-events-none']),
    )
  })

  // A sheet whose body scrolls ends its content the band above the screen's
  // foot, as the results sheet does (record 0152, the maintainer 2026-10-14).
  // Measured 2026-10-14 in the Playwright image's Chromium at 390x844,
  // scrolled to the end: with no band reported, the Controls sheet's last
  // section ends 16px above the rule over the document links and the links'
  // line 16px above the foot, and the Layers sheet's next-to-last label 15px
  // above its rule and the last one 15px above the foot; with a 34px band
  // emulated, each last line stands those 16 and 15px plus the 34 above it.
  // Those are browser pixels, which this file cannot take; what it holds is
  // the padding that produced them.
  it('ends every sheet scroller the band above the foot, and pads no sheet card', () => {
    for (const recipe of [BOTTOM_SHEET.card, CONTROLS_SHEET.card]) expect(recipe).not.toContain('safe-area')
    expect(words(BOTTOM_SHEET.body)).toContain(SAFE_AREA.pad)
    expect(words(CONTROLS_SHEET.body)).toEqual([
      'pb-[calc(1rem+env(safe-area-inset-bottom))]',
      '[--scroll-shadow-end-inset:env(safe-area-inset-bottom)]',
    ])
    // The Controls body's 16px is the stack's gap above each rule.
    expect(words(PANEL_RULE)).toContain('[&>*+*]:mt-4')
  })

  // The end shade stands on the scroller's padding, so a scroller that pads
  // for the band tells the shade, which then still meets the bottom edge.
  it('drops the end shade by the band a scroller names', () => {
    expect(indexCss).toMatch(/bottom: calc\(-1 \* var\(--scroll-shadow-bleed, 0px\) - var\(--scroll-shadow-end-inset, 0px\)\)/)
  })
})

// The panel on a phone (#696; record 0141): the bottom sheet's surface,
// mounted for good and slid below the map while shut, and modal over the
// bottom sheet's own dim while open (record 0207).
describe('the Controls sheet', () => {
  it('wears the bottom sheet surface on the panel layer, and slides', () => {
    expect(darkStep(token(CONTROLS_SHEET.card, 'bg'))).toBe('slate-800')
    expect(darkStep(token(CONTROLS_SHEET.card, 'border'))).toBe('slate-600')
    for (const part of ['border-t', 'rounded-t-lg', ELEVATION.overlay, LAYER.drawer, 'focus:outline-none']) {
      expect(words(CONTROLS_SHEET.card)).toContain(part)
    }
    for (const part of words(MOTION.slide)) expect(words(CONTROLS_SHEET.card)).toContain(part)
    expect(CONTROLS_SHEET.shut).toBe('translate-y-full')
    expect(words(CONTROLS_SHEET.panel)).toEqual(['min-h-0', 'flex-1'])
  })

  // Its dim is the whole screen, fixed to the viewport like a menu sheet's,
  // one layer under the card: over the map, the button and the results
  // sheet (record 0207).
  it('dims the whole screen one layer under the card', () => {
    expect(words(CONTROLS_SHEET.scrim)).toEqual(['fixed', 'inset-0', LAYER.scrim])
    expect(zOf(LAYER.scrim)).toBeLessThan(zOf(LAYER.drawer))
    for (const under of [LAYER.base, LAYER.sheet, LAYER.mapControls, MAP_FAB_SLOT.match(/(?:^|\s)(z-\S+)/)![1]]) {
      expect(zOf(under)).toBeLessThan(zOf(LAYER.scrim))
    }
    expect(bottomSheetSource).toContain('kept ? CONTROLS_SHEET.scrim : BOTTOM_SHEET.scrim')
    expect(bottomSheetSource).toContain('<div className={`${BOTTOM_SHEET.dim}${aside ? ` ${SHEET_ASIDE.dim}` : \'\'}`} />')
  })
})

// The results table's Name column stands still (#696; record 0142), on an
// opaque fill so the columns under it do not show through.
describe('the sticky Name column', () => {
  it('sticks at the left edge on the fill of the surface it stands on', () => {
    for (const recipe of [STYLES.TABLE.stickyNameCell, STYLES.TABLE.stickyNameHead]) {
      expect(words(recipe)).toEqual(expect.arrayContaining(['sticky', 'left-0', 'z-[1]']))
    }
    expect(darkStep(token(STYLES.TABLE.stickyNameCell, 'bg'))).toBe('slate-800')
    expect(darkStep(token(STYLES.TABLE.stickyNameHead, 'bg'))).toBe('slate-700')
    // The row's hover tint, over the fill rather than under it.
    const hover = `${token(STYLES.TABLE.row, 'hover:bg')}/30`
    expect(darkStep(token(STYLES.TABLE.row, 'hover:bg'))).toBe('slate-700')
    expect(words(STYLES.TABLE.row)).toContain(`hover:bg-${hover}`)
    expect(words(STYLES.TABLE.stickyNameCell)).toEqual(
      expect.arrayContaining([`group-hover:from-${hover}`, `group-hover:to-${hover}`]),
    )
    expect(STYLES.TABLE.rowOpens).toBe('cursor-pointer')
  })
})

// A finger reads the chart sideways and scrolls the sheet up and down
// (#336; record 0144).
describe('the chart under a finger', () => {
  it('leaves the browser the vertical pan alone', () => {
    expect(CHART_PLOT_TOUCH).toBe('touch-pan-y')
  })
})

// A phone's chart picker is the plot's title (#696; record 0149), and the plot
// is inset by the title's box so its dashed lines, their labels and the y
// axis's top tick start under it. Measured 2026-10-14 in the Playwright
// image's Chromium: the field row it replaced was 52px at 360 and 390 (the
// 44px select a finger presses and the row's 4px either side). The box stands
// 12px from the grip's rule, 12px over the y axis's top label and 12px from
// the sheet's edge, the results bar's own inset (the maintainer, 2026-10-14).
describe('the chart title on a phone', () => {
  const MEASURED = { fieldRowPx: 52, insetPx: 28, rulePx: 12, labelPx: 12, leftPx: 12, barLeftPx: 12 }

  it('is a 28px box with the same room above it, below it and on its left', () => {
    expect(words(CHART_TITLE.box)).toEqual(expect.arrayContaining(['h-7', 'top-3', 'left-3']))
    expect(7 * 4).toBe(CHART_TITLE_PX)
    expect(CHART_TITLE_PX).toBe(MEASURED.insetPx)
    expect(3 * 4).toBe(CHART_TITLE_INSET_PX)
    for (const gap of [MEASURED.rulePx, MEASURED.labelPx, MEASURED.leftPx]) expect(gap).toBe(CHART_TITLE_INSET_PX)
    // Its left edge is the results bar's, where "Lowest" and the view buttons stand.
    expect(MEASURED.leftPx).toBe(MEASURED.barLeftPx)
    expect(TITLED_PLOT_MARGIN.top).toBe(2 * CHART_TITLE_INSET_PX + CHART_TITLE_PX + TOP_LABEL_RISE_PX)
  })

  it("wears the select's look, its fill, edge, radius, type and arrow room, at the plot's left margin", () => {
    expect(words(CHART_TITLE.box)).toEqual(
      expect.arrayContaining([...words(TEXT.control), RECESSED_FILL, ...words(RECESSED_EDGE), RADIUS.control, 'pr-6']),
    )
    expect(words(SELECT)).toContain('pr-6')
    // The chevron every menu trigger wears, where every select's stands.
    expect(timeSeriesChartSource).toContain('<IconChevron up={false} className={ICON_ADORNMENT} />')
    // Sized to its words, not to the desktop picker's fixed width.
    expect(CHART_TITLE.box).not.toContain(CHART_METRIC_W)
  })

  it('lays the native select over the title, invisible, a 44px target centred on it', () => {
    expect(words(CHART_TITLE.select)).toEqual(
      expect.arrayContaining(['absolute', 'opacity-0', 'touch:h-11', 'w-full', 'top-1/2', '-translate-y-1/2']),
    )
    // 44 over a 28px box is 8px either side, inside the 12px of room.
    expect((44 - CHART_TITLE_PX) / 2).toBeLessThan(CHART_TITLE_INSET_PX)
    // FIELD's focus edge, on the box because the select is invisible.
    expect(darkStep(token(FIELD, 'focus:border'))).toBe('sky-500')
    expect(token(CHART_TITLE.box, 'has-[select:focus]:border')).toBe(token(FIELD, 'focus:border'))
  })
})

// The map's Layers popover: thirteen rows in three groups (record 0240).
describe('the map layer rows', () => {
  // Read out of the source rather than out of a render, for the reason every
  // other check here is: Vitest has no DOM, and the order is a property of the
  // literal the popover maps over.
  const block = layersPopoverSource.match(/const MAP_LAYERS(?:: [^=]+)? = \[[\s\S]*?\n {2}\]/)?.[0] ?? ''
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  const headings = [...block.matchAll(/heading: '([^']+)'/g)].map((m) => m[1])

  it('found every row', () => {
    expect(labels).toHaveLength(13)
  })

  // By what a layer changes: the map itself, a hazard on it, the weather on
  // it, the ground first; and by kind inside a group (the maintainer,
  // 2026-10-29, from the lab).
  it('lists the layers in three groups, ordered by kind', () => {
    expect(headings).toEqual(['Base map', 'Hazards', 'Forecast'])
    expect(labels).toEqual([
      'Satellite',
      'Topographic',
      'Shaded relief',
      'Slope angle',
      'Wildfires',
      'Fire activity',
      'Smoke',
      'Area closures',
      'Trail closures',
      'Rain radar',
      'Snow depth',
      'Forecast grid',
      'Forecast player',
    ])
  })

  // Shift ranges run down the whole list, across the groups (record 0227).
  it('takes one Shift order across the groups', () => {
    expect(layersPopoverSource).toContain('const layers = MAP_LAYERS.flatMap((group) => group.rows)')
    expect(layersPopoverSource).toContain('const order = layers.map((layer) => layer.key)')
  })

  // The heading is read and never pressed: the caption step in semibold,
  // sentence case, the rows' own size in a quieter ink. Measured on the
  // card it stands on, in both themes.
  it('heads each group in the caption step, semibold, past AA on the card', () => {
    expect(MENU.heading).toBe(`${TEXT.caption} font-semibold`)
    expect(MENU.heading).not.toMatch(/uppercase|tracking-/)
    expect(sizes(MENU.heading)).toEqual(sizes(TEXT.control))
    expect(token(MENU.heading, 'text')).toBe('ink-soft')
    expect(ratio(dark(token(MENU.heading, 'text')), dark('floating'))).toBe(5.56)
    expect(ratio(light(token(MENU.heading, 'text')), light('floating'))).toBe(8.91)
  })

  // At a desk 6px over every group but the first, and the heading 2px over
  // its first row, the gap a row keeps; on a phone the sheet's own rule
  // between the heading and each row, and each row the sheet's 32px.
  it('spaces the groups at a desk and rules them on a phone the sheet\'s way', () => {
    expect(MENU_GROUP.card).toBe('not-first:mt-1.5')
    expect(MENU_GROUP.cardHeading).toBe(`${MENU.heading} pb-0.5`)
    expect(stepPx(MENU_GROUP.cardHeading, 'pb')).toBe(stepPx(MENU.cardRow, 'py'))
    expect(BOTTOM_SHEET.body).toContain(MENU_GROUP.sheet)
    expect(MENU_GROUP.sheetHeading).toBe(`${MENU.heading} pt-1.5 pb-0.5`)
    expect(BOTTOM_SHEET.body).toContain(`[&>*]:${MENU_GROUP.sheetRow}`)
    expect(layersPopoverSource).toContain('className={sheet ? MENU_GROUP.sheet : MENU_GROUP.card}')
    expect(layersPopoverSource).toContain('className={sheet ? MENU_GROUP.sheetHeading : MENU_GROUP.cardHeading}')
  })
})

// The Layers palette's rows (record 0241): an eye over every row's checkbox,
// an opacity slider on the four Base map rows, and the phone's sheet stepping
// aside while one is dragged.
describe('the layers palette', () => {
  const both = (fn: (theme: (name: string) => string) => number) => [fn((n) => dark(n)), fn(light)]

  // The eye is a glyph that carries the row's state, so each ink owes 3:1 on
  // every ground the row stands on: the desk's card, the raised fill under
  // the pointer, and the phone's sheet. The struck eye takes the soft ink,
  // a step up from the lab's faint one, which read 2.2:1 on the raised fill.
  it('draws the eye in two inks, each past 3:1 on the card, the hover and the sheet', () => {
    expect(token(LAYER_ROW.on, 'text')).toBe('ink-mid')
    expect(token(LAYER_ROW.off, 'text')).toBe('ink-soft')
    for (const ink of [LAYER_ROW.on, LAYER_ROW.off]) {
      for (const ground of ['floating', 'raised', 'panel']) {
        for (const theme of [(n: string) => dark(n), light]) {
          expect(contrast(theme(token(ink, 'text')), theme(ground))).toBeGreaterThanOrEqual(3)
        }
      }
    }
    expect(both((t) => ratio(t(token(LAYER_ROW.on, 'text')), t('floating')))).toEqual([9.83, 12.3])
    expect(both((t) => ratio(t(token(LAYER_ROW.off, 'text')), t('raised')))).toEqual([3.94, 7.47])
    // The faint ink the lab drew the struck eye in, on the raised fill.
    expect(ratio(dark('ink-faint'), dark('raised'))).toBeLessThan(3)
    // The eye fills the 16px box its checkbox is laid over.
    expect(LAYER_ROW.eyeInput).toContain('appearance-none')
    expect(LAYER_ROW.eyeInput).toContain('absolute inset-0')
  })

  // An off row's name is text, in the heading's soft ink, past 4.5:1 on the
  // card and the sheet. Under the pointer, on the raised fill, where the soft
  // ink reads under AA in dark, it takes the rows' own ink.
  it('sets an off row\'s name in the soft ink, past AA wherever it stands', () => {
    const soft = token(LAYER_ROW.nameOff, 'text')
    expect(soft).toBe(token(MENU.heading, 'text'))
    for (const ground of ['floating', 'panel']) {
      for (const t of [(n: string) => dark(n), light]) expect(contrast(t(soft), t(ground))).toBeGreaterThanOrEqual(4.5)
    }
    expect(ratio(dark(soft), dark('raised'))).toBeLessThan(4.5)
    const lit = token(LAYER_ROW.nameOff, 'group-hover/layer:text')
    expect(lit).toBe(token(TEXT.control, 'text'))
    for (const t of [(n: string) => dark(n), light]) expect(contrast(t(lit), t('raised'))).toBeGreaterThanOrEqual(4.5)
    expect(LAYER_ROW.line).toContain('group/layer')
  })

  // A slider whose layer is off still works, so its line owes 4.5:1. The
  // lab's 55% fade would have left the value on the accent under it in both
  // themes; the resting fill is the raised surface in the control ink.
  it('dims an off layer\'s slider by its fill, its line still past AA', () => {
    const fill = LAYER_ROW.restingFill
    expect(fill).not.toMatch(/opacity/)
    expect(both((t) => ratio(t(token(fill, 'text')), t(token(fill, 'bg'))))).toEqual([8.4, 13.66])
    for (const t of [(n: string) => dark(n), light]) {
      expect(contrast(t(token(fill, 'text')), t(token(fill, 'bg')))).toBeGreaterThanOrEqual(4.5)
    }
    // What the lab's fade would have given the value on the accent.
    const faded = (t: (n: string) => string) =>
      ratio(over(t('on-fill'), 0.55, t('floating')), over(t('accent'), 0.55, t('floating')))
    expect(faded((n) => dark(n))).toBeLessThan(4.5)
    expect(faded(light)).toBeLessThan(4.5)
  })

  // The lab's sizes: 96 by 20 at a desk, 120 by 24 on a phone, where the
  // sheet's rows are 32px. `100%` and `Opacity` with the well's 8px either
  // side are 82px (measured in the browser suite's Chromium, 2026-10-29).
  it('sizes the sliders to their line, the desk\'s row to its slider', () => {
    const MEASURED = { line: 16 + 26.9 + 41.6 }
    expect([stepPx(LAYER_ROW.slider, 'w'), stepPx(LAYER_ROW.slider, 'h')]).toEqual([96, 20])
    expect([stepPx(LAYER_ROW.sliderSheet, 'w'), stepPx(LAYER_ROW.sliderSheet, 'h')]).toEqual([120, 24])
    expect(stepPx(LAYER_ROW.slider, 'w') - MEASURED.line).toBeGreaterThanOrEqual(8)
    // The desk's row is the slider and 4px over and under it.
    expect(stepPx(LAYER_ROW.cardRow, 'min-h')).toBe(stepPx(LAYER_ROW.slider, 'h') + 2 * 4)
    expect(stepPx(LAYER_ROW.sliderSheet, 'h')).toBeLessThanOrEqual(stepPx(MENU_GROUP.sheetRow, 'min-h'))
    // The rows a group holds at a desk are ruled the sheet's way.
    expect(LAYER_ROW.cardRows).toBe('divide-y divide-rule')
    expect(layersPopoverSource).toContain('${sheet ? LAYER_ROW.sliderSheet : LAYER_ROW.slider} ${SLIDER.well}')
  })

  // While a finger drags, the dim lifts and the card goes but for the row
  // dragged, which keeps the sheet's own fill, edge and shadow.
  it('steps the sheet aside but for the row being dragged', () => {
    expect(SHEET_ASIDE.dim).toBe('opacity-0')
    expect(SHEET_ASIDE.card).toBe('invisible')
    expect(SHEET_ASIDE.keep).toContain('visible')
    expect(token(SHEET_ASIDE.keep, 'bg')).toBe(token(BOTTOM_SHEET.card, 'bg'))
    expect(bottomSheetSource).toContain('${BOTTOM_SHEET.card}${aside ? ` ${SHEET_ASIDE.card}` : \'\'}')
    expect(SHEET_ASIDE.keep).toContain(ELEVATION.overlay)
  })
})

// The map's one legend box (#454): the metric key and a section per layer that
// is on, all in one list in the Layers menu's order.
describe('the map legend sections', () => {
  // The whole box, metric key included — it is one box now, where the key used
  // to be a second one below the layer rows.
  const box = (() => {
    const from = mapLegendSource.indexOf('ONE box, gaining and losing sections')
    return from >= 0 ? mapLegendSource.slice(from) : ''
  })()

  // Every section's label as the box RENDERS it. The metric key's is the ranked
  // metric's noun, which changes under the reader, so it is the one that cannot
  // be listed here.
  const LAYER_LABELS = [
    "label: 'Active wildfire'",
    "label: 'Area closures'",
    "label: 'Trail closures'",
    'label: gridLegend.label',
    "label: 'Rain radar'",
    "label: 'Smoke'",
    'label: SNOW_LABEL',
    "label: 'Fire activity'",
  ]
  // The same, in the order the card reads them after the slope bands.
  const LAYER_LABELS_IN_ORDER = [
    "label: 'Active wildfire'",
    "label: 'Fire activity'",
    "label: 'Smoke'",
    "label: 'Area closures'",
    "label: 'Trail closures'",
    "label: 'Rain radar'",
    'label: SNOW_LABEL',
    'label: gridLegend.label',
  ]

  it('found every section', () => {
    expect(box).not.toBe('')
    for (const mark of LAYER_LABELS) {
      expect(box.split(mark).length - 1, mark).toBe(1)
    }
    // The metric key's label is composed, not written: `metricLabel` is what
    // every surface in the app names a metric with, and it reads the SCALE's
    // unit so playback's swap to `in/hr` relabels the strip with its bands.
    expect(box).toContain('label: metricLabel(')
  })

  // In the Layers menu's order (record 0240): the metric key, the base map's
  // slope bands, the hazards, then the forecast. Written in that order rather
  // than sorted, so the order is the source's.
  it('lists the sections in the Layers menu\'s order, the metric key first', () => {
    const at = (mark: string) => box.indexOf(mark)
    const order = ['label: metricLabel(', "label: 'Slope angle'", ...LAYER_LABELS_IN_ORDER]
    expect(order.map(at).every((i) => i >= 0)).toBe(true)
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b))
    expect(box).not.toContain('.sort(')
  })

  // One box, not two: the second cost a border, a gap and a backdrop on a map
  // that can be 161px tall.
  it('draws them all in one box', () => {
    expect((box.match(/\$\{SURFACE_CHIP_CARD\.key\}/g) ?? []).length).toBe(1)
  })

  // Every section, a chip row or a scale alike, is built by one function —
  // which is what lets them stand in one list at all, and what stopped the
  // snow key being the odd one out.
  it('builds every section from the one recipe', () => {
    expect((box.match(/legendSection\(section\)/g) ?? []).length).toBe(1)
    expect((box.match(/\bramp: \{/g) ?? []).length).toBe(3)
  })
})

// At a desk the legend is the card under the Legend chip (#714, record 0174).
// It scrolls inside the map left below the rows, so a long legend never runs
// under the timeline or off the map's foot.
describe('the desk legend card', () => {
  const card = mapLegendSource.match(/className=\{`\$\{SURFACE_CHIP_CARD\.key\} \$\{MAP_CHIP_MENU\}[^`]*`\}/)?.[0] ?? ''

  it('found the card', () => {
    expect(card).not.toBe('')
  })

  it('scrolls inside a height the map reads off its own box', () => {
    expect(card).toContain('overflow-y-auto')
    expect(mapLegendSource).toContain('style={{ maxHeight: legendMaxCss(sheetLiftPx, timelineShown) }}')
    expect(MAP_EDGE.publish).toContain('[container-type:size]')
  })
})

// The legend's scale key (#446, generalized in #454): the shape every banded
// scale on the map wears, where a single-value layer keys on a chip.
describe('the legend ramp', () => {
  it('spans the box where a single-value key is a chip', () => {
    // Eleven bands of snow cannot be said by the 14px square the other layers
    // key on, and eleven of those squares in a 184px box are unreadable; six
    // bands of a metric fit in six rows and cost seven lines of a map that can
    // be 161px tall. The strip takes the width instead and the numbers go
    // under it, in two lines whatever the band count.
    expect(SWATCH_RAMP).toMatch(/\bw-full\b/)
    expect(SWATCH_CHIP).not.toMatch(/\bw-full\b/)
    // The line key stands in the column of the single-value keys, the fire's
    // and the area closure's 14px squares, so it is their width. The smoke
    // chips are three side by side and 16px since #687, for their letter.
    expect(SWATCH_LINE).toMatch(/\bw-3\.5\b/)
    expect(mapLegendSource).toMatch(/inline-block h-3\.5 w-3\.5 flex-shrink-0/)
    expect(SWATCH_CHIP).toMatch(/\bh-4 w-4\b/)
  })

  it('names no fill of its own', () => {
    // A band's colour is what the number means: NOAA's for the snow image the
    // map draws, `colors.ts`' for a marker. Either way it arrives at the call
    // site, and a fill spelled here would be a second opinion about a picture
    // already on the map.
    expect(SWATCH_RAMP).not.toMatch(/\bbg-/)
    expect(SWATCH_RAMP).not.toMatch(/-(?:sky|blue|cyan|purple|red)-\d{2,3}/)
  })

  // The border is the app's own, so it is a role rather than a hex at four
  // call sites — and a VALUE rather than a class, because the fill beside it is
  // inline and two colour utilities resolve by stylesheet order.
  // A variable since #706, so it follows the theme: the dark value is the hex
  // it always was, and the light one is the light theme's surface outline.
  it('edges every swatch from one place', () => {
    expect(SWATCH_EDGE).toBe('var(--ui-swatch-edge)')
    expect(DARK_TOKENS['swatch-edge']).toBe('#475569')
    expect(light('swatch-edge')).toBe(light('frame'))
  })

  // The numbers moved INSIDE the strip (TJ, 2026-09-17), which saves a line per
  // scale and costs a contrast rule: a metric ramp runs cyan-300 to purple-500,
  // so no single ink clears AA across it and a ground is what makes one
  // measurable. These are the worst ratios over every metric ramp and the
  // eleven snow bands: white and the scrim's slate-900 straight on a band, and
  // the tick's ink on the scrim over one; a change to the scrim, the ink or a
  // band re-measures them.
  const RAMP_INK = { straightWhite: 1.45, straightDark: 2.04, onScrim: 6.48 }

  it('stands its numbers on a ground rather than on the ramp', () => {
    const bands = [...Object.values(METRIC_SCALE).flatMap((s) => s.colors), ...SNOW_RAMP.map((b) => b.color!)]
    const scrim = dark(token(SWATCH_RAMP_SCRIM, 'bg'))
    const ink = dark(token(SWATCH_RAMP_TICK, 'text'))
    const alpha = alphaOf(SWATCH_RAMP_SCRIM, 'bg')
    const worst = (on: (band: string) => number) => Math.min(...bands.map(on))
    expect({
      straightWhite: worst((band) => ratio('#ffffff', band)),
      straightDark: worst((band) => ratio(scrim, band)),
      onScrim: worst((band) => ratio(ink, over(scrim, alpha, band))),
    }).toEqual(RAMP_INK)
    expect(RAMP_INK.straightWhite).toBeLessThan(4.5)
    expect(RAMP_INK.straightDark).toBeLessThan(4.5)
    expect(RAMP_INK.onScrim).toBeGreaterThanOrEqual(4.5)
    expect(darkStep(token(SWATCH_RAMP_SCRIM, 'bg'))).toBe('slate-900')
    expect(words(SWATCH_RAMP_SCRIM)).toContain(`bg-${token(SWATCH_RAMP_SCRIM, 'bg')}/70`)
    // Full width rather than a chip per number: one ground and one baseline,
    // where four chips are four dark blocks punched through a six-band scale.
    expect(SWATCH_RAMP_SCRIM).toContain('inset-x-0')
    expect(darkStep(token(SWATCH_RAMP_TICK, 'text'))).toBe('slate-200')
    // The strip clips the scrim to its own corners, and a number paints over
    // it rather than under it.
    expect(SWATCH_RAMP).toContain('overflow-hidden')
    expect(SWATCH_RAMP_TICK).toContain('relative')
  })

})

// The chips above the model list: one per selected model, with the one in force
// wearing the accent. Two states of one box, which is what makes the pair read
// as a set rather than as two kinds of thing.
describe('the selection chip', () => {
  it('gives both states the same box and changes only the fill', () => {
    const shape = (recipe: string) =>
      recipe
        .split(' ')
        .filter((c) => !/^(bg|text)-/.test(c))
        .join(' ')
    expect(shape(CHIP.active)).toBe(shape(CHIP.rest))
    expect(CHIP.active).toContain(ACCENT.fill)
    expect(CHIP.rest).not.toContain(ACCENT.fill)
  })

  // The accent fill against the neutral chip beside it measures 2.27:1, under
  // the 3:1 WCAG 1.4.11 asks of a boundary carrying meaning alone — so the
  // state is carried by shape as well, the × that a resting chip has and an
  // active one never does (`chipRemovable`, held in
  // `utils/model/modelSelection.test.ts`). Measured here so a change to either fill
  // is forced through a re-measurement rather than inheriting this sentence.
  const MEASURED = { activeVsRest: 2.27, restLabel: 8.4, activeLabel: 4.56 }

  it('carries its state on a second channel, because colour alone is short', () => {
    const [active, rest] = [dark(token(CHIP.active, 'bg')), dark(token(CHIP.rest, 'bg'))]
    expect({
      activeVsRest: ratio(active, rest),
      restLabel: ratio(dark(token(CHIP.rest, 'text')), rest),
      activeLabel: ratio(dark(token(CHIP.active, 'text')), active),
    }).toEqual(MEASURED)
    expect(MEASURED.activeVsRest).toBeLessThan(3)
    expect(MEASURED.restLabel).toBeGreaterThanOrEqual(4.5)
    expect(MEASURED.activeLabel).toBeGreaterThanOrEqual(4.5)
  })

  // A long model name gives way rather than pushing the chip past the row.
  it('truncates its label rather than widening', () => {
    expect(CHIP.label).toContain('truncate')
    expect(CHIP.label).toContain('min-w-0')
  })

  // The box is 20x24, which is narrower than WCAG 2.5.8's 24x24 and is what
  // keeps the gap before the glyph at 5px instead of 16. The target reaches
  // the floor on a coarse pointer instead, and the negative margin takes those
  // four pixels back out of the layout so nothing beside it moves.
  it('buys the × its AA target without widening the box', () => {
    expect(CHIP.remove).toContain('h-6 w-5')
    expect(CHIP.remove).toContain('touch:w-6')
    expect(CHIP.remove).toContain('touch:-mx-0.5')
  })

  // Four paddings around one word is what made the chips too wide: the label
  // pads its left, the shape pads the chip's right, and the × sits between
  // them with nothing but the glyph's own inset either side.
  it('pads a chip once on each side rather than around every part', () => {
    expect(CHIP.label).toContain('pl-2')
    expect(CHIP.label).not.toMatch(/\bp[xr]-/)
    expect(CHIP.rest).toContain('pr-1')
    expect(CHIP.active).toContain('pr-1')
  })
})

describe('the tutorial', () => {
  it('draws the spotlight as one box whose shadow is the dim layer', () => {
    expect(STYLES.TOUR.spotlight).toContain('shadow-[0_0_0_200vmax_')
    expect(STYLES.TOUR.spotlight).not.toMatch(/rounded/)
    // Its corners are read off the target it frames (tour/place.ts), not a role.
    expect(STYLES.TOUR).not.toHaveProperty('spotlightControl')
    expect(STYLES.TOUR.spotlight).toContain('pointer-events-none')
  })

  // The glide in `Tour.tsx` moves them (#786): a transition handed a new end
  // every frame by a target riding a sheet restarts every frame.
  it('moves by no transition of its own', () => {
    for (const role of Object.values(STYLES.TOUR)) expect(role).not.toMatch(/transition/)
  })

  it('stands the card on the welcome dialog surface, fixed, at the welcome card width', () => {
    expect(STYLES.TOUR.card).toContain(STYLES.SURFACE_CARD)
    expect(STYLES.TOUR.card).toContain('fixed')
    expect(STYLES.TOUR.card).toContain('w-80')
    expect(STYLES.TOUR.sheet).toContain(STYLES.SURFACE_CARD)
    expect(STYLES.TOUR.sheet).toContain('inset-x-4 bottom-4')
    expect(STYLES.TOUR.sheetTop).toContain('inset-x-4 top-4')
  })
})

// #687's design-system pass: one floor for text that is read, one for text
// that is pressed, one named exception under them, and three depths.
describe('the type floor', () => {
  const px = (cls: string) => Number(cls.match(/^text-\[(\d+)px\]$/)?.[1] ?? NaN)
  // Every class string a role carries, objects opened up.
  const recipes = Object.values(STYLES).flatMap((v) =>
    typeof v === 'string' ? [v] : Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string'),
  )

  it('reads the micro step at 11px, and every role built on it follows', () => {
    expect(px(MICRO_SIZE)).toBe(11)
    for (const role of [TEXT.micro, TEXT.overline, BADGE_ACCENT]) expect(sizes(role)).toEqual([MICRO_SIZE])
  })

  // Under 11px only the glyphs in boxes of fixed size, at 10px, named as the
  // exception: the strip's numerals in their 11px scrim band, the smoke key's
  // letters in their chips and the fire key's hours in their stars (#799).
  // Nothing is 9px any more.
  it('keeps 10px for the glyphs in fixed boxes, and nothing smaller', () => {
    const under = recipes.flatMap((r) => sizes(r).filter((c) => px(c) < 11))
    expect(new Set(under)).toEqual(new Set(['text-[10px]']))
    expect(sizes(SWATCH_RAMP_TICK)).toEqual(['text-[10px]'])
    expect(sizes(SWATCH_CHIP)).toEqual(['text-[10px]'])
    expect(sizes(SWATCH_STAR)).toEqual(['text-[10px]'])
    expect(recipes.filter((r) => sizes(r).includes('text-[10px]')).sort()).toEqual(
      [SWATCH_CHIP, SWATCH_RAMP_TICK, SWATCH_STAR].sort(),
    )
  })

  // The fire key's star is the smoke chip's box with the smoke chip's glyph
  // in it (the maintainer, 2026-10-29), so the two keys read as one family.
  it('gives the fire key the smoke chip\'s box and glyph', () => {
    expect(stepPx(SWATCH_STAR, 'h')).toBe(stepPx(SWATCH_CHIP, 'h'))
    expect(stepPx(SWATCH_STAR, 'w')).toBe(stepPx(SWATCH_CHIP, 'w'))
    const glyph = (recipe: string) => recipe.split(/\s+/).filter((c) => /^text-|^font-|^tracking-/.test(c)).sort()
    expect(glyph(SWATCH_STAR)).toEqual(glyph(SWATCH_CHIP))
  })

  // Its label is read on the band's fill, the three as light as smoke's, so
  // the smoke chip's dark ink clears 4.5:1 on each, the red the lowest.
  // Measured 2026-10-28, and re-checked on the 16px star 2026-10-29, whose
  // label stands inside the fill.
  it('sets the hours in the fire key past 4.5:1 on every band', () => {
    const ink = paletteHex(SWATCH_STAR.match(/\btext-(slate-\d+)\b/)![1])
    expect(FIRE_ACTIVITY_FILLS.map((fill) => ratio(ink, fill))).toEqual([5.77, 7.88, 13.53])
  })

  // A 10px letter does not fit a 14px box inside its border, so the box grew.
  it('gives the swatch letter a 16px box', () => {
    expect(stepPx(SWATCH_CHIP, 'h')).toBe(16)
    expect(stepPx(SWATCH_CHIP, 'w')).toBe(16)
  })

  // Recharts takes a number, so the chart's ticks spell the step a third time.
  it('sets the chart ticks at the micro step', () => {
    expect(CHART_TICK_PX).toBe(px(MICRO_SIZE))
  })

  // Both titles name the surface they head, so they are one recipe.
  it('sets the dialog title at the panel title', () => {
    expect(PROSE.title).toBe(TEXT.appTitle)
    expect(sizes(PROSE.title)).toEqual(['text-lg'])
  })
})

describe('the elevation scale', () => {
  const recipes = Object.values(STYLES).flatMap((v) =>
    typeof v === 'string' ? [v] : Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string'),
  )
  // A shadow utility of the stock scale, under any variant. The glows are
  // arbitrary values and are not depths.
  const DEPTH = /(?:^|\s|:)shadow(?:-(?:sm|md|lg|xl|2xl|none))?(?=\s|$)/g

  it('names three depths, two of which cast a shadow', () => {
    expect(ELEVATION).toEqual({ none: 'shadow-none', raised: 'shadow-lg', overlay: 'shadow-2xl' })
  })

  it('uses no depth off the scale anywhere in the design system', () => {
    const allowed = new Set(Object.values(ELEVATION))
    for (const recipe of recipes) {
      for (const hit of recipe.match(DEPTH) ?? []) {
        expect(allowed, `${hit.trim()} in ${recipe}`).toContain(hit.trim().replace(/^.*:/, ''))
      }
    }
  })

  it('puts each surface at the depth of its job', () => {
    expect(SURFACE_FLOATING).toContain(ELEVATION.raised)
    expect(SURFACE_CARD).toContain(ELEVATION.overlay)
    expect(SURFACE_CHIP_CARD.key).toContain(ELEVATION.raised)
    expect(SURFACE_CHIP_CARD.menu).toContain(ELEVATION.overlay)
    expect(BANNER_PREVIEW).toContain(ELEVATION.none)
    expect(SURFACE_SHEET).toContain(ELEVATION.none)
  })

  // The thumbs dropped their shadow: they ride a well, and the Firefox thumb
  // never drew one, so the two engines now draw one thumb.
  it('draws the range thumbs flat on every engine', () => {
    for (const input of [SCRUBBER, SLIDER.overlay]) expect(input).not.toMatch(/thumb\]:shadow/)
  })

  it('keeps the glows off the scale', () => {
    expect(ACCENT_RING).toMatch(/shadow-\[/)
    expect(STYLES.TOUR.spotlight).toMatch(/shadow-\[/)
  })
})

// The compass hides under a class map/controls.ts keeps on the map's container
// while the map is north-up and flat (#687); controls.test.ts holds the name.

// A desk's map corner (record 0174), laid out as Google Maps lays out its own
// (TJ, 2026-10-20): the credit line flush in the corner with the scale at its
// end, and over it the compass, the locate button and the zoom pair, 24px in
// from the map's right edge, 6px apart and 10px above the line.
describe('a desk\'s map corner', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)
  // A spacing step is a quarter of a rem: 4px.
  const step = (recipe: string, prefix: string): number => {
    const m = recipe.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`))
    expect(m, `${prefix} in ${recipe}`).not.toBeNull()
    return Number(m![1]) * 4
  }
  const rule = (selector: string) => {
    const at = mapCss.indexOf(`${selector} {`)
    expect(at, selector).toBeGreaterThanOrEqual(0)
    return mapCss.slice(at, mapCss.indexOf('}', at))
  }

  it('stands the column 24px in, its buttons 6px apart and 10px above the line', () => {
    expect(step(MAP_CORNER.stack, 'mr')).toBe(24)
    expect(step(MAP_CORNER.stack, 'gap')).toBe(6)
    expect(step(MAP_CORNER.box, 'gap')).toBe(10)
    expect(tokens(MAP_CORNER.box)).toEqual(
      expect.arrayContaining(['absolute', 'right-0', 'flex-col', 'items-end', 'pointer-events-none', LAYER.base]),
    )
    // On the lift the library's bottom corners ride, which is 0 at a desk.
    expect(tokens(MAP_CORNER.box)).toContain('bottom-[var(--map-corner-lift,0px)]')
  })

  // Flush against the map's right edge and the results' top, so its two outer
  // edges are off and its one inner corner is the floating box's radius.
  it('draws the credit line as the floating box against two edges, with no shadow', () => {
    const credit = tokens(MAP_CORNER.credit)
    const floating = tokens(SURFACE_FLOATING)
    for (const t of floating.filter((t) => t.startsWith('bg-') || t.startsWith('backdrop-') || t === 'border-frame')) {
      expect(credit, t).toContain(t)
    }
    expect(credit).toEqual(expect.arrayContaining(['border-t', 'border-l', RADIUS.surface.replace('rounded-', 'rounded-tl-')]))
    expect(credit).not.toContain('border')
    expect(credit).not.toContain(ELEVATION.raised)
    expect(credit.filter((t) => t.startsWith('shadow'))).toEqual([])
  })

  // The map's container gives the library's controls a 20px line, and the
  // corner stands outside it: without its own the scale shrank to 17px from
  // the vendor's 22px box (record 0162).
  it('keeps the library\'s 20px line on the credit line', () => {
    expect(tokens(MAP_CORNER.credit)).toContain('leading-5')
  })

  // The scale's box is as wide as the bar can draw, the bar at its right, so
  // the credits stay put while the bar changes with the zoom.
  it('holds the scale in a box as wide as its widest bar', () => {
    expect(step(MAP_CORNER.scale, 'w')).toBe(SCALE_MAX_WIDTH_PX)
    expect(tokens(MAP_CORNER.scale)).toEqual(expect.arrayContaining(['flex', 'justify-end']))
    expect(MAP_CORNER.slot).toBe('contents')
  })

  // map.css keys on the corner: the library's margins come off every control
  // in it, and the box `MAP_CREDIT.card` gives the attribution comes off it
  // inside the line, which is that box itself.
  it('takes the library\'s margins and the credit\'s own box off inside it', () => {
    for (const part of [MAP_CORNER.stack, MAP_CORNER.credit]) expect(tokens(part)).toContain('map-corner')
    expect(rule('.map-corner .maplibregl-ctrl')).toContain('margin: 0;')
    const attrib = rule('.map-corner .maplibregl-ctrl-attrib')
    for (const decl of ['padding: 0;', 'background: none;', 'border-width: 0;', 'border-radius: 0;', 'box-shadow: none;', 'backdrop-filter: none;']) {
      expect(attrib).toContain(decl)
    }
  })

  // The pair is the map button's chrome joined (TJ, 2026-10-20): a capsule
  // with the lower half's top edge for the rule, a raised fill under the
  // pointer rather than the sky edge, which only one half's border could take.
  it('joins the zoom pair into one capsule, each half a map button', () => {
    const shape = new Set<string>([RADIUS.pill, ACCENT.edgeHover])
    for (const half of [MAP_ZOOM_PAIR.in, MAP_ZOOM_PAIR.out]) {
      for (const t of tokens(MAP_ROUND_BUTTON).filter((t) => !shape.has(t))) expect(tokens(half), t).toContain(t)
      expect(tokens(half)).not.toContain(RADIUS.pill)
      expect(half).not.toContain(ACCENT.edgeHover)
      expect(tokens(half)).toContain('enabled:hover:bg-raised')
    }
    expect(tokens(MAP_ZOOM_PAIR.in)).toEqual(expect.arrayContaining(['border-b-0', 'rounded-t-full']))
    expect(tokens(MAP_ZOOM_PAIR.out)).toContain('rounded-b-full')
    expect(tokens(MAP_ZOOM_PAIR.out)).not.toContain('border-t-0')
  })
})

// The credit line on a phone, opened, wraps short of the scale bar rather than
// covering it (#687): map.css caps the bottom-right corner at the map's width
// less the scale's room, which these vendor numbers and the scale's widest
// draw decide.
describe('the attribution beside the scale', () => {
  const SCALE_MARGIN_PX = 10 // the vendor's bottom-left control margin
  const ATTRIB_MARGIN_PX = 10 // the vendor's compact attribution margin
  const CLEAR_PX = 8

  it('caps the corner where the room the scale bar takes ends', () => {
    const rule = mapCss.match(/\n\.maplibregl-ctrl-bottom-right \{[^}]*max-width[^}]*\}/)?.[0] ?? ''
    const cap = Number(rule.match(/max-width: calc\(100% - (\d+)px\)/)?.[1])
    expect(SCALE_MAX_WIDTH_PX).toBe(110)
    expect(cap).toBe(SCALE_MARGIN_PX + SCALE_MAX_WIDTH_PX + CLEAR_PX - ATTRIB_MARGIN_PX)
  })

  // On a phone the credit line sits at the bottom left beside the scale, and
  // its row stops so the line ends 8px short of the Analyze button (#696):
  // the button's measured width, its 16px inset and the 8px clear, less the
  // compact credit's own 10px margin inside the row. Measured 2026-10-14 at
  // 360, 390 and 430 wide: a 120.1px button, the row ending 134.1px from the
  // map's right edge, the line 8px short of the button.
  it('caps a phone\'s credit row short of the Analyze button', () => {
    const rule = mapCss.match(/\n\.maplibregl-ctrl-bottom-left:has\(> \.maplibregl-ctrl-attrib\) \{[^}]*\}/)?.[0] ?? ''
    const clear = Number(rule.match(/right: calc\(var\(--map-fab-w, 0px\) \+ (\d+)px\);/)?.[1])
    expect(clear).toBe(16 + CLEAR_PX - ATTRIB_MARGIN_PX)
    expect(MAP_FAB_SLOT.split(/\s+/)).toContain('right-4')
    expect(mapStageSource).toContain("'--map-fab-w': `${fabPx}px`")
  })

  // Three lines at 360px wide: the corner grows up over the map, never down
  // behind the results, and the band cannot squeeze the line to clip it.
  it('grows a tall credit line upward, whole', () => {
    const corner = mapCss.match(/\.maplibregl-ctrl-bottom-left,\n\.maplibregl-ctrl-bottom-right \{[^}]*\}/)?.[0] ?? ''
    expect(corner).toMatch(/flex-direction: column-reverse;/)
    expect(corner).not.toMatch(/justify-content/)
    const child = mapCss.match(/\.maplibregl-ctrl-bottom-right \.maplibregl-ctrl \{[^}]*\}/)?.[0] ?? ''
    expect(child).toMatch(/margin-top: auto;\s*margin-bottom: auto;/)
    expect(child).toMatch(/flex-shrink: 0;/)
  })
})

// The two grounds the map's own objects stand on since the satellite imagery
// (#799), and Liberty's. The forest and the snowfield are the means of a
// USGS tile over the Enchantments and one on Rainier's summit snowfield
// (#333e3e and #dfdedf at z14, 2026-10-27), rounded to a ground a little
// lighter and a little darker, so a pass here holds on the real tiles; the
// light one is Liberty's own background.
const MAP_GROUNDS = { forest: '#3a4a33', snow: '#e8ecef', liberty: '#f8f4f0' }

// The marker's edge on either ground (#799): the white stroke and the dark
// ring outside it (`MARKER_HALO`), one of which clears 3:1 on any ground
// (WCAG 1.4.11), and the two 3:1 apart. Measured 2026-10-27.
describe('the markers on the map', () => {
  it('keep an edge past 3:1 on the forest, the snow and Liberty', () => {
    const grounds = [MAP_GROUNDS.forest, MAP_GROUNDS.snow, MAP_GROUNDS.liberty]
    // White alone was already under 3:1 on Liberty, where the fill was the edge.
    expect(grounds.map((g) => ratio(MARKER_STROKE, g))).toEqual([9.51, 1.19, 1.09])
    expect(grounds.map((g) => ratio(MARKER_HALO, g))).toEqual([1.87, 15.01, 16.29])
    for (const g of grounds) expect(Math.max(ratio(MARKER_STROKE, g), ratio(MARKER_HALO, g))).toBeGreaterThanOrEqual(3)
    expect(ratio(MARKER_STROKE, MARKER_HALO)).toBe(17.83)
  })

  // Haloed text is read against its halo, so the halo is its ground on any map.
  it('label their names on their own halo', () => {
    expect(ratio(MARKER_LABEL_PAINT!['text-color'] as string, MARKER_LABEL_PAINT!['text-halo-color'] as string)).toBe(17.04)
  })
})

// The trails over the imagery (#799; record 0234): the sienna is lost on a
// forest, so a light casing goes under it while the Satellite row is on. The
// casing clears 3:1 on the forest, and the trail as drawn, at its opacity
// over the casing, clears 3:1 on it. Measured 2026-10-28.
describe('the trails on the imagery', () => {
  it('stand on a casing past 3:1 on the forest, and past 3:1 on it', () => {
    expect(ratio(TRAIL_COLOR, MAP_GROUNDS.forest)).toBe(1.69)
    expect(ratio(TRAIL_COLOR, MAP_GROUNDS.liberty)).toBe(5.13)
    expect(ratio(TRAIL_CASING_COLOR, MAP_GROUNDS.forest)).toBe(8.69)
    expect(ratio(over(TRAIL_COLOR, TRAIL_OPACITY, TRAIL_CASING_COLOR), TRAIL_CASING_COLOR)).toBe(3.89)
    // On snow the casing is lost and the trail reads on the snow itself.
    expect(ratio(TRAIL_CASING_COLOR, MAP_GROUNDS.snow)).toBe(1.09)
    expect(ratio(TRAIL_COLOR, MAP_GROUNDS.snow)).toBe(4.73)
  })
})

// The contours over the imagery (#799; record 0234): the brown at its map
// opacity is lost on a forest, so while the Satellite row is on the lines turn
// light over a dark edge. Each line as drawn, its ink over its edge over the
// ground, clears 3:1 on the forest, and its edge clears 3:1 on the snow.
// Measured 2026-10-28.
describe('the contours on the imagery', () => {
  const edged = (kind: 'minor' | 'index', ground: string) => {
    const edge = over(CONTOUR_IMAGERY_EDGE, CONTOUR_EDGE_OPACITY[kind], ground)
    return { edge, ink: over(CONTOUR_IMAGERY_INK, CONTOUR_IMAGERY_OPACITY[kind], edge) }
  }
  it('read past 3:1 on the forest by their ink and on the snow by their edge', () => {
    expect(ratio(over(CONTOUR_INK, CONTOUR_INK_ON.map[CONTOUR_LAYER][1], MAP_GROUNDS.forest), MAP_GROUNDS.forest)).toBe(1.25)
    expect(ratio(edged('minor', MAP_GROUNDS.forest).ink, MAP_GROUNDS.forest)).toBe(4.89)
    expect(ratio(edged('minor', MAP_GROUNDS.snow).edge, MAP_GROUNDS.snow)).toBe(3.2)
    expect(ratio(edged('index', MAP_GROUNDS.forest).ink, MAP_GROUNDS.forest)).toBe(7.23)
    expect(ratio(edged('index', MAP_GROUNDS.snow).edge, MAP_GROUNDS.snow)).toBe(4.34)
    // On a mid grey neither reaches 3:1 alone, and the ink stands off its edge.
    const grey = edged('minor', '#808080')
    expect([ratio(grey.ink, '#808080'), ratio(grey.edge, '#808080'), ratio(grey.ink, grey.edge)]).toEqual([2.23, 2.14, 4.76])
  })
})

// The scale bar on the theme's ground (#739; record 0162): the legend ramp's
// scrim and ink, read by their variables because the library makes the
// markup, and measured over the lightest and the darkest map it can stand on.
describe('the scale bar', () => {
  const rule = mapCss.match(/\n\.maplibregl-ctrl\.maplibregl-ctrl-scale \{[^}]*\}/)?.[0] ?? ''
  const scrim = token(SWATCH_RAMP_SCRIM, 'bg')
  const alpha = Number(SWATCH_RAMP_SCRIM.match(/\/(\d+)/)![1])
  const ink = token(SWATCH_RAMP_TICK, 'text')

  it('stands on the legend scrim in the legend ink, and wears no chrome', () => {
    expect(rule).toContain(`background-color: color-mix(in oklab, var(--ui-${scrim}) ${alpha}%, transparent);`)
    expect(rule).toContain(`color: var(--ui-${ink});`)
    // Its ends are two lines, because the map under it is light (Liberty) or
    // dark (the satellite imagery, #799): the border dark outside, the
    // scrim's own surface opaque in the dark theme and the ink in the light,
    // and the inner line light inside, the other of the two.
    expect(rule).toContain(`border-color: var(--ui-${scrim});`)
    expect(mapCss).toMatch(
      new RegExp(String.raw`:root\[data-theme="light"\] \.maplibregl-ctrl\.maplibregl-ctrl-scale \{\s*border-color: var\(--ui-${ink}\);\s*\}`),
    )
    const inner = mapCss.match(/\n\.maplibregl-ctrl\.maplibregl-ctrl-scale::after \{[^}]*\}/)?.[0] ?? ''
    expect(inner).toContain(`border: 1px solid var(--ui-${ink});`)
    expect(inner).toContain('border-top: 0;')
    expect(mapCss).toMatch(
      new RegExp(String.raw`:root\[data-theme="light"\] \.maplibregl-ctrl\.maplibregl-ctrl-scale::after \{\s*border-color: var\(--ui-${scrim}\);\s*\}`),
    )
    // A ruler, not a control (record 0147): no corner and no shadow. Its
    // label is the attribution's 11px (record 0222), which
    // e2e/scaleBar.spec.ts holds inside the bar.
    expect(rule).not.toMatch(/radius|shadow/)
    expect(rule).toContain('font-size: var(--map-credit-size);')
  })

  // Measured 2026-10-16: the ink on the scrim over a white map and a black
  // one, dark theme then light.
  it('reads its label at 4.5:1 or better over any map in both themes', () => {
    const measure = (hex: (name: string) => string) =>
      ['#ffffff', '#000000'].map((map) => ratio(hex(ink), over(hex(scrim), alpha / 100, map)))
    expect(darkStep(scrim)).toBe('slate-900')
    expect(darkStep(ink)).toBe('slate-200')
    expect(measure(dark)).toEqual([5.35, 15.39])
    expect(measure(light)).toEqual([17.12, 8.16])
    for (const r of [...measure(dark), ...measure(light)]) expect(r).toBeGreaterThanOrEqual(4.5)
  })

  // In a desk's credit line (record 0174) it stands on the line's floating
  // surface instead, so it sheds the scrim and draws its ends in its ink in
  // both themes. Measured 2026-10-20: the ink on the line's 95% fill over a
  // white map and a black one, dark theme then light, for the label and the
  // ends alike.
  it('stands on the credit line\'s surface in a desk\'s corner, its ends in its ink', () => {
    const corner = mapCss.match(/\n\.map-corner \.maplibregl-ctrl-scale \{[^}]*\}/)?.[0] ?? ''
    expect(corner).toContain('background-color: transparent;')
    expect(corner).toContain(`border-color: var(--ui-${ink});`)
    // One line there: the credit line is its one ground.
    expect(mapCss).toMatch(/\n\.map-corner \.maplibregl-ctrl-scale::after \{\s*content: none;\s*\}/)
    // After the scale's own rule, which it ties on specificity.
    expect(mapCss.indexOf(corner)).toBeGreaterThan(mapCss.indexOf(rule))
    const floating = token(SURFACE_FLOATING, 'bg')
    const measure = (hex: (name: string) => string) =>
      ['#ffffff', '#000000'].map((map) => ratio(hex(ink), over(hex(floating), 0.95, map)))
    expect(measure(dark)).toEqual([10.19, 12.16])
    expect(measure(light)).toEqual([16.29, 14.64])
    for (const r of [...measure(dark), ...measure(light)]) expect(r).toBeGreaterThanOrEqual(4.5)
  })

  // The ruler's ends past the 3:1 a graphic owes on either map (#799): the
  // outer line on Liberty's ground and on snow, where the inner is lost, the
  // inner on a forest, where the outer is lost, and each against the other.
  // The grounds are `MAP_GROUNDS`. Measured 2026-10-27, dark theme then light.
  it('draws its ends past 3:1 on a light map and a dark one in both themes', () => {
    const lines = { dark: { outer: dark(scrim), inner: dark(ink) }, light: { outer: light(ink), inner: light(scrim) } }
    const measure = ({ outer, inner }: { outer: string; inner: string }) => [
      ratio(outer, MAP_GROUNDS.liberty),
      ratio(outer, MAP_GROUNDS.snow),
      ratio(inner, MAP_GROUNDS.forest),
      ratio(outer, inner),
    ]
    expect(measure(lines.dark)).toEqual([16.29, 15.01, 7.72, 14.46])
    expect(measure(lines.light)).toEqual([15.64, 14.41, 9.51, 17.12])
    for (const r of [...measure(lines.dark), ...measure(lines.light)]) expect(r).toBeGreaterThanOrEqual(3)
  })
})

// The map's popups follow the theme (#740), and are the panel's own surface
// in either one (#786, record 0215): every `--popup-*` value in `map.css` is
// an app token, declared once on the root, where the light theme redefines
// the tokens. So every pair is measured here, where the stylesheets are read,
// on the surface it lands on, in both themes. Measured 2026-10-22.
describe('the popup card', () => {
  type Theme = 'dark' | 'light'
  const popupBlock = (selector: string): Record<string, string> => {
    const body = mapCss.match(new RegExp(String.raw`\n${selector} \{([^}]*)\}`))![1]
    return Object.fromEntries([...body.matchAll(/--popup-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  }
  const POPUP = popupBlock(':root')
  /** The hex a value paints in a theme: a popup value, a theme token, a step, a mix. */
  const paint = (value: string, theme: Theme): string => {
    const v = value.replace(/^color:/, '').trim()
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
    const popup = v.match(/^var\(--popup-([\w-]+)\)$/)
    if (popup) return paint(POPUP[popup[1]], theme)
    const ui = v.match(/^var\(--ui-([\w-]+)\)$/)
    if (ui) return theme === 'light' ? light(ui[1]) : paint(DARK_TOKENS[ui[1]], theme)
    const own = v.match(/^var\(--color-([\w-]+)\)$/)
    if (own) return paletteHex(own[1])
    const mix = v.match(/^color-mix\(in oklab, (.+) (\d+)%, (.+)\)$/)
    if (mix) return mixOklab(paint(mix[1], theme), Number(mix[2]) / 100, paint(mix[3], theme))
    throw new Error(`cannot resolve ${v}`)
  }
  const measure = (a: string, b: string, theme: Theme) => ratio(paint(a, theme), paint(b, theme))
  const both = (a: string, b: string) => [measure(a, b, 'dark'), measure(a, b, 'light')]
  const SURFACE = GRID_GUTTER_COLOR
  const INK = 'var(--popup-ink)'

  // One source for every colour a card wears: a value here that is not a
  // token is a second palette, which is how the light card's buttons came to
  // be a near-black and a blue the app never wore. The light block says the
  // scheme and nothing else, because the tokens it would name already turn
  // with the theme.
  it('names an app token for every popup colour, once, for both themes', () => {
    const TOKEN = String.raw`var\(--(?:ui-[\w-]+|scroll-shade)\)`
    const VALUE = new RegExp(String.raw`^(?:${TOKEN}|color-mix\(in oklab, ${TOKEN} \d+%, ${TOKEN}\))$`)
    const { scheme, ...colours } = POPUP
    expect(scheme).toBe('dark')
    for (const [name, value] of Object.entries(colours)) expect([name, VALUE.test(value)]).toEqual([name, true])
    expect(popupBlock(String.raw`:root\[data-theme="light"\]`)).toEqual({ scheme: 'light' })
    expect(mapCss).toMatch(/\n\.maplibregl-popup-content \{\s*background: var\(--popup-surface\);/)
    expect(mapCss.match(/border-(top|bottom|left|right)-color: var\(--popup-surface\);/g)).toHaveLength(4)
    expect(mapCss).toContain('scrollbar-color: var(--popup-thumb) var(--popup-band);')
  })

  // The card is the panel every popover stands on, and its band and ranked
  // cell one and two half steps toward the raised step.
  it('stands the card on the panel, in both themes', () => {
    for (const theme of ['dark', 'light'] as const) expect(paint(SURFACE, theme)).toBe(paint('var(--ui-panel)', theme))
    expect(both(HEADER_BAND_COLOR, SURFACE)).toEqual([1.18, 1.06])
    expect(both(GRID_RANKED_COLOR, GRID_BAND_COLOR)).toEqual([1.2, 1.06])
  })

  it('reads every text above AA on each surface it lands on', () => {
    // A link takes the colour of the text around it (#740), so the ink is the
    // title's and every grid number's, linked or not.
    for (const theme of ['dark', 'light'] as const) {
      expect([SURFACE, GRID_BAND_COLOR, GRID_RANKED_COLOR].map((on) => measure(INK, on, theme))).toEqual(
        theme === 'dark' ? [11.86, 10.05, 8.4] : [15.25, 14.42, 13.66],
      )
      // Labels and the coordinates beside them. Neither stands on the ranked
      // cell, which holds a number alone.
      expect([SURFACE, GRID_BAND_COLOR].map((on) => measure(LABEL_COLOR, on, theme))).toEqual(
        theme === 'dark' ? [5.56, 4.71] : [8.34, 7.89],
      )
    }
    // A safety warning in the table's own amber, which clears AA in both
    // themes where the popup's copy, amber-500, read 2.15:1 on white.
    expect(both(WARNING_COLOR, SURFACE)).toEqual([10.1, 6.31])
  })

  // The link-out glyph, at rest and under the pointer, and the scroll bar's
  // thumb owe 3:1.
  it('keeps the glyph and the thumb above the 3:1 a graphic owes', () => {
    expect(both(HEADER_ICON_COLOR, HEADER_BAND_COLOR)).toEqual([4.71, 7.89])
    expect(both('var(--popup-glyph-hover)', HEADER_BAND_COLOR)).toEqual([5.69, 5.43])
    expect(both('var(--popup-thumb)', GRID_BAND_COLOR)).toEqual([4.71, 3.76])
  })

  // On a touch screen a link's underline rests in the label grey (#786,
  // record 0212). It is the one cue that marks the link there, so it owes 3:1
  // on every surface a link stands on: the card, the grid's band and its
  // ranked cell.
  it('keeps the touch underline above 3:1 wherever a popup link stands', () => {
    const ratios = (['dark', 'light'] as const).map((theme) =>
      [SURFACE, GRID_BAND_COLOR, GRID_RANKED_COLOR].map((on) => measure('var(--popup-label)', on, theme)),
    )
    expect(ratios[0]).toEqual([5.56, 4.71, 3.94])
    expect(ratios[1]).toEqual([8.34, 7.89, 7.47])
  })

  // The fine print steps back, under AA for the reason `FINE_COLOR` gives.
  it('steps the fine print back', () => {
    expect([SURFACE, HEADER_BAND_COLOR].map((on) => both(FINE_COLOR, on))).toEqual([
      [3.07, 4.32],
      [2.6, 4.09],
    ])
  })

  // The button is the panel's own (#786, record 0215): its class list is
  // `BUTTON_ACCENT` and nothing else sets its look, so its fill, label and
  // hover are the ones the app's buttons measure; `popupParity.spec.ts`
  // reads the rendered button against the panel's in a browser.
  it('dresses its button as the panel\'s accent button and nothing else', () => {
    expect(popupButton('data-x', 'Go')).toBe(`<button data-x class="${BUTTON_ACCENT}">Go</button>`)
    expect(mapCss).not.toMatch(/data-popup-button|--popup-(?:primary|secondary|danger)/)
  })

  // The × is the bare glyph every card's close is (record 0222), standing on
  // the header band, at rest and under the pointer, dark theme then light.
  it('draws its × bare on the header band, past 3:1 in both themes', () => {
    expect({
      rest: both('var(--popup-close)', HEADER_BAND_COLOR),
      hover: both('var(--popup-close-hover)', HEADER_BAND_COLOR),
    }).toEqual({ rest: [4.71, 7.89], hover: [12.39, 14.42] })
    expect(mapCss).not.toMatch(/--popup-close-(?:fill|edge|hover-fill|hover-edge)/)
  })

  // The ranked family's colours (#740) are the table's, and the card stands
  // on the table's own panel in both themes, so every band's ink reads at the
  // ratios `colors.test.ts` pins.
  it('reads the ranked family on the table\'s own panel, in both themes', () => {
    for (const theme of ['dark', 'light'] as const) expect(paint(SURFACE, theme)).toBe(paint('var(--ui-panel)', theme))
    expect(mapCss).toMatch(/\.maplibregl-popup \[data-tint\] \{\s*--popup-tint: var\(--tint-dark\);/)
    expect(mapCss).toMatch(/:root\[data-theme="light"\] \.maplibregl-popup \[data-tint\] \{\s*--popup-tint: var\(--tint-light\);/)
  })

  // The quiet lines, the header's edge and the grid's hairline, and the
  // firmer rule under the grid's heads.
  it('draws the lines a step and two off the surface', () => {
    expect([HEADER_EDGE_COLOR, GRID_LINE_COLOR, RULE_COLOR].map((l) => both(l, SURFACE))).toEqual([
      [1.41, 1.5],
      [1.41, 1.5],
      [1.93, 2.35],
    ])
  })
})

describe('the merged roles', () => {
  // Five exports for one gesture's parts, and five for two range inputs'
  // parts, became one object each; the keys are the whole vocabulary.
  it('groups the drag and the slider parts', () => {
    expect(Object.keys(DRAG).sort()).toEqual(['carried', 'ghost', 'grip', 'gripActive', 'insert'])
    expect(Object.keys(SLIDER).sort()).toEqual(['fit', 'idle', 'overlay', 'track', 'value', 'well', 'wordmark'])
  })

  // The marks under the scrubber stand over the thumb's centre, which the
  // timeline module computes from a number this file draws as a class.
  it('places the scale marks off the thumb this file draws', () => {
    expect(SCRUBBER).toContain('[&::-webkit-slider-thumb]:w-3.5')
    expect(stepPx('w-3.5', 'w')).toBe(SCRUBBER_THUMB_PX)
  })
})

describe('the results bar buttons', () => {
  // One group in the mode switch's look (#687, the maintainer on #709): the
  // same well, the same half and the same idle fill, so the two read as
  // siblings and stand at one height on either pointer.
  it('reads as the sibling of the mode switch', () => {
    // SEGMENT_FLUID's well without its clip, so the bar's press can reach
    // past its edges (record 0223).
    expect(BAR_GROUP).toBe(SEGMENT_FLUID.replace(' overflow-hidden', ''))
    expect(ACTION_GROUP).toBe(BAR_GROUP)
    // The switch's idle fill and ink, with the accent label every menu
    // trigger takes under the pointer in place of its white (record 0201).
    expect(token(ACTION_ITEM, 'bg')).toBe(token(SEGMENT_IDLE, 'bg'))
    expect(token(ACTION_ITEM, 'text')).toBe(token(SEGMENT_IDLE, 'text'))
    expect(ACTION_ITEM).toContain(ACCENT.hoverText)
    expect(words(ACTION_ITEM)).not.toContain(`hover:text-${token(SEGMENT_IDLE, 'hover:text')}`)
    for (const part of [TAP.action, FOCUS_RING, 'py-0.5', 'text-xs', 'gap-1.5']) {
      expect(SEGMENT_ITEM).toContain(part)
      expect(ACTION_ITEM).toContain(part)
    }
    expect(ACTION_ITEM).toContain('flex-none')
  })

  // A glyph alone is 16px plus the item's inset each side. 28px wide passes
  // WCAG 2.2's target spacing on a fine pointer, where the item is 22px tall:
  // a 24px circle on its centre stays inside its own width (record 0130's
  // test). On a coarse pointer TAP.action makes it 44.
  it('leaves an icon-only item wide enough to pass by spacing', () => {
    const inset = stepPx(ACTION_ITEM, 'px')
    expect(16 + 2 * inset).toBe(28)
    expect((16 + 2 * inset) / 2).toBeGreaterThanOrEqual(12)
  })

  // One width rule for every word on the bar, from the measured line: the
  // labelled switch, the labelled group with Removed, the folded line's 16px
  // gap and two more digits of a Removed count.
  it('shows the words only where the measured line fits', () => {
    const MEASURED = { switch: 176.7, group: 377.8, gap: 16, digits: 13.4 }
    const fits = Number(BAR_LABEL.match(/@min-\[(\d+)px\]:inline/)![1])
    expect(BAR_LABEL.startsWith('hidden ')).toBe(true)
    expect(fits).toBe(Math.ceil(MEASURED.switch + MEASURED.group + MEASURED.gap + MEASURED.digits))
    // The docked bar at 1024 wide has 640px and keeps them; the widest phone
    // measured, 430, has 406.
    expect(640).toBeGreaterThanOrEqual(fits)
    expect(406).toBeLessThan(fits)
    // At a desk the menu buttons carry chevrons (record 0201), measured
    // 2026-10-20: the docked bar at 1024 still holds a two-digit count.
    const DESK_GROUP = 437.8
    expect(MEASURED.switch + DESK_GROUP + MEASURED.gap + MEASURED.digits / 2).toBeLessThanOrEqual(640)
  })
})

describe('the phone draw bar', () => {
  it('floats on the map at the column inset from both sides', () => {
    expect(DRAW_BAR).toContain(SURFACE_FLOATING)
    expect(DRAW_BAR).toContain(MAP_EDGE.left)
    expect(DRAW_BAR).toContain(MAP_EDGE.right)
    expect(DRAW_BAR).toContain(LAYER.base)
  })
})

describe('the welcome dialog foot', () => {
  it('sticks to the card on the card fill, under the quiet rule', () => {
    expect(DIALOG_FOOT.bar).toMatch(/(^|\s)sticky bottom-0(\s|$)/)
    const fill = (recipe: string) => recipe.split(' ').find((c) => c.startsWith('bg-'))
    expect(fill(DIALOG_FOOT.bar)).toBe(fill(SURFACE_CARD))
    expect(DIALOG_FOOT.bar).toContain(SURFACE_DIVIDER)
  })

  // The tutorial button is the primary's button in the secondary's fill
  // (record 0222): the same label, padding, width and corners, so the pair
  // differs only in which one leads.
  it('draws the second action as the primary in the secondary fill', () => {
    const shape = (recipe: string) =>
      recipe.split(' ').filter((c) => !/^(hover:)?bg-|^text-(ink|on-)|^(hover:)?text-white/.test(c) && !c.includes('accent'))
    const without = (recipe: string, role: string) => recipe.split(' ').filter((c) => !role.split(' ').includes(c))
    expect(shape(DIALOG_FOOT.secondary).sort()).toEqual(shape(without(BUTTON_PRIMARY, ACCENT.fill + ' ' + ACCENT.fillHover).join(' ')).sort())
    const fills = (recipe: string) => recipe.split(' ').filter((c) => /^(hover:)?bg-/.test(c))
    expect(fills(DIALOG_FOOT.secondary)).toEqual(fills(BUTTON_SECONDARY))
  })
})

// One menu for every trigger at a desk (#714, record 0201): the Layers chip's
// card made the general case.
describe('the one menu', () => {
  // A desk chip's menu stands 4px under it, closer than the chip row stands
  // under the pill, or the card reads as a row of its own rather than its
  // chip's menu (TJ, 2026-10-18). Every menu takes the same gap.
  it("stands a menu closer under its trigger than the map's rows stand apart", () => {
    const tokens = MAP_CHIP_MENU.split(' ')
    expect(tokens).toEqual(expect.arrayContaining(['absolute', 'left-0', 'top-full']))
    expect(tokens.filter((t) => /^rounded/.test(t))).toEqual([])
    expect(CHIP_MENU_GAP_PX).toBe(4)
    expect(tokens).toContain(`mt-${CHIP_MENU_GAP_PX / 4}`)
    const rowGapPx = Number(MAP_ROWS.stack.match(/(?:^|\s)gap-(\d+)/)![1]) * 4
    expect(CHIP_MENU_GAP_PX).toBeLessThan(rowGapPx)
  })

  // One card: the Layers menu's surface, whole corners, on the popover layer.
  it('draws every card on the Layers menu\'s surface', () => {
    expect(MENU.card).toContain(SURFACE_CHIP_CARD.menu)
    expect(MENU.card).toContain(LAYER.popover)
    expect(MENU.card).not.toMatch(/rounded-[tb][lr]?-none|border-[tb]-0/)
  })

  // A row's words stand 10px in from the card's edge in every menu: the list's
  // 4px and the row's 6px, as the Layers menu's own 10px padding stands its.
  it('stands every row 10px in from the card, at 12px type', () => {
    const layersInset = stepPx(MAP_CHIP_MENU, 'px')
    expect(layersInset).toBe(10)
    expect(stepPx(MENU.list, 'px') + stepPx(MENU.row, 'px')).toBe(layersInset)
    expect(stepPx(MENU.list, 'py') + stepPx(MENU.row, 'py')).toBe(stepPx(MAP_CHIP_MENU, 'py'))
    expect(stepPx(MENU.foot, 'px')).toBe(layersInset)
    expect(MENU.option).toContain(MENU.row)
    expect(words(MENU.option)).toEqual(expect.arrayContaining(words(TEXT.control)))
    expect(CONTROL_SIZE).toBe('text-xs')
    expect(MENU.row).toContain('whitespace-nowrap')
  })

  // The model list (#801): a hairline between rows and every name semibold,
  // a mouse's fill and the keyboard's while the list shows its ring, and no
  // other fill, so a finger leaves none.
  it('parts the model rows by a hairline and lights them for a mouse or the keyboard', () => {
    const row = MODEL_ROW.row.split(' ')
    expect(row).toEqual(expect.arrayContaining(['border-t', 'first:border-t-0', SURFACE_DIVIDER, MENU.hover]))
    expect(stepPx(MODEL_ROW.row, 'py')).toBe(8)
    expect(row.filter((c) => /bg-/.test(c) && c !== MENU.hover)).toEqual([])
    expect(MODEL_ROW.keys).toBe(`group-focus-visible/list:${MENU.active}`)
    expect(MODEL_ROW.list).toBe('group/list')
    expect(MODEL_ROW.name).toBe(TEXT.subheading)
  })

  it('fills the row under the pointer and sets the current value semibold', () => {
    expect(MENU.active).toBe(`bg-${token(MAP_CHIP, 'active:bg')}`)
    expect(MENU.current).toBe('font-semibold')
  })

  // Every row a press acts on lights under the pointer, a checkbox row as a
  // pick-one row does, in the one fill. The Layers rows stand on the card's
  // own padding, so they reach out to the list rows' 4px for it and keep
  // their words at 10px.
  it('fills every enabled row the same way, a checkbox row included', () => {
    expect(MENU.hover).toBe(`hover:${MENU.active}`)
    const layersInset = stepPx(MAP_CHIP_MENU, 'px')
    expect(MENU.cardRow).toMatch(/(^|\s)-mx-1\.5(\s|$)/)
    expect(stepPx(MENU.cardRow, 'px')).toBe(stepPx(MENU.row, 'px'))
    expect(layersInset - stepPx(MENU.cardRow, 'px')).toBe(stepPx(MENU.list, 'px'))
    expect(MENU.cardRow).toContain('rounded')
    // And 20px apart, the list rows' pitch (record 0222).
    expect(stepPx(MENU.cardRow, 'py')).toBe(stepPx(MENU.row, 'py'))
    // A disabled row takes none: each wiring names the condition.
    expect(layersPopoverSource).toContain("disabled ? '' : ` ${MENU.hover}`")
    expect(columnsPickerSource).toContain('!sheet && !isRanked ? MENU.hover')
    expect(modelsPickerSource).toContain('${MENU.row} ${MENU.hover}')
  })

  // Three trigger shapes, on purpose (TJ, 2026-10-20: "Three shapes,
  // recorded"): a pill on the map, a field in the panel, a button in the
  // results bar's group. Everything else is the one menu.
  it('keeps three trigger shapes and no more', () => {
    expect(Object.keys(MENU_TRIGGER).sort()).toEqual(['bar', 'chip', 'field'])
    expect(sizes(MENU_TRIGGER.chip)).toEqual([CONTROL_SIZE])
    expect(MENU_TRIGGER.field.startsWith(SELECT)).toBe(true)
    expect(MENU_TRIGGER.bar.startsWith(ACTION_ITEM)).toBe(true)
    expect(Object.keys(MENU_CHEVRON).sort()).toEqual(Object.keys(MENU_TRIGGER).sort())
  })

  // The one hover: the accent on the edge and the label, and on the label
  // alone where a bar button has no edge of its own inside its group.
  it('lights every trigger the same way under the pointer', () => {
    const accent = token(ACCENT.hoverText, 'hover:text')
    expect(token(MAP_CHIP, 'hover:text')).toBe(accent)
    expect(token(MAP_CHIP, 'hover:border')).toBe(accent)
    expect(token(MENU_TRIGGER.field, 'enabled:hover:text')).toBe(accent)
    expect(token(MENU_TRIGGER.field, 'enabled:hover:border')).toBe(accent)
    expect(token(MENU_TRIGGER.bar, 'hover:text')).toBe(accent)
    expect(MENU_TRIGGER.bar).not.toMatch(/hover:border/)
  })

  // Open, a chip and a bar button light in the accent fill; a field keeps
  // its accent edge, since a filled field would read as a value chosen.
  it('lights a chip and a bar button while open, and edges a field', () => {
    const fill = words(ACCENT.fill)
    for (const shape of [MENU_TRIGGER.chip, MENU_TRIGGER.bar]) {
      for (const part of fill) expect(words(shape)).toContain(`aria-expanded:${part}`)
    }
    expect(token(MENU_TRIGGER.field, 'aria-expanded:border')).toBe(token(ACCENT.hoverText, 'hover:text'))
    expect(MENU_TRIGGER.field).not.toMatch(/aria-expanded:bg-/)
  })

  // The chevron's stroke runs 6 to 18 of its 24-unit box, so at
  // `ICON.control`'s 16px a quarter of the box (4px) is empty past it. A chip
  // takes all of it back, so the glyph stands where its label does from the
  // other edge; a bar button, inset 6px, takes 2px, so the stroke stands 8px
  // in; a field's stands in the adornment's place inside SELECT's reserve.
  it("pulls each shape's chevron into its padding by its empty box", () => {
    expect(ICON.control).toBe('h-4 w-4')
    const empty = (16 * 6) / 24
    expect(MENU_CHEVRON.chip).toBe(`-mr-${empty / 4}`)
    expect(MAP_CHIP).toContain('px-3')
    expect(MENU_CHEVRON.bar).toBe('-mr-0.5')
    expect(stepPx(ACTION_ITEM, 'px') + empty - 2).toBe(8)
    expect(MENU_CHEVRON.field).toContain(ICON_ADORNMENT)
    expect(token(MENU_CHEVRON.field, 'group-aria-expanded:text')).toBe(token(ACCENT.hoverText, 'hover:text'))
    expect(token(MENU_CHEVRON.field, 'group-enabled:group-hover:text')).toBe(token(ACCENT.hoverText, 'hover:text'))
    expect(MENU_TRIGGER.field).toMatch(/(^|\s)group(\s|$)/)
    expect(MENU_TRIGGER.field).toMatch(/(^|\s)relative(\s|$)/)
  })

  // The calendar's field is a field trigger whose chevron stands on its first
  // line, in the same inks.
  it("gives the calendar's chevron the field chevron's inks", () => {
    for (const ink of ['group-aria-expanded:text', 'group-enabled:group-hover:text']) {
      expect(token(CALENDAR_FIELD.arrow, ink)).toBe(token(MENU_CHEVRON.field, ink))
    }
  })

  // About 150ms, the same both ways, and off under reduced motion: fades in
  // and slides 4px from its trigger's side, and goes back the way it came.
  it('fades a menu in and out over 150ms and keeps still under reduced motion', () => {
    expect(MOTION.menu).toContain('duration-150')
    expect(MOTION.menu).toContain('motion-reduce:transition-none')
    expect(words(MOTION.menu)).toEqual(expect.arrayContaining(['starting:opacity-0', 'starting:-translate-y-1']))
    expect(MOTION.menu).toContain('data-[side=above]:starting:translate-y-1')
    // The exit is the entrance's start, word for word, under `closing`.
    const exit = words(MOTION.menu).filter((w) => w.includes('data-[state=closing]:'))
    const entrance = words(MOTION.menu).filter((w) => w.includes('starting:'))
    expect(exit.filter((w) => !w.endsWith('pointer-events-none')).map((w) => w.replace('data-[state=closing]:', '')))
      .toEqual(entrance.map((w) => w.replace('starting:', '')))
    // And a press during the fade lands on what is under the card.
    expect(words(MOTION.menu)).toContain('data-[state=closing]:pointer-events-none')
    for (const card of [SURFACE_CHIP_CARD.key, SURFACE_CHIP_CARD.menu, MENU.card]) {
      expect(card).toContain(MOTION.menu)
    }
  })
})

describe('the panel frame', () => {
  // The seam between the docked panel and the results (#697, record 0128):
  // the panel's own structural edge, 3.07:1 on slate-800 and 3.74:1 on
  // slate-900, where SURFACE_DIVIDER's 1.41:1 left the two one block.
  it("closes the panel's right edge with the structural rule", () => {
    const MEASURED = { panel: 3.07, page: 3.74, wasBefore: 1.41 }
    const edge = dark(token(PANEL_EDGE, 'border'))
    expect({
      panel: ratio(edge, dark('panel')),
      page: ratio(edge, dark('page')),
      wasBefore: ratio(dark(token(SURFACE_DIVIDER, 'border')), dark('panel')),
    }).toEqual(MEASURED)
    expect(DESK_PANEL.card).toContain(`border-r ${PANEL_EDGE}`)
    expect(appDrawerSource).toContain('DESK_PANEL.card')
    expect(appDrawerSource).not.toMatch(/SURFACE_DIVIDER/)
    expect(Math.min(MEASURED.panel, MEASURED.page)).toBeGreaterThanOrEqual(3)
    expect(MEASURED.wasBefore).toBeLessThan(3)
  })

  // 56px of header plus its rule (#687): the logo's box and its margin set
  // the height, and the title block's padding must not outgrow it.
  it('keeps the header at 56px, set by the logo', () => {
    const px = (recipe: string, prefix: string) => stepPx(recipe, prefix)
    const logo = px(PANEL_HEADER.logo, 'h') + 2 * px(PANEL_HEADER.logo, 'm')
    expect(logo).toBe(56)
    expect(px(PANEL_HEADER.logo, 'w')).toBe(px(PANEL_HEADER.logo, 'h'))
    // The title (18px at leading-tight, 22.5px) and the 16px tagline line,
    // with the block's padding above and below, fit inside the logo's 56.
    const TITLE_AND_TAGLINE_PX = 22.5 + 16
    expect(TITLE_AND_TAGLINE_PX + 2 * px(PANEL_HEADER.title, 'py')).toBeLessThanOrEqual(logo)
    expect(controlPanelSource).toContain('PANEL_HEADER.logo')
    expect(controlPanelSource).toContain('PANEL_HEADER.title')
  })

  // The round buttons centre where the logo and the title block do (#801):
  // measured 2026-10-22, all three at 28px once the buttons stand 12px down,
  // where at 8px the buttons' centre was 24.
  it('centres the header buttons on the logo', () => {
    const logo = stepPx(PANEL_HEADER.logo, 'h') + 2 * stepPx(PANEL_HEADER.logo, 'm')
    expect(stepPx(PANEL_HEADER.actions, 'top') + stepPx(HEADER_BUTTON, 'h') / 2).toBe(logo / 2)
    expect(PANEL_HEADER.title).toContain('justify-center')
  })

  // The name and the tagline start together at the block's left edge: the
  // maintainer tried them centred and had them put back (#801, record 0229).
  it('starts the title and the tagline together', () => {
    expect(PANEL_HEADER.title.split(' ')).not.toContain('text-center')
  })

  // One bar style on every dark surface, and the panel body reserves its
  // width so the column does not move when a section opens (#697).
  it('gives the panel body the shared bar and a stable gutter', () => {
    expect(PANEL_BODY).toContain(SCROLL_BARS)
    expect(PANEL_BODY).toContain('[scrollbar-gutter:stable]')
    expect(PANEL_BODY).toContain(SCROLL_SHADOW.both)
    // The shadows reach across exactly the body's padding to its edges.
    expect(PANEL_BODY).toContain('px-4')
    expect(PANEL_BODY).toContain('[--scroll-shadow-bleed:1rem]')
    expect(controlPanelSource).toContain('PANEL_BODY')
  })

  it('tells the browser which theme it is in, and draws the bar in the theme\'s own tokens', () => {
    expect(indexCss).toMatch(/:root\s*\{\s*color-scheme:\s*dark;/)
    expect(indexCss).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/)
    const bars = indexCss.slice(indexCss.indexOf('.surface-scrollbars {'), indexCss.indexOf('/* Scroll shadows'))
    // The structural edge on the panel: slate-500 on slate-800 in dark.
    expect(bars).toContain('var(--ui-edge)')
    expect(bars).toContain('var(--ui-panel)')
    expect(darkStep('edge')).toBe('slate-500')
    expect(darkStep('panel')).toBe('slate-800')
    expect(bars).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    // MapLibre's white controls keep the light scheme for themselves, and a
    // popup takes its card's (#740).
    expect(mapCss).toMatch(/\n\.maplibregl-ctrl\s*\{\s*color-scheme:\s*light;\s*color:\s*CanvasText;/)
    expect(mapCss).toMatch(/\n\.maplibregl-popup\s*\{\s*color-scheme:\s*var\(--popup-scheme\);\s*color:\s*var\(--popup-ink\);/)
  })

  // The two halves of the shadow, each drawn only while content continues
  // past its edge: a CSS scroll timeline where there is one, and the two data
  // attributes `useScrollShadows` sets where there is not.
  it('draws each scroll shadow only while there is more in its direction', () => {
    expect(indexCss).toMatch(/@supports \(animation-timeline: scroll\(\)\)/)
    expect(indexCss).toMatch(/\.scroll-shadow-start\[data-more-above\]::before/)
    expect(indexCss).toMatch(/\.scroll-shadow-end\[data-more-below\]::after/)
    expect(indexCss).toMatch(/\[data-more-above\] \.scroll-shadow-head th::after/)
    expect(SCROLL_SHADOW.both.split(' ').sort()).toEqual([SCROLL_SHADOW.start, SCROLL_SHADOW.end].sort())
  })

  // The movements that answer an action stop where the reader asked their
  // system for less (#687), as the tutorial's spotlight already did.
  it('drops every answering movement under reduced motion', () => {
    for (const recipe of Object.values(MOTION)) {
      expect(recipe).toMatch(/(^|\s)transition/)
      expect(recipe).toContain('motion-reduce:transition-none')
    }
    expect(CONTROLS_SHEET.card).toContain(MOTION.slide)
    expect(DESK_PANEL.card).toContain(MOTION.push)
    expect(appDrawerSource).not.toMatch(/(^|\s)transition-transform duration/)
    expect(analysisOverlaySource).toContain('MOTION.progress')
    expect(resultsPanelsSource).toContain('MOTION.pane')
  })

  // Two speeds (#714; record 0202): a menu or a card in 150ms, and a panel,
  // a sheet or a results pane in 300ms, each the same both ways because one
  // recipe carries both directions. The number script waits on is the panel
  // classes' own.
  it('moves a menu at one speed and a panel at the other', () => {
    const duration = (recipe: string) => Number(recipe.match(/(?:^|\s)duration-(\d+)(?=\s|$)/)?.[1])
    const easing = (recipe: string) => recipe.match(/(?:^|\s)(ease-[a-z-]+)(?=\s|$)/)?.[1]
    expect(PANEL_MS).toBe(300)
    expect(duration(MOTION.menu)).toBe(150)
    for (const recipe of [MOTION.slide, MOTION.push, MOTION.pane]) {
      expect(duration(recipe)).toBe(PANEL_MS)
      expect(easing(recipe)).toBe('ease-in-out')
    }
    // Each names the one property it moves, so a grip's drag on a sheet's or
    // a pane's height never chases the finger.
    expect(MOTION.slide).toMatch(/(^|\s)transition-transform(\s|$)/)
    expect(MOTION.push).toMatch(/(^|\s)transition-\[margin-left\](\s|$)/)
    expect(MOTION.pane).toMatch(/(^|\s)transition-\[grid-template-rows\](\s|$)/)
    expect(MOTION.menu).toMatch(/(^|\s)transition-\[opacity,translate\](\s|$)/)
  })

  // The desk panel pushes the map's edge (record 0202): it stays in the row
  // shut, and its margin takes back exactly its own width.
  it('takes the desk panel out of the row by its own width', () => {
    const width = DESK_PANEL.card.match(/(?:^|\s)w-(\d+)(?=\s|$)/)?.[1]
    expect(width).toBe('90')
    expect(DESK_PANEL.shut).toBe(`-ml-${width}`)
    expect(DESK_PANEL.card).not.toMatch(/(^|\s)(absolute|fixed)(\s|$)/)
    expect(DESK_PANEL.card).toMatch(/(^|\s)relative(\s|$)/)
    expect(DESK_PANEL.card).toContain(LAYER.base)
  })

  // While a desk's layout moves, the map and the results hold one size
  // (record 0202). The map's box is the window's width or height, centred on
  // its column, so MapLibre, which keeps the centre on a resize, draws what it
  // would at every size in between. The chart closing keeps its open width,
  // the window less the panel.
  it('holds the map centred on its column, and the chart at the width it had', () => {
    expect(words(LAYOUT_HOLD.mapPush)).toEqual(expect.arrayContaining(['absolute', 'inset-y-0', 'w-screen', 'left-[calc(50%-50vw)]']))
    expect(words(LAYOUT_HOLD.mapPanes)).toEqual(expect.arrayContaining(['absolute', 'inset-x-0', 'h-dvh', 'top-[calc(50%-50dvh)]']))
    expect(LAYOUT_HOLD.rest).toBe('absolute inset-0')
    expect(LAYOUT_HOLD.table).toBe('w-screen')
    expect(LAYOUT_HOLD.chartOpening).toBe('w-screen')
    const panelRem = Number(DESK_PANEL.card.match(/(?:^|\s)w-(\d+)(?=\s|$)/)![1]) / 4
    expect(LAYOUT_HOLD.chartClosing).toBe(`w-[calc(100vw-${panelRem}rem)]`)
    expect(LAYOUT_HOLD.clip).toBe('overflow-clip')
    // What moves stands on a layer of its own while it moves (record 0216).
    expect(LAYOUT_HOLD.layer).toBe('will-change-transform')
  })

  // A results pane opens to its body's height and shuts to none, and the
  // chart's body holds to the bar and the table's to the foot (record 0202).
  it('opens a results pane by its grid row', () => {
    expect(RESULTS_PANE.open).toBe('grid-rows-[1fr]')
    expect(RESULTS_PANE.shut).toBe('grid-rows-[0fr]')
    expect(RESULTS_PANE.frame).toMatch(/(^|\s)grid(\s|$)/)
    for (const body of [RESULTS_PANE.top, RESULTS_PANE.foot]) {
      expect(body).toMatch(/(^|\s)min-h-0(\s|$)/)
      expect(body).toMatch(/(^|\s)overflow-hidden(\s|$)/)
    }
    expect(RESULTS_PANE.foot).toMatch(/(^|\s)justify-end(\s|$)/)
    expect(RESULTS_PANE.top).not.toMatch(/justify-end/)
  })

  // The chart-only legend's tallest strip (#795): two rows of 26px chips and
  // their 6px gap, its padding above and below, and its 1px edge. At a desk
  // it opens in the table's floor, which Chart keeps free under the chart, so
  // it must fit there or the map loses its floor to it.
  it('fits the chart legend\'s tallest strip in the table\'s floor', () => {
    const strip = CHART_LEGEND.strip.split(' ')
    const chips = CHART_LEGEND.chips.split(' ')
    const CHIP_PX = 26 // a chip: TEXT.control's line and its py-1
    const gapPx = Number(chips.find((t) => /^gap-/.test(t))!.slice(4)) * 4
    const maxPx = Number(chips.find((t) => /^max-h-\[/.test(t))!.match(/\d+/)![0])
    expect(maxPx).toBe(2 * CHIP_PX + gapPx)
    expect(chips).toContain('overflow-y-auto')
    const padPx = Number(strip.find((t) => /^py-/.test(t))!.slice(3)) * 4
    expect(strip).toContain('border-t')
    const tallestPx = maxPx + 2 * padPx + 1
    expect(tallestPx).toBe(71)
    expect(tallestPx).toBeLessThanOrEqual(PANEL_FLOOR_PX)
  })

  // The Metrics rows pass WCAG 2.2 SC 2.5.8 by spacing (#687, record 0130):
  // a 16px label with 5px above and below, beside the 22px boxes, with the
  // grid's row gap, is a 32px pitch on a fine pointer. Touch keeps TAP.row's
  // 44px label and spends nothing more.
  it('sets the metric rows 32px apart on a fine pointer', () => {
    const LABEL_PX = 16 // text-xs line box; the 14px radio sits inside it
    const BOX_PX = 22 // FIELD_NUMERIC at py-0.5, measured 2026-10-13
    const margin = Number(METRIC_LABEL_PITCH.match(/(?:^|\s)my-\[(\d+)px\]/)![1])
    const gapY = stepPx(METRICS_GRID, 'gap-y')
    const row = Math.max(LABEL_PX + 2 * margin, BOX_PX)
    expect(row + gapY).toBe(32)
    expect(METRIC_LABEL_PITCH).toContain('touch:my-0')
    // A 24px circle centred on a 16px label reaches 4px past it: inside its
    // own 5px margin, so it meets no other row's target.
    expect((24 - LABEL_PX) / 2).toBeLessThanOrEqual(margin)
  })
})

describe('the calendar field', () => {
  // 28px day rows under a fine pointer, 44 under touch, and the weekday head
  // keeps the 36px the rows had (#687, record 0129).
  it('sizes the day rows for the pointer', () => {
    expect(DAY.cell).toMatch(/(^|\s)h-7(\s|$)/)
    // A finger's row height (record 0223), and the initials over them one
    // height on either pointer.
    expect(DAY.cell).toContain('touch:h-8')
    expect(DAY.head).toMatch(/(^|\s)h-9(\s|$)/)
    expect(DAY.head).not.toContain('touch:')
  })

  // The field is a field trigger, the same recessed box with a chevron that
  // opens every other choice in the panel, and the card is Menu.tsx's
  // (record 0201).
  it('draws the field as a field trigger and the grid on the menu card', () => {
    expect(forecastCalendarSource).toContain('shape="field"')
    expect(forecastCalendarSource).toContain('className={CALENDAR_FIELD.box}')
    expect(forecastCalendarSource).toContain('chevronClassName={CALENDAR_FIELD.arrow}')
    expect(CALENDAR_FIELD.box).not.toContain(SELECT)
    expect(forecastCalendarSource).toMatch(/<Menu\s/)
    expect(forecastCalendarSource).toContain('CALENDAR_GROUND')
  })
})

describe('the polygon row', () => {
  // Three equal buttons on the fields' edges (#687): the two button roles with
  // the inset cut to 4px and nothing else changed, because 12px a side would
  // wrap `Draw polygon` (77.4px on a Mac) in a third of a 295px field.
  it('is the two button roles at a 4px inset, three to a row', () => {
    expect(DRAW_ROW.secondary).toBe(BUTTON_SECONDARY.replace(' px-3 ', ' px-1 '))
    expect(DRAW_ROW.accent).toBe(BUTTON_ACCENT.replace(' px-3 ', ' px-1 '))
    expect(DRAW_ROW.secondary).not.toBe(BUTTON_SECONDARY)
    expect(DRAW_ROW.accent).not.toBe(BUTTON_ACCENT)
    expect(DRAW_ROW.row).toContain('grid-cols-3')
    const third = (field: number) => (field - 2 * stepPx(DRAW_ROW.row, 'gap')) / 3
    const need = (inset: number) => 77.4 + 2 * inset
    expect(need(stepPx(DRAW_ROW.secondary, 'px'))).toBeLessThan(third(295))
    expect(need(stepPx(BUTTON_SECONDARY, 'px'))).toBeGreaterThan(third(317))
    for (const name of ['DRAW_ROW.row', 'DRAW_ROW.secondary', 'DRAW_ROW.accent', 'DISABLED']) {
      expect(destinationsSource).toContain(name)
    }
    expect(destinationsSource).not.toMatch(/BUTTON_(SECONDARY|ACCENT)/)
  })
})

describe('the calendar field wraps', () => {
  // The one panel control that may stand two lines tall (#687, record 0129):
  // it aligns to its top so a second line grows the box downward, and the
  // first line and the arrow stand where a one-line field centres them. 7px
  // is the 1px border plus py-1.5 (one line 30px); 8px is the border plus
  // 7px under touch (one line 32px, TAP.height's floor, record 0223).
  it('keeps the first line and the arrow where a one-line field has them', () => {
    const LINE_PX = 16 // text-xs line box
    const BORDER_PX = 1
    const fine = stepPx(CALENDAR_FIELD.box, 'py')
    const touch = Number(CALENDAR_FIELD.box.match(/touch:py-\[(\d+)px\]/)![1])
    expect(2 * BORDER_PX + 2 * fine + LINE_PX).toBe(30)
    expect(2 * BORDER_PX + 2 * touch + LINE_PX).toBe(32)
    expect(CALENDAR_FIELD.box).toContain('items-start')
    expect(CALENDAR_FIELD.arrow).toContain(`top-[${BORDER_PX + fine}px]`)
    expect(CALENDAR_FIELD.arrow).toContain(`touch:top-[${BORDER_PX + touch}px]`)
    // The glyph is the line box's height, so its top is the line's top.
    expect(stepPx(ICON.control, 'h')).toBe(LINE_PX)
    expect(CALENDAR_FIELD.arrow).toContain('pointer-events-none')
    expect(forecastCalendarSource).not.toMatch(/id=\{fieldTextId\} className="[^"]*truncate/)
  })
})

// The light theme (#706; record 0158), measured rather than copied: every
// pair the dark assertions above pin as a literal is computed here from the
// light values `index.css` declares, so a light value that moves fails here
// and forces the re-measurement. The palette is the maintainer's (issue
// #706); the values it left to derive (the middle ink, the faint ink, the
// outline, the range band's hover, the shade, the thumb and the muted fade)
// are each held to the floor they owe. Measured 2026-10-15.
describe('the light theme', () => {
  // A role's light hex through one of its utilities.
  const hex = (recipe: string, utility: string) => light(token(recipe, utility))

  const PANEL = light('panel')
  const RAISED = light('raised')
  const WELL = light('recessed')
  const FLOATING = light('floating')
  const PAGE = light('page')

  it('declares a light value for every token the dark theme has', () => {
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(Object.keys(DARK_TOKENS).sort())
    // The maintainer's palette, as given.
    expect([PAGE, PANEL, RAISED, WELL, light('rule'), light('edge')]).toEqual([
      '#f8f9ff', '#eef2f9', '#e1e6ee', '#ffffff', '#c2c8d1', '#72787f',
    ])
    expect([light('ink-strong'), light('ink'), light('ink-soft')]).toEqual(['#181c21', '#181c21', '#42474e'])
  })

  // The theme is the header switch's, and dark the default whatever the
  // operating system says (record 0158). A prefers-color-scheme query, or a
  // custom dark variant built on one, would paint by the system's setting
  // under a switch that may say the opposite. The linter's style-no-os-theme
  // holds the sources to the same rule; ESLint does not read a stylesheet.
  it('takes the theme from the switch, never from the operating system', () => {
    for (const css of [indexCss, mapCss]) expect(css).not.toMatch(/prefers-color-scheme|@custom-variant dark/)
  })

  // The accent: the label on the fill (1.4.3), the fill against everything
  // beside it (1.4.11), and the hover, which in light darkens and so stays AA
  // where the dark hover could not.
  // The fill is the dark theme's sky-650 (PR #733), so the label has 4.56:1
  // where `#00639b` gave it 6.45; the hover is that darker blue, which with a
  // white label is the direction that gains contrast.
  it('clears the label and every edge on the light accent, the hover included', () => {
    const fill = hex(ACCENT.fill, 'bg')
    const label = hex(ACCENT.fill, 'text')
    expect(fill).toBe('#007bc1')
    expect(ratio(label, fill)).toBe(4.56)
    expect(ratio(fill, PANEL)).toBe(4.06)
    expect(ratio(fill, hex(DAY.range, 'bg'))).toBe(3.54)
    expect(ratio(fill, hex(SEGMENT_IDLE, 'bg'))).toBe(4.56)
    expect(ratio(fill, hex(DAY.range, 'hover:bg'))).toBe(3.17)
    expect(ratio(fill, RAISED)).toBe(3.64)
    expect(hex(ACCENT.fillHover, 'hover:bg')).toBe('#00639b')
    expect(ratio(label, hex(ACCENT.fillHover, 'hover:bg'))).toBe(6.45)
    for (const edge of [PANEL, RAISED, hex(DAY.range, 'bg'), hex(DAY.range, 'hover:bg'), WELL]) {
      expect(contrast(fill, edge)).toBeGreaterThanOrEqual(3)
    }
    // Darker than the rest, where the dark theme's hover lightens.
    expect(relativeLuminance(hex(ACCENT.fillHover, 'hover:bg'))).toBeLessThan(relativeLuminance(fill))
    // Every label the fill carries: a button's, a lit chip's glyph and the
    // welcome dialog's step badge, all the label-on-fill ink.
    for (const recipe of [BUTTON_PRIMARY, BADGE_STEP]) {
      expect(ratio(hex(recipe, 'text'), hex(recipe, 'bg'))).toBe(4.56)
    }
    // The accent as text stays the darker blue: the fill itself would read
    // under 4.5 on the panel.
    expect(hex(LINK_ACTION, 'text')).toBe('#00639b')
    expect(contrast(fill, PANEL)).toBeLessThan(4.5)
  })

  // A lit map chip wears the fill, so its label and glyph take the ink on the
  // fill. The resting ink would read 3.75:1 there (2.66 on the darker fill
  // this theme first had), which is how the summary chip's menu glyph
  // vanished in light while its sheet was up.
  it('lights a map chip in the label-on-fill ink', () => {
    for (const chip of [MAP_CHIP, MAP_CHIP_SUMMARY]) {
      expect(hex(chip, 'aria-expanded:bg')).toBe(hex(ACCENT.fill, 'bg'))
      expect(ratio(hex(chip, 'aria-expanded:text'), hex(chip, 'aria-expanded:bg'))).toBe(4.56)
    }
    expect(ratio(hex(MAP_CHIP_SUMMARY_TEXT, 'in-aria-expanded:text'), hex(ACCENT.fill, 'bg'))).toBe(4.56)
    expect(ratio(hex(MAP_CHIP, 'text'), hex(ACCENT.fill, 'bg'))).toBe(3.75)
    expect(MAP_CHIP_SUMMARY_TEXT).toContain('in-aria-expanded:text-on-fill')
  })

  // Every text role on every surface it lands on, past 4.5:1.
  it('keeps every text role at 4.5:1 or better on every surface', () => {
    const roles = [TEXT.appTitle, TEXT.control, TEXT.section, TEXT.caption, PROSE.body, LINK, CAPTION_LIFTED]
    const lowest: Record<string, number> = {}
    for (const recipe of roles) {
      const ink = hex(recipe, 'text')
      for (const ground of [PAGE, PANEL, RAISED, WELL, FLOATING]) {
        const r = contrast(ink, ground)
        expect(r, `${recipe} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        lowest[ink] = Math.min(lowest[ink] ?? Infinity, round2(r))
      }
    }
    // The secondary ink is the floor: 7.47 on the raised surface.
    expect(lowest[light('ink-soft')]).toBe(7.47)
    // The middle ink sits between the primary and the secondary.
    expect(relativeLuminance(light('ink-mid'))).toBeGreaterThan(relativeLuminance(light('ink')))
    expect(relativeLuminance(light('ink-mid'))).toBeLessThan(relativeLuminance(light('ink-soft')))
  })

  it('keeps the placeholder, the pickable days and the micro step legible', () => {
    expect(ratio(hex(FIELD, 'placeholder'), WELL)).toBe(9.36)
    // The calendar's ground is the well; both pickable days clear 4.5 there.
    for (const day of [DAY.full, DAY.partial]) expect(contrast(hex(day, 'text'), WELL)).toBeGreaterThanOrEqual(4.5)
    // An unservable day is decoration (inactive, 1.4.3 exempts it) and must
    // stay dimmer than the dimmest day a reader can pick.
    expect(contrast(hex(DAY.unservable, 'text'), WELL)).toBeLessThan(contrast(hex(DAY.partial, 'text'), WELL))
    expect(ratio(hex(DAY.unservable, 'text'), WELL)).toBe(2.45)
    // The micro step on its three grounds: the legend box, the table header
    // and the panel.
    const micro = hex(TEXT.micro, 'text')
    expect([FLOATING, RAISED, PANEL].map((g) => ratio(micro, g))).toEqual([12.3, 10.31, 11.51])
    // A search result's caption on its highlighted row.
    expect(ratio(hex(CAPTION_LIFTED, 'text'), light('highlight'))).toBe(9.19)
  })

  // Icons and boundaries owe 3:1 (1.4.11): the faint icon ink on every
  // surface, the recessed edge on both sides it separates, a desk chip card's
  // outline on the card it overlaps (the frame it replaced read 2.51:1), the
  // checkbox mark and the focus ring.
  it('holds every icon and boundary at 3:1 or better', () => {
    const faint = hex(ICON_ACTION, 'text')
    expect([PANEL, RAISED, WELL].map((g) => ratio(faint, g))).toEqual([4.32, 3.87, 4.85])
    const edge = hex(RECESSED_EDGE, 'border')
    expect([PANEL, WELL].map((g) => ratio(edge, g))).toEqual([3.97, 4.46])
    // A desk chip card's outline on the card it overlaps (#714).
    const card = hex(SURFACE_CHIP_CARD.menu, 'border')
    expect(ratio(card, hex(SURFACE_CHIP_CARD.key, 'bg'))).toBe(4.24)
    expect(ratio(light('frame'), FLOATING)).toBe(2.51)
    const mark = hex(ACCENT.input, 'accent')
    expect([PANEL, RAISED, WELL].map((g) => ratio(mark, g))).toEqual([4.06, 3.64, 4.56])
    expect(mark).toBe(hex(ACCENT.fill, 'bg'))
    expect(hex(ACCENT.mark, 'bg')).toBe(mark)
    const ring = hex(FOCUS_RING, 'focus-visible:outline')
    expect([PAGE, PANEL, RAISED, WELL].map((g) => ratio(ring, g))).toEqual([6.13, 5.74, 5.14, 6.45])
    expect(ratio(hex(ICON_ADORNMENT, 'text'), WELL)).toBe(9.36)
  })

  // The two quiet lines stay quiet, as the dark ones are (the rule 1.41 and
  // the outline 1.93 on slate-800), and the structural edge still reads on
  // the floating box, where every floating card's rim is since record 0222.
  it('keeps the quiet rule and the outline quiet and the structural edge seen', () => {
    expect(ratio(hex(SURFACE_DIVIDER, 'border'), PANEL)).toBe(1.5)
    const frame = light('frame')
    expect(ratio(frame, PANEL)).toBe(2.35)
    // Derived halfway between the quiet rule and the structural edge.
    const mid = hexToRgb(light('rule')).map((v, i) => Math.floor((v + hexToRgb(light('edge'))[i]) / 2))
    expect(hexToRgb(frame)).toEqual(mid)
    expect(ratio(hex(PANEL_EDGE, 'border'), FLOATING)).toBe(4.24)
  })

  // Notices: each ink on its own tint and on the panel, which the dismiss
  // glyph stands on too.
  it('keeps every notice ink at 4.5:1 or better on its tint and the panel', () => {
    const tones = { warn: [5.85, 6.31], error: [7.24, 8.33], info: [7.44, 8.35] }
    for (const [tone, [onTint, onPanel]] of Object.entries(tones)) {
      const ink = hex(STATUS[tone as keyof typeof STATUS], 'text')
      const tint = hex(NOTICE[tone as keyof typeof NOTICE], 'bg')
      expect(ratio(ink, tint), tone).toBe(onTint)
      expect(ratio(ink, PANEL), tone).toBe(onPanel)
      // The rule is the ink at 38% over the tint, the theme lab's derivation.
      expect(hex(NOTICE[tone as keyof typeof NOTICE], 'border')).toBe(over(ink, 0.38, tint))
    }
    // The warning ink also stands bare, off any tint: the grid's waiting line
    // on the floating legend, the comparison's notes on the raised results
    // bar, the search notice on the well. Amber-800 since PR #733.
    const warn = hex(STATUS.warn, 'text')
    expect([FLOATING, RAISED, WELL].map((g) => ratio(warn, g))).toEqual([6.75, 5.66, 7.09])
    expect(ratio(hex(STATUS.ok, 'text'), PANEL)).toBe(5.84)
    // The dismiss ×, bare since record 0222, is its box's ink on the tint:
    // the first ratio of each pair above.
    expect(NOTICE_DISMISS.pill).not.toMatch(/(^|\s)bg-/)
  })

  // `MUTED` fades a working control, whose text still owes 4.5:1. The light
  // ink at the light fade on the panel, an idle select and an unplotted chip
  // (the panel at 50% over the page at 50% over the panel).
  it('fades a muted label by the step that keeps it over the text floor', () => {
    const fade = Number(LIGHT_TOKENS.muted)
    const ink = hex(TEXT.control, 'text')
    const chip = over(PANEL, 0.5, over(PAGE, 0.5, PANEL))
    const at = (a: number) => [PANEL, WELL, chip].map((g) => ratio(over(ink, a, g), g))
    expect(fade).toBe(0.65)
    expect(at(fade)).toEqual([5.07, 5.34, 5.1])
    // The dark theme's 60% would not: 4.31 on the panel.
    expect(Math.min(...at(Number(DARK_TOKENS.muted)))).toBeLessThan(4.5)
  })

  // The legend strip's numbers on their scrim, over the palest and the
  // darkest band any ramp draws (cyan-300 and the snow key's #5720c3).
  it('stands the ramp numbers on a light ground that clears every band', () => {
    const scrim = light(token(SWATCH_RAMP_SCRIM, 'bg'))
    const alpha = Number(SWATCH_RAMP_SCRIM.match(/\/(\d+)/)![1]) / 100
    const ink = hex(SWATCH_RAMP_TICK, 'text')
    expect(['#67e8f9', '#5720c3'].map((band) => ratio(ink, over(scrim, alpha, band)))).toEqual([15.12, 9.79])
  })

  // The range thumb is the ink here, half on the white well where a white
  // thumb would vanish; on the mark it reads 3.75:1 beside the dark white
  // thumb's 2.71:1 on its own.
  it('draws the slider thumb in the ink, findable on the well and the fill', () => {
    const thumb = light(token(SCRUBBER, '[&::-webkit-slider-thumb]:bg'))
    expect(ratio(thumb, hex(ACCENT.mark, 'bg'))).toBe(3.75)
    expect(contrast(thumb, WELL)).toBeGreaterThan(15)
    expect(token(SCRUBBER, '[&::-moz-range-thumb]:bg')).toBe(token(SCRUBBER, '[&::-webkit-slider-thumb]:bg'))
  })

  // A theme switch holds every transition off while it lands (#786; record
  // 0211): the hook's class must be the one the rule names, and the rule must
  // reach every element and its two generated boxes.
  it('turns every transition off under the theme hook\'s class', () => {
    const c = THEME_SWITCHING_CLASS
    const rule = indexCss.match(new RegExp(String.raw`\.${c} \*,\s*\.${c} \*::before,\s*\.${c} \*::after \{([^}]*)\}`))
    expect(rule?.[1].trim()).toBe('transition: none !important;')
  })

  // The shade under a fixed edge: the ink at 12% stands 1.27:1 off the light
  // panel, where the dark theme's slate-950 at 70% stands 1.29:1 off its own.
  it('shades a cut-off edge as deeply as the dark theme does', () => {
    const shade = indexCss.match(/:root\[data-theme="light"\] \{\s*--scroll-shade: color-mix\(in oklab, (#[0-9a-f]{6}) (\d+)%, transparent\);/)!
    expect(shade[1]).toBe(light('ink'))
    expect(ratio(over(shade[1], Number(shade[2]) / 100, PANEL), PANEL)).toBe(1.27)
  })
})
