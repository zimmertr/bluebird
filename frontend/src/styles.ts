/**
 * One type ramp, at two densities.
 *
 * Bluebird has two kinds of surface. The working chrome — control panel,
 * results table, map legends, chart — is dense: you scan it while doing
 * something else. The reading surfaces — the welcome and privacy dialogs, and
 * the analysis overlay card — are wide, and you read them once, carefully.
 *
 * They are not two scales. The dialog title is the panel header's title one
 * size up, and the dialog subtitle is the caption step one size up — the same
 * recipe the tagline under the app title wears; even the copy rhymes
 * ("Weather Window Finder" / "The Weather Window Finder").
 * And the reading tier's small step lands exactly on the compact tier's base,
 * so the two share the 12px rung rather than running past each other. Naming
 * them as one ramp keeps a dialog from drifting into a second look.
 *
 * Within a tier, roles separate by weight and color, not only by size: two
 * sizes cover the whole compact tier because `subheading` and `control` share
 * both a size and a color and let weight alone distinguish "Elevation range
 * (ft)" from "Peaks". Roles that stand in that relationship are composed from
 * a shared constant below rather than spelled out twice, so the relationship
 * is something a test can assert instead of a comment that rots.
 *
 * Status text is not in the ramp. Warnings, errors and progress lines use the
 * base size with a semantic color (amber, red, sky, green) because there the
 * color carries the meaning, not the hierarchy.
 */

/**
 * The 10px step, for chrome that must not compete with what it labels.
 *
 * This step lands on three background lightnesses — the slate-900/85 map
 * legends, the slate-800/95 chart tooltip, and the slate-700 table header bar
 * — and two of its sites are attributions a license requires people to be
 * able to read. slate-300 is the dimmest step clearing 4.5:1 on all three
 * (7.0 / 9.9 / 12.0); slate-400, where these sites had drifted, manages only
 * 4.0:1 on the header bar.
 *
 * The color has to live here rather than at the call site. Tailwind resolves
 * two competing color utilities by their order in the generated stylesheet,
 * not by their order in the class list, so a site cannot reliably brighten a
 * role it was handed — which is also why LINK below shares this exact color.
 */
const MICRO = 'text-[10px] text-slate-300'

/**
 * The base size, stepped back: secondary text that is read, not scanned.
 *
 * This step lands on the slate-800 panel, cards and dialogs. slate-400 is the
 * dimmest step clearing 4.5:1 there (5.7, and 7.0 on slate-900 fields);
 * slate-500, where this tier sat through #159, managed 3.1:1 — receding on
 * purpose, but past what AA permits for text. Brightening it made the tagline
 * under the app title the same recipe, so what had been two roles is one, and
 * as with MICRO above, a call site cannot dim it back. (#165)
 */
const CAPTION = 'text-xs text-slate-400'

/** The compact tier: panel, table, map chrome, chart. */
export const TEXT = {
  /** Numbered section headings: "1. Destinations", "3. Result Ranking". */
  section: 'text-sm font-bold uppercase tracking-wider text-slate-400',
  /** The single call to action, deliberately a step up from the panel body. */
  cta: 'text-sm font-semibold',
  /** Panel identity in the header. Outside the body ramp on purpose. */
  appTitle: 'text-lg font-bold text-white leading-tight',
  /** Named sub-blocks, the labels naming a field, and docked panel titles. */
  subheading: 'text-xs font-semibold text-slate-200',
  /** Anything you read or type in a control: radio labels, inputs, pickers. */
  control: 'text-xs text-slate-200',
  /** Secondary text: the app tagline, a place's description, a dialog's note. */
  caption: CAPTION,
  /** Prose that explains a control without being one. */
  helper: `${CAPTION} italic`,
  /** Tiny all-caps labels: the legend's metric, a search result's kind. */
  overline: `${MICRO} font-semibold uppercase tracking-wider`,
  /** Attribution, timestamps, overflow counts — present but never first. */
  micro: MICRO,
} as const

/**
 * The reading tier: the two dialogs and the analysis overlay card.
 *
 * A step up from the compact tier, for surfaces wide enough to hold a
 * paragraph. `note` is deliberately the compact tier's `caption` — the rung
 * where the two densities meet.
 */
export const PROSE = {
  /** The dialog's name. */
  title: 'text-xl font-bold text-white leading-tight',
  /** The line under it saying what the dialog is for. */
  subtitle: 'text-sm text-slate-400',
  /** A heading inside the body copy. */
  heading: 'text-sm font-semibold text-white',
  /** Body copy. */
  body: 'text-sm text-slate-300',
  /**
   * Inline emphasis — the lead-in naming what a sentence is about. The one
   * role that sets no size: it modifies whatever it sits inside.
   */
  strong: 'font-semibold text-white',
  note: CAPTION,
} as const

/**
 * Links, split by whether they are part of the content or part of the chrome.
 *
 * The app had five spellings of "underlined link", differing in resting color,
 * hover color, and whether the underline got its own tint. `LINK` settles the
 * ambient ones — data credits, provider lists, the privacy dialog — on the
 * majority hover (sky-400) and on MICRO's rest color.
 *
 * Sharing that color is not a coincidence, it is the only safe way to compose
 * the two: the map's Open-Meteo credit is a link *and* a 10px caption, and had
 * they disagreed the class list would not have decided which won. It is also
 * the dimmest step that keeps every link in the app readable — several of
 * these sat at 3.1:1 by inheriting the prose around them.
 *
 * `LINK_ACTION` is for a link inside the content itself, where following it is
 * the point rather than a footnote: today, the results table's destination
 * names. Keeping that the only thing wearing sky at rest is what lets sky mean
 * one thing across the app.
 *
 * Neither sets a size, because a link takes the size of the sentence holding
 * it. That means they belong inside text a role has already sized — put one on
 * a bare element and it inherits the browser's 16px, which is how the Options
 * section briefly got a Clear button twice the size of everything near it.
 */
export const LINK = 'text-slate-300 hover:text-sky-400 underline'
export const LINK_ACTION = 'text-sky-400 hover:text-sky-300 hover:underline'

/**
 * Three radii, down from six spellings.
 *
 * Two of those six were never a radius of their own. Tailwind v4 renamed this
 * scale, so its small step and the bare utility both resolve to 0.25rem: the
 * two legend chips that asked for the small step have been drawing the control
 * radius the whole time. The other two, on the dialog cards and their icons,
 * were used twice each and said nothing the surface radius does not.
 *
 * Naming class names in a comment here is a trap worth knowing about: v4 scans
 * this file as raw text, so quoting a utility we deleted puts its CSS straight
 * back into the bundle.
 */
export const RADIUS = {
  /** Form controls, small buttons, inline chips and swatches. */
  control: 'rounded',
  /** Anything floating above the page: cards, dropdowns, tooltips, CTAs. */
  surface: 'rounded-lg',
  /** Pills, dots, spinners, progress bars. */
  pill: 'rounded-full',
} as const

/**
 * Boxes that float over the map: the search field and its dropdown, the
 * Controls button, the legends, the chart tooltip.
 *
 * Five of those were already byte-identical. The two legends were not — they
 * ran a darker fill and a darker border, so the map carried two different
 * ideas of "floating box" within a few hundred pixels of each other.
 */
export const SURFACE_FLOATING =
  `bg-slate-800/95 border border-slate-600 ${RADIUS.surface} shadow-lg backdrop-blur-sm`

/** Opaque cards that sit above a scrim: the dialogs and the analysis overlay. */
export const SURFACE_CARD =
  `bg-slate-800 border border-slate-600 ${RADIUS.surface} shadow-xl`

/**
 * The accent, named by the jobs it does, because it does six.
 *
 * Every one of these was spelled at a call site before, in fourteen places
 * across five files, which is how the fill and the button that wears it came to
 * disagree about their own contrast. The rule this section exists to make
 * enforceable is in `styles.test.ts`: **no component names a hue.** A component
 * says which job it is doing and the answer lives here.
 *
 * ## Why the fill is dark-on-bright rather than white-on-blue (#167)
 *
 * The accent fill has two contrast obligations at once, and they pull opposite
 * ways. Its label is text, so WCAG 1.4.3 wants 4.5:1 against the fill. The fill
 * is also what says "this block is a control, and it is the selected one", so
 * 1.4.11 wants 3:1 against the surface behind it — the same 3:1 `SURFACE_GROUP`
 * below holds itself to.
 *
 * White labels cannot satisfy both. White at 4.5:1 needs a fill no lighter than
 * 0.183 relative luminance; a 3:1 edge on the slate-800 panel needs one no
 * darker than 0.165. sky-600 sits at 0.211 (white reads 4.02:1, which is the
 * bug) and sky-700 at 0.130 (white reads 5.85:1, but the fill drops to 2.50:1
 * on the panel and 2.37:1 on `DAY.range` — the two ends of a selected range
 * would sink into the band between them, which is the one thing that control
 * has to show). No Tailwind sky step lands in the window, and a custom shade
 * that did would sit on both floors with no headroom.
 *
 * Inverting the polarity clears both with room to spare: slate-950 on sky-500
 * is 7.4:1, and sky-500 is 5.4:1 on the panel and 5.1:1 on the range band. It
 * also lets the hover keep *lightening* (sky-400: 9.2:1 text, 6.5:1 edge),
 * which is the direction every other hover in the app moves. Darkening the fill
 * instead would have had to invert that language app-wide.
 */
export const ACCENT = {
  /**
   * A solid block filled with the accent, carrying a label: the chosen segment
   * of the ranking toggle and the calendar's Hours toggle, the ends of a day
   * selection, the Now button when it is the live arm, the numbered steps in
   * the welcome dialog, and `BUTTON_PRIMARY` below.
   *
   * The label color is not separable from the fill and must never be restated
   * at a call site — that is the whole failure this role was rewritten to end.
   */
  fill: 'bg-sky-500 text-slate-950',
  /** The hover step for a fill that is a button. Only `BUTTON_PRIMARY` has one. */
  fillHover: 'hover:bg-sky-400',
  /** The accent as a bare graphic with nothing on it: the progress bar's fill. */
  mark: 'bg-sky-500',
  /**
   * Native checkbox and radio tint, at the one size every one of them wears.
   * Six inputs across three files had the tint, and five of the six the size;
   * the chart's metric radio had drifted to the browser default.
   */
  input: 'accent-sky-500 h-3.5 w-3.5',
  /** Resting accent text that is not a link: the table's detail-sort arrow. */
  text: 'text-sky-400',
  /** An icon or control reaching for the accent on hover. */
  hoverText: 'hover:text-sky-400',
  /** The accent on a boundary rather than a fill, in the two states that use it. */
  edgeHover: 'hover:border-sky-400',
  edgeFocus: 'focus-within:border-sky-400',
} as const

/**
 * The full-width primary action: Analyze, and the modals' dismiss buttons.
 *
 * It had been written out three times and had drifted into two radii, with the
 * coarse-pointer padding on only one of the three. Call sites append their own
 * disabled/layout classes; nothing here is a size or color they should restate.
 *
 * It composes `ACCENT.fill` rather than restating a fill of its own. Spelling it
 * out separately is exactly how the button and the blocks it is supposed to
 * match ended up one shade apart, and how #167's contrast bug outlived the
 * sweep that was meant to catch it.
 */
export const BUTTON_PRIMARY =
  `${TEXT.cta} w-full py-2.5 touch:py-3 ${RADIUS.surface} transition-colors ` +
  `${ACCENT.fill} ${ACCENT.fillHover}`

/**
 * The secondary action standing next to something else: Clear under the
 * polygon status, Cancel on the analysis overlay.
 *
 * The two were already the same size at the same padding on the same
 * slate-800 background, and differed only in whether they wore a fill or a
 * border — so a phone user met a filled button in the panel and an outlined
 * one on the overlay for the same kind of action. Buttons in this app are
 * fills and fields are bordered, so the fill stays and the border goes.
 *
 * Deliberately no coarse-pointer padding: sizing tap targets is #160's job,
 * and doing it one control at a time is what broke the panel's rhythm before.
 */
export const BUTTON_SECONDARY =
  `${TEXT.control} px-3 py-1.5 ${RADIUS.control} transition-colors ` +
  'bg-slate-700 hover:bg-slate-600'

/**
 * The destructive retry inside an error notice: "Try again".
 *
 * The one button in the app that is neither the primary action nor a neutral
 * secondary, and it had its whole recipe — fill, hover, border, weight, radius,
 * padding, disabled treatment — inline at the call site. red-200 on the tinted
 * fill reads 8.8:1, and it stays red-200 rather than white so the button reads
 * as part of the notice holding it rather than as a second primary action.
 *
 * Sets the size bare rather than composing `TEXT.control`, which is the one
 * place in this file that would be wrong: that role carries slate-200, and a
 * second color utility here would race the red one by stylesheet order.
 */
export const BUTTON_DANGER =
  `text-xs w-full py-1.5 ${RADIUS.control} font-medium transition-colors ` +
  'text-red-200 bg-red-900/60 hover:bg-red-800 border border-red-700'

/**
 * A button floating over the map rather than sitting in a panel: today, the
 * one that reopens the collapsed controls.
 *
 * It is `SURFACE_FLOATING` that has become pressable, so it takes the surface
 * whole and adds only what pressability needs — the accent on hover, and a
 * pressed state. Layout (the icon row, its gap and padding) stays at the call
 * site, the way `FIELD` leaves padding to the control that wears it.
 */
export const BUTTON_FLOATING =
  `${SURFACE_FLOATING} ${TEXT.cta} text-white transition-colors ` +
  `${ACCENT.edgeHover} ${ACCENT.hoverText} active:bg-slate-700`

/**
 * The preview-deployment banner, the one surface that is deliberately loud.
 *
 * It lived as a local constant inside its own component, which is the same
 * bespoke-recipe problem as the accent had, just with only one call site to
 * drift from. White on red-600 reads 4.76:1, so it clears AA as it stands.
 */
export const BANNER_PREVIEW =
  'flex-shrink-0 bg-red-600 text-white text-center text-xs sm:text-sm ' +
  'font-semibold py-1.5 px-4 z-30 shadow-md'

/**
 * An icon that acts on hover: the table's external-destination links.
 *
 * slate-500 is 3.1:1 on the panel, which is the floor for an icon rather than
 * the 4.5:1 asked of text — these carry no label and are recognized by shape.
 */
export const ICON_ACTION = `text-slate-500 ${ACCENT.hoverText}`

/** A bare icon button in a header: the chart and table collapse chevrons. */
export const ICON_BUTTON = 'px-1 text-slate-400 hover:text-white'

/**
 * The indeterminate spinner: the search box while a lookup is in flight.
 *
 * Size stays at the call site; everything that makes it a spinner does not.
 */
export const SPINNER =
  `animate-spin ${RADIUS.pill} border-2 border-slate-500 border-t-sky-400`

/**
 * The idle half of a segmented choice: the ranking direction toggle's unchosen
 * side, and the calendar's Hours toggle.
 *
 * `ACCENT.fill` above is the chosen half. Naming the pair is what makes the
 * second segmented control in the panel the *same* control rather than a
 * lookalike that drifted — the hazard #159-#165 spent five PRs on.
 */
export const SEGMENT_IDLE = 'bg-slate-900 text-slate-400 hover:text-slate-200'

/**
 * Status color, for the lines the type ramp deliberately does not cover.
 *
 * The ramp separates roles by size and weight; these separate by meaning, which
 * is why the header above puts them outside it. What the ramp's absence did
 * *not* license is nine call sites picking their own step: "warning" was
 * amber-300, amber-400 and amber-300/90 in one file, and the two the panel
 * shows next to each other were two different ambers.
 *
 * Every step here clears 4.5:1 on the slate-800 panel (8.3 to 10.5) and on the
 * tinted `NOTICE` fills below, so a status line is legible wherever it lands.
 *
 * These set a color and no size, and `NOTICE` sets a size and no color, so the
 * two compose without the collision the file keeps warning about: two color
 * utilities in one class list resolve by stylesheet order, not by intent.
 */
export const STATUS = {
  /** The polygon is closed, the thing you were building is ready. */
  ok: 'text-green-400',
  /** Survivable: the analysis can still run, but something is worth knowing. */
  warn: 'text-amber-300',
  /** Blocking: it did not work, or it will not run as asked. */
  error: 'text-red-400',
  /** Neither good nor bad, just a fact about the data you are about to get. */
  info: 'text-sky-300',
} as const

/**
 * The box a status line sits in when it is a block rather than a sentence: the
 * forecast-window warning, the AQI-coverage note, the refusal remedies, and the
 * error retry.
 *
 * Four boxes, and before this they were four recipes. Three had settled on a
 * `-950/40` fill with a `-800/60` border and the fourth — the error, the one
 * that matters most — ran a `/50` fill behind a fully opaque border, so the app
 * shouted in a slightly different shape than it warned in. These are that
 * majority spelling, and the error box joins it.
 *
 * The borders are ~1.5:1 on the panel and deliberately stay there. Unlike
 * `SURFACE_GROUP`, which needs 3:1 because its border is the *only* thing
 * grouping what it holds, here the tinted fill and the colored text already
 * carry the meaning; the border is trim on a box that is not hard to find.
 *
 * Carries the size but no text color, so it composes with `STATUS` above. A box
 * whose children color themselves individually wears this alone.
 */
export const NOTICE = {
  warn: `text-xs bg-amber-950/40 border border-amber-800/60 ${RADIUS.control} p-2`,
  error: `text-xs bg-red-950/40 border border-red-800/60 ${RADIUS.control} p-2`,
  info: `text-xs bg-sky-950/40 border border-sky-800/60 ${RADIUS.control} p-2`,
} as const

/**
 * A bordered region grouping controls inside the panel: today, the calendar.
 *
 * Border only, no fill of its own, and the border is deliberately brighter than
 * anything else in the panel. slate-500 is 3.4:1 on the slate-800 panel, which
 * clears the 3:1 asked of a meaningful UI boundary; the panel's own section
 * dividers are slate-700 at 1.4:1, and something that quiet cannot make a block
 * of controls read as one object — which is the whole job here.
 *
 * A darker inset fill would separate it further and is the obvious next lever,
 * but it is not free: `DAY.range` below is sky-950, legible on slate-800 and
 * nearly invisible on slate-900, so a fill change means brightening the range
 * band in the same breath. One change at a time.
 */
export const SURFACE_GROUP = `border border-slate-500 ${RADIUS.surface}`

/**
 * The calendar's day cells.
 *
 * The first three are one ramp, and the thing they encode is **how much of that
 * day the app can actually tell you** — the only question about a cell that
 * changes what clicking it gets you, which is why it wins the brightness
 * channel over "is this in the past" and "is this in the month on screen":
 *
 * - `full` (slate-200, 11:1 on the panel) — weather and air quality.
 * - `partial` (slate-400, 5.7:1) — weather only, past the ~5-day air-quality
 *   horizon. Still holds the 4.5:1 floor because the day is clickable content;
 *   dimming it to slate-500's 3.1:1 would put a live date below AA, which is
 *   what #165 spent five PRs undoing.
 * - `unservable` (slate-600, ~2.6:1) — outside what the weather service serves.
 *   The one step here deliberately below AA: WCAG 1.4.3 exempts inactive
 *   controls, and a disabled day that read as text would invite the click it
 *   cannot accept.
 *
 * Selection is a fill, so it composes with the ramp instead of competing:
 *
 * - `range` fills the days between the two ends. sky-950 is dark enough that a
 *   cell keeps its own ramp color on top (slate-400 is 5.9:1 there), so a day
 *   with no air quality stays marked *inside* a selected range — which is
 *   exactly when that matters.
 * - `selected` is the accent fill: the two ends, and a single-day pick. This is
 *   the one place the ramp is lost, because the fill carries its own label
 *   color (see `ACCENT` above). Two cells out of a range, and the panel's
 *   air-quality warning covers the window as a whole. The end of a range has to
 *   stay findable against the band beside it, which is the 1.4.11 half of why
 *   the fill could not simply be darkened in #167: sky-500 is 5.1:1 on
 *   `range`, where sky-700 would have been 2.4:1.
 *
 * `today` is a ring rather than a fill, so it can coexist with any of the above
 * (today is frequently also selected). slate-400 clears the 3:1 for a boundary.
 */
export const DAY = {
  full: 'text-slate-200 hover:bg-slate-700',
  partial: 'text-slate-400 hover:bg-slate-700',
  unservable: 'text-slate-600',
  range: 'bg-sky-950 hover:bg-sky-900',
  selected: ACCENT.fill,
  today: 'ring-1 ring-inset ring-slate-400',
} as const

/**
 * The shared surface under every text-entry control in the panel.
 *
 * The placeholder color lives here for the same reason every color above
 * does: a call site cannot override it. Placeholders are content held to the
 * same 4.5:1 as text, and the slate-600 the call sites had drifted into read
 * at 2.4:1 on this surface; slate-400 is 7.0:1. (#165)
 *
 * Padding stays at the call site: a textarea and a one-line input want
 * different insets, and a second padding utility here would collide with
 * theirs rather than override it.
 */
export const FIELD =
  `${TEXT.control} bg-slate-900 border border-slate-600 ${RADIUS.control} ` +
  'focus:outline-none focus:border-sky-500 placeholder-slate-400'
