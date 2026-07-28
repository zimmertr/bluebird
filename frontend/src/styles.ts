/**
 * One type ramp, at two densities.
 *
 * Bluebird has two kinds of surface. The working chrome — control panel,
 * results table, map legends, chart — is dense: you scan it while doing
 * something else. The reading surfaces — the welcome and privacy dialogs, and
 * the analysis overlay card — are wide, and you read them once, carefully.
 *
 * They are not two scales. The dialog title is the panel header's title one
 * size up, and the dialog subtitle is the panel's subtitle one size up; even
 * the copy rhymes ("Weather Window Finder" / "The Weather Window Finder").
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

/** The base size, stepped back: secondary text that is read, not scanned. */
const CAPTION = 'text-xs text-slate-500'

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
  /** The tagline under the app title. */
  appSubtitle: 'text-xs text-slate-400',
  /** Secondary text: a place's description, a dialog's closing note. */
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
 * The full-width primary action: Analyze, and the modals' dismiss buttons.
 *
 * It had been written out three times and had drifted into two radii, with the
 * coarse-pointer padding on only one of the three. Call sites append their own
 * disabled/layout classes; nothing here is a size or color they should restate.
 */
export const BUTTON_PRIMARY =
  `${TEXT.cta} w-full py-2.5 touch:py-3 ${RADIUS.surface} transition-colors ` +
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
 * Deliberately no coarse-pointer padding: sizing tap targets is #160's job,
 * and doing it one control at a time is what broke the panel's rhythm before.
 */
export const BUTTON_SECONDARY =
  `${TEXT.control} px-3 py-1.5 ${RADIUS.control} transition-colors ` +
  'bg-slate-700 hover:bg-slate-600'

/**
 * The shared surface under every text-entry control in the panel.
 *
 * Padding stays at the call site: a textarea and a one-line input want
 * different insets, and a second padding utility here would collide with
 * theirs rather than override it.
 */
export const FIELD =
  `${TEXT.control} bg-slate-900 border border-slate-600 ${RADIUS.control} ` +
  'focus:outline-none focus:border-sky-500'
