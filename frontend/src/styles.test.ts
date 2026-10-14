// Vitest runs on node; the project ships no node types, and this is the one
// place in src/ that reads a file, so the suppression stays local to it.
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  UNFURLED,
  UNFURL_ANCHOR,
  ACCENT,
  ACCENT_RING,
  BADGE_ACCENT,
  BADGE_STEP,
  LAYER,
  BUTTON_ACCENT,
  BUTTON_DANGER,
  BUTTON_FLOATING,
  ACTION_GROUP,
  ACTION_ITEM,
  BAR_LABEL,
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
  SEGMENT_FLUID_LIFTED,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  DISABLED,
  SELECT,
  SEGMENT_FILL,
  SELECT_W_AGGREGATE,
  SPINNER,
  STATUS,
  TRANSPORT_AXIS_ITEM,
  LIFTED_EDGE,
  RECESSED_FILL,
  CALENDAR_FIELD,
  CALENDAR_GROUND,
  DRAW_ROW,
  METRIC_LABEL_PITCH,
  MOTION,
  PANEL_BODY,
  PANEL_HEADER,
  SCROLL_BARS,
  SCROLL_SHADOW,
  LINK,
  LINK_ACTION,
  CAPTION_LIFTED,
  BOTTOM_SHEET,
  MAP_CHIP,
  MAP_CHIP_SUMMARY,
  MAP_CHIP_SUMMARY_TEXT,
  MAP_FAB,
  MAP_FAB_WORDS,
  MAP_COL_GAP,
  MAP_COL_W,
  MAP_LOCATE,
  MAP_NOTICE_BAND,
  MAP_PILL,
  MAP_PILL_FIELD,
  MAP_ROWS,
  MAP_ROW_H,
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
  SURFACE_POPOVER,
  SURFACE_SHEET,
  SWATCH_CHIP,
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
import { CHART_TICK_PX } from './utils/chartColors'
import { SCRUBBER_THUMB_PX } from './utils/timeline'
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
import mapButtonColumnSource from './components/MapButtonColumn.tsx?raw'
import mapLegendSource from './components/MapLegend.tsx?raw'
import phoneMapRowsSource from './components/PhoneMapRows.tsx?raw'
import bottomSheetSource from './components/BottomSheet.tsx?raw'
import phoneFootSource from './components/PhoneFoot.tsx?raw'
import mapStageSource from './components/MapStage.tsx?raw'
import appDrawerSource from './components/AppDrawer.tsx?raw'
import analysisOverlaySource from './components/AnalysisOverlay.tsx?raw'
import forecastCalendarSource from './components/ForecastCalendar.tsx?raw'
// The one stylesheet with a decision in it: the vendor's own controls have no
// call site to hand a role to, so what they take is written there. Read off
// the disk rather than imported — Vitest stubs a CSS import, `?raw` included,
// to an empty string.
const mapCss: string = readFileSync(new URL('./map.css', import.meta.url), 'utf8')
// The other stylesheet with a decision in it, read the same way and for the
// same reason.
const indexCss: string = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

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

// The two building blocks `styles.ts` no longer exports (#687), read back off
// the roles that compose them, so every assertion below tests what a call site
// is actually handed.
const RECESSED_EDGE = SEGMENT_FLUID.split(' ').filter((c) => c.startsWith('border')).join(' ')
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

  // The 10px step lands on three background lightnesses, the lightest of them
  // the slate-700 table header bar carrying a required CC-BY credit. slate-300
  // is the dimmest step clearing 4.5:1 on all three (7.0 / 9.9 / 12.0);
  // slate-400 manages 4.0:1 on that bar and slate-500 only 2.2:1. Dimming this
  // role is not a style change, it is an accessibility regression, and a call
  // site cannot undo it: Tailwind resolves competing color utilities by
  // stylesheet order, not class-list order.
  it('keeps the micro step legible on the lightest surface it lands on', () => {
    expect(TEXT.micro).toContain('text-slate-300')
  })

  // The 12px secondary step lands on the slate-800 panel, cards and dialogs.
  // slate-400 is the dimmest step clearing 4.5:1 there (5.7, and 7.0 on the
  // slate-900 fields); slate-500, where this tier sat, managed 3.1:1 — a
  // deliberate recession, but below what AA permits for text. Same rule as
  // the micro step: a call site cannot dim this back, so the floor is here.
  it('keeps the caption step legible on the panel it lands on', () => {
    expect(TEXT.caption).toContain('text-slate-400')
  })

  // A section heading was slate-400 (5.71:1 on the slate-800 panel) over a
  // slate-200 subheading, so DESTINATIONS read dimmer than the Polygon under
  // it (#687). slate-300 is 9.85:1 and sits between the two steps it orders:
  // brighter than any caption, and still a step under the subheading's
  // brightness so the size, weight and case carry the rank, not a glare.
  it('brightens the section heading past the caption and keeps its size', () => {
    const MEASURED = { section: 9.85, wasBefore: 5.71 }
    const step = (c: string) => Number(c.match(/text-slate-(\d+)/)![1])
    expect(TEXT.section).toContain('text-slate-300')
    expect(TEXT.section).toContain('text-sm')
    expect(step(TEXT.section)).toBeLessThan(step(TEXT.caption))
    expect(step(TEXT.section)).toBeGreaterThan(step(TEXT.subheading))
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
  // would otherwise compile.
  it.each(Object.entries(sources))('%s spells no divider of its own', (_path, source) => {
    expect(source).not.toMatch(/border-slate-[7]00/)
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

    expect(uses.length).toBeGreaterThan(6)
    for (const use of uses) expect(use).toMatch(/\bborder-[trbl]\b/)
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
    const step = (recipe: string) => Number(recipe.match(/text-slate-(\d+)/)![1])

    expect(step(DAY.full)).toBeLessThan(step(DAY.partial))
    expect(step(DAY.partial)).toBeLessThan(step(DAY.unservable))
  })

  // Both steps a user can click are content, so both hold the 4.5:1 floor on the
  // slate-800 panel: slate-200 far above it, slate-400 at 5.7:1. Dimming the
  // partial step to slate-500's 3.1:1 would put a live date below AA, which is
  // what #165 spent five PRs undoing.
  it('keeps every pickable day legible on the panel', () => {
    expect(DAY.full).toContain('text-slate-200')
    expect(DAY.partial).toContain('text-slate-400')
  })

  // The one role here deliberately below 4.5:1, and the only one with no hover:
  // WCAG 1.4.3 exempts inactive controls, and a day that read as text would
  // invite the click it cannot accept.
  it('sets a day outside the servable band apart as inactive', () => {
    expect(DAY.unservable).toContain('text-slate-600')
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
  // slate-600, which the inputs used to carry, reads 1.94:1 against the
  // slate-800 panel and 2.36:1 against the slate-900 fill; slate-500 reads
  // 3.07 and 3.74. The fill step alone is 1.22:1 and cannot carry it. Binding
  // the three therefore raised the inputs to spec rather than lowering the
  // calendar to meet them — pinned so a later 'tidy-up' has to re-measure.
  it('keeps that edge on the step that clears both sides', () => {
    const MEASURED = { panel: 3.07, fill: 3.74, wasBefore: { panel: 1.94, fill: 2.36 } }
    expect(RECESSED_EDGE).toContain('slate-500')
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
    const fill = CALENDAR_GROUND.match(/bg-(slate-\d+)/)![1]
    expect(step(fill)).toBeGreaterThan(800) // darker than the slate-800 panel
    expect(fill).not.toBe(DAY.range.match(/bg-([a-z]+-\d+)/)![1])
  })

  // Two segmented controls in one panel: the ranking direction, and the
  // calendar's hours. ACCENT.fill is the chosen half, this is the other one, and
  // naming the pair is what stops the second one being a lookalike that drifts.
  it('pairs the idle segment with the accent fill', () => {
    expect(SEGMENT_IDLE).toContain('text-slate-400')
    expect(SEGMENT_IDLE).not.toBe(ACCENT.fill)
  })

  // Pointing at a control from across the screen is a ring, not a border or a
  // fill: it has to layer onto something that already has both. DAY.today is
  // the other one, and it wears slate because it labels a day rather than
  // acting on it — this one wears the resting accent because it is the app
  // answering a hover.
  it('points with a ring in the resting accent', () => {
    expect(ACCENT_RING).toContain('ring-sky-400')
    expect(ACCENT_RING).not.toContain('border')
    expect(DAY.today).toContain('ring-slate-400')
  })

  // The ring is a box-shadow and fades; a radius does not. Bundling one in here
  // squared the corners the instant the ring began fading, so the outline spent
  // the transition as a rectangle standing off a rounded field. The element
  // wearing this keeps its own radius at all times.
  it('leaves the radius to whatever wears the ring', () => {
    expect(ACCENT_RING).not.toContain(RADIUS.surface)
    expect(ACCENT_RING).not.toMatch(/\brounded\b/)
  })

  // Three severities, one shape. The error box used to run a heavier fill and a
  // brighter border than the two beside it in the same panel.
  it('builds every notice on one shape and differs only in hue', () => {
    const shape = (recipe: string) => recipe.replace(/-(amber|red|sky)-/g, '-*-')
    expect(shape(NOTICE.error)).toBe(shape(NOTICE.warn))
    expect(shape(NOTICE.info)).toBe(shape(NOTICE.warn))
    expect(NOTICE.warn).toContain(RADIUS.control)
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
    ['BUTTON_DANGER', BUTTON_DANGER],
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
    expect(FIELD).toContain('placeholder-slate-400')
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
    expect(MUTED).toBe('opacity-60')
    expect(MUTED).not.toContain('cursor')
    expect(MUTED).not.toContain('disabled:')
    expect(MUTED).not.toMatch(/text-|bg-|border-/)
  })

  // WCAG exempts only inactive controls from 1.4.3, and a muted control still
  // works, so its text owes 4.5:1. The slate-200 label composited at the
  // role's opacity, measured on each surface it lands on: the panel (Include
  // unnamed peaks), an idle metric row's select, and an unplotted chart chip.
  // 50% failed two of the three, which is what axe found in the browser suite.
  it('keeps a muted label above the text floor on every surface it fades on', () => {
    const MEASURED = {
      at60: { panel: 5.25, select: 5.96, chip: 5.43 },
      at50: { panel: 4.11, select: 4.58, chip: 4.22 },
    }
    expect(MUTED).toBe('opacity-60')
    expect(Math.min(...Object.values(MEASURED.at60))).toBeGreaterThanOrEqual(4.5)
    expect(Math.min(...Object.values(MEASURED.at50))).toBeLessThan(4.5)
    // Louder than off, still: the whole claim that separates it from DISABLED.
    expect(Number(MUTED.match(/opacity-(\d+)/)![1])).toBeGreaterThan(Number(DISABLED.match(/opacity-(\d+)/)![1]))
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
    expect(SURFACE_DIVIDER).toBe('border-slate-700')
    expect(SURFACE_DIVIDER.split(' ')).toHaveLength(1)
    expect(PANEL_EDGE).toBe('border-slate-500')
    expect(PANEL_RULE).toContain('[&>*+*]:border-t')
  })

  // Since #687 the panel's rule draws the divider's colour rather than
  // half-opacity slate-600, which composited to 1.37:1 beside the divider's
  // 1.41: the same line by eye, so it is the same line. Spelled under the
  // stack's variant because Tailwind cannot compile an interpolated one, and
  // held to the divider here.
  it('draws the panel rule in the divider colour', () => {
    expect(PANEL_RULE).toContain(`[&>*+*]:${SURFACE_DIVIDER}`)
    expect(PANEL_RULE.match(/border-slate-\S+/g)).toEqual([SURFACE_DIVIDER])
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
  // above it, and its labels carry their units. `Freezing level (ft)` is
  // 99.27px, where the panel column would leave 84px.
  it('keeps the chart metric select off the panel column', () => {
    const FREEZING_LEVEL_UNIT_PX = 100
    const chartPx = stepPx(CHART_METRIC_W, 'w')
    expect(chartPx - 8 - selectArrowPx() - 2).toBeGreaterThanOrEqual(FREEZING_LEVEL_UNIT_PX)
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
    ['BUTTON_DANGER', BUTTON_DANGER],
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
    const MEASURED = { headerBar: 4.74, sheet: 6.71, hoveredRow: 6.08 }
    for (const [ground, ratio] of Object.entries(MEASURED)) {
      expect(ratio, `the ring on ${ground} must clear the 3:1 asked of a focus indicator`).toBeGreaterThanOrEqual(3)
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
    expect(SURFACE_SHEET).toContain('bg-slate-800')
    expect(SURFACE_SHEET).toContain('border-slate-600')
    expect(SURFACE_SHEET).toContain(RADIUS.surface.replace('rounded', 'rounded-t'))
    // The header bar inside is a square block, so the corners only exist while
    // the sheet clips them.
    expect(SURFACE_SHEET).toContain('overflow-hidden')
    // Downward shadows have nothing to fall on under a bottom sheet, so it
    // stands at the docked step of the elevation scale.
    expect(SURFACE_SHEET).toContain(ELEVATION.none)
    expect(SURFACE_SHEET.match(/\bshadow-\S+/g)).toEqual([ELEVATION.none])
  })

  // Everything in the map's left column is one width: the search field, its
  // results, the Controls and Layers buttons, the Layers popover and the
  // legend. They shipped as 301, 184, 128, 128, 192 and 192, which read as a
  // ragged edge rather than as a column, so the width is one role and every
  // member of the column wears it.
  it('gives every member of the map column one width', () => {
    // Who wears it, and what no call site spells beside it, are the
    // style-map-column and style-search-box checks.
    expect(MAP_COL_W).toBe('w-46')
  })

  // The third part of the same decision: one gap between members, so the
  // column's height and the inset that clears it are built from one number.
  // The Layers menu took it too, as a margin, until it unfurled out of its
  // button with no gap (record 0134).
  it('gives the column one gap', () => {
    expect(MAP_COL_GAP).toEqual({ gap: 'gap-1' })
  })

  // The other half of the same decision: one row height, so the field and the
  // two buttons do not each solve for their own (34, 38 and 38 before this).
  it('gives every row in that column one height', () => {
    expect(MAP_ROW_H).toBe('h-9 touch:h-11')
    const rows = [
      ...(mapButtonColumnSource.match(/\$\{MAP_ROW_H\}/g) ?? []),
      ...(layersPopoverSource.match(/\$\{MAP_ROW_H\}/g) ?? []),
      ...(searchBoxSource.match(/\$\{MAP_ROW_H\}/g) ?? []),
    ]
    // Both buttons and the search field, counted across the three files. A row
    // that sets its own height beside the role is the style-map-column check.
    expect(rows).toHaveLength(3)
  })

  // One type size for the whole column, which is what `CONTROL_SIZE` is doing
  // on a map button: a 14px label beside the 12px field, results and legends
  // read as a different kind of object rather than as a louder one
  // (TJ, 2026-09-14).
  it('reads the whole map column at one size', () => {
    expect(sizes(BUTTON_FLOATING)).toEqual([CONTROL_SIZE])
    expect(sizes(BUTTON_FLOATING)).toEqual(sizes(TEXT.control))
    // Colorless on purpose: the label is white, and a second color utility
    // beside `TEXT.control`'s slate-200 would resolve by stylesheet order.
    expect(BUTTON_FLOATING).toContain('text-white')
    expect(BUTTON_FLOATING).not.toContain(TEXT.cta)
  })

  // The search results moved onto the popover's fill, which is a step lighter
  // than the surface the caption tier was derived against.
  it('lifts the search results and the caption inside them together', () => {
    // slate-400 is 3.94:1 on that fill, under the 4.5:1 AA asks of text.
    // The results bar is the same slate-700, and its window caption measured
    // 3.93:1 on the caption tier; slate-300 is 6.97:1 there.
    expect(CAPTION_LIFTED).not.toContain('slate-400')
    expect(sizes(CAPTION_LIFTED)).toEqual(sizes(TEXT.caption))
  })

  // The Layers popover, separated from the legend boxes by elevation rather
  // than by a heavier line: one slate step of fill and a heavier shadow, with
  // the border the legends' and unchanged. It has to be spelled
  // as its own recipe rather than composed onto the floating one, because two
  // background utilities resolve by stylesheet order and the lighter fill would
  // not reliably win.
  it('lifts the Layers popover off the legends by elevation', () => {
    expect(SURFACE_POPOVER).toContain('bg-slate-700/95')
    expect(SURFACE_POPOVER).toContain('border-slate-600')
    expect(SURFACE_POPOVER).toContain(RADIUS.surface)
    // The shadow is what does the separating, so it must outrank the legends'.
    expect(SURFACE_POPOVER).toContain(ELEVATION.overlay)
    expect(SURFACE_FLOATING).not.toContain(ELEVATION.overlay)
    expect(SURFACE_POPOVER).not.toContain(SURFACE_FLOATING)
  })

  // slate-500 carries the recessed boundary at 3.07:1 against the slate-800
  // panel and only 2.17:1 against the popover's lighter fill, which would leave
  // the segment and the coverage well without the outer half of their edge.
  // slate-400 is 3.94:1 out and 7.0:1 against the slate-900 fill in, so both
  // sides clear the 3:1 WCAG 1.4.11 asks of a component boundary.
  it('re-derives the recessed edge for the lifted surface', () => {
    expect(LIFTED_EDGE).toContain('border')
    expect(LIFTED_EDGE).toContain('slate-400')
    expect(LIFTED_EDGE).not.toBe(RECESSED_EDGE)
    // Only the edge varies: shape stays the fluid segment's, so the two cannot
    // drift into different controls.
    expect(SEGMENT_FLUID_LIFTED).toContain(LIFTED_EDGE)
    expect(SEGMENT_FLUID_LIFTED).not.toContain(RECESSED_EDGE)
    expect(SEGMENT_FLUID_LIFTED.replace(LIFTED_EDGE, RECESSED_EDGE)).toBe(SEGMENT_FLUID)
  })

  // Sky at rest means "this acts here". Anything that leaves for someone
  // else's site rests in slate and only reaches for sky on hover, which is what
  // keeps the accent meaning one thing.
  it('reserves the resting accent for links that act in the app', () => {
    expect(LINK_ACTION).toContain('text-sky-400')
    expect(LINK).not.toMatch(/(^|\s)text-sky-/)
    expect(LINK).toContain('hover:text-sky-400')
  })

  // A data credit is a link inside an 11px caption, so it wears
  // both roles at once. Two color utilities in one class list are decided by
  // stylesheet order, not by the order they were written, so composing them is
  // only safe while they agree. If one moves, the other has to move with it.
  it('lets a link and the micro step be worn together', () => {
    const color = (recipe: string) => recipe.split(' ').find((c) => /^text-slate-/.test(c))

    expect(color(LINK)).toBe(color(TEXT.micro))
  })

  // The two secondary actions had been a filled button in the panel and an
  // outlined one on the overlay, same size and padding, same background.
  it('builds the secondary action from the ramp and the radius scale', () => {
    expect(BUTTON_SECONDARY).toContain(TEXT.control)
    expect(BUTTON_SECONDARY).toContain(RADIUS.control)
  })
})

// WCAG 2.2 gives two numbers: SC 2.5.8 (AA) wants 24x24 CSS px, SC 2.5.5 (AAA)
// wants 44x44. The app takes the 44 wherever a control stands on its own and
// holds the 24 floor inside the results grid, where 44px rows would cost more
// ranking than the reach is worth. What these guard is that the two numbers
// stay two numbers rather than becoming a spectrum.
describe('tap targets', () => {
  const px = (recipe: string, axis: 'h' | 'w') => {
    const step = recipe.match(new RegExp(`min-${axis}-(\\d+)|(?<![-\\w])${axis}-(\\d+)`))

    return step ? Number(step[1] ?? step[2]) * 4 : null
  }

  it.each(['action', 'row', 'height'] as const)(
    'TAP.%s reaches the enhanced target',
    (key) => {
      expect(px(TAP[key], 'h')).toBe(44)
    },
  )

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

  // Three reach 44 by different display values because three kinds of control
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

  // The file warns about this in five places and it still nearly shipped: this
  // very PR first built BUTTON_DANGER out of TEXT.control, which carries
  // slate-200, so its red label would have raced a slate one and the winner
  // would have been decided by Tailwind's stylesheet order rather than by
  // intent. A comment cannot catch that. Variants are excluded because a
  // `hover:` color does not compete with a resting one.
  const RESTING_COLOR = new RegExp(
    String.raw`(?:^|\s)text-(?:white|black|(?:slate|sky|blue|cyan|teal|emerald|green|lime|` +
      String.raw`yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|indigo)-\d{2,3})` +
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
    fill: 'bg-sky-650 text-white',
    label: 4.57, // white on sky-650
    edges: { panel: 3.21, rangeBand: 3.04, segmentTrack: 3.91 },
  }

  it('rests on the one shade that clears the label and every edge at once', () => {
    expect(ACCENT.fill).toBe(MEASURED.fill)
    expect(MEASURED.label).toBeGreaterThanOrEqual(4.5)
    for (const [edge, ratio] of Object.entries(MEASURED.edges)) {
      expect(ratio, `${edge} must clear the 3:1 asked of a UI boundary`).toBeGreaterThanOrEqual(3)
    }
  })

  // The custom token is the whole point: a scale step here would mean someone
  // "simplified" the fill back onto sky-600 or sky-700, both of which fail.
  it('takes its fill from the custom token rather than the stock scale', () => {
    expect(ACCENT.fill).toContain('sky-650')
  })

  // The one state still below AA, recorded rather than asserted away. With a
  // white label every lightening costs contrast, so a conformant hover would
  // have to darken — making the app's one primary action the only control that
  // dims under the pointer. 4.02:1 is what the *resting* fill measured before
  // #167, so no state is worse than what already shipped.
  const HOVER = { recipe: 'hover:bg-sky-600', ratio: 4.02, wasBefore: 2.71 }

  it('hovers lighter, at a contrast cost taken knowingly', () => {
    expect(ACCENT.fillHover).toBe(HOVER.recipe)
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
    // stylesheet order — the trap BUTTON_DANGER documents.
    expect(BUTTON_ACCENT).not.toContain(TEXT.control)
    expect(sizes(BUTTON_ACCENT)).toEqual(sizes(TEXT.control))
  })

  // Every other accent job routes through the same object, so there is one
  // place to change if the accent hue ever moves.
  it('sources every accent treatment from the one hue', () => {
    for (const recipe of [ICON_ACTION, BUTTON_FLOATING, SPINNER]) {
      expect(recipe).toMatch(/sky-/)
    }
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
      expect(box).not.toMatch(/(^|\s)text-(?:slate|sky|amber|red|green)-/)
    }
  })

  // The error box ran a heavier fill behind an opaque border while the other
  // three shared one spelling, so the app shouted in a different shape than it
  // warned in. One shape now, tone being the only thing that varies.
  it('gives every notice tone the same box', () => {
    const shape = (box: string) => box.replace(/(amber|red|sky)/g, 'TONE')

    expect(new Set(Object.values(NOTICE).map(shape)).size).toBe(1)
    expect(Object.values(NOTICE)).toHaveLength(3)
  })

  // The destructive retry had its entire recipe inline. It stays in the red
  // family rather than going white so it reads as part of the notice holding
  // it, not as a second primary action competing with Analyze.
  it('keeps the destructive action inside the notice that holds it', () => {
    expect(BUTTON_DANGER).toContain(RADIUS.control)
    expect(BUTTON_DANGER).toMatch(/text-red-/)
    expect(BUTTON_DANGER).not.toContain('text-white')
  })

  // #253. The dismiss X inherits its box's STATUS color, so neither part of
  // the recipe may set a resting color of its own — one would override the
  // voice on every box at once. The ratios are the inherited glyph on the
  // resting pill backdrop (box fill + white/5 over the panel); literals so
  // a fill, STATUS or pill change fails here and forces a re-measurement
  // rather than inheriting a stale claim.
  const DISMISS_MEASURED = { warn: 9.1, error: 5.0, info: 7.45 }

  it('dismisses in the voice of the box it sits in', () => {
    expect(NOTICE_DISMISS.button).not.toMatch(/(^|\s)text-/)
    expect(NOTICE_DISMISS.pill).not.toMatch(/(^|\s)text-/)
    for (const [tone, ratio] of Object.entries(DISMISS_MEASURED)) {
      expect(ratio, `${tone} glyph must clear the 3:1 asked of a UI glyph`).toBeGreaterThanOrEqual(3)
    }
  })

  // The Analyze button sits directly above the notices, so the 44px touch
  // target must grow the box in-flow rather than positioning itself over the
  // button's bottom edge. The visible pill is the separate, smaller part —
  // and hue-free, so one recipe sits on all three tints.
  it('earns its touch target by growing the box, not by overhanging it', () => {
    expect(NOTICE_DISMISS.button).toContain(TAP.action)
    expect(NOTICE_DISMISS.button).toContain(FOCUS_RING)
    expect(NOTICE_DISMISS.button).not.toContain('absolute')
    expect(NOTICE_DISMISS.pill).toContain(RADIUS.pill)
    expect(NOTICE_DISMISS.pill).toContain('bg-white/')
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
    expect(NOTICE_DISMISS.row).toContain('hover:bg-white/')
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
      const border = NOTICE[tone].split(' ').find((c) => /^border-[a-z]+-\d/.test(c))
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

  // The message and its X are centred against each other. On a coarse pointer
  // the button is 44px and the message is one line, so the text sits level with
  // the disc rather than at the top of a target three times its height; the
  // offset that used to pin the X to a wrapped message's first line is gone
  // with the wrap it existed for.
  it('sets the message level with the X it carries', () => {
    expect(NOTICE_DISMISS.row).toContain('items-center')
    expect(NOTICE_DISMISS.button).not.toContain('self-start')
    // No UNPREFIXED negative margin: the one the button carries is the
    // coarse-pointer overlay below, and a mouse must not inherit it.
    expect(NOTICE_DISMISS.button).not.toMatch(/(^|\s)-m[trblxy]?-/)
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

  // The button column, the legend stack and the popover under them. The first
  // two wear the role; the popover's offset parent IS the column, so it takes
  // zero from the button it hangs under, which is the same edge. What none of
  // them may do is spell an inset of its own — that is how the column came to
  // sit 4px right of the legends. Written as alternation so no banned class
  // appears verbatim: v4 scans this file as raw text.
  // The library's top-right stack takes the same inset through `map.css`,
  // which reads the property and spells no number of its own — the vendor's
  // 10px is what put its buttons a step above the app's column opposite them.
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

// The phone's two rows across the map's top (#696; record 0135): the search
// pill with the locate button at its right, and the chip row under it. Every
// other anchor on a phone's top is built from the rows' four numbers, so this
// holds each one to the sum rather than trusting a comment.
describe('the phone rows', () => {
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
    // The chips are 32px tall each, and 6px apart.
    expect(step(MAP_CHIP, 'h')).toBe(CHIPS)
    expect(step(MAP_ROWS.chips, 'gap')).toBe(6)
  })

  // The pill leaves the locate button and the 8px between them at rest, and
  // takes the whole row while it is searching.
  it('stands the pill beside a 40px round locate button', () => {
    expect(step(MAP_LOCATE, 'size')).toBe(ROW)
    expect(step(MAP_PILL, 'h')).toBe(ROW)
    expect(step(MAP_ROWS.pill, 'right')).toBe(ROW + GAP)
    expect(MAP_ROWS.pillWide).toMatch(/(^|\s)right-0(\s|$)/)
    for (const recipe of [MAP_PILL, MAP_LOCATE]) expect(tokens(recipe)).toContain(RADIUS.pill)
    // The class map.css keys the vendor button's restyle on.
    expect(tokens(MAP_LOCATE)).toContain('map-locate')
    expect(mapCss).toContain('.map-locate .maplibregl-ctrl-group')
    expect(phoneMapRowsSource).toContain('<div ref={onLocateSlot} className={MAP_LOCATE} />')
  })

  // One floating chrome for the pill, the locate button and the chips: the
  // floating box's fill, edge, shadow and blur, at a capsule's radius rather
  // than the box's.
  it('dresses the pill, the locate button and the chips in the floating box\'s chrome', () => {
    const chrome = tokens(SURFACE_FLOATING).filter((t) => t !== RADIUS.surface)
    for (const recipe of [MAP_PILL, MAP_LOCATE, MAP_CHIP, MAP_CHIP_SUMMARY]) {
      for (const t of chrome) expect(tokens(recipe), `${t} in ${recipe}`).toContain(t)
      expect(tokens(recipe)).not.toContain(RADIUS.surface)
    }
  })

  // The mockup's original size (#696): 13px type and 12px a side, at the
  // normal weight. The one 13px role in the app, so nothing else drifts onto
  // it by accident.
  it('sets the chips at 13px with 12px a side', () => {
    for (const recipe of [MAP_CHIP, MAP_CHIP_SUMMARY]) expect(sizes(recipe)).toEqual(['text-[13px]'])
    const recipes = Object.values(STYLES).flatMap((v) =>
      typeof v === 'string' ? [v] : Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === 'string'),
    )
    expect(recipes.filter((r) => sizes(r).includes('text-[13px]')).sort()).toEqual([MAP_CHIP, MAP_CHIP_SUMMARY].sort())
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
    for (const recipe of [MAP_CHIP, MAP_CHIP_SUMMARY, MAP_ROWS.chips]) expect(recipe).not.toMatch(/(^|\s)(ml-auto|justify-between)(\s|$)/)
  })

  // A chip lit for its open sheet takes the accent fill as a variant, so the
  // lit and the resting fills never race on stylesheet order.
  it('lights a chip in the accent fill while its sheet is open', () => {
    expect(phoneMapRowsSource).toContain('${MAP_CHIP} ${DISABLED}')
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
    // The draw bar: its 44px buttons (`TAP`) and its 6px of padding a side.
    const drawBarPx = 44 + 2 * step(DRAW_BAR, 'py')
    expect(drawBarPx).toBe(56)
    // Its 1px border, top and bottom, is the 58 the bar measures.
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
    expect(searchBoxSource).toContain('${pill ? MAP_PILL_FIELD : \'\'}')
  })

  // The vendor's button, so map.css spells it, on the query `touch` is.
  it('presses the 40px locate button as 44, by a rim on a coarse pointer', () => {
    expect(steps(MAP_LOCATE, /(?:^|\s)size-(\d+)(?:\s|$)/)).toBe(40)
    const block = mapCss.slice(mapCss.indexOf('@media (hover: none) {\n  .map-locate'))
    expect(block.slice(0, block.indexOf('\n}\n'))).toMatch(/\.map-locate \.maplibregl-ctrl-group button::before \{\s*content: '';\s*position: absolute;\s*inset: -3px;/)
  })

  it('leaves the Analyze button at 56, over the floor already', () => {
    expect(steps(MAP_FAB, /(?:^|\s)h-(\d+)(?:\s|$)/)).toBe(56)
  })
})

// The phone's Analyze (#696; record 0135): Material's extended floating
// action button, on the panel's primary fill and gate.
describe('the Analyze button on a phone', () => {
  const tokens = (recipe: string) => recipe.split(/\s+/).filter(Boolean)

  it('is 56px tall, 16px off the right edge, with a 16px corner', () => {
    expect(tokens(MAP_FAB)).toEqual(expect.arrayContaining(['absolute', 'right-4', 'h-14', 'rounded-2xl']))
    expect(MAP_FAB).toContain(LAYER.mapControls)
    expect(MAP_FAB).toContain(ELEVATION.overlay)
  })

  // The primary fill, so the white label keeps record 0008's contrast; the
  // call to action's type; the panel's grey from the call site.
  it('wears BUTTON_PRIMARY\'s fill and the call to action\'s type', () => {
    for (const part of [ACCENT.fill, ACCENT.fillHover, FOCUS_RING, TEXT.cta]) expect(MAP_FAB).toContain(part)
    for (const part of [ACCENT.fill, TEXT.cta]) expect(BUTTON_PRIMARY).toContain(part)
    expect(phoneFootSource).toContain('${MAP_FAB} ${DISABLED}')
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
    expect(tokens(BOTTOM_SHEET.scrim)).toEqual(expect.arrayContaining(['fixed', 'inset-0']))
    expect(BOTTOM_SHEET.dim).toMatch(/(^|\s)bg-black\/\d+(\s|$)/)
    // The whole screen, chips and search row included, fixed to the viewport
    // with the scrim, so no banner above the map leaves a band of it bright.
    expect(BOTTOM_SHEET.dim.split(/\s+/)).toEqual(expect.arrayContaining(['absolute', 'inset-0']))
    expect(BOTTOM_SHEET.dim).not.toMatch(/(^|\s)top-/)
    expect(bottomSheetSource).toContain('role="dialog"')
    expect(bottomSheetSource).toContain('aria-modal="true"')
    expect(bottomSheetSource).toContain('useDialog(onClose)')
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
    expect(tokens(BOTTOM_SHEET.body)).toEqual(expect.arrayContaining(['[&>*]:min-h-11', 'overflow-y-auto', 'divide-y', SCROLL_BARS]))
    expect(BOTTOM_SHEET.title).toBe(TEXT.subheading)
    for (const part of [CONTROL_SIZE, TAP.action, LINK_ACTION, FOCUS_RING]) expect(BOTTOM_SHEET.done).toContain(part)
  })
})

// The panel's notices on a phone's map while the drawer is shut (#696;
// record 0140): the same translucent boxes, on the drawer's own fill.
describe('the notice band', () => {
  it('lays the drawer\'s fill under the boxes only while it holds one, and yields the rest', () => {
    const drawerFill = appDrawerSource.match(/flex-shrink-0 (bg-slate-\d+) flex flex-col/)?.[1]
    expect(drawerFill).toBeDefined()
    expect(MAP_NOTICE_BAND).toContain(`has-[>[role=status]>*]:${drawerFill}`)
    expect(MAP_NOTICE_BAND).not.toMatch(/(^|\s)bg-/)
    for (const part of [MAP_EDGE.left, MAP_EDGE.right, YIELD_EMPTY]) expect(MAP_NOTICE_BAND).toContain(part)
    // The boxes' own corners, so the fill under them meets their edges.
    expect(NOTICE.warn).toContain(RADIUS.control)
    expect(MAP_NOTICE_BAND).toContain(RADIUS.control)
  })
})

// The map's Layers popover: the one list in the app whose members have no
// ranking between them.
describe('the map layer rows', () => {
  // Read out of the source rather than out of a render, for the reason every
  // other check here is: Vitest has no DOM, and the order is a property of the
  // literal the popover maps over.
  const labels = (() => {
    const block = layersPopoverSource.match(/const MAP_LAYERS = \[[\s\S]*?\n {2}\]/)?.[0] ?? ''
    return [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  })()

  it('found every row', () => {
    expect(labels).toHaveLength(8)
  })

  // Alphabetical, because nothing else orders these: no cost, no severity and
  // no dependency separates one switch from another, so any other order is one
  // the reader has to learn rather than one they can scan.
  it('lists the layers in alphabetical order', () => {
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

})

// The map's one legend box (#454): the metric key and a section per layer that
// is on, all in one alphabetical list.
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

  // Alphabetical by the label a section reads, the metric key included (TJ,
  // 2026-09-17). Nothing ranks these against each other, so any other order is
  // one the reader has to learn. It is SORTED rather than written in order,
  // because one of the labels is the ranked metric's: `Temperature` sorts last
  // and `AQI` first, and no source order can be both.
  it('sorts every section by the label it reads', () => {
    expect(box).toContain('.sort((a, b) => a.label.localeCompare(b.label))')
  })

  // One box, not two: the second cost a border, a gap and a backdrop on a map
  // that can be 161px tall.
  it('draws them all in one floating box', () => {
    expect((box.match(/\$\{SURFACE_FLOATING\}/g) ?? []).length).toBe(1)
  })

  // Every section, a chip row or a scale alike, is built by one function —
  // which is what lets them be sorted at all, and what stopped the snow key
  // being the odd one out.
  it('builds every section from the one recipe', () => {
    expect((box.match(/legendSection\(section\)/g) ?? []).length).toBe(1)
    expect((box.match(/\bramp: \{/g) ?? []).length).toBe(2)
  })
})

// The stack spans the map's height to its derived floor whatever it holds, so
// the band under the last section is empty and a click there belongs to the
// map. The box yields; the sections it holds take the pointer back.
describe('the legend stack', () => {
  // The scroll box itself: the one element that wears the legend's top inset.
  const stack = mapLegendSource.match(/className=\{`absolute \$\{MAP_EDGE\.left\}[^`]*LEGEND_TOP[^`]*`\}/)?.[0] ?? ''

  it('found the stack', () => {
    expect(stack).toContain('overflow-y-auto')
  })

  it('gives its empty area to the map and keeps it for its sections', () => {
    expect(YIELD_EMPTY.split(' ')).toEqual(['pointer-events-none', '[&>*]:pointer-events-auto'])
    expect(stack).toContain('${YIELD_EMPTY}')
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
  it('edges every swatch from one place', () => {
    expect(SWATCH_EDGE).toBe('#475569')
  })

  // The numbers moved INSIDE the strip (TJ, 2026-09-17), which saves a line per
  // scale and costs a contrast rule: a metric ramp runs cyan-300 to purple-500,
  // so no single ink clears AA across it and a ground is what makes one
  // measurable. These are the measured ratios over all five metric ramps and
  // the eleven snow bands; a change to the scrim or the ink re-measures them.
  const RAMP_INK = { straightWhite: 1.45, straightDark: 2.04, onScrim: 6.49 }

  it('stands its numbers on a ground rather than on the ramp', () => {
    expect(RAMP_INK.straightWhite).toBeLessThan(4.5)
    expect(RAMP_INK.straightDark).toBeLessThan(4.5)
    expect(RAMP_INK.onScrim).toBeGreaterThanOrEqual(4.5)
    expect(SWATCH_RAMP_SCRIM).toContain('bg-slate-900/70')
    // Full width rather than a chip per number: one ground and one baseline,
    // where four chips are four dark blocks punched through a six-band scale.
    expect(SWATCH_RAMP_SCRIM).toContain('inset-x-0')
    expect(SWATCH_RAMP_TICK).toContain('text-slate-200')
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

  // The accent fill against the neutral chip beside it measures 2.2:1, under
  // the 3:1 WCAG 1.4.11 asks of a boundary carrying meaning alone — so the
  // state is carried by shape as well, the × that a resting chip has and an
  // active one never does. Recorded here so a change to either fill is forced
  // through a re-measurement rather than inheriting this sentence.
  const MEASURED = { activeVsRest: 2.2, restLabel: 8.2, activeLabel: 4.57 }

  it('carries its state on a second channel, because colour alone is short', () => {
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
    expect(STYLES.TOUR.spotlightControl).toBe(STYLES.RADIUS.surface)
    // The one transition the tour wears yields to a reduced-motion setting.
    expect(STYLES.TOUR.motion).toContain('motion-reduce:transition-none')
    expect(STYLES.TOUR.spotlight).toContain('pointer-events-none')
  })

  it('moves only between steps, never with the layout', () => {
    for (const role of [STYLES.TOUR.spotlight, STYLES.TOUR.card, STYLES.TOUR.sheet, STYLES.TOUR.sheetTop]) {
      expect(role).not.toMatch(/transition/)
    }
    expect(STYLES.TOUR.motion).toContain('duration-200')
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

  // Under 11px only the two glyphs in boxes of fixed size, at 10px, named as
  // the exception: the strip's numerals in their 11px scrim band and the smoke
  // key's letters in their chips. Nothing is 9px any more.
  it('keeps 10px for the two glyphs in fixed boxes, and nothing smaller', () => {
    const under = recipes.flatMap((r) => sizes(r).filter((c) => px(c) < 11))
    expect(new Set(under)).toEqual(new Set(['text-[10px]']))
    expect(sizes(SWATCH_RAMP_TICK)).toEqual(['text-[10px]'])
    expect(sizes(SWATCH_CHIP)).toEqual(['text-[10px]'])
    expect(recipes.filter((r) => sizes(r).includes('text-[10px]')).sort()).toEqual(
      [SWATCH_CHIP, SWATCH_RAMP_TICK].sort(),
    )
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
    expect(SURFACE_POPOVER).toContain(ELEVATION.overlay)
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

// The credit line on a phone, opened, wraps short of the scale bar rather than
// covering it (#687): map.css caps the bottom-right corner at the map's width
// less the scale's room, which these vendor numbers and the scale's widest
// draw decide.
describe('the attribution beside the scale', () => {
  const SCALE_MARGIN_PX = 10 // the vendor's bottom-left control margin
  const ATTRIB_MARGIN_PX = 10 // the vendor's compact attribution margin
  const CLEAR_PX = 8
  // Read as text: the controls module imports maplibre-gl, which this node
  // suite does not load.
  const SCALE_MAX_WIDTH_PX = Number(
    readFileSync(new URL('./map/controls.ts', import.meta.url), 'utf8').match(/SCALE_MAX_WIDTH_PX = (\d+)/)?.[1],
  )

  it('caps the corner where the room the scale bar takes ends', () => {
    const rule = mapCss.match(/\n\.maplibregl-ctrl-bottom-right \{[^}]*max-width[^}]*\}/)?.[0] ?? ''
    const cap = Number(rule.match(/max-width: calc\(100% - (\d+)px\)/)?.[1])
    expect(SCALE_MAX_WIDTH_PX).toBe(100)
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
    expect(MAP_FAB.split(/\s+/)).toContain('right-4')
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

describe('the idle compass', () => {
  it('is hidden by map.css under the class the controls module sets', () => {
    const rule = mapCss.slice(mapCss.indexOf('.compass-idle .maplibregl-ctrl-compass'))
    expect(rule).toMatch(/^\.compass-idle \.maplibregl-ctrl-compass \{\s*display: none;/)
  })
})

describe('the merged roles', () => {
  // Five exports for one gesture's parts, and five for two range inputs'
  // parts, became one object each; the keys are the whole vocabulary.
  it('groups the drag and the slider parts', () => {
    expect(Object.keys(DRAG).sort()).toEqual(['carried', 'ghost', 'grip', 'gripActive', 'insert'])
    expect(Object.keys(SLIDER).sort()).toEqual(['idle', 'overlay', 'track', 'value', 'wordmark'])
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
    expect(ACTION_GROUP).toBe(`${SEGMENT_FLUID} ${UNFURL_ANCHOR}`)
    expect(ACTION_ITEM).toContain(SEGMENT_IDLE)
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

  // The tutorial button at the primary's height: py-2.5 around text-sm's 20px
  // line is 40, and min-h-10 is 40.
  it('stands the second action at the primary height', () => {
    expect(DIALOG_FOOT.secondary).toContain(BUTTON_SECONDARY)
    const primaryPx = 2 * stepPx(BUTTON_PRIMARY, 'py') + 20
    expect(stepPx(DIALOG_FOOT.secondary, 'min-h')).toBe(primaryPx)
  })
})

// A menu is one card with the control that opens it (#687, record 0134).
describe('an unfurled menu', () => {
  // The card drops the border and the corners on the edge it shares with its
  // anchor, and nothing on the other three: the anchor's own edge is the one
  // line between them.
  it('drops exactly the shared edge, on whichever side it took', () => {
    expect(UNFURLED.below.split(' ').sort()).toEqual(['border-t-0', 'rounded-t-none'])
    expect(UNFURLED.above.split(' ').sort()).toEqual(['border-b-0', 'rounded-b-none'])
  })

  // Across a row the card is wider than its control, so it keeps the border on
  // the shared edge and squares only the corner under the control: its right
  // edge is the control's, and the outer corner stands free under the label.
  it('squares only the corner under the control when it spans a row', () => {
    expect(UNFURLED.belowWide).toBe('rounded-tr-none')
    expect(UNFURLED.aboveWide).toBe('rounded-br-none')
  })

  // The anchor squares the corners facing the card, on the side `usePopover`
  // writes, and takes the card's edge colour so the outline runs round both.
  it("squares the anchor on the side facing the card, in the card's edge colour", () => {
    expect(UNFURL_ANCHOR).toContain('data-[unfurled=below]:rounded-b-none')
    expect(UNFURL_ANCHOR).toContain('data-[unfurled=above]:rounded-t-none')
    expect(SURFACE_CARD).toContain('border-slate-600')
    expect(UNFURL_ANCHOR).toContain('data-[unfurled]:border-slate-600')
  })

  it('is worn by the results bar group', () => {
    expect(ACTION_GROUP).toContain(UNFURL_ANCHOR)
  })
})

describe('the panel frame', () => {
  // The seam between the docked panel and the results (#697, record 0128):
  // the panel's own structural edge, 3.07:1 on slate-800 and 3.74:1 on
  // slate-900, where SURFACE_DIVIDER's 1.41:1 left the two one block.
  it("closes the panel's right edge with the structural rule", () => {
    const MEASURED = { panel: 3.07, page: 3.74, wasBefore: 1.41 }
    expect(appDrawerSource).toMatch(/border-r \$\{PANEL_EDGE\}/)
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

  it('tells the browser the app is dark, and draws the bar in the theme\'s own steps', () => {
    expect(indexCss).toMatch(/:root\s*\{\s*color-scheme:\s*dark;/)
    const bars = indexCss.slice(indexCss.indexOf('.surface-scrollbars {'), indexCss.indexOf('/* Scroll shadows'))
    expect(bars).toContain('var(--color-slate-500)')
    expect(bars).toContain('var(--color-slate-800)')
    expect(bars).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    // The map's white surfaces keep the light scheme for themselves.
    expect(mapCss).toMatch(/\.maplibregl-popup,\s*\.maplibregl-ctrl\s*\{\s*color-scheme:\s*light;\s*color:\s*CanvasText;/)
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

  // The two movements that answer an action stop where the reader asked
  // their system for less (#687), as the tutorial's spotlight already did.
  it('drops every answering movement under reduced motion', () => {
    for (const recipe of Object.values(MOTION)) {
      expect(recipe).toMatch(/(^|\s)transition/)
      expect(recipe).toContain('motion-reduce:transition-none')
    }
    expect(appDrawerSource).toContain('MOTION.slide')
    expect(appDrawerSource).not.toMatch(/(^|\s)transition-transform duration/)
    expect(analysisOverlaySource).toContain('MOTION.progress')
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
    expect(DAY.cell).toContain('touch:h-11')
    expect(DAY.head).toMatch(/(^|\s)h-9(\s|$)/)
  })

  // The field is a SELECT, so it is the same recessed box with an arrow that
  // opens every other choice in the panel, and the card is Popover.tsx's.
  it('draws the field as a select and the grid on the popover card', () => {
    expect(CALENDAR_FIELD.box).toContain(SELECT)
    expect(forecastCalendarSource).toContain('CALENDAR_FIELD.box')
    expect(forecastCalendarSource).toContain('<IconSelectArrow placement={CALENDAR_FIELD.arrow} />')
    expect(forecastCalendarSource).toContain('<Popover ')
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
  // is the 1px border plus py-1.5 (one line 30px); 14px is the border plus
  // 13px under touch (one line 44px, TAP.height's floor).
  it('keeps the first line and the arrow where a one-line field has them', () => {
    const LINE_PX = 16 // text-xs line box
    const BORDER_PX = 1
    const fine = stepPx(CALENDAR_FIELD.box, 'py')
    const touch = Number(CALENDAR_FIELD.box.match(/touch:py-\[(\d+)px\]/)![1])
    expect(2 * BORDER_PX + 2 * fine + LINE_PX).toBe(30)
    expect(2 * BORDER_PX + 2 * touch + LINE_PX).toBe(44)
    expect(CALENDAR_FIELD.box).toContain('items-start')
    expect(CALENDAR_FIELD.arrow).toContain(`top-[${BORDER_PX + fine}px]`)
    expect(CALENDAR_FIELD.arrow).toContain(`touch:top-[${BORDER_PX + touch}px]`)
    // The glyph is the line box's height, so its top is the line's top.
    expect(stepPx(ICON.control, 'h')).toBe(LINE_PX)
    expect(CALENDAR_FIELD.arrow).toContain('pointer-events-none')
    expect(forecastCalendarSource).not.toMatch(/id=\{fieldTextId\} className="[^"]*truncate/)
  })
})
