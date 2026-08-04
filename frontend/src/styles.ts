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
 * Material's 48dp. Bluebird takes the 44, and takes it where a control stands
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
 * Glyph sizing for inline SVG icons paired with text: the results-bar mode
 * toggle, the columns picker. 16x16 at default density; visible as text width
 * shrinks below breakpoints.
 */
export const ICON = 'h-4 w-4'

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
  /** The analysis overlay, over the map while a run is in flight. */
  overlay: 'z-20',
  /** The scrim behind the mobile drawer, and the preview banner. */
  scrim: 'z-30',
  /** The mobile drawer itself. */
  drawer: 'z-40',
  /** Anything opened from inside the drawer, which must clear it. */
  popover: 'z-50',
  /** Modal dialogs, and the shield that swallows pointer events mid-drag. */
  modal: 'z-[60]',
} as const

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
 * is the left one. The segmented control set it — two halves need room for
 * "All Day" and "Hourly" side by side — and everything beside it follows rather
 * than each row picking its own.
 *
 * The filters grid derives from it rather than repeating it: two boxes plus
 * their `gap-x-2` (0.5rem) must total this, which is why each is `4.25rem`.
 */
export const CONTROL_W = 'w-36'

export const SEGMENT = `flex ${CONTROL_W} ${RADIUS.control} overflow-hidden ${RECESSED_EDGE}`

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
export const SEGMENT_FLUID = `inline-flex ${RADIUS.control} overflow-hidden ${RECESSED_EDGE}`

/**
 * The forecast-bounds grid: a label taking the free space, then a lower and an
 * upper box.
 *
 * The two boxes plus the gap between them come to exactly `CONTROL_W`, so the
 * grid lines up with the model picker and the segmented controls on BOTH edges
 * rather than only on the right. That arithmetic is the whole reason the boxes
 * are `4.25rem` and not a round number, so `styles.test.ts` checks it instead of
 * trusting this sentence: change `CONTROL_W` and the sum has to be redone.
 */
export const BOUNDS_GRID =
  'grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-center gap-x-2 gap-y-2'
export const SEGMENT_ITEM = `${TAP.action} flex-1 px-2 py-0.5 text-xs transition-colors ${FOCUS_RING}`
/** Between two halves, never before the first. */
export const SEGMENT_DIVIDER = 'border-l border-slate-500'

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
 * else: hovering the panel's Destinations caption rings the map's search box,
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
 * The two weights of rule in the control panel.
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
 */
export const PANEL_EDGE = 'border-slate-500'
export const PANEL_RULE =
  '[&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-slate-600/50 [&>*+*]:pt-4'

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
 * The unboxed status line.
 *
 * Boxed messages (`NOTICE.*`) get their size from the role's own text-xs. Unboxed
 * status lines that sit alone need their own size, and compose with `STATUS.*`
 * for color. This lives at text-xs so both paths size to the same step.
 *
 * Example use: the "model-changed" cue telling the user that the forecast window
 * was shortened by a model change.
 */
export const CUE = 'text-xs text-center'

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
 * - `pr-8`, reserving the room that arrow sits in. It belongs here and not at
 *   the call site because it is not decoration: without it a long option label
 *   runs underneath the arrow.
 *
 * `<option>` elements are deliberately left alone. Their rendering is the
 * platform's — several browsers ignore author styles on them outright — so
 * styling them would produce a control that matched the design system on some
 * machines and not others, which is worse than one that consistently does not.
 */
export const SELECT = `${FIELD} appearance-none pr-8`

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
