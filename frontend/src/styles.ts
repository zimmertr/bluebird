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
 * How big a thing you can hit, sized for the pointer rather than the viewport.
 *
 * WCAG 2.2 asks for two different numbers and it matters which one this is.
 * SC 2.5.8 *Target Size (Minimum)* is the AA bar at 24x24 CSS px, with an
 * exception where spacing does the work. SC 2.5.5 *Target Size (Enhanced)* is
 * AAA at 44x44, which is also Apple's 44pt and the nearest web equivalent of
 * Material's 48dp. Bluebird takes the 44 everywhere a control stands on its
 * own, and holds the 24 floor inside the results grid, where 44px rows would
 * cut a phone's visible ranking from roughly 21 rows to 13.
 *
 * Coarse pointers only, for the reason `touch` exists at all (index.css): the
 * panel is 320px wide at every breakpoint, so a viewport query re-spaces it on
 * a desktop window that never changed size. A mouse keeps today's density.
 *
 * The lesson of #159 was not "no touch sizing" — it was "not one control at a
 * time". A coarse-pointer padding on the ranking rows and nothing else is what
 * broke the panel's rhythm. So these compose into the shared recipes (BUTTON_*,
 * FIELD, CHOICE_ROW, SEGMENT_ITEM, ICON_BUTTON, DAY.cell) and a component
 * never writes one: `styles.test.ts` fails any source that spells a `touch:`
 * utility of its own.
 *
 * `min-h` rather than padding, because padding has to be re-derived per font
 * size to land on the same number — which is how BUTTON_PRIMARY's `py-3` came
 * to be the only control in the app that actually met the target.
 *
 * The keys are layouts, not sizes. Four of them reach 44 by different routes
 * because four kinds of control lay their contents out differently, and one
 * display value would have been wrong for three of them.
 */
export const TAP = {
  /** A button: grow the box, keep its own label centered inside it. */
  action: 'touch:min-h-11 touch:min-w-11 flex items-center justify-center',
  /** The same box for a control sitting inside a line of text, which must stay inline-level. */
  inline: 'touch:min-h-11 touch:min-w-11 inline-flex items-center justify-center',
  /** A left-aligned strip — a label and its radio. Growing it is the point; centering it would move the label. */
  row: 'touch:min-h-11 flex items-center',
  /** Height alone, for anything that already lays its own content out: a native input, a two-line list item. */
  height: 'touch:min-h-11',
  /**
   * The 24px AA floor, for controls inside the results grid. Deliberately not
   * gated on the pointer: 24px costs nothing beside a 28px table row, and a
   * 14px checkbox is a poor target for a mouse too.
   */
  dense: 'min-h-6 min-w-6 inline-flex items-center justify-center',
  /**
   * A full-width drag handle (the chart/table resizers). The AA floor rather
   * than the 44, because only the vertical axis is scarce here and a 44px bar
   * between two panels would cost more than the grab it buys. Pointer-gated
   * unlike `dense`, because 8px to 24px is a visible change to the layout and
   * a mouse can already hit an 8px strip that spans the window.
   */
  grip: 'touch:min-h-6',
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
 * The full-width primary action: Analyze, and the modals' dismiss buttons.
 *
 * It had been written out three times and had drifted into two radii, with the
 * coarse-pointer padding on only one of the three. Call sites append their own
 * disabled/layout classes; nothing here is a size or color they should restate.
 *
 * Its own coarse-pointer padding is gone. It reached 44px by a number derived
 * from this role's font size, so it was a target only as long as nobody
 * restyled the label. `TAP.action` states the 44 directly, and states it the
 * same way as every other control in the app (#160).
 *
 * The utility itself is deliberately not named above. v4 scans this file as
 * raw text, so quoting a class we just deleted puts its CSS back in the
 * bundle — the same trap the RADIUS comment warns about, and one this change
 * fell into before the built stylesheet was read.
 */
export const BUTTON_PRIMARY =
  `${TEXT.cta} ${TAP.action} w-full py-2.5 ${RADIUS.surface} transition-colors ` +
  'bg-sky-600 hover:bg-sky-500 text-white'

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
 * It carries `TAP.action` now, which is what #160 was waiting for: the whole
 * point of deferring it was to size every control in one pass rather than
 * leave a second one padded on its own.
 */
export const BUTTON_SECONDARY =
  `${TEXT.control} ${TAP.action} px-3 py-1.5 ${RADIUS.control} transition-colors ` +
  'bg-slate-700 hover:bg-slate-600'

/**
 * Retry, inside an error box.
 *
 * The one button in the app wearing red, and the only one that had never been
 * a role — so it was also the only one still spelling out its own radius,
 * weight and disabled treatment. It sets its size and color together rather
 * than composing `TEXT.control`, because that role carries slate-200 and two
 * competing colors in one class list are settled by stylesheet order.
 *
 * red-200 on red-900/60 over the slate-800 panel is 8.9:1.
 */
export const BUTTON_DANGER =
  `text-xs font-medium text-red-200 ${TAP.action} w-full py-1.5 ${RADIUS.control} ` +
  'bg-red-900/60 hover:bg-red-800 border border-red-700 transition-colors ' +
  'disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * A button that is only its icon: the chart and table collapse chevrons, and
 * the search box's clear ×.
 *
 * All three were already the same two colors and differed only in whether they
 * carried a padding utility, which on a coarse pointer is the difference
 * between a 20px target and a 16px one. Neither is a target, hence the role.
 */
export const ICON_BUTTON =
  `${TAP.action} text-slate-400 hover:text-white transition-colors`

/**
 * The solid accent block: the chosen segment of the ranking direction toggle, the
 * ends of the calendar's day selection, and the numbered steps in the welcome
 * dialog.
 *
 * Three jobs, one recipe — the same way BUTTON_PRIMARY covers both Analyze and a
 * dialog's dismiss button. What they share is not a meaning but a treatment: a
 * small block filled with the app's one resting accent (see LINK_ACTION above),
 * carrying text on top of it. All three had it spelled out at the call site, and
 * white on sky-600 reads at 4.6:1, so this is also the contrast floor for
 * anything wearing the accent as a fill — which is exactly why a call site must
 * not be able to restate it a shade lighter.
 */
export const ACCENT_FILL = 'bg-sky-600 text-white'

/**
 * The idle half of a segmented choice: the ranking direction toggle's unchosen
 * side, and the calendar's Hours toggle.
 *
 * `ACCENT_FILL` above is the chosen half. Naming the pair is what makes the
 * second segmented control in the panel the *same* control rather than a
 * lookalike that drifted — the hazard #159-#165 spent five PRs on.
 */
export const SEGMENT_IDLE = 'bg-slate-900 text-slate-400 hover:text-slate-200'

/**
 * The geometry the two halves sit in, which had been spelled out twice.
 *
 * Naming the colors (above) and leaving the box at the call site is how the
 * pair stayed a lookalike anyway: the ranking toggle and the calendar's Hours
 * toggle each wrote their own border, radius, overflow and padding, and were
 * byte-equivalent by luck rather than by construction. A segment is also the
 * shortest control in the panel at 20px, so it is where the tap-target rule
 * has the most to fix — and it can only be fixed once if the box is one thing.
 *
 * No color here: the halves are `ACCENT_FILL` and `SEGMENT_IDLE`, so a color
 * in this recipe would be a third one competing with them by stylesheet order.
 */
export const SEGMENT = `flex ${RADIUS.control} overflow-hidden border border-slate-600`
export const SEGMENT_ITEM = `${TAP.action} px-2 py-0.5 text-xs transition-colors`
/** Between two halves, never before the first. */
export const SEGMENT_DIVIDER = 'border-l border-slate-600'

/**
 * A radio or checkbox and the words naming it, as one strip.
 *
 * The panel had four of these (destination type, the four ranking metrics,
 * Show Wildfires, the chart's metric radios) at three different gaps, and the
 * 14px box was the target in all four — the label beside it was clickable, but
 * only as tall as its own text. `TAP.row` grows the strip instead, which is
 * the affordance a full-width row already implied.
 *
 * The text role lives here rather than on an inner span, so a row cannot be
 * built that reads at a different size than the others.
 *
 * The disabled look is the role's too, keyed off the control it wraps. A call
 * site that spelled `cursor-not-allowed` beside this would be betting on which
 * of two `cursor` utilities Tailwind emitted last, and class order is not what
 * decides that. As a variant it sorts after the base rule and simply wins.
 */
export const CHOICE_ROW =
  `${TEXT.control} ${TAP.row} gap-2.5 cursor-pointer ` +
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40'
export const CHOICE_INPUT = 'accent-sky-500 h-3.5 w-3.5 flex-shrink-0 cursor-pointer align-middle'

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
 *   the one place the ramp is lost, because white is what reads on sky-600. Two
 *   cells out of a range, and the panel's air-quality warning covers the window
 *   as a whole.
 *
 * `today` is a ring rather than a fill, so it can coexist with any of the above
 * (today is frequently also selected). slate-400 clears the 3:1 for a boundary.
 */
export const DAY = {
  /**
   * The cell box itself. Seven columns inside a ~272px card is ~38px wide, and
   * the drawer is 320px on every phone, so this is the one control in the app
   * that cannot reach 44 on both axes — the width has nowhere to come from
   * short of a wider panel, which would cost more than it buys. Height it can
   * have, and a calendar's mis-taps are overwhelmingly vertical: the columns
   * are a whole finger apart in meaning (a week) while the rows are a day.
   */
  cell: 'flex h-9 touch:h-11 items-center justify-center',
  full: 'text-slate-200 hover:bg-slate-700',
  partial: 'text-slate-400 hover:bg-slate-700',
  unservable: 'text-slate-600',
  range: 'bg-sky-950 hover:bg-sky-900',
  selected: ACCENT_FILL,
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
 * theirs rather than override it. The tap target does *not* — `TAP.height` is
 * a minimum, so it composes with either inset instead of fighting it, which is
 * the whole reason the rule is written as a height and not as padding.
 */
export const FIELD =
  `${TEXT.control} ${TAP.height} bg-slate-900 border border-slate-600 ${RADIUS.control} ` +
  'focus:outline-none focus:border-sky-500 placeholder-slate-400'

/**
 * The results grid's two cell insets, which had been spelled out ten times
 * across one file.
 *
 * A row is 28px and stays 28px: this is the one surface that holds the 24px AA
 * floor (`TAP.dense`) rather than the app's 44, because the ranking is the
 * thing the phone is there to read and 44px rows would show 13 of them instead
 * of 21. The controls living in a cell — the remove ×, the chart checkbox, the
 * destination link — get the floor; the row keeps its density.
 */
export const TABLE = {
  cell: 'px-2 py-1.5',
  head: `${TEXT.subheading} px-2 py-2 text-left`,
} as const
