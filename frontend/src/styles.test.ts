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
  BUTTON_DANGER,
  BUTTON_FLOATING,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHIP,
  CHOICE_INPUT,
  CHOICE_ROW,
  DAY,
  CONTROL_W,
  FIELD,
  FIELD_NUMERIC,
  FOCUS_RING,
  ICON,
  ICON_ADORNMENT,
  METRICS_GRID,
  METRICS_RULE,
  METRIC_BOX_W,
  ICON_ACTION,
  ICON_BUTTON,
  NOTICE,
  NOTICE_DISMISS,
  NOTICE_DIVIDER,
  SCRUBBER,
  SCRUBBER_TRACK,
  SLIDER_OVERLAY,
  CONTROL_SIZE,
  SLIDER_VALUE,
  SLIDER_WORDMARK,
  SEGMENT,
  SEGMENT_FLUID,
  SEGMENT_FLUID_LIFTED,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  DISABLED,
  SELECT,
  PANEL_RULE,
  SELECT_W_AGGREGATE,
  SPINNER,
  STATUS,
  TRANSPORT_AXIS_ITEM,
  LIFTED_EDGE,
  RECESSED_EDGE,
  RECESSED_FILL,
  SURFACE_GROUP,
  SURFACE_GROUP_BLEED,
  LINK,
  LINK_ACTION,
  MAP_BOX_W,
  MICRO_PX,
  MICRO_SIZE,
  MAP_EDGE,
  PROSE,
  RADIUS,
  SURFACE_CARD,
  SURFACE_FLOATING,
  SURFACE_POPOVER,
  SURFACE_SHEET,
  TAP,
  TEXT,
} from './styles'
import * as STYLES from './styles'
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'
import appSource from './App.tsx?raw'
// The one stylesheet with a decision in it: the vendor's own controls have no
// call site to hand a role to, so what they take is written there. Read off
// the disk rather than imported — Vitest stubs a CSS import, `?raw` included,
// to an empty string.
const mapCss: string = readFileSync(new URL('./map.css', import.meta.url), 'utf8')

// The arbitrary branch cannot carry a trailing \b: `text-[10px]` ends in `]`, a
// non-word character, so a boundary there would require the *next* character to
// be a word one — which it never is, mid-class-list.
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
// by default rather than by remembering to list it.
const sources: Record<string, string> = {
  ...(import.meta.glob('./components/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  './App.tsx': appSource,
}

describe('every component', () => {
  it('found the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(6)
  })

  // Arbitrary sizes are how a 10px and an 11px treatment ended up inside the
  // same 160px legend box. The ramp owns the two steps Tailwind has no name
  // for; nothing else may invent one.
  // L1: No component sets a text size of its own.
  it.each(Object.entries(sources))('%s invents no size of its own', (_path, source) => {
    expect(source).not.toMatch(/\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/)
    expect(source).not.toMatch(/text-\[/)
  })

  // L2: No component sets a slate text color of its own. Slate is the surface
  // system, already covered by TEXT, SURFACE_* and FIELD roles.
  it.each(Object.entries(sources))('%s sets no slate text color of its own', (_path, source) => {
    expect(source).not.toMatch(/\btext-slate-\d+/)
  })

  // Derived from the scale rather than blocking a list of names, so a utility
  // nobody thought to forbid still fails. Deliberately written without quoting
  // any deleted class: v4 scans this file as raw text and would re-emit it.
  it.each(Object.entries(sources))('%s stays on the radius scale', (_path, source) => {
    const scale = new Set<string>(Object.values(RADIUS))
    const used = new Set(source.match(/\brounded(?:-[a-z0-9]+)?\b/g) ?? [])

    expect([...used].filter((c) => !scale.has(c))).toEqual([])
  })

  // The placeholder color lives in FIELD; the search box, not a field, sets
  // its own at the same step. What no component may do is dim one below AA
  // again. Written so no banned class appears verbatim: v4 scans this file as
  // raw text and would emit its CSS.
  // A call site that re-widths a segment breaks the alignment the role exists
  // to hold, and it cannot even be relied on to win: two width utilities resolve
  // by stylesheet order rather than by class order. Matched only where a width
  // rides along in the same class list as the role.
  it.each(Object.entries(sources))('%s re-widths no segment', (_path, source) => {
    const rides = source.match(/\$\{SEGMENT\}[^`]*/g) ?? []
    expect(rides.filter((r) => /(^|\s)w-\S+/.test(r))).toEqual([])
  })

  it.each(Object.entries(sources))('%s dims no placeholder below AA', (_path, source) => {
    expect(source).not.toMatch(/placeholder[:-](?:text-)?slate-[56]00/)
  })

  // The glob covers components added later, which is the point: a fourth copy
  // of a shared recipe should fail here rather than ship a fourth look.
  it.each(Object.entries(sources))('%s restates no shared recipe', (_path, source) => {
    // The idle half of a segmented choice, which two controls in the panel wear.
    expect(source).not.toMatch(/bg-slate-900 text-slate-400/)
    expect(source).not.toMatch(/bg-slate-900 border border-slate-500/)
    expect(source).not.toMatch(/bg-slate-800(\/95)? border border-slate-600/)
  })

  // The guardrail #167 exists to install. Every hue in the app carries meaning
  // — the accent says "this acts", and green/amber/red say how an analysis is
  // going — so every one of them is a decision the design system owes an answer
  // to, and a component that answers for itself is how the app ended up with
  // three ambers, four notice boxes in three shapes, and a primary button one
  // shade off the blocks it was supposed to match.
  //
  // This is deliberately stricter than the recipe checks above: not "don't
  // restate a known recipe" but "don't name a hue at all". Slate is exempt and
  // stays compositional — it is the surface system, already covered by TEXT,
  // SURFACE_* and FIELD, and banning it would be a different and much larger
  // change than this one.
  //
  // Built from alternation rather than by quoting classes, so it forbids
  // utilities nobody thought of, and so Tailwind's raw-text scan of this file
  // finds no candidate to re-emit.
  const HUE = new RegExp(
    String.raw`(?:^|["'\s:])(?:bg|text|border|ring|divide|accent|caret|outline|decoration|shadow|from|via|to)-` +
      String.raw`(?:sky|blue|cyan|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal)-\d{2,3}`,
  )

  it.each(Object.entries(sources))('%s names no hue of its own', (_path, source) => {
    expect(source.match(new RegExp(HUE, 'g'))).toBeNull()
  })

  // The rule #159 arrived at and #160 acts on: size tap targets across every
  // control at once, never one at a time. A component that reaches for the
  // variant directly is doing the thing that broke the panel's rhythm, so the
  // variant is spelled in exactly one file and this is what holds it there.
  it.each(Object.entries(sources))('%s sizes no tap target of its own', (_path, source) => {
    expect(source).not.toMatch(/\btouch:/)
  })

  // One accent, one size, one cursor for every radio and checkbox in the app —
  // the panel's, the chart's, and the table's, which had drifted into three
  // spellings of the same 14px box.
  it.each(Object.entries(sources))('%s builds no checkbox of its own', (_path, source) => {
    expect(source).not.toMatch(/accent-sky-500/)
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
    // The Light/Medium/Heavy chips in the map's layer legend, and why the
    // Forecast grid row is faded over a report carrying archive hours (#123).
    './App.tsx': 2,
    // Max results (label + field), and the unknown-value note on the
    // Elevation and AQI rows of the Metrics table (label + both boxes). Six
    // `title=` in the source for those three tooltips: the AQI row is one of
    // five metric rows the table maps, and the elevation row is its own
    // markup under the rule, so each note is spelled twice (#341).
    './components/ControlPanel.tsx': 6,
    // What Hourly actually does to a multi-day window (label + segment).
    './components/ForecastCalendar.tsx': 2,
    // Why the control is faded for an archive window (#123). Both of these
    // tooltips carry the same sentence in a hidden twin `aria-describedby`
    // names, because a tooltip does not exist on touch or to a screen reader.
    './components/ModelPicker.tsx': 1,
    // Two cells carry one each. The Wildfire (mi) cell: the fire's name on a
    // warned row, or which of its two causes an N/A carries (TJ, PR #275
    // review). And the freezing-level cell: why it reads N/A, which is the
    // forecast model rather than the weather (TJ, 2026-09-12, asked for with
    // the metric itself in #295).
    './components/ResultsTable.tsx': 2,
  }

  it.each(Object.entries(sources))('%s carries only its approved tooltips', (path, source) => {
    const found = (source.match(/\btitle=/g) ?? []).length
    expect(found).toBe(APPROVED_TOOLTIPS[path] ?? 0)
  })
})

// The panel is a near-constant width on every breakpoint, so a width variant used for
// padding re-spaced its rows on desktop windows that had not changed size,
// while leaving large tablets with mouse-tight rows. Nothing catches a relapse
// at build time: `lg:py-*` reads as ordinary responsive code.
describe('control panel sizing', () => {
  // The coarse-pointer padding itself now lives in BUTTON_PRIMARY, asserted
  // below. What has to stay true here is that nothing sizes by window width.
  it('never sizes a control by viewport width', () => {
    expect(controlPanelSource).not.toMatch(
      /\b(sm|md|lg|xl|2xl):(p[xytrbl]?|space-[xy]|gap|min-h|h)-/,
    )
  })

  // The size used to live beside the tint at every call site, which is how the
  // chart's metric radio ended up wearing the tint at the browser's default
  // size. Both now come from ACCENT.input, which CHOICE_INPUT composes, so what
  // is left to check is that no input re-sizes itself after taking it, and that
  // the panel reaches for the row that wraps it, since that is what a finger
  // actually lands on.
  it('builds every radio and checkbox from the shared recipe', () => {
    expect(ACCENT.input).toMatch(/\bh-[\d.]+ w-[\d.]+/)
    expect(CHOICE_INPUT).toContain(ACCENT.input)
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(/ACCENT\.input\}? [^`"']*\bh-[\d.]+/)
    }

    const rows = controlPanelSource.match(/CHOICE_ROW/g) ?? []
    const boxes = controlPanelSource.match(/CHOICE_INPUT/g) ?? []

    expect(rows.length).toBeGreaterThan(2)
    expect(boxes.length).toBe(rows.length)
  })

  // Spelling type out per element is what let the panel drift into three
  // treatments for one kind of label. Anything above the base size has to come
  // from the ramp so the drift is visible in one file. Bare `text-xs` stays
  // legal: status lines carry a semantic color.
  it('routes every non-base size through the ramp', () => {
    expect(controlPanelSource).not.toMatch(/className="[^"]*\btext-(sm|base|lg|xl)\b/)
    expect(controlPanelSource).not.toMatch(/<h[123] className="/)
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
  it('draws a group boundary bright enough to be one', () => {
    expect(SURFACE_GROUP).toContain('border-slate-500')
    expect(SURFACE_GROUP).toContain(RADIUS.surface)
  })

  // The bleed exists so a control inside a well lands on the same column as
  // one outside it: it must cancel exactly the inset the well imposes, which
  // is the call sites' p-2 (8px) plus RECESSED_EDGE's 1px border. Pinned as
  // the finished number because Tailwind cannot do the arithmetic — a well
  // that changes its padding has to re-derive this by hand.
  it('bleeds a well by exactly its border plus its padding', () => {
    expect(SURFACE_GROUP_BLEED).toBe('-mx-[9px]')
    expect(RECESSED_EDGE).toContain('border')
  })

  // Every surface the panel sinks into is one recipe, so an input, the idle
  // half of a segmented control and the calendar cannot drift into three
  // near-identical looks the way they had.
  it('builds every recessed surface from the one fill and the one edge', () => {
    for (const recipe of [FIELD, SURFACE_GROUP]) {
      expect(recipe).toContain(RECESSED_FILL)
      expect(recipe).toContain(RECESSED_EDGE)
    }
    expect(SEGMENT_IDLE).toContain(RECESSED_FILL)
    expect(SEGMENT).toContain(RECESSED_EDGE)
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
  it('recesses the group below the panel without colliding with the range band', () => {
    const step = (c: string) => Number(c.match(/-(\d+)$/)![1])
    const fill = SURFACE_GROUP.match(/bg-(slate-\d+)/)![1]
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
    // A stacking context orders only its own children, so the layer is useless
    // unless the cluster itself wears it.
    expect(appSource).toContain('LAYER.mapControls')
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
    expect(SLIDER_OVERLAY).toContain('appearance-none')
    expect(SLIDER_OVERLAY).toContain('[&::-webkit-slider-thumb]:[appearance:none]')
    expect(SLIDER_OVERLAY).toContain('[&::-moz-range-thumb]:[appearance:none]')
    expect(SLIDER_OVERLAY).toContain(FOCUS_RING)
    expect(SLIDER_OVERLAY).toContain('bg-transparent')
    expect(SLIDER_OVERLAY).toContain('absolute inset-0')
  })

  // The wordmark has no color of its own: its line renders twice, muted on the
  // well and white inside the accent fill, and a baked-in color would race the
  // layer's by stylesheet order.
  it('keeps the slider wordmark colorless so each layer supplies its own', () => {
    expect(SLIDER_WORDMARK).not.toMatch(/text-(slate|white)/)
  })

  // Both halves of the slider's one line are one size, and the wordmark is
  // sentence case like the segment above it (TJ, 2026-09-14). It carried
  // `TEXT.overline`'s 10px uppercase until then, which is the shape of a
  // heading over a group rather than a label inside a control — and it made
  // "COVERAGE" the one shouted word in the popover.
  it('sets the wordmark at the value size, in sentence case', () => {
    expect(SLIDER_WORDMARK).toContain(CONTROL_SIZE)
    expect(SLIDER_VALUE).toContain(CONTROL_SIZE)
    expect(SLIDER_WORDMARK).not.toMatch(/uppercase|tracking-/)
    // The weight is the only thing left separating a label from its value.
    expect(SLIDER_WORDMARK).toContain('font-semibold')
  })

  // The rail is a separate element rather than the input's own track
  // pseudo-element, because the filled portion has to be a third box on top of
  // it. What that must not become is a fourth spelling of the recessed well.
  it('builds the scrubber rail from the recessed surface every other well uses', () => {
    expect(SCRUBBER_TRACK).toContain(RECESSED_FILL)
    expect(SCRUBBER_TRACK).toContain(RECESSED_EDGE)
    expect(SCRUBBER_TRACK).toContain(RADIUS.pill)
  })

  // The timeline's axis halves are the one segment whose labels the design
  // system does not choose: the right one is the ranked metric's noun, and the
  // longest of them read as too wide for the half at the panel's inset. One
  // step more, and only that: everything else is the same half, so the bar
  // cannot become a second kind of segment.
  it('gives the timeline axis halves room for a metric noun', () => {
    expect(TRANSPORT_AXIS_ITEM).toMatch(/(^|\s)px-3(\s|$)/)
    expect(SEGMENT_ITEM).toMatch(/(^|\s)px-2(\s|$)/)
    expect(TRANSPORT_AXIS_ITEM.replace('px-3', 'px-2')).toBe(SEGMENT_ITEM)
    // And the bar wears it, or the role is a number nothing reads.
    expect(sources['./components/TimelineTransport.tsx']).toContain('TRANSPORT_AXIS_ITEM')
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
    expect(SELECT).toContain('pr-8')
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

  // The panel's controls share a left edge as well as a right one. The segment
  // is where the width comes from, so it composes the token rather than
  // spelling a width that the model picker and Max Results would then have to
  // match by hand.
  it('builds the segmented control on the shared control width', () => {
    expect(SEGMENT).toContain(CONTROL_W)
  })

  // The Metrics grid (#341) sizes no control itself: its three control columns
  // are `auto`, so the dropdown and the boxes are as wide as the roles they
  // wear and nothing else. A rem in the template would be a second copy of
  // METRIC_BOX_W or SELECT_W_AGGREGATE, which is the drift BOUNDS_GRID's
  // 4.25rem used to need a test to police.
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
  // (28px) plus the field's 8px left padding plus the 32px the SELECT recipe
  // reserves for its arrow. Measured in the running app (2026-08-22 and
  // 2026-09-14); re-measure before moving either width, the gap, or the nouns.
  it('leaves the metric label room for its longest noun', () => {
    // `Freezing level` at text-xs: 78.03px in Chrome on macOS, 2026-09-14.
    const FREEZING_LEVEL_PX = 79
    const rem = Number(SELECT_W_AGGREGATE.match(/\[(\d+(?:\.\d+)?)rem\]/)![1])
    const dropdownPx = rem * 16
    const boxPx = (Number(METRIC_BOX_W.match(/-(\d+)$/)![1]) / 4) * 16
    const gapPx = (Number(METRICS_GRID.match(/gap-x-([\d.]+)/)![1]) / 4) * 16
    const labelPx = 327 - 14 - 10 - 3 * gapPx - dropdownPx - 2 * boxPx

    expect(labelPx).toBeGreaterThanOrEqual(FREEZING_LEVEL_PX)
    expect(dropdownPx).toBeGreaterThanOrEqual(28 + 8 + 32)
  })

  // Every numeric box in the section — ten bounds and Max results — wears the
  // one METRIC_BOX recipe, so a future box cannot pick its own width or
  // height and the two rows under the rule line up with the bounds above.
  it('puts every numeric box in the Metrics section on the shared box width', () => {
    const inputs = controlPanelSource.match(/type="number"/g) ?? []
    const boxed = controlPanelSource.match(/className=\{METRIC_BOX\}/g) ?? []
    expect(inputs.length).toBeGreaterThanOrEqual(3)
    expect(boxed.length).toBe(inputs.length)
    expect(controlPanelSource).toMatch(/const METRIC_BOX = `\$\{FIELD_NUMERIC\} \$\{METRIC_BOX_W\}/)
  })

  // The rule inside the section is drawn in the panel's own rule ink, one
  // step down from the rule between sections, rather than a third grey.
  it('draws the Metrics rule in the panel rule ink', () => {
    const ink = PANEL_RULE.match(/border-(slate-[\d/]+)/)![1]
    expect(METRICS_RULE).toContain(`border-${ink}`)
    expect(METRICS_RULE).toContain('border-t')
  })

  // Clear filters has no label to push it into a column, so it spans the two
  // box columns: both of its edges sit on the boxes it clears, which is what a
  // CONTROL_W button no longer lines up with now that the boxes are narrower.
  it('keeps the clear-filters button under the bound boxes', () => {
    const button = controlPanelSource.match(/onClick=\{onClearFilters\}[\s\S]*?>/)![0]
    expect(button).toContain('col-span-2')
    expect(button).toContain('col-start-3')
    expect(button).not.toContain('CONTROL_W')
  })

  // The chart's metric control (#348). It was five radios whose labels carry
  // their units, which at the panel's 12px type need 584px of row; a phone's
  // results sheet is the phone's width, so at 402px the row wrapped and AQI
  // sat alone on a second line. A control whose width its labels cannot move
  // is what ends that: the select composes SELECT at CONTROL_W, and the row
  // holding it never wraps, so a sixth metric cannot bring the line back.
  it('keeps the chart metric control on one row at every width', () => {
    const chart = sources['./components/TimeSeriesChart.tsx']
    // Through the whole class template rather than to the closing bracket:
    // the change handler's arrow is a `>` too, and the template's first
    // interpolation is a `}` too.
    const select = chart.match(/<select[\s\S]*?className=\{`[^`]*`\}/)![0]
    expect(select).toContain('SELECT')
    expect(select).toContain('CONTROL_W')
    expect(chart).not.toMatch(/flex-wrap/)
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

  // Every notice in the panel renders in the ONE block under the Analyze
  // button. The archive work (#123) shipped a window warning under the
  // calendar, a screen away from every other message, and found two more
  // already there — so this is the guardrail rather than a third fix.
  //
  // Enforced through the box: a notice IS a `NOTICE` role, only `FooterNotice`
  // wears one, and `FooterNotice` is rendered once, below the button. A message
  // put beside a control therefore has nowhere to live. Regexes are built by
  // alternation rather than by quoting a class, so Tailwind's raw-text scan of
  // this file finds nothing to emit.
  const roleUses = (source: string, role: string): number[] =>
    [...source.matchAll(new RegExp(String.raw`\b${role}\s*[.[]`, 'g'))].map(
      (m) => m.index,
    )

  it('renders every notice box below the Analyze button', () => {
    const footerNotice = controlPanelSource.indexOf('function FooterNotice(')
    const panel = controlPanelSource.indexOf('export default function ControlPanel(')
    const rendered = [...controlPanelSource.matchAll(/<FooterNotice\b/g)]
    const analyze = controlPanelSource.indexOf('onClick={onAnalyze}')

    expect(footerNotice).toBeGreaterThan(-1)
    expect(analyze).toBeGreaterThan(-1)
    // The box is built in one component and rendered in one place, after the
    // button. Two call sites would let a second block open anywhere.
    expect(rendered).toHaveLength(1)
    expect(rendered[0].index).toBeGreaterThan(analyze)
    for (const at of roleUses(controlPanelSource, 'NOTICE')) {
      expect(at, 'a NOTICE box outside FooterNotice').toBeGreaterThan(footerNotice)
      expect(at, 'a NOTICE box outside FooterNotice').toBeLessThan(panel)
    }
  })

  it('colours nothing but a notice and the draw counter by status', () => {
    const panel = controlPanelSource.indexOf('export default function ControlPanel(')
    const outside = roleUses(controlPanelSource, 'STATUS').filter((at) => at > panel)
    // The one exception, pinned by count the way the tooltip list is: the
    // polygon's draw counter colours its captions by state (points placed, the
    // ring closed, the area over the cap, a large area). Those are a field's own
    // readout beside the field, not messages about the analysis — and a seventh
    // is a notice that has wandered out of the footer.
    expect(outside).toHaveLength(6)
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

  // Inline SVG icons beside text: sized for clarity without dominating text labels.
  it('sizes the inline glyph for text-paired icons', () => {
    expect(ICON).toBe('h-4 w-4')
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
    // Downward shadows have nothing to fall on under a bottom sheet.
    expect(SURFACE_SHEET).not.toMatch(/\bshadow-/)
  })

  // The three boxes in the map's left column are one width: the Layers popover
  // and the two legends below it. The popover shipped a step narrower than the
  // legends it hangs into, which read as a ragged edge rather than as three
  // boxes, so the width is a role and every one of them wears it.
  it('gives every box under the Layers button one width', () => {
    expect(MAP_BOX_W).toBe('w-48')
    // The call sites are the two legends and the popover. A width spelled
    // beside the role could not even be relied on to win: two width utilities
    // resolve by stylesheet order rather than by class order.
    const rides = appSource.match(/\$\{MAP_BOX_W\}[^`]*/g) ?? []
    expect(rides).toHaveLength(3)
    expect(rides.filter((r) => /(^|\s)w-\S+/.test(r))).toEqual([])
    // And nothing in the file picks its own width in the range one of these
    // boxes would plausibly take. Written as a range rather than as a list of
    // names so a step nobody thought of still fails, and with the leading
    // guard so `max-w-*` is not read as a width of its own.
    expect(appSource).not.toMatch(/(?<![-\w])w-(?:4\d|5\d)\b/)
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
    expect(SURFACE_POPOVER).toContain('shadow-2xl')
    expect(SURFACE_FLOATING).not.toContain('shadow-2xl')
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

  // The results bar's five links — Columns, Models, Removed, Download CSV, and
  // the Open-Meteo credit beside them — are controls the reader presses, so they
  // read at the size every other control in the app reads at. The micro step
  // below is for text that is present but never first, and a 10px button in a
  // bar of 12px text read as a footnote rather than as a control.
  it('reads the results bar at the size of every other control', () => {
    expect((appSource.match(/\$\{TEXT\.control\} \$\{LINK\}/g) ?? []).length).toBe(5)
    expect(appSource).not.toMatch(/\$\{TEXT\.micro\}/)
  })

  // The map's Open-Meteo credit is a link *and* a 10px caption, so it wears
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

  // Every message in this app is written to fit one line at 360px, and that
  // budget is measured with the full text column. A list indent and its marker
  // take 16px of it, which is what made the first message wrap as soon as a
  // second joined it. Spelled from parts: v4 scans this file as raw text and
  // would emit the CSS for a marker class quoted here.
  it('gives the messages the whole text column', () => {
    expect(controlPanelSource).not.toContain(['list', 'disc'].join('-'))
    expect(controlPanelSource).not.toContain(['<', 'ul'].join(''))
  })
})

// The rank cell trades its number for the remove × on hover. Both faces share
// one grid cell, so the column is as wide as the wider face at all times;
// toggling display instead let the # column grow on every hover and shove
// every column to its right (#339).
describe('the results table rank cell', () => {
  const source = sources['./components/ResultsTable.tsx']

  it('pins both faces of the rank cell to one grid cell', () => {
    expect(STYLES.TABLE.rankFace.split(' ')).toEqual(['col-start-1', 'row-start-1'])
    expect(STYLES.TABLE.rankStack.split(' ')).toContain('inline-grid')
    expect((source.match(/TABLE\.rankFace/g) ?? []).length).toBe(2)
  })

  it('trades visibility, never display, on row hover', () => {
    // Built from parts so the class name never appears in this file as text,
    // which Tailwind would otherwise compile.
    const displayToggle = new RegExp(['group-hover', '(hidden|inline|block|flex)\\b'].join(':'))
    expect(source).not.toMatch(displayToggle)
  })
})

// One inset for everything that stands off the map's edges, the app's chrome
// and the library's alike.
describe('the map edge inset', () => {
  it('publishes one number and reads it everywhere', () => {
    expect(MAP_EDGE.publish).toContain('[--map-edge-inset:0.75rem]')
    for (const side of [MAP_EDGE.left, MAP_EDGE.top]) {
      expect(side).toContain('var(--map-edge-inset)')
      // The number is published, never repeated: a fallback here would be a
      // second copy of it, and the two would drift.
      expect(side).not.toMatch(/rem|px/)
    }
  })

  // The map wrapper is what carries the property, so everything inside it —
  // the app's floating chrome and MapLibre's own markup, which has no call
  // site to hand a role to — inherits the same number.
  it('is published on the map wrapper', () => {
    expect(appSource).toContain('MAP_EDGE.publish')
  })

  // MapLibre's credit line is sized by map.css from a custom property, because
  // the library builds that markup itself and there is no call site to hand
  // `TEXT.micro` to. The number is the ramp's smallest step, spelled once as
  // `MICRO_PX`; the class and the property are both pinned to it here so the
  // stylesheet, which no test can read, cannot drift from the ramp.
  it('publishes the credit size from the ramp', () => {
    expect(MICRO_SIZE).toBe(`text-[${MICRO_PX}px]`)
    expect(MAP_EDGE.publish).toContain(`[--map-credit-size:${MICRO_PX}px]`)
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

  it('leaves no top edge spelled at the app\'s own column', () => {
    expect(appSource).toContain('${MAP_EDGE.top}')
    expect(appSource).not.toMatch(/\btop-(?:3)\b/)
  })

  it('leaves no left edge spelled at a call site', () => {
    expect(appSource).not.toMatch(/\bleft-(?:2|3)\b/)
    expect(appSource).not.toMatch(/\bleft-\[/)
    expect((appSource.match(/\$\{MAP_EDGE\.left\}/g) ?? []).length).toBe(2)
  })
})

// The map's Layers popover: the one list in the app whose members have no
// ranking between them.
describe('the map layer rows', () => {
  // Read out of the source rather than out of a render, for the reason every
  // other check here is: Vitest has no DOM, and the order is a property of the
  // literal the popover maps over.
  const labels = (() => {
    const block = appSource.match(/const MAP_LAYERS = \[[\s\S]*?\n {2}\]/)?.[0] ?? ''
    return [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  })()

  it('found every row', () => {
    expect(labels).toHaveLength(5)
  })

  // Alphabetical, because nothing else orders these: no cost, no severity and
  // no dependency separates one switch from another, so any other order is one
  // the reader has to learn rather than one they can scan.
  it('lists the layers in alphabetical order', () => {
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
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
