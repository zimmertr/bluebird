import { describe, expect, it } from 'vitest'
import {
  ACCENT_FILL,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHOICE_INPUT,
  CHOICE_ROW,
  DAY,
  FIELD,
  ICON_BUTTON,
  SEGMENT,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
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
  it.each(Object.entries(sources))('%s dims no placeholder below AA', (_path, source) => {
    expect(source).not.toMatch(/placeholder[:-](?:text-)?slate-[56]00/)
  })

  // The glob covers components added later, which is the point: a fourth copy
  // of a shared recipe should fail here rather than ship a fourth look.
  it.each(Object.entries(sources))('%s restates no shared recipe', (_path, source) => {
    expect(source).not.toMatch(/bg-sky-600 hover:bg-sky-500/)
    // The solid accent block: the chosen direction segment, the selected day, the
    // welcome dialog's numbered steps. Three spellings of one treatment before.
    expect(source).not.toMatch(/bg-sky-600 text-white/)
    // The idle half of a segmented choice, which two controls in the panel wear.
    expect(source).not.toMatch(/bg-slate-900 text-slate-400/)
    expect(source).not.toMatch(/bg-slate-900 border border-slate-600/)
    expect(source).not.toMatch(/bg-slate-800(\/95)? border border-slate-600/)
    expect(source).not.toMatch(/hover:text-sky-400 underline/)
    expect(source).not.toMatch(/text-sky-400 hover:text-sky-300/)
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

  // Was three spellings of one box in this file alone. It is one recipe now,
  // so what is left to check is that the panel reaches for it — and reaches
  // for the row that wraps it, since that is what a finger actually lands on.
  it('builds every radio and checkbox from the shared recipe', () => {
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
    expect(DAY.selected).toBe(ACCENT_FILL)
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

  // Two segmented controls in one panel: the ranking direction, and the
  // calendar's hours. ACCENT_FILL is the chosen half, this is the other one, and
  // naming the pair is what stops the second one being a lookalike that drifts.
  it('pairs the idle segment with the accent fill', () => {
    expect(SEGMENT_IDLE).toContain('text-slate-400')
    expect(SEGMENT_IDLE).not.toBe(ACCENT_FILL)
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
    ['BUTTON_DANGER', BUTTON_DANGER],
    ['CHOICE_ROW', CHOICE_ROW],
    ['SEGMENT_ITEM', SEGMENT_ITEM],
    ['FIELD', FIELD],
    ['DAY.cell', DAY.cell],
  ])('%s is a tap target on a coarse pointer', (_name, recipe) => {
    expect(recipe).toContain('touch:')
  })

  // The segmented control had been built twice from scratch and matched only by
  // luck. Its colors were already roles; its box was not, which is why the two
  // copies could have carried different padding and nothing would have noticed.
  it('builds a segmented control from one box and one pair of colors', () => {
    expect(SEGMENT).toContain(RADIUS.control)
    expect(SEGMENT_ITEM).not.toMatch(/(^|\s)(bg|text)-(sky|slate)-/)
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
