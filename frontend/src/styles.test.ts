import { describe, expect, it } from 'vitest'
import {
  ACCENT,
  BUTTON_DANGER,
  BUTTON_FLOATING,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  DAY,
  FIELD,
  ICON_ACTION,
  NOTICE,
  SEGMENT_IDLE,
  SPINNER,
  STATUS,
  SURFACE_GROUP,
  LINK,
  LINK_ACTION,
  PROSE,
  RADIUS,
  SURFACE_CARD,
  SURFACE_FLOATING,
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
  it.each(Object.entries(sources))('%s dims no placeholder below AA', (_path, source) => {
    expect(source).not.toMatch(/placeholder[:-](?:text-)?slate-[56]00/)
  })

  // The glob covers components added later, which is the point: a fourth copy
  // of a shared recipe should fail here rather than ship a fourth look.
  it.each(Object.entries(sources))('%s restates no shared recipe', (_path, source) => {
    // The idle half of a segmented choice, which two controls in the panel wear.
    expect(source).not.toMatch(/bg-slate-900 text-slate-400/)
    expect(source).not.toMatch(/bg-slate-900 border border-slate-600/)
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
  // size. Both now come from ACCENT.input, so the only thing left to assert is
  // that no input re-sizes itself after taking it.
  it('gives every radio and checkbox the same size', () => {
    expect(ACCENT.input).toMatch(/\bh-[\d.]+ w-[\d.]+/)
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(/ACCENT\.input\}? [^`"']*\bh-[\d.]+/)
    }
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

  // Two segmented controls in one panel: the ranking direction, and the
  // calendar's hours. ACCENT.fill is the chosen half, this is the other one, and
  // naming the pair is what stops the second one being a lookalike that drifts.
  it('pairs the idle segment with the accent fill', () => {
    expect(SEGMENT_IDLE).toContain('text-slate-400')
    expect(SEGMENT_IDLE).not.toBe(ACCENT.fill)
  })
})

describe('shared recipes', () => {
  it('grows the primary action for coarse pointers wherever it appears', () => {
    expect(BUTTON_PRIMARY).toContain('touch:')
    expect(FIELD).toContain(TEXT.control)
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
    // Tap-target sizing is #160's job, deliberately across all controls at
    // once rather than one at a time.
    expect(BUTTON_SECONDARY).not.toContain('touch:')
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
