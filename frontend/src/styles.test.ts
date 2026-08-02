import { describe, expect, it } from 'vitest'
import {
  ACCENT,
  ACCENT_RING,
  BADGE_ACCENT,
  LAYER,
  BUTTON_ACCENT,
  BUTTON_DANGER,
  BUTTON_FLOATING,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHOICE_INPUT,
  CHOICE_ROW,
  DAY,
  FIELD,
  FIELD_NUMERIC,
  ICON_ADORNMENT,
  ICON_ACTION,
  ICON_BUTTON,
  NOTICE,
  SEGMENT,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SELECT,
  SPINNER,
  STATUS,
  RECESSED_EDGE,
  RECESSED_FILL,
  SURFACE_GROUP,
  LINK,
  LINK_ACTION,
  PROSE,
  RADIUS,
  SURFACE_CARD,
  SURFACE_FLOATING,
  TAP,
  TEXT,
} from './styles'
import * as STYLES from './styles'
// `?raw` gives us the file's text without executing it, so this stays a pure
// node test with no DOM, matching vitest.config.ts. (The same trick does not
// work on index.css: vitest stubs CSS imports to an empty string.)
import controlPanelSource from './components/ControlPanel.tsx?raw'
import appSource from './App.tsx?raw'

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
  it.each(Object.entries(sources))('%s invents no size of its own', (_path, source) => {
    expect(source).not.toMatch(/text-\[/)
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
})

// The panel is 320px wide at every breakpoint, so a width variant used for
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

  // A docked panel's name and the report inside it sat a few pixels apart in
  // the same role, so they read as one run of text. They separate by weight and
  // brightness at one size — not by the caps-and-tracking of `section`, which
  // was tried on these bars and shouted.
  it('separates a panel title from the subheadings it sits beside', () => {
    expect(TEXT.panelTitle).not.toBe(TEXT.subheading)
    expect(TEXT.panelTitle).toContain('font-bold')
    expect(TEXT.subheading).toContain('font-semibold')
    expect(TEXT.panelTitle).not.toContain('uppercase')
    expect(sizes(TEXT.panelTitle)).toEqual(sizes(TEXT.subheading))
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

  // The model picker opened behind the drawer that contains it, because the two
  // z values were chosen in different files and never compared. This asserts the
  // stack reads in the order the names claim, so the next layer has to say where
  // it belongs rather than pick a number.
  it('orders the stacking layers the way their names read', () => {
    const depth = (v: string) => Number(v.replace(/^z-\[?|\]$/g, ''))
    const stack = [LAYER.base, LAYER.overlay, LAYER.scrim, LAYER.drawer, LAYER.popover, LAYER.modal]
    const depths = stack.map(depth)
    expect(depths).toEqual([...depths].sort((a, b) => a - b))
    expect(new Set(depths).size).toBe(depths.length)
    // The two that caused the bug, stated outright rather than left to the sort.
    expect(depth(LAYER.popover)).toBeGreaterThan(depth(LAYER.drawer))
    expect(depth(LAYER.modal)).toBeGreaterThan(depth(LAYER.popover))
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

  // A numeric field is a field with the spinner arrows taken off, not a second
  // field, for the same reason the dropdown is built from FIELD.
  it('builds the numeric field out of the field rather than beside it', () => {
    expect(FIELD_NUMERIC).toContain(FIELD)
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

  // Sky at rest means "this acts here". Anything that leaves for someone
  // else's site rests in slate and only reaches for sky on hover, which is what
  // keeps the accent meaning one thing.
  it('reserves the resting accent for links that act in the app', () => {
    expect(LINK_ACTION).toContain('text-sky-400')
    expect(LINK).not.toMatch(/(^|\s)text-sky-/)
    expect(LINK).toContain('hover:text-sky-400')
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
})
