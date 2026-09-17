/**
 * One type ramp, at two densities.
 *
 * Bluebird Forecast has two kinds of surface. The working chrome — control panel,
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
// Size and color split so the coverage slider's wordmark below can take the
// shape without the color: its line renders twice, muted on the well and white
// inside the accent fill, and a color baked into the shape would race the
// layer's by stylesheet order.
/**
 * The ramp's smallest step, as the class itself rather than as a number the
 * class is built from: Tailwind v4 scans this file as raw text, so an
 * interpolated utility emits no CSS and the size has to be spelled.
 *
 * That is why the one stylesheet needing the same size says it a second time —
 * `MAP_EDGE.publish` carries it as `--map-credit-size` for MapLibre's credit
 * line, which has no call site to hand a role to. `styles.test.ts` holds the
 * two spellings to one number, which is the only place that can be done.
 */
export const MICRO_SIZE = 'text-[10px]'
const MICRO = `${MICRO_SIZE} text-slate-300`

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
  /** Numbered section headings: "1. Destinations", "3. Ranking". */
  section: 'text-sm font-bold uppercase tracking-wider text-slate-400',
  /** The single call to action, deliberately a step up from the panel body. */
  cta: 'text-sm font-semibold',
  /** Panel identity in the header. Outside the body ramp on purpose. */
  appTitle: 'text-lg font-bold text-white leading-tight',
  /** Named sub-blocks and the labels naming a field. */
  subheading: 'text-xs font-semibold text-slate-200',
  /** Anything you read or type in a control: radio labels, inputs, pickers. */
  control: 'text-xs text-slate-200',
  /** Secondary text: the app tagline, a place's description, a dialog's note. */
  caption: CAPTION,
  /** Prose that explains a control without being one. */
  helper: `${CAPTION} italic`,
  /** Tiny all-caps labels: a popover header, a search result's kind. */
  overline: `${MICRO} font-semibold uppercase tracking-wider`,
  /** Attribution, timestamps, overflow counts — present but never first. */
  micro: MICRO,
} as const

/**
 * Control-size text with NO color of its own, for spans whose color is a
 * separate role's to supply: the coverage slider's two-layer value, the grid
 * legend's value, which wears `STATUS.warn` while transient and `ACCENT.text`
 * once settled, and the two map buttons, whose label is white. `TEXT.control`
 * cannot serve these — its color is baked in, and a second color class beside
 * it would resolve by stylesheet order rather than by intent.
 *
 * It is declared up here with the ramp rather than beside the slider it was
 * written for, because `BUTTON_FLOATING` below needs it: a const used before
 * its declaration at module scope is a temporal-dead-zone throw, not a
 * hoisted value.
 */
export const CONTROL_SIZE = 'text-xs'

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
 * Material's 48dp. Bluebird Forecast takes the 44, and takes it where a control stands
 * in its own space: the control panel, the calendar, the map chrome.
 *
 * It does **not** reach into the results panel — not the table's rows, not the
 * two header bars, not the search field. Those are surfaces you read rather
 * than operate, and every pixel a control takes there is a pixel of ranking or
 * of map that a phone stops showing. A 44px table row costs about eight rows
 * of a phone's ranking; a 44px chevron costs its bar permanently. The
 * exception is deliberate and it is the whole reason the rule is written down
 * here rather than inferred from whatever each component happened to do.
 *
 * Coarse pointers only, for the reason `touch` exists at all (index.css): the
 * panel is a near-constant width on every breakpoint (360px docked on desktop,
 * 100vw − 2rem capped at 360 as the phone drawer), so a viewport query would
 * re-space it on a desktop window that never changed size. A mouse keeps
 * today's density.
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
 * The keys are layouts, not sizes. Three reach 44 by different routes, because
 * three kinds of control lay their contents out differently and one display
 * value would have been wrong for two of them.
 */
export const TAP = {
  /** A button: grow the box, keep its own label centered inside it. */
  action: 'touch:min-h-11 touch:min-w-11 flex items-center justify-center',
  /** A left-aligned strip — a label and its radio. Growing it is the point; centering it would move the label. */
  row: 'touch:min-h-11 flex items-center',
  /** Height alone, for anything that already lays its own content out: a two-line list item. */
  height: 'touch:min-h-11',
  /**
   * A full-width drag handle (the chart/table resizers). The AA floor rather
   * than the 44, because only the vertical axis is scarce here and a 44px bar
   * between two panels would cost more than the grab it buys. It is also the
   * only place a finger has no alternative at all: the panels have no other
   * resize affordance, where a small chevron at least still collapses.
   */
  grip: 'touch:min-h-6',
} as const

/**
 * Boxes that float over the map: the search field and its dropdown, the
 * Controls button, the legend, the chart tooltip.
 *
 * Most of those were already byte-identical. The legends were not — they ran a
 * darker fill and a darker border, so the map carried two different ideas of
 * "floating box" within a few hundred pixels of each other. There is one legend
 * box now (#454), the key and the layers sharing it.
 */
export const SURFACE_FLOATING =
  `bg-slate-800/95 border border-slate-600 ${RADIUS.surface} shadow-lg backdrop-blur-sm`

/** Opaque cards that sit above a scrim: the dialogs and the analysis overlay. */
export const SURFACE_CARD =
  `bg-slate-800 border border-slate-600 ${RADIUS.surface} shadow-xl`

/**
 * The results sheet on a phone: the panel parked over the map's bottom edge
 * rather than docked below it (#249).
 *
 * The same slate-800 the docked panel wears, so the results do not change colour
 * with the breakpoint, plus the two things that say it is standing on the map:
 * the slate-600 edge every box floating over the map already carries, and the
 * surface radius on the top corners only, since the bottom pair are off the
 * screen and a curve nobody can see is not a curve.
 *
 * `overflow-hidden` is what makes the radius real — the header bar inside is a
 * square slate-700 block and would paint straight over the corners without it.
 *
 * No shadow: Tailwind's shadows cast downward, where this surface has nothing to
 * fall on, and the edge is already the strongest boundary on the screen.
 */
export const SURFACE_SHEET = 'bg-slate-800 border-t border-slate-600 rounded-t-lg overflow-hidden'

/**
 * The map's Layers popover: the one floating box that is a menu rather than a
 * label, separated from the boxes around it by ELEVATION.
 *
 * `SURFACE_FLOATING` would make it byte-identical to the legend box a few
 * hundred pixels below it, so a thing the reader acts in would look like a key
 * the reader reads. What separates it here is the shadow and one step of fill;
 * the border stays exactly the legend's slate-600 so the difference is
 * elevation only.
 *
 * ## Why `shadow-2xl` rather than `shadow-xl`
 *
 * Tailwind's `xl` is two layers at 0.1 black alpha; `2xl` is one 50px blur at
 * 0.25. Over the light basemap both register, but this popover also hangs over
 * the dark results sheet at the phone breakpoint, where 0.1 alpha on a near
 * black surface is nothing at all. 0.25 is the only one of the two that reads
 * on both grounds. `SURFACE_CARD` keeps `xl` because a scrim does its
 * separating; nothing sits behind this one.
 *
 * ## Why slate-700, and what still clears AA on it
 *
 * One step up from the legend's slate-800, measured on the v4 oklch steps:
 * white 10.34:1, `TEXT.control`'s slate-200 8.40:1, `MICRO`'s slate-300
 * 6.97:1 — every text role in the popover past the 4.5:1 of WCAG 1.4.3.
 * `ACCENT.input`'s checked sky-500 fill reads 3.81:1 here (5.40:1 on
 * slate-800), past the 3:1 a control boundary owes under 1.4.11.
 *
 * The border is 1.37:1 on this fill where it was 1.94:1 on slate-800, and that
 * is fine for the same reason it was fine there: it has never been the boundary
 * doing the work — the shadow is, more so now.
 *
 * The one thing the lift genuinely breaks is `RECESSED_EDGE`, which carries
 * 3.07:1 on slate-800 and only 2.17:1 here, so the segment and the coverage
 * well inside the popover would lose the outer half of their boundary.
 * `LIFTED_EDGE` below re-derives it.
 *
 * Spelled out rather than composed onto `SURFACE_FLOATING`: two background
 * utilities resolve by their order in the generated stylesheet, not by class
 * order, so appending a lighter fill would be a bet rather than an override.
 */
export const SURFACE_POPOVER =
  `bg-slate-700/95 border border-slate-600 ${RADIUS.surface} shadow-2xl backdrop-blur-sm`

/**
 * The accent, named by the jobs it does, because it does six.
 *
 * Every one of these was spelled at a call site before, in fourteen places
 * across five files, which is how the fill and the button that wears it came to
 * disagree about their own contrast. The rule this section exists to make
 * enforceable is in `styles.test.ts`: **no component names a hue.** A component
 * says which job it is doing and the answer lives here.
 *
 * ## The fill is a custom shade, and it has to be (#167)
 *
 * White on sky-600 measured **4.02:1** against the 4.5:1 WCAG 1.4.3 asks of
 * normal-size text, and every site is 12-14px so no large-text allowance
 * applies. The fix is not a different step on Tailwind's scale, because there
 * is no step that works: the fill answers to 1.4.3 for its label *and* 1.4.11
 * for its own edge, those bound it from opposite sides, and the surviving
 * window is 0.0067 of relative luminance wide with nothing in it. sky-700
 * would fix the label and break the calendar, where the ends of a selected
 * range would sink into the band between them.
 *
 * So the accent fill is `sky-650`, defined in `index.css` — the midpoint of
 * that window, which is where the derivation lives. White reads 4.57:1 on it,
 * and it holds 3.21:1 on the panel, 3.04:1 on `DAY.range` and 3.91:1 on the
 * segment track. Resting states pass; the one that does not is the hover, for
 * a reason recorded on `fillHover` below.
 *
 * Two roads not taken, so they do not have to be rediscovered. Inverting the
 * polarity — a dark label on a brighter fill — clears everything with far more
 * room (7.43:1 text, 5.40:1 edge) and was rejected: white-on-blue is the app's
 * identity. Accepting 4.02:1 as a documented exception was the other, and is
 * what this replaced.
 *
 * The margins here are ~1.5% on two of the four constraints. That thinness is
 * the honest price of a white label on a blue fill, and it is why every number
 * above is pinned in `styles.test.ts`: the last time this recipe carried a
 * contrast claim in a comment the claim was simply wrong (it said 4.6:1), and
 * an entire accessibility sweep believed it.
 */
export const ACCENT = {
  /**
   * A solid block filled with the accent, carrying a label: the chosen segment
   * of the ranking toggle, the When and Hours toggles, the ends of a day
   * selection, the numbered steps in the welcome dialog, and `BUTTON_PRIMARY`
   * below.
   *
   * The label color is not separable from the fill and must never be restated
   * at a call site — that is the whole failure this role was rewritten to end.
   * The shade is the only one that clears both rules; see `--color-sky-650` in
   * `index.css` for the derivation before changing either half.
   */
  fill: 'bg-sky-650 text-white',
  /**
   * The hover step for a fill that is a button: `BUTTON_PRIMARY` and the
   * inline `BUTTON_ACCENT`.
   *
   * Still lightens, matching every other hover in the app. That is the one
   * state left below AA: white on sky-600 is **4.02:1** against 4.5. It cannot
   * be fixed by lightening less, because with a white label *every* lightening
   * costs contrast — a conformant hover would have to darken, making the app's
   * one primary action the only control that dims under the pointer.
   *
   * Kept deliberately, and it is a strict improvement on what it replaced: the
   * hover used to be sky-500 at 2.71:1. 4.02:1 is also exactly the ratio the
   * *resting* fill carried before #167, so no state is worse than what the app
   * already shipped, and the state you read while not touching it now passes.
   */
  fillHover: 'hover:bg-sky-600',
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
 * The visible keyboard-focus indicator for interactive controls.
 *
 * Fires only on focus-visible, not on pointer focus, so mouse users see no
 * change while keyboard users get a clear outline. The outline is 2px with a
 * 2px offset, and uses sky-400 which comfortably clears the 3:1 boundary
 * contrast on the slate-800 panel.
 */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400'

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
  `${ACCENT.fill} ${ACCENT.fillHover} ${FOCUS_RING}`

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
  `bg-slate-700 hover:bg-slate-600 ${FOCUS_RING}`

/**
 * The leading action of an inline pair: Done, with Clear beside it, ending the
 * map's draw mode (#118).
 *
 * `BUTTON_PRIMARY` is the panel's one full-width call to action and cannot be
 * this — a `w-full` button cannot stand next to anything — but a Done that
 * looked exactly like the Clear beside it would leave the pair with no order,
 * and Clear is the destructive one. So: `BUTTON_SECONDARY`'s box, because the
 * two sit side by side and must read as one pair, wearing the accent fill that
 * marks the primary action everywhere else.
 *
 * The size is set bare rather than by composing `TEXT.control`, for the reason
 * spelled out on `BUTTON_DANGER` below: that role carries slate-200, which
 * would race `ACCENT.fill`'s white by stylesheet order and could not be
 * overridden here.
 */
export const BUTTON_ACCENT =
  `text-xs ${TAP.action} px-3 py-1.5 ${RADIUS.control} transition-colors ` +
  `${ACCENT.fill} ${ACCENT.fillHover} ${FOCUS_RING}`

/**
 * A word marking the row it sits in, not a control: "Recommended" on the
 * default forecast model.
 *
 * Filled rather than tinted, which is the whole reason it exists. Accent *text*
 * is the app's quiet accent — the table's sort arrow, a link on hover — and in
 * a list of eight rows that are all mostly text it reads as more text. A badge
 * has to survive not being read, so it takes the fill.
 *
 * `TAP.action` is deliberately absent: this is the one accent-filled thing in
 * the app you cannot press, and growing it to 44px would make it look like the
 * one thing in its row that you can.
 *
 * `ACCENT.fill`'s white on `--color-sky-650` measures 4.57:1, so the label
 * clears AA at this size without the fill needing a shade of its own.
 *
 * The type is spelled out rather than composed from `TEXT.overline`, for the
 * same reason `BUTTON_ACCENT` above spells its size: that role carries
 * slate-300, which would race `ACCENT.fill`'s white by stylesheet order rather
 * than by class order, so the winner would not be decidable from this line.
 * `styles.test.ts` caught exactly that when this was written the short way.
 */
export const BADGE_ACCENT =
  `text-[10px] font-semibold uppercase tracking-wider ` +
  `${ACCENT.fill} ${RADIUS.pill} px-1.5 py-0.5`

/**
 * The box a chip sits in, which is the same box in either state.
 *
 * The right padding is the chip's rather than the label's: the label sits
 * against the × with nothing between them but the glyph's own inset, so the
 * gap a reader sees is 4px — half of what `CHIP.remove`'s 20px box leaves
 * around an `ICON.chip` cross — rather than the 16px two `px-2` halves put
 * there.
 */
const CHIP_SHAPE = `inline-flex max-w-full items-center ${RADIUS.control} pr-1 text-xs`

/**
 * A chip naming one selected member of a set: the forecast models the picker
 * has selected, of which exactly one is in force.
 *
 * Two states, and the pair is the point. `active` marks the member in force —
 * the model that RANKS the field — and wears `ACCENT.fill`, the same fill the
 * chosen half of a segmented control wears, because it states the same fact
 * about the same kind of set. `rest` is every other selected member.
 *
 * Colour is not the only channel separating them, and it cannot be: the accent
 * fill against the neutral chip beside it measures 2.2:1, under the 3:1 that
 * WCAG 1.4.11 asks of a boundary carrying meaning on its own. A resting chip
 * SHOWS its remove ×, an active one shows the same slot empty, and the row
 * carries a header naming what the highlight means, so the state survives a
 * reader the fill does not reach. The labels are above the text floor in both
 * states — white on `--color-sky-650` is 4.57:1 (the derivation is in
 * `index.css`) and slate-200 on slate-700 is 8.2:1.
 *
 * The size is spelled bare rather than composed from `TEXT.control`, for the
 * reason `BADGE_ACCENT` above spells its own: that role carries slate-200,
 * which would race `ACCENT.fill`'s white by stylesheet order rather than by
 * class order, so the winner would not be decidable from this line.
 */
export const CHIP = {
  /** A selected member that is not the one in force. */
  rest: `${CHIP_SHAPE} bg-slate-700 text-slate-200`,
  /** The member in force. */
  active: `${CHIP_SHAPE} ${ACCENT.fill}`,
  /**
   * The label, which is also the control that puts that member in force. Left
   * padding only: its right edge is the gap before the × and the shape above
   * owns that, so a chip is as wide as its name plus its control rather than
   * as wide as four paddings.
   */
  label: `min-w-0 cursor-pointer truncate py-1 pl-2 ${FOCUS_RING}`,
  /**
   * The × that deselects it: a 20x24 box, drawn on every chip whether or not
   * it can act, so the row cannot resize when the highlight moves.
   *
   * 20 is narrower than the 24x24 WCAG 2.5.8 asks of a target, and the height
   * is what keeps the chip a chip — a 24px-wide box put ~16px of nothing
   * between the last letter and the glyph. So the BOX stays 20 and the TARGET
   * grows on a coarse pointer instead: `touch:w-6` takes it to 24 and the
   * negative margin takes the four pixels back out of the layout, which is the
   * one way to buy a target without moving anything around it.
   */
  remove:
    `flex h-6 w-5 flex-shrink-0 cursor-pointer items-center justify-center ` +
    `touch:-mx-0.5 touch:w-6 ${FOCUS_RING}`,
} as const

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
  `text-xs ${TAP.action} w-full py-1.5 ${RADIUS.control} font-medium transition-colors ` +
  `text-red-200 bg-red-900/60 hover:bg-red-800 border border-red-700 ` +
  `disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`

/**
 * A button floating over the map rather than sitting in a panel: the one that
 * reopens the collapsed controls, and the one that opens the map's layers.
 *
 * Both wear it, deliberately. They are the app's only two map buttons and they
 * stack in one column, so a size difference between them reads as a mistake
 * rather than as a hierarchy — which is exactly how it read when Layers was
 * given a quieter role of its own.
 *
 * ## Why the label is `CONTROL_SIZE` and not `TEXT.cta`
 *
 * It was `text-sm` on the argument that a map button is pressed outdoors at
 * arm's length. What that missed is that these two buttons are not alone: they
 * stand in one column with the search field, its results, and the legends,
 * every one of which reads at 12px, and a 14px label in that column read as a
 * different kind of object rather than as a louder one (TJ, 2026-09-14). The
 * column now has ONE type size, and `CONTROL_SIZE` is it — colorless, so the
 * white label below does not race it by stylesheet order. Reach is bought by
 * the target instead: `MAP_ROW_H` floors every row in the column at 44px on a
 * finger, which is the dimension a glove actually needs.
 *
 * It is `SURFACE_FLOATING` that has become pressable, so it takes the surface
 * whole and adds only what pressability needs — the accent on hover, and a
 * pressed state. Layout (the icon row, its gap and padding) stays at the call
 * site, the way `FIELD` leaves padding to the control that wears it.
 */
export const BUTTON_FLOATING =
  `${SURFACE_FLOATING} ${CONTROL_SIZE} font-semibold text-white transition-colors ` +
  `${ACCENT.edgeHover} ${ACCENT.hoverText} active:bg-slate-700 ${FOCUS_RING}`

/**
 * The preview-deployment banner, the one surface that is deliberately loud.
 *
 * It lived as a local constant inside its own component, which is the same
 * bespoke-recipe problem as the accent had, just with only one call site to
 * drift from. White on red-600 reads 4.76:1, so it clears AA as it stands.
 */
export const BANNER_PREVIEW =
  'flex-shrink-0 bg-red-600 text-white text-center text-xs sm:text-sm ' +
  'font-semibold py-1.5 px-4 shadow-md'

/**
 * An icon that acts on hover: the table's external-destination links.
 *
 * slate-500 is 3.1:1 on the panel, which is the floor for an icon rather than
 * the 4.5:1 asked of text — these carry no label and are recognized by shape.
 */
/**
 * A legend swatch that carries a letter.
 *
 * The smoke overlay's three densities are one hue at three opacities, and the
 * whole encoding is that opacity — so the three have to be readable AGAINST
 * each other, which they cannot be stacked one per row. Side by side as
 * lettered chips they read as the ramp they are, in one row instead of four.
 *
 * The letter is dark rather than light because the fill it sits on is pale at
 * every density; that colour lives here rather than at the call site for the
 * usual reason, and so does the size, which is one step below the ramp's
 * smallest on purpose — a chip is 14px square and a 10px glyph does not fit
 * inside it with its own border.
 */
export const SWATCH_CHIP =
  `inline-flex h-3.5 w-3.5 items-center justify-center ${RADIUS.control} border ` +
  `text-[9px] font-semibold text-slate-900`

/**
 * A legend key that is a SCALE rather than one colour, drawn as a strip across
 * the box: the snow depth overlay's eleven bands (#446) and, since #454, each
 * of the five ranking metrics' six.
 *
 * A single-value layer keys on the 14px chip beside its label. A banded scale
 * cannot be said that way — eleven chips in a 164px row are 13px each with
 * nothing under them to read — and a row per band is eleven rows for snow and
 * seven lines for a metric, on a map that can be 161px tall on a phone. So a
 * scale takes the box's whole width and buys ONE line whatever the band count.
 *
 * **The numbers live inside it** (TJ, 2026-09-17). Under it they cost a second
 * line per scale, which with two scales on screen is 16px of a map a phone can
 * only give 161 to. So the strip is the grid its numbers sit in, and the height
 * is what a 10px numeral needs rather than what a colour bar does.
 *
 * The fill is the scale's own, passed in: `colors.ts` and `snowDepth.ts` are
 * where a band's colour is decided, and a fill named here would be a second
 * opinion about a picture already on the map. `overflow-hidden` is what clips
 * {@link SWATCH_RAMP_SCRIM} to the strip's own corners.
 */
export const SWATCH_RAMP =
  `relative grid items-end h-5 w-full overflow-hidden ${RADIUS.control} border`

/**
 * The band the numbers stand on, inside the strip.
 *
 * **Ink on a ramp needs a ground, and this is a measurement rather than a
 * style.** A metric ramp runs from cyan-300 to purple-500 in one strip, so no
 * single ink clears AA across it: white measures 1.45:1 on `#67e8f9` and
 * slate-900 measures 2.04:1 on `#5720c3` (2026-09-17, over all five metric
 * ramps and the eleven snow bands). A scrim is what gives every number one
 * ground to be read against — slate-200 on this one measures **6.49:1** at its
 * worst, on that same cyan-300, where a text-shadow would be carrying the
 * legibility and no test could measure it.
 *
 * It takes the strip's lower 11px and leaves the colour the upper 7, which is
 * within a pixel of the whole strip before the numbers moved in. Full width
 * rather than a chip per number, so the numbers read along one baseline on one
 * ground instead of as four dark blocks punched through a six-band scale.
 */
export const SWATCH_RAMP_SCRIM =
  'pointer-events-none absolute inset-x-0 bottom-0 h-[11px] bg-slate-900/70'

/**
 * One number on that band: 10px, the ramp's smallest step, on the scrim.
 *
 * `relative` lifts it over the scrim, which is a later sibling in paint order.
 * `leading-none` is what lets a 10px numeral sit in an 11px band at all, and
 * the 2px of side padding keeps the first and last numbers off the strip's own
 * edges without moving a centred one, which pads symmetrically.
 */
export const SWATCH_RAMP_TICK =
  `relative whitespace-nowrap px-0.5 pb-px ${MICRO_SIZE} leading-none text-slate-200`

/**
 * The edge every legend swatch wears, as a VALUE rather than a class.
 *
 * slate-600, the same line `SURFACE_FLOATING` draws around the box the swatches
 * sit in — a swatch is chrome holding somebody else's colour, so its border is
 * the app's and its fill is not. It has to be a value because the fill beside
 * it is one: Tailwind resolves two competing colour utilities by stylesheet
 * order, so a `border-slate-600` class on a span carrying an inline
 * `borderColor` would be a race rather than a rule. It was this hex spelled at
 * four call sites in `App.tsx` until #454.
 */
export const SWATCH_EDGE = '#475569'

export const ICON_ACTION = `text-slate-500 ${ACCENT.hoverText}`

/** A bare icon button in a header: the chart and table collapse chevrons. */
export const ICON_BUTTON = `px-1 text-slate-400 hover:text-white transition-colors ${FOCUS_RING}`

/**
 * A glyph drawn inside a field rather than beside it: the `SELECT` arrow.
 *
 * `pointer-events-none` is the load-bearing part — the arrow overlays the
 * control it decorates, and without it the one place a user aims for is the one
 * place that does not open the dropdown. slate-400 is 7.0:1 on the recessed
 * fill, well past the 3:1 a UI glyph owes.
 */
export const ICON_ADORNMENT =
  'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400'

/**
 * How big a drawn glyph is, for every icon in `components/icons.tsx`.
 *
 * A ramp rather than one size, because the app's icons are not all the same
 * kind of object: some stand beside a control's label, one is a mark inside a
 * sentence, and the smallest live inside a disc or a chip that is itself
 * smaller than a control. The step is set by the box the glyph sits in.
 *
 * It is a role and not a call-site class for the reason every size here is:
 * nineteen inline SVGs drew their own before #386, and the same cross came out
 * at three sizes and two stroke weights.
 *
 * Four steps, all of them on Tailwind's scale. It was five: the magnifier sat
 * a pixel under `control` and the same chip cross was drawn at two sizes, both
 * carried over by #386 because that change moved no visible size. #436
 * measured them in Chrome on macOS on 2026-09-16, at 1440 and at 360px alike
 * — every box below comes out the same at both widths, the map column being a
 * fixed 184px and a chip as wide as its name — and the number that decided
 * each step is in its comment.
 */
export const ICON = {
  /**
   * 16x16. The standing step: a glyph in or beside a control — the results
   * bar's mode switch, the map's two buttons, the panel's close, the columns
   * picker's grip, the collapse chevron, the search field's magnifier, and the
   * arrow `SELECT` reserves room for (`ICON_ADORNMENT`, whose 24px reserve is
   * measured off this step).
   *
   * The magnifier was 15 and is the reason this step is worth a number. Its
   * row is `MAP_ROW_H`, 36px on a pointer and 44 on a finger, and both are
   * even: a 16px box centres on 10 and 14px of clear space, a 15px box on 10.5
   * and 14.5. The row also holds two 16px boxes already — the clear cross, and
   * the spinner that stands in its place — which sit at that same 10px. So the
   * odd step bought nothing and cost a half-pixel, on the one glyph in the row
   * that was off the pixel grid and the one that was off the scale. The column
   * pays for the extra pixel out of slack it has: `MAP_COL_W` is 184px against
   * 178.6px of content.
   */
  control: 'h-4 w-4',
  /**
   * 14x14. A mark inside a line of text rather than inside a control: the
   * results table's link-out arrow, which sits on a destination's name and is
   * sized to the name rather than to a button, and the same glyph in the map
   * popup's title row, which reads the number from `iconPaths.ts` because a
   * string handed to setHTML can carry no class.
   */
  inline: 'h-3.5 w-3.5',
  /**
   * 12x12. The remove cross on a chip: the chart legend's and the model
   * picker's alike.
   *
   * Both chips measure exactly 24px tall, so they are one box carrying one
   * object, and they drew it at 12 and at 10 until #436. 12 is the size this
   * cross is actually drawn at: its two lines run 6 to 18 of a 24-unit
   * viewBox, so at 12 the scale is exactly a half — a 1.00px stroke with both
   * ends on whole pixels — where 10 gives 0.83px on half pixels. It costs the
   * model chip no width, `CHIP.remove` being a fixed 20x24 box: the glyph
   * grows inside it, the chips stay 92.8, 97.8 and 111.7px wide, and the gap
   * the reader sees between the last letter and the cross closes from 5px to
   * the 4px the legend chip already had.
   */
  chip: 'h-3 w-3',
  /**
   * 10x10. What fits inside a DRAWN shape smaller than a control, where the
   * fill around the glyph is the shape: the notice's 20px dismiss disc and the
   * timeline's 28px play button.
   *
   * The disc sets it. At 10 its fill rings the cross by 5px and at 12 by 4,
   * and that ring is all there is of the disc — `NOTICE_DISMISS.pill` is
   * `white/5` at rest, deliberately the faintest fill in the app. The play
   * button has the room either way (9px against 8) and takes the disc's step
   * rather than standing alone at a fifth number.
   */
  micro: 'h-2.5 w-2.5',
}

/**
 * The indeterminate spinner: the search box while a lookup is in flight.
 *
 * Size stays at the call site; everything that makes it a spinner does not.
 */
export const SPINNER =
  `animate-spin ${RADIUS.pill} border-2 border-slate-500 border-t-sky-400`

/**
 * What sits in front of what.
 *
 * Six values across three files, each picked in isolation, which is how the
 * model picker ended up *behind* the mobile drawer that contains it: the drawer
 * took z-40 and the popover z-30, so on a narrow window the list opened
 * invisibly behind the panel, and closing the panel to see it unmounted the
 * picker along with it. Naming the order is what makes that a compile-time
 * question rather than a discovery.
 *
 * Read top to bottom as the stack. The one rule that is not obvious: a popover
 * belongs *above* the drawer, because it is opened from inside it, and below a
 * dialog, because a dialog is modal and a popover is not.
 */
export const LAYER = {
  /** Map chrome, the sticky table header, the docked panels. */
  base: 'z-10',
  /**
   * The results sheet on a phone, which stands on the map rather than beside it
   * (#249). Above every piece of map chrome it covers — the legends, the
   * timeline, the map buttons, all `base` — and below the scrim, because the
   * drawer dims the whole screen behind it and the sheet is part of that screen.
   */
  sheet: 'z-[15]',
  /**
   * The map's own top-left cluster: Controls, the search box, Layers, and
   * whatever they open.
   *
   * Above the sheet and above every piece of map chrome under it, because the
   * Layers popover hangs down across both and a control the reader has just
   * opened has to be whole while it is open — the lifted timeline used to paint
   * over its last row. Below `overlay`, which speaks for the whole map while an
   * analysis runs.
   *
   * The cluster wears it rather than the popover inside it: a positioned box
   * with a z-index is a stacking context, so a bigger number on a child can
   * only order that child against its own siblings.
   */
  mapControls: 'z-[18]',
  /** The analysis overlay, over the map while a run is in flight. */
  overlay: 'z-20',
  /** The scrim behind the mobile drawer, and the preview banner. */
  scrim: 'z-30',
  /** The mobile drawer itself. */
  drawer: 'z-40',
  /**
   * Anything opened from inside the drawer, which must clear it: the model
   * picker's listbox, and the analysis overlay — which is started from the
   * drawer and now runs while it is still open, so a mobile reader can watch
   * the progress they would otherwise be waiting on blind.
   */
  popover: 'z-50',
  /** Modal dialogs, and the shield that swallows pointer events mid-drag. */
  modal: 'z-[60]',
} as const

/**
 * The grip a column is dragged by, in the table header and in the Columns
 * picker alike (#360).
 *
 * A grip rather than the whole row, because both rows already answer a press:
 * a header sorts and a picker row toggles a checkbox. A dedicated handle is
 * also the only visible affordance either surface can carry, since neither has
 * room for a word.
 *
 * `cursor-grab` is the standing signal for "this moves", and `touch-none` is
 * load-bearing: without it the browser claims the gesture for scrolling and
 * the drag never gets a second pointer event on a phone. It is the same reason
 * the resize handle wears it.
 */
export const DRAG_GRIP =
  `cursor-grab touch-none text-slate-500 hover:text-slate-200 active:cursor-grabbing ` +
  `transition-colors ${FOCUS_RING}`

/** The grip while its column is the one being moved. */
export const DRAG_GRIP_ACTIVE = 'text-slate-200'

/**
 * What a column looks like where it used to be, while it is being carried.
 *
 * The table header and the Columns picker both fade the row the drag started
 * in, so the ghost under the pointer reads as the thing itself rather than as a
 * copy of a column that is still sitting there. Both spelled the same literal
 * before it had a name (#437).
 *
 * The same 40 percent as `DISABLED` and deliberately not that role: `DISABLED`
 * promises a press will do nothing and carries `cursor-not-allowed` to say so,
 * where this column still sorts and still toggles the moment the drag ends, and
 * the pointer is already holding it. Not `MUTED` either, which is the 50 percent
 * of a control that works but is not the one in force; this one is not faded for
 * what it does, but for where it is.
 */
export const CARRIED = 'opacity-40'

/**
 * The column being carried, drawn under the pointer.
 *
 * Translucent and tilted a degree, which is the standing vocabulary for
 * "picked up" — the same two signals a dragged card wears everywhere. It is
 * portalled to the body and positioned in viewport coordinates, so it needs
 * the app's top layer rather than the table's.
 *
 * That layer is part of the role rather than a second class the call site
 * adds. Both surfaces that move a column drew the pair, and a ghost that gets
 * one without the other is a ghost the picker it was dragged out of paints
 * over.
 *
 * `pointer-events-none` is load-bearing: the ghost follows the pointer, so
 * without it the ghost is what every hit test finds and the drag can never see
 * the column underneath.
 */
export const DRAG_GHOST =
  `${TEXT.control} pointer-events-none fixed ${LAYER.popover} -rotate-1 opacity-80 ` +
  `${SURFACE_CARD} px-2 py-1 whitespace-nowrap shadow-xl`

/**
 * Where the carried column will land: a line in the gap, not a fill on a
 * column.
 *
 * A fill cannot say which SIDE of the column underneath the carried one ends
 * up on, which is the whole question a drop answers. The accent because this
 * is the app's one "here" mark; the bar's own thickness is the call site's,
 * since the two surfaces draw it on different axes.
 *
 * The accent's FILL without its label color: `ACCENT.fill` pairs the two
 * deliberately and this bar carries no label, so taking the pair would hand a
 * text color to something with no text.
 *
 * It carries the same layer as the ghost above and for the same reason: the
 * bar is drawn in viewport coordinates over whatever surface the drag started
 * in.
 */
export const DRAG_INSERT =
  `pointer-events-none fixed ${LAYER.popover} bg-sky-650 ${RADIUS.pill}`

/**
 * The recessed surface, and the boundary that closes it.
 *
 * One look for everything the panel sinks *into* rather than raises off it:
 * every text input (`FIELD`), the idle half of a segmented control, and the
 * calendar's day grid. The three were already the same fill by coincidence and
 * differed only in their border, which is exactly the drift that makes a panel
 * look assembled from parts — so they are one recipe now and cannot separate.
 *
 * The edge is slate-500 rather than the slate-600 the inputs used to carry,
 * because a component boundary owes 3:1 on **both** sides it separates
 * (WCAG 1.4.11) and slate-600 clears neither: 1.94:1 against the slate-800
 * panel outside and 2.36:1 against the slate-900 fill inside. slate-500 reads
 * 3.07:1 and 3.74:1. The fill step alone is 1.22:1, nowhere near enough to
 * carry the boundary by itself, so this is the line doing the work.
 *
 * Binding them therefore raised the inputs to spec rather than lowering the
 * calendar to match them.
 */
export const RECESSED_FILL = 'bg-slate-900'
export const RECESSED_EDGE = 'border border-slate-500'

/**
 * The same boundary, re-derived for the one surface that is a step lighter than
 * the panel: `SURFACE_POPOVER`.
 *
 * A recessed edge owes 3:1 on both sides, and slate-500 only manages that
 * against slate-800. On the popover's slate-700 fill it falls to 2.17:1, so the
 * segment and the coverage well would read as fills with no boundary. slate-400
 * is 3.94:1 against that fill and 7.0:1 against the slate-900 well inside it, so
 * both sides clear. The fill it closes is unchanged — only the line moves, and
 * only where the surface behind it did.
 */
export const LIFTED_EDGE = 'border border-slate-400'

/**
 * `TEXT.caption` re-derived for that same fill: a search result's description.
 *
 * The caption tier is slate-400, which is 5.7:1 on the panel and 3.94:1 on the
 * popover — under the 4.5:1 WCAG 1.4.3 asks of text. slate-300 is 6.97:1 on
 * the fill and 5.89:1 on a highlighted row (`bg-slate-600/50`), so it clears on
 * both grounds a result line is ever drawn on. Measured on the v4 oklch steps
 * 2026-09-14; the search dropdown is the only surface that needs it, and the
 * reason it does is that it moved from `SURFACE_FLOATING` to the popover.
 */
export const CAPTION_LIFTED = 'text-xs text-slate-300'

/**
 * The idle half of a segmented choice: the ranking direction toggle's unchosen
 * side, and the calendar's Hours toggle.
 *
 * `ACCENT.fill` above is the chosen half. Naming the pair is what makes the
 * second segmented control in the panel the *same* control rather than a
 * lookalike that drifted — the hazard #159-#165 spent five PRs on.
 */
export const SEGMENT_IDLE = `${RECESSED_FILL} text-slate-400 hover:text-slate-200`

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
 * No color here: the halves are `ACCENT.fill` and `SEGMENT_IDLE`, so a color
 * in this recipe would be a third one competing with them by stylesheet order.
 *
 * The width is fixed and the halves split it, so every segment in the panel is
 * the same size and every half within one is too. Sized to text, they were not:
 * Current/Dates measured 111px against Lowest/Highest at 119px, with halves of
 * 59/50 and 56/61. Stacked in one card that reads as three controls that failed
 * to line up. 144px is the measured floor plus slack — the widest label here is
 * "Highest" at 61px of content, so a 72px half leaves 11px.
 */
/**
 * The width every stacked panel control shares.
 *
 * The panel is a column of label-plus-control rows, so the controls line up on
 * both edges or the column looks ragged. They already shared a right edge; this
 * is the left one.
 *
 * It is 118px because that is 2 x `METRIC_BOX_W` + the Metrics grid's
 * `gap-x-1.5`, so the Forecast section's controls stand on exactly the edges
 * the bound boxes below them do and the whole panel reads as one column (TJ,
 * 2026-09-14). `styles.test.ts` does that sum from the roles rather than
 * trusting this sentence. It was 144px, set by the widest segment label, until
 * the Metrics table's label budget forced the narrower boxes and left the two
 * sections 26px apart.
 *
 * Nothing here is sized to its own content, which is the point: a control that
 * picks its own width cannot line up with the one above it. What that costs is
 * written down where it lands — see `SELECT`, which had to give the arrow's
 * slack back to make the model picker fit, and `SEGMENT_ITEM`'s inset.
 */
export const CONTROL_W = 'w-[118px]'

/**
 * The chart's metric select, the one control that borrowed `CONTROL_W` from
 * outside the panel and cannot follow it down to 118px.
 *
 * It lives in the results sheet, not the sidebar, so it lines up with nothing
 * above it and its labels carry their units: `Freezing level (ft)` measures
 * 99.3px at text-xs, where 118px of `SELECT` offers 84px of label. 144px
 * offers 110px, which clears it by 10.7px. Fixed rather than content-sized for
 * the reason #348 gave: a select that grows with its labels lets a sixth
 * metric wrap the row a phone can barely fit.
 */
export const CHART_METRIC_W = 'w-36'

/**
 * The width of the map's left column, which EVERYTHING in it wears: the search
 * field, the list of results under it, the Controls and Layers buttons, the
 * Layers popover and the legend box.
 *
 * They sit in one column on the left of the map, so differing widths read as a
 * ragged edge rather than as a column. It covered the three boxes first (the
 * popover and the legends had drifted a step apart); the buttons and the search
 * field were still sizing themselves — 128px, 128px and 301px against the
 * boxes' 192 — which is the edge TJ measured with a red line across a
 * screenshot on 2026-09-14.
 *
 * ## The number
 *
 * Measured in Chrome on macOS 2026-09-14 at the app's own type sizes, and TWO
 * things govern it within a pixel of each other:
 *
 *   - the grid legend's wait line, "Forecast grid" against "Waiting · 99s":
 *     74.7 + 8 + 74.1 = 156.8px of content, so 176.8px with the 20px of side
 *     padding a legend box carries. The countdown switches to minutes past 99s,
 *     so that row's widest case is bounded.
 *   - the search field at rest: 16px of icon, the 8px gap, and 134.6px of
 *     "Search for a destination" — 178.6px with the same 20px of padding.
 *
 * 184 leaves 5.4px over the wider of the two. It is 8px narrower than the
 * `w-48` it replaced, which is all the slack there was: at 176 (`w-44`) the
 * wait line wraps and the placeholder clips. Everything else in the column has
 * room to spare — the widest popover row, "Wildfires (US only)", needs 148.9px,
 * and the Controls button 107.6px. Re-measure before lengthening a line in any
 * of them.
 */
export const MAP_COL_W = 'w-46'

/**
 * The height of one row in that column: the search field and the two buttons.
 *
 * Fixed rather than derived from each row's contents, because the contents
 * differ — a glyph beside a label, a glyph beside an input and a clear cross —
 * and three rows that each solved for their own height came out 34, 38 and 38.
 * One number instead, floored at the 44px target on a finger the way `TAP`
 * floors every other control, and 36 on a pointer, which is the size the
 * column's own inset was already derived against (`LEGEND_TOP`).
 */
export const MAP_ROW_H = 'h-9 touch:h-11'

/**
 * The gap between members of that column: the field, the buttons, the legend
 * box, and the popover under the button it hangs from.
 *
 * 4px, half the 8px every one of them took before: a quarter off first, then
 * the same again once the tighter column was on screen (TJ, 2026-09-14).
 * It is a role rather than a `gap-1.5` at four call sites because
 * `LEGEND_TOP`'s arithmetic is built out of it: a gap changed in one of the
 * four would move the column's height without moving the inset that clears it.
 */
export const MAP_COL_GAP = 'gap-1'
/** The same gap as a top margin, for the popover that hangs rather than sits. */
export const MAP_COL_GAP_T = 'mt-1'

/**
 * How far anything floating on the map stands off its edge.
 *
 * One number, published once as a custom property on the map wrapper, because
 * the things that measure from these edges are not all the app's: the button
 * column and the legend stack are ours, and MapLibre's zoom/compass/geolocate
 * stack takes a margin the library spells for itself. Chosen separately they do
 * not line up — the column sat 12px in with the legends at 8px, so an open
 * popover hung 4px right of the boxes it hangs over, and the vendor's 10px left
 * its stack a step higher than the Layers button opposite it.
 *
 * The value is declared here rather than in `map.css` so the design system
 * still owns it: `map.css` reads the property and spells no number of its own.
 * Everything that wears `left`/`top` below is inside the wrapper, so the
 * property reaches all of them by inheritance — including the library's markup,
 * which has no call site to hand a role to.
 */
export const MAP_EDGE = {
  /**
   * On the map wrapper: publishes the inset to the app's chrome and the
   * vendor's, and the credit line's type size — the ramp's smallest step, the
   * second spelling of `MICRO_SIZE` — to `map.css`, which has no call site to
   * hand `TEXT.micro` to.
   */
  publish: '[--map-edge-inset:0.75rem] [--map-credit-size:10px]',
  /** The left edge every floating box on the map's left shares. */
  left: 'left-[var(--map-edge-inset)]',
  /** The top edge the app's own button column takes. */
  top: 'top-[var(--map-edge-inset)]',
} as const

/**
 * Where the legend stack hangs: one row of the column's own gap under the last
 * button, at both pointer sizes, in the column's two heights.
 *
 * Every row above it is `MAP_ROW_H` — 36 on a pointer, 44 on a finger — and
 * they are separated by `MAP_COL_GAP`'s 4px, so the arithmetic is the inset,
 * then a row and a gap per member:
 *
 *   search + Layers:            12 + 36 + 4 + 36 + 4 =  92
 *                               12 + 44 + 4 + 44 + 4 = 108
 *   search + Controls + Layers: + 36 + 4 = 132
 *                               + 44 + 4 = 156
 *
 * Spelled in pixels rather than on Tailwind's 4px spacing scale. Three of the
 * four land on it, but writing one of them as `top-33` and its neighbour as
 * `top-[132px]` would hide which numbers share a derivation. One form for all
 * four keeps the class and the sum above one thing rather than two.
 *
 * TWO heights because the Controls button exists only while the panel is
 * collapsed, and since the search field moved out of its row and above it
 * (TJ, 2026-09-14) that is a whole row rather than a neighbour. One inset for
 * both would leave 44px of dead space under the button whenever the panel is
 * open, which is the state a desktop is in by default — the same objection
 * that split the pointer sizes in the first place. Anything under the height
 * on screen collides: the stack's first rows paint BEHIND the buttons, which
 * are opaque and paint after the legends by design (see the ordering note in
 * `App.tsx`).
 *
 * Keyed on `touch` rather than on Tailwind's `pointer-coarse`, deliberately.
 * The heights above are `MAP_ROW_H`'s, and it is floored by `touch`
 * (`@media (hover: none)`, see index.css). A second query here would answer
 * differently on the devices the two disagree about — a hover-capable stylus
 * screen, a remote — and the inset would clear a column of a different height
 * than the one on screen.
 *
 * `resultsSheet.ts` holds the numbers (`LEGEND_TOP_PX`, `LEGEND_TOP_FINE_PX`),
 * because everything anchored below the stack measures off them, and
 * `resultsSheet.test.ts` reads this file as text so the classes and the
 * constants cannot drift.
 */
export const LEGEND_TOP = {
  /** The panel is open, so the column is the search field and Layers. */
  compact: 'top-[92px] touch:top-[108px]',
  /** The panel is collapsed and the Controls button stands between them. */
  full: 'top-[132px] touch:top-[156px]',
} as const

export const SEGMENT = `flex ${CONTROL_W} ${RADIUS.control} overflow-hidden ${RECESSED_EDGE}`
/**
 * The same segmented control sized by the box it is placed in, for a row whose
 * column is not the panel's.
 *
 * The third width a segment can have, and the three are exhaustive: `SEGMENT`
 * takes the panel's control column, `SEGMENT_FLUID` takes its own content, and
 * this one takes whatever it is given. It exists for the Metrics table's
 * direction row (#341), where the column is two grid tracks and the gap between
 * them rather than a width this file names. `CONTROL_W` now measures the same
 * 118px, but a fixed width in a grid cell states a number the tracks already
 * decide, and the two would drift the moment a box changed. Anything else in a
 * grid cell or a flex row that must match its neighbours rather than a named
 * column wears this.
 *
 * Its halves wear `SEGMENT_ITEM`, whose inset
 * has less room to spend on insets. See that recipe for the arithmetic.
 */
export const SEGMENT_FILL = `flex w-full ${RADIUS.control} overflow-hidden ${RECESSED_EDGE}`

/**
 * The metric rows' aggregate dropdown (#291): the one control that sits
 * BESIDE the shared control column rather than in it, so it takes its own
 * width and the metric label absorbs what is left.
 *
 * 4.5rem (72px) is a budget, not a taste. The row it sits in is the Metrics
 * grid's (#341): panel content is 327px, and a metric row spends 14px on the
 * radio, 10px on its label gap, 18px on its three gap-1.5 grid gaps, this
 * width on the dropdown and two `METRIC_BOX_W` boxes, leaving the label what
 * is left — and its longest noun, `Freezing level`, is measured at text-xs
 * in `styles.test.ts`, which pins the sum. The dropdown's own floor is its
 * content: the widest aggregate word measures 28px, plus the field's 8px
 * left padding and the 24px the SELECT recipe reserves for its arrow — 60px
 * (measured 2026-08-22, re-derived 2026-09-14 when SELECT gave 8px back).
 * The 12px of slack that leaves is deliberate: this width also sets a grid
 * track, so shrinking it to the floor would only widen a label that already
 * fits. Re-measure both sums before changing this, the box width, the grid
 * gap, or the nouns.
 */
export const SELECT_W_AGGREGATE = 'w-[4.5rem]'

/**
 * A segmented control OUTSIDE the panel's column, sized by its content.
 *
 * `SEGMENT` bakes in `CONTROL_W` because the panel's rows must line up on both
 * edges — but that width is the sidebar's, and a segment that lives elsewhere
 * inherits a straitjacket instead of an alignment. The results bar's
 * three-way mode switch shipped clipped for exactly this reason: three
 * icon-plus-label halves cannot fit in 144px, and `overflow-hidden` (needed to
 * clip the halves' corners to the radius) cut the third one off silently
 * rather than visibly. Anything segmented that does not sit in the panel's
 * control column wears this and takes the width its labels need.
 */
const SEGMENT_FLUID_SHAPE = `inline-flex ${RADIUS.control} overflow-hidden`
export const SEGMENT_FLUID = `${SEGMENT_FLUID_SHAPE} ${RECESSED_EDGE}`

/**
 * The same segment on `SURFACE_POPOVER`, which is a step lighter than the panel
 * the recessed edge was derived against.
 *
 * Shape and edge are split so the two cannot drift into different controls: the
 * only difference between them is `LIFTED_EDGE`, and `styles.test.ts` asserts
 * that. The divider BETWEEN the halves is untouched, because both of its sides
 * are well interior — the idle fill and the accent — so the surface behind the
 * popover never reaches it.
 */
export const SEGMENT_FLUID_LIFTED = `${SEGMENT_FLUID_SHAPE} ${LIFTED_EDGE}`

/**
 * The Metrics grid (#341): the ranking and the bounds in one table, one row
 * per metric, so the two cannot disagree about which metrics exist or in what
 * order, and the panel stops spending 484px on two sections that list the same
 * six things.
 *
 * Four columns: the label (with its radio, where the row can rank), the
 * aggregate dropdown, the floor box and the ceiling box. The last three are
 * `auto`, sized by the roles their controls wear — `SELECT_W_AGGREGATE` and
 * `METRIC_BOX_W` — so the header row and every box line up without the grid
 * restating a width. Under a single-hour window the dropdown column holds
 * nothing and every label spans it, which keeps one gap between the label and
 * the boxes rather than two. Nothing in the section is wider than the tracks it
 * spans: the direction segment wears `SEGMENT_FILL` over the two box columns
 * rather than `SEGMENT`'s `CONTROL_W`, so every control in the table shares the
 * boxes' two edges and a grid item can never stretch a track.
 *
 * This is the panel's widest row, and the budget is the label's: `Freezing
 * level` must fit beside a dropdown and two boxes at the panel's 327px of
 * content. `styles.test.ts` does that arithmetic from the measured noun, so a
 * wider box or a longer noun fails there instead of as an ellipsis, which is
 * how the old Ranking row shipped `Freezing le…` (#341).
 */
export const METRICS_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-1.5 gap-y-1.5'
/**
 * The one deliberate break inside the Metrics grid: the space above the two box
 * headings, separating the controls that order the list from the table of
 * bounds below them.
 *
 * Padding on every cell of the heading row rather than a margin on one of them,
 * because the four columns are grid tracks and a margin on a single item would
 * shift that item alone. It is deliberately not a rule: a rule of any weight in
 * this section read as a break the size of the one between whole sections,
 * which is the only thing that weight may say (TJ, 2026-09-14). It is also the
 * only vertical space in the grid that `gap-y` does not set, which is why it is
 * named here rather than spelled at the call site.
 */
export const METRIC_HEAD_GAP = 'pt-2'
/**
 * One box in the Metrics grid: a floor, a ceiling, or the Max results count.
 * Every numeric box in the section wears it, so a new control cannot pick a
 * width of its own and the two rows under the rule line up with the bounds
 * above them. 56px is the widest the label budget above allows and holds five
 * digits at text-xs inside the field's 8px insets, the spinner being off
 * (`FIELD_NUMERIC`).
 */
export const METRIC_BOX_W = 'w-14'
/**
 * One half of a segmented control: the shape, and the inset the panel's own
 * segments take.
 *
 * The two are split because the map timeline's halves need a wider inset and
 * nothing else about them differs (`TRANSPORT_AXIS_ITEM` below). Two `px-*`
 * utilities in one class list would resolve by stylesheet order rather than by
 * intent, so the inset is part of the recipe rather than something a call site
 * adds.
 *
 * The gap is here rather than at a call site for the same reason, and it costs
 * the panel's segments nothing: a half carrying one word has no second child to
 * be spaced from. It is the results bar's three halves that need it, where an
 * icon sits against its label (TJ, 2026-09-14).
 */
const segmentHalf = (flex: string) =>
  `${TAP.action} ${flex} gap-1.5 py-0.5 text-xs transition-colors ${FOCUS_RING}`
const SEGMENT_ITEM_SHAPE = segmentHalf('flex-1')
/**
 * One half of any segment in the panel.
 *
 * Every one of them is 118px now, so there is one inset rather than two: less
 * the 2px border and the 1px divider, a half is 57.5px, and an 8px inset
 * leaves 41.5px. `Current` measures 42.9px at text-xs and `Highest` 43.7px, so
 * both overrun it. 4px leaves 49.5px, clearing the wider of the two by 5.8px.
 * `styles.test.ts` does that sum from the roles rather than trusting this
 * sentence, so a wider word or a narrower segment fails there instead of on
 * screen.
 */
export const SEGMENT_ITEM = `${SEGMENT_ITEM_SHAPE} px-1`
/** Between two halves, never before the first. */
export const SEGMENT_DIVIDER = 'border-l border-slate-500'

/**
 * A radio or checkbox and the words naming it, as one strip.
 *
 * The panel had four of these (destination type, the ranking metrics,
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
  `has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ` +
  `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-400`
export const CHOICE_INPUT = `${ACCENT.input} flex-shrink-0 cursor-pointer align-middle`

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
 * A transient outline drawn around a control to point at it from somewhere
 * else: hovering the panel's Map group rings the map's search box,
 * which is a control the panel names but does not contain.
 *
 * A ring rather than a border or a fill, for the same reason `DAY.today` is
 * one: it layers onto a control that already has both without displacing it or
 * restating its own treatment.
 *
 * It stays in the accent rather than reaching for amber, which was the other
 * candidate. Every hue in this app carries a meaning and amber's is "something
 * is off" — the window warnings, the over-limit refusal, the failed wildfire
 * check. A yellow ring would say the search box had a problem rather than that
 * it is the thing being pointed at, and sky already means "the app acts here"
 * (see LINK_ACTION). What it buys instead is weight: four pixels and a glow,
 * because this has to register in peripheral vision two thirds of a screen
 * away while the eye is still in the sidebar, and a hairline ring at that
 * distance reads as an edge rather than as an answer.
 *
 * The glow is the whole shadow for whatever wears this, so a call site must
 * apply it to an element that is not already carrying `SURFACE_FLOATING`'s
 * shadow-lg — two shadow utilities on one element resolve by stylesheet order,
 * not by intent.
 *
 * Carries no radius, and that is load-bearing rather than an omission. A ring
 * is a box-shadow, so it fades out under `transition-shadow` while a corner
 * radius does not: bundling the radius in here meant that on un-hover the
 * corners squared off instantly and the still-visible ring spent the fade as a
 * rectangle standing off a rounded field. The element wearing this owns its
 * radius permanently, and only the ring toggles.
 */
export const ACCENT_RING = 'ring-4 ring-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.65)]'

/**
 * The box a status line sits in when it is a block rather than a sentence: the
 * forecast-window warning, the AQI-coverage note, the refusal remedies, the
 * error retry, and the failed wildfire check.
 *
 * There is no unboxed alternative any more. A `CUE` role used to hold the
 * centred, borderless variant, and the panel's footer showed both: a commit cue
 * as centred amber text directly above a blocker in an amber box, saying the
 * same kind of thing in two shapes for no reason a reader could act on. Every
 * message under the Analyze button is one of these three now, and severity is
 * the only thing that varies (`FooterNotice` in `ControlPanel.tsx`).
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
 * The stack of messages inside one notice box, and the rule between them.
 *
 * A box holding more than one message has to say where one ends and the next
 * begins. A bulleted list did that and cost the text column 16px of indent and
 * marker, which is more than the app's one-line message budget can spare: a
 * line written to fit a 360px phone wrapped as soon as a second message joined
 * it. A 1px rule separates them at no cost to the column.
 *
 * The rule is the box's OWN border tint, so the divider reads as part of the
 * box rather than as a second decision — which is why this is keyed by severity
 * beside `NOTICE` above, and why `styles.test.ts` fails a tint that stops
 * matching its border.
 *
 * The rule sits 6px clear on both sides. That space is padding on each row
 * (`NOTICE_DISMISS.row`) rather than a gap on this container: the rule is a
 * border on a row's own edge, so a margin between rows would put the whole gap
 * on one side of it. The negative margin here cancels the padding the first and
 * last rows would otherwise add to the box, so a box holding one message is
 * exactly as tall as it was.
 */
export const NOTICE_DIVIDER = {
  warn: '-my-1.5 divide-y divide-amber-800/60',
  error: '-my-1.5 divide-y divide-red-800/60',
  info: '-my-1.5 divide-y divide-sky-800/60',
} as const

/**
 * The X that dismisses one footer message (#253). Every message under the
 * Analyze button carries its own — a box dismisses line by line, not whole
 * (TJ, 2026-08-22); which dismissal it triggers, and when that dismissal
 * expires, is `utils/notices.ts`'s business, not this recipe's.
 *
 * Three parts, because the touch target and the visible control must be
 * different sizes. The `row` is the message the X belongs to and the hover
 * surface that reveals it. The `button` carries `TAP.action` in-flow, so on
 * touch the 44px target grows its own row rather than overhanging it —
 * the Analyze button sits directly above, and an absolutely-positioned
 * square would cover its bottom edge. The `pill` inside it is what the eye
 * gets: a 20px disc, the panel close button's idiom at notice scale, so the
 * X reads as a control rather than a stray character.
 *
 * The row centres its two members against each other. On a coarse pointer the
 * button is 44px tall and the message is one line, so the text sits level with
 * the disc rather than at the top of a target three times its height; on a
 * mouse the row is the text line itself and nothing moves. Every message is
 * written to fit one line, so there is no first line for the X to align to.
 *
 * The fill is `white/5` at rest — a whisper of a disc, because at `/10` TJ
 * read it as too buttony for a passive notice — rising to `white/15` on
 * hover, where the affordance question is actually being asked. Hue-free,
 * so one recipe sits on all three tints; the pill is an affordance, not the
 * boundary, and owes no ratio — the glyph is the icon and it does. The
 * glyph inherits its box's `STATUS` voice (a slate X would read as chrome
 * that escaped into a status message). Measured on the resting pill
 * backdrop (fill + white/5 over the panel): amber-300 9.10:1, red-400
 * 5.00:1, sky-300 7.45:1, all past the 3:1 a UI glyph owes; the hover's
 * white on the `white/15` hover fill is 8.9:1+. Pinned in styles.test.ts
 * so a fill or `STATUS` change forces a re-measurement.
 */
export const NOTICE_DISMISS = {
  /**
   * One message inside a notice box, whether it is the box's only line or one
   * of several. The named group (`group/notice`) is what reveals the X: the
   * button's own `group` is already taken by the pill's hover, and an unnamed
   * group here would hand the pill every row hover in the box.
   *
   * The lift (`white/[0.04]`) exists to bind the X to its row: in a stack of
   * messages the X alone does not say which one it belongs to. Arbitrary
   * rather than `white/5` so the row reads one step quieter than the pill
   * resting on it.
   *
   * The padding is the 6px each side of the rule `NOTICE_DIVIDER` draws
   * between two rows; the container cancels it at the box's own edges.
   */
  row: `group/notice flex items-center gap-2 py-1.5 ${RADIUS.control} hover:bg-white/[0.04]`,
  /**
   * Hidden until asked for: the X appears when the pointer rests on its row,
   * on keyboard focus, and is always on where hover does not exist (`touch:`)
   * — a hover-only control on a phone is a control that does not exist (the
   * tooltip rule, applied to a button). Opacity rather than `hidden`, so the
   * reveal can fade and the row never reflows.
   *
   * On a coarse pointer the target is 44px and the disc inside it is 20, and
   * the difference used to come out of the message beside it: the text column
   * was 257px on a 360px panel, where the longest commit cue needs 267. The
   * negative left margin hands those 24px back. Nothing moves on screen — the
   * button's box still ends at the row's right edge, so the centred disc sits
   * exactly where it did — and the target simply reaches further left, over
   * the tail of the text. That costs nothing, because the text is not a target
   * and a press on it has never done anything; what it buys is the one-line
   * budget every message in this app is written to, which is measured against
   * the column rather than against the box. `gap-2` on the row stays the
   * visible distance from the disc to the last word.
   */
  button:
    `group ${TAP.action} touch:-ml-6 opacity-0 transition-[color,opacity] ` +
    `group-hover/notice:opacity-100 focus-visible:opacity-100 touch:opacity-100 ` +
    `hover:text-white ${FOCUS_RING}`,
  pill:
    `flex h-5 w-5 items-center justify-center ${RADIUS.pill} ` +
    `bg-white/5 transition-colors group-hover:bg-white/15`,
} as const

/**
 * The three weights of rule in the app.
 *
 * `PANEL_EDGE` closes the panel: the line under the app title and the one over
 * the Analyze button. Those are structural — they separate the scrolling body
 * from the fixed chrome above and below it — so they are the heavier pair.
 *
 * `PANEL_RULE` separates one numbered step from the next *inside* that body,
 * and is the whole recipe rather than a colour, because Tailwind scans source
 * as raw text: a variant assembled from a template at a call site is a class
 * name that never appears anywhere, so no CSS is generated for it. Spelling it
 * out here is what makes it exist, and it keeps the decision in the design
 * system where the rest of the panel's chrome lives.
 *
 * Three things it settles:
 *
 * - **The weight.** slate-700 is 1.4:1 on the slate-800 panel, which is not a
 *   line anyone can see, and slate-600 at 1.94:1 read heavy once the gutters
 *   tightened. Half-opacity slate-600 lands between the two steps — a value
 *   the scale does not offer — which is the quietest this can be while still
 *   being a line. The panel's structural edges stay two steps above it at
 *   slate-500 (3.07:1), which is what keeps the two weights distinct.
 * - **The gap.** 16px on both sides, and equal is the part that matters. It
 *   was 20 and read as hugging the control above; 32/16 only moved the
 *   imbalance to the other side; 32/32 was balanced but left the panel mostly
 *   air. Symmetry does the separating, not size.
 * - **Where it is drawn.** From the stack, so a section added later cannot
 *   forget its line or draw a second one.
 *
 * `SURFACE_DIVIDER` is that same quiet line where the stack cannot draw it:
 * one rule a component places itself, between two blocks of one surface. The
 * dialog's header over its body, the popover's overline strip over its rows,
 * the month navigation under the calendar grid, the panel's own right edge
 * against the map. On the slate-800 panel and card it is 1.41:1, and
 * `PANEL_RULE` composites to 1.37:1 there — the same line by eye, which is the
 * point: a surface that has to place its own rule should not look like a
 * different kind of rule. What splits them is only whether the stack or the
 * call site decides WHERE, so a bare colour is all this one carries.
 *
 * It was `border-slate-700` at eleven call sites in eight files before it had a
 * name (#390), which is a third weight nothing had chosen and nothing could
 * change in one place. `styles.test.ts` now fails the literal anywhere under
 * `components/` or in `App.tsx`.
 */
export const PANEL_EDGE = 'border-slate-500'
export const PANEL_RULE =
  '[&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-slate-600/50 [&>*+*]:pt-4'
export const SURFACE_DIVIDER = 'border-slate-700'

/**
 * Step number badge in the welcome modal.
 *
 * The badge wears the accent fill with white text; the size and weight are
 * fixed here so every step reads the same. Layout (the flex row, centering,
 * margin) stays at the call site. Derived from `ACCENT.fill` rather than
 * restated so the color cannot drift.
 */
export const BADGE_STEP = `${ACCENT.fill} text-xs font-bold`

/**
 * A bordered region grouping controls inside the panel: today, the calendar.
 *
 * The border is deliberately brighter than anything else in the panel.
 * slate-500 clears the 3:1 asked of a meaningful UI boundary; the panel's own
 * section dividers are slate-700 at 1.4:1, and something that quiet cannot
 * make a block of controls read as one object — which is the whole job here.
 *
 * It now also carries a recessed fill, which this comment used to warn against
 * on the grounds that `DAY.range` is sky-950, "legible on slate-800 and nearly
 * invisible on slate-900". Measured against the Tailwind v4 palette the app
 * actually ships, that is backwards. sky-950 sits at L 29.3%, within a point
 * and a half of slate-800's 27.9% — which is why the range band reads by hue
 * rather than by lightness today, at 1.05:1 — while slate-900's 20.8% puts
 * real lightness between them. Every ratio in the calendar improves or holds:
 *
 * | on slate-800 → slate-900 | | |
 * | --- | --- | --- |
 * | day text (slate-200) | 11.90 | 14.49 |
 * | dimmed day + today ring (slate-400) | 5.58 | 6.79 |
 * | this border (slate-500) | 3.07 | 3.74 |
 * | range band (sky-950) | 1.05 | 1.28 |
 *
 * Crucially `DAY.range` itself does **not** move, so the selected end still
 * reads against it at the pinned 3.04:1 and `--color-sky-650` needs no
 * re-derivation. The coupling the old comment feared only bites if the range
 * band changes; darkening what sits *under* it does not.
 */
export const SURFACE_GROUP = `${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.surface}`

/**
 * Cancels a SURFACE_GROUP well's inset so its CONTENTS sit on the panel's
 * control column: the well grows outward instead of pushing its children in.
 * Without this, a segmented control inside a well ends 9px left of the same
 * control outside one — the calendar's Hours row against the When row above
 * it — and the panel's right edge stops being one line.
 *
 * 9px = the 8px of `p-2` the well's call sites use plus the 1px RECESSED_EDGE
 * border. A well that changes its padding must change this with it;
 * styles.test.ts pins the sum so the drift is a red test, not a crooked column.
 */
export const SURFACE_GROUP_BLEED = '-mx-[9px]'

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
 * - `unservable` (slate-600, ~2.6:1) — outside what Open-Meteo serves.
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
 *   the one place the ramp is lost, because white is what reads on the accent.
 *   Two cells out of a range, and the panel's air-quality warning covers the
 *   window as a whole. **This cell is why the accent fill is a custom shade:**
 *   the end of a range has to stay findable against `range` right beside it, so
 *   sky-950 here is the tightest of the four edges the fill answers to and the
 *   one that sets its dark limit (3.04:1, where sky-700 would be 2.37:1).
 *   Changing `range` moves that limit — re-derive `--color-sky-650` if it does.
 *
 * `today` is a ring rather than a fill, so it can coexist with any of the above
 * (today is frequently also selected). slate-400 clears the 3:1 for a boundary.
 */
export const DAY = {
  /**
   * The cell box itself. Seven columns split the calendar card, and the card's
   * width is the drawer's minus the gutters: at the 360px panel (#238) a phone
   * drawer is 100vw − 2rem, so a 375px phone yields ~295px of card and ~42px
   * cells — closer to the 44px target than the old 320px drawer's ~38px, but
   * still the one control in the app that cannot promise 44 on both axes,
   * because the width is the phone's to give. Height it can have, and a
   * calendar's mis-taps are overwhelmingly vertical: the columns are a whole
   * finger apart in meaning (a week) while the rows are a day.
   */
  cell: 'flex h-9 touch:h-11 items-center justify-center',
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
 * theirs rather than override it. The tap target does *not* — `TAP.height` is
 * a minimum, so it composes with either inset instead of fighting it, which is
 * the whole reason the rule is written as a height and not as padding.
 */
export const FIELD =
  `${TEXT.control} ${TAP.height} ${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.control} ` +
  'focus:outline-none focus:border-sky-500 placeholder-slate-400'

/**
 * A numeric field with the browser's spinner arrows suppressed.
 *
 * The arrows cost roughly 16px of every field's inner width and buy a pair of
 * 8px tap targets nobody aims at: a phone shows a number pad, a mouse has the
 * arrow keys, and the value is typed either way. That trade is invisible on one
 * wide field and decisive in the filters grid (#115), where ten of them sit
 * two-to-a-row beside a label. Reclaiming the arrows is what lets a row read
 * "Precipitation (in)" on one line instead of wrapping to two.
 *
 * Every numeric input in the app composes this, including the wide ones that
 * did not need it. The grid made the difference visible: two number fields in
 * one panel wearing different chrome reads as an oversight, not as a decision
 * about column widths.
 *
 * Both spellings are needed: `appearance: textfield` is what Firefox reads, and
 * the two pseudo-elements are what WebKit and Blink read.
 */
export const FIELD_NUMERIC =
  `${FIELD} [appearance:textfield] ` +
  '[&::-webkit-outer-spin-button]:[appearance:none] [&::-webkit-inner-spin-button]:[appearance:none]'

/**
 * The same recessed surface for a native `<select>`.
 *
 * Composed from `FIELD` rather than written afresh so a dropdown and a text
 * input cannot drift apart, plus the two things a select needs that an input
 * does not:
 *
 * - `appearance-none`, because the platform control paints its own chrome from
 *   the *system* palette, not ours: on a light-mode OS the popup and its arrow
 *   render dark-on-light inside a dark panel. Suppressing it costs the arrow,
 *   which the call site draws back as an inline SVG in `ICON_ADORNMENT` — one
 *   glyph we control on every platform, rather than one we control on none.
 * - `pr-6`, reserving the room that arrow sits in. It belongs here and not at
 *   the call site because it is not decoration: without it a long option label
 *   runs underneath the arrow. 24px is the arrow's own box and nothing more:
 *   `ICON_ADORNMENT` puts a 16px glyph 8px from the edge, so it occupies 8px
 *   to 24px and a label may run to that line. It reserved 32px until the panel
 *   column came down to 118px, where the spare 8px was the difference between
 *   `UK Met Office` (79.7px) fitting the model picker and truncating (TJ,
 *   2026-09-14). The glyph is drawn inside its box with its own margin, so the
 *   text does not touch the mark.
 *
 * `<option>` elements are deliberately left alone. Their rendering is the
 * platform's — several browsers ignore author styles on them outright — so
 * styling them would produce a control that matched the design system on some
 * machines and not others, which is worse than one that consistently does not.
 */
export const SELECT = `${FIELD} appearance-none pr-6`

/**
 * What a control looks like when it does not apply.
 *
 * One role rather than a pair of utilities re-spelled at each call site, which
 * is what it was in four places before the model picker needed a fifth. Faded
 * rather than hidden: a control that vanishes takes its label and its last value
 * with it, and a reader who set that value is owed the sight of it. No color of
 * its own, so it composes over any button or field role without racing it by
 * stylesheet order.
 */
export const DISABLED = 'disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * What a control looks like when it is not the one in force, but still works.
 *
 * The opposite claim to `DISABLED` above, and the reason the two cannot share a
 * recipe. `DISABLED` says a press will do nothing, and its cursor promises
 * that; this says a press still does what it always did, it is just not the
 * answer the panel is currently reading. Unnamed peaks with Peaks unticked is
 * the clearest case: ticking it turns Peaks on. A `cursor-not-allowed` on any
 * of these would be a lie the pointer tells before the reader finds out.
 *
 * Quieter than nothing and louder than off: 50% against `DISABLED`'s 40%, and
 * unscoped rather than behind the `disabled:` variant, because none of these
 * elements is disabled and the variant would never fire.
 *
 * Three sites spelled it before it had a name (#390). No colour of its own,
 * for the same reason `DISABLED` carries none: it composes over whatever role
 * the control already wears instead of racing it by stylesheet order.
 */
export const MUTED = 'opacity-50'

/**
 * Text that exists for assistive technology and takes no space on screen.
 *
 * The twin of an approved tooltip (#123 review). A `title` is a pointer's
 * affordance: it does not exist on touch, and a screen reader is not promised it
 * either — so where a disabled control's reason is worth a tooltip, the same
 * sentence is also mounted here and pointed at by `aria-describedby`. One recipe
 * rather than the utility spelled at each call site, for the reason every role
 * here exists: the second spelling is where the two drift.
 */
export const SR_ONLY = 'sr-only'

/**
 * The map timeline's scrubber (#121).
 *
 * A real `<input type="range">` rather than a div with a drag handler, and that
 * is the load-bearing decision here: it arrives knowing arrow keys, Home and
 * End, it announces itself and its value to a screen reader, and a finger drags
 * it because the platform makes it. A hand-rolled track would owe every one of
 * those and would ship with none of them.
 *
 * What the platform does *not* give is a look — it paints from the system
 * palette, so a light-mode OS renders a pale track inside a dark map card, the
 * same problem `SELECT` documents. So `appearance-none` on the input and on
 * both thumb pseudo-elements, then the track and thumb drawn here.
 *
 * The two vendor spellings are both required and neither is redundant: WebKit
 * and Blink read `::-webkit-slider-thumb`, Firefox reads `::-moz-range-thumb`,
 * and a browser ignores the other one entirely. They are written as separate
 * arbitrary variants rather than a grouped selector because Tailwind scans this
 * file as raw text and generates a rule per variant it finds.
 *
 * The thumb is white on the accent-filled track for the same reason the
 * `ACCENT.fill` label is: white is what reads on this blue, and the thumb is
 * the one part that has to be findable at a glance while it moves. It is 14px,
 * which is under the 44px target — deliberately, and it is the exception
 * `TAP.grip` already argues for: the control is a horizontal drag on a bar that
 * is itself the target, so the height that matters is the input's, and the
 * thumb is a mark on it rather than a thing to hit.
 */
const SLIDER_THUMB =
  '[&::-webkit-slider-thumb]:[appearance:none] [&::-webkit-slider-thumb]:h-3.5 ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:[appearance:none] [&::-moz-range-thumb]:h-3.5 ' +
  '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white'

export const SCRUBBER =
  'w-full h-2 appearance-none cursor-pointer bg-transparent ' +
  `${FOCUS_RING} ` +
  SLIDER_THUMB

/**
 * The coverage slider's range input (#288), laid over a track the caller
 * draws — the well, the accent fill, and the in-track line are its siblings,
 * so the input itself is transparent and full-bleed. Same real
 * `<input type="range">` argument as `SCRUBBER` above, and the same two
 * vendor spellings for the same reason. The thumb is a slim full-height bar
 * rather than the scrubber's dot: it marks the fill's edge, and a dot at
 * that edge sat on top of the value the fill carries.
 */
const SLIDER_BAR_THUMB =
  '[&::-webkit-slider-thumb]:[appearance:none] [&::-webkit-slider-thumb]:h-6 ' +
  '[&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:rounded-sm ' +
  '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:[appearance:none] [&::-moz-range-thumb]:h-6 ' +
  '[&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-sm ' +
  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white'

export const SLIDER_OVERLAY =
  'absolute inset-0 h-full w-full appearance-none cursor-pointer bg-transparent ' +
  `${FOCUS_RING} ` +
  SLIDER_BAR_THUMB

/** The slider's value readout: the colorless control size above. */
export const SLIDER_VALUE = CONTROL_SIZE

/**
 * The other half of the same line: the slider's in-track wordmark.
 *
 * The same size as the value beside it (`CONTROL_SIZE`) and in sentence case,
 * so the slider reads as one line of one control rather than two labels of
 * different ranks — and so it matches the Blocks/Smooth segment directly above
 * it, which is the app's rule everywhere (TJ, 2026-09-14). It used to wear
 * `TEXT.overline`'s shape, a 10px uppercase with letter-spacing, which is the
 * shape of a heading OVER a group rather than of a label inside a control.
 *
 * The weight is what still separates the two halves: `font-semibold` names the
 * control where the value states its number, at one size and one color.
 *
 * Colorless, like `CONTROL_SIZE` itself. The line renders twice — muted on the
 * recessed well, and white where the accent fill has reached (the fill layer is
 * `ACCENT.fill`, whose label color is not separable from it) — so the color
 * belongs to the layer, never to this shape.
 */
export const SLIDER_WORDMARK = `${CONTROL_SIZE} font-semibold`

/**
 * The coverage slider's un-filled text layer: the same idle slate the resting
 * segment wears, carried by the layer rather than the shape so the filled
 * copy of the identical line can be white without two colors racing.
 */
export const SLIDER_IDLE = 'text-slate-400'

/**
 * The rail the scrubber slides on, drawn as the element behind it.
 *
 * A separate element rather than styling `::-webkit-slider-runnable-track`,
 * because the filled portion has to be a third box on top of it and a
 * pseudo-element cannot carry one. Same recessed surface as every other well in
 * the app, so the bar reads as part of the same system as the calendar and the
 * fields — the fill is `ACCENT.mark`, the app's bare accent graphic, which is
 * what the analysis progress bar already is.
 */
export const SCRUBBER_TRACK = `h-2 ${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.pill}`

/**
 * The floor under a timeline axis half: what `Radar` takes, so the metric
 * beside it is never the narrower of the two.
 *
 * `Radar` measures 33.02px at text-xs and the half spends 12px of inset on
 * each side, so the half is 57.02px and 58px is that rounded up. The right
 * half spends one of those pixels on the divider between them, which is the
 * whole difference between the two at rest. Both halves wear the floor, so a
 * one-word metric — `AQI` is 20.14px, `Wind` 28.95px — stands as a matching
 * pair beside Radar rather than as the short half of a lopsided one (measured
 * in Chrome on macOS, 2026-09-14).
 *
 * Spelled twice on purpose. `TAP.action` carries `touch:min-w-11` for the
 * icon-only buttons that have no width of their own, Tailwind v4 resolves
 * competing utilities by stylesheet order rather than by class list, and the
 * variant's rule is the later one — so on a coarse pointer a single plain
 * `min-w` here would be overridden and the floor would drop to 44px, which is
 * under `Radar`. The value is one number in one role either way.
 */
export const TRANSPORT_AXIS_W = 'min-w-[58px] touch:min-w-[58px]'

/**
 * The timeline's axis halves: Radar beside the metric the report ranks by.
 *
 * The one segment whose labels this file does not choose. The right half is
 * whatever metric the report ranks by, spelled by `metrics.ts` — the longest of
 * them are "Freezing level", "Temperature" and "Precipitation" — where every
 * other segment in the app carries a word picked to fit the control. So it
 * takes one step more horizontal inset than `SEGMENT_ITEM`, and it is the one
 * half that sizes itself to the label it was handed.
 *
 * Three things follow from that, and only those three. `whitespace-nowrap`,
 * because a half whose label is a phrase wraps where a half whose label is one
 * word cannot: `Freezing level` broke over two lines and made the bar taller
 * than the strings it was carrying. `flex-none` in place of the panel half's
 * `flex-1`, because a segment of two equal halves is a segment sized to its
 * longer label twice over — the metric half has to take the width its own
 * label needs and leave Radar the width of `Radar`. And `TRANSPORT_AXIS_W`,
 * the floor that keeps a one-word metric from being the runt beside it.
 *
 * The flex value and the floor are one decision, not two. An explicit
 * `min-width` REPLACES the automatic content floor a flex item otherwise has,
 * so a floored half that could still shrink squeezed `Freezing level` to 81px
 * of a label that needs 103 and spilled it over its own insets — measured in
 * the running app, 2026-09-14. `flex-none` is what makes the floor a floor.
 *
 * The inset is the slack that keeps a long noun clear of the clip. This segment
 * is `SEGMENT_FLUID`, sized by its own content and `overflow-hidden` so the
 * halves' corners follow the radius, which means a label that fills its half to
 * the last pixel has nowhere to lose one: the longest nouns read as too wide for
 * the half they sit in (TJ, 2026-09-13). Re-measure here before shortening it,
 * and remember the widest case is a metric name rather than a string this file
 * controls.
 *
 * Everything else is `SEGMENT_ITEM`, and `styles.test.ts` asserts that, so the
 * bar cannot become a second kind of segment.
 */
export const TRANSPORT_AXIS_ITEM = `${segmentHalf('flex-none')} px-3 whitespace-nowrap ${TRANSPORT_AXIS_W}`

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
  /**
   * One data row: the rule above it and what it does under the pointer.
   *
   * Both bodies wear it — the pending destinations waiting on a forecast and
   * the ranked results under them — and they had spelled it separately, which
   * is how a hover could have come to mean two things in one table.
   *
   * Half-opacity slate-700 rather than `SURFACE_DIVIDER` itself: a rule
   * between two blocks of a card is drawn once, and this one is drawn twenty
   * times down a screen, where the full weight reads as a grid. `group` is
   * load-bearing rather than decorative — the rank cell's remove × appears on
   * `group-hover`, so a row that forgets it is a row that cannot be removed
   * with a pointer.
   */
  row: 'group border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors',
  /**
   * The rank cell's two faces, the number and the remove ×, laid in ONE grid
   * cell so the column is as wide as the wider face at all times and a hover
   * trades only visibility. Swapping them with display let the column grow by
   * the icon's extra width on every hover and shove every column to its right
   * (#339). Touch devices have no hover and place the × in a second column
   * beside the number instead: the `.row-remove` rule in index.css.
   */
  rankStack: 'inline-grid items-center justify-items-center',
  rankFace: 'col-start-1 row-start-1',
} as const
