/**
 * One type ramp, at two densities.
 *
 * Bluebird Forecast has two kinds of surface. The working chrome — control panel,
 * results table, map legends, chart — is dense: you scan it while doing
 * something else. The reading surfaces — the welcome and privacy dialogs, and
 * the analysis overlay card — are wide, and you read them once, carefully.
 *
 * They are not two scales. The dialog title is the panel header's title, one
 * size for both since #687 (both are the name of the surface they head), and
 * the dialog subtitle is the caption step one size up, the same recipe the
 * tagline under the app title wears, and both say "Weather Window Finder"
 * (record 0222).
 * And the reading tier's small step lands exactly on the compact tier's base,
 * so the two share the 12px rung rather than running past each other. Naming
 * them as one ramp keeps a dialog from drifting into a second look.
 *
 * Within a tier, roles separate by weight and color, not only by size: two
 * sizes cover the whole compact tier because `subheading` and `control` share
 * both a size and a color and let weight alone distinguish "Polygon search"
 * from "Peaks". Roles that stand in that relationship are composed from
 * a shared constant below rather than spelled out twice, so the relationship
 * is something a test can assert instead of a comment that rots.
 *
 * Status text is not in the ramp. Warnings, errors and progress lines use the
 * base size with a semantic color (amber, red, sky, green) because there the
 * color carries the meaning, not the hierarchy.
 *
 * Every colour utility in this file names a semantic token rather than a
 * palette step (#706; record 0158): `text-ink-soft` rather than the
 * slate-400 text it was, `bg-panel` rather than the slate-800 fill. `index.css` gives
 * each token two values, the dark theme's Tailwind step and the light theme's
 * measured hex, so a role is written once and paints both themes. Where a
 * comment below names a slate or sky step, it is the token's DARK value, and
 * the ratio beside it is the dark theme's; `styles.test.ts` measures the same
 * pairs for light off the values in `index.css`.
 */

/**
 * The 11px step, for chrome that must not compete with what it labels.
 *
 * This step lands on three background lightnesses — the slate-900/85 map
 * legends, the slate-800/95 chart tooltip, and the slate-700 table header bar
 * — and two of its sites are attributions a license requires people to be
 * able to read. slate-300 is the dimmest step clearing 4.5:1 on all three:
 * 6.97:1 on the header bar, the lightest, and 7.65 and 8.45 on the other two
 * even over white. slate-400, where these sites had drifted, manages only
 * 3.94:1 on the header bar.
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
 * two spellings to one number, which is the only place that can be done, and
 * the chart's ticks a third time (`CHART_TICK_PX` in `utils/chartColors.ts`),
 * since Recharts takes a number rather than a class.
 *
 * 11px since #687, which made this the floor for text that is read: it was
 * 10px, and 10px read as a smudge on the calendar's weekday row and under the
 * player. 12px is the floor for anything pressed, which is why no button or
 * link wears this step (the linter's `style-micro-not-pressed` check). The
 * exception is a credit, which is this step's own job: the map's attribution
 * line, Open-Meteo's link on it included, is links that sit
 * inside an attribution line rather than controls a reader goes looking for.
 * The one size left under the step is `GLYPH_SIZE` below, inside a box of
 * fixed size.
 * Re-measured at 11px: the calendar's weekday row, the player's marks and
 * the model picker's reach column (record 0131).
 */
export const MICRO_SIZE = 'text-[11px]'
const MICRO = `${MICRO_SIZE} text-ink-mid`

/**
 * The one size under the floor, for a glyph inside a box whose size is fixed
 * by something else: the legend strip's numerals in their 11px scrim band
 * (`SWATCH_RAMP_TICK`) and the smoke key's letters in their chips
 * (`SWATCH_CHIP`). Named so it reads as the exception it is rather than as a
 * step of the ramp (#687): nothing here is prose, and each is measured against
 * its box. Spelled for `MICRO_SIZE`'s reason.
 */
const GLYPH_SIZE = 'text-[10px]'

/**
 * The base size, stepped back: secondary text that is read, not scanned.
 *
 * This step lands on the slate-800 panel, cards and dialogs. slate-400 is the
 * dimmest step clearing 4.5:1 there (5.56, and 6.78 on slate-900 fields);
 * slate-500, where this tier sat through #159, managed 3.1:1 — receding on
 * purpose, but past what AA permits for text. Brightening it made the tagline
 * under the app title the same recipe, so what had been two roles is one, and
 * as with MICRO above, a call site cannot dim it back. (#165)
 */
const CAPTION = 'text-xs text-ink-soft'

/** The compact tier: panel, table, map chrome, chart. */
export const TEXT = {
  /**
   * The panel's section headings: Destinations, Forecast, Metrics. slate-300
   * (9.83:1 on the slate-800 panel) rather than the slate-400 (5.56:1) it wore
   * until #687, where it read dimmer than the slate-200 subheading under it
   * and a heading outranked by its own sub-block is no heading. It keeps the
   * 14px size, the weight and the tracking that already set it above the
   * subheading; only the step moved (the maintainer's option B, 2026-10-13).
   */
  section: 'text-sm font-bold uppercase tracking-wider text-ink-mid',
  /** The single call to action, deliberately a step up from the panel body. */
  cta: 'text-sm font-semibold',
  /** Panel identity in the header. Outside the body ramp on purpose. */
  appTitle: 'text-lg font-bold text-ink-strong leading-tight',
  /** Named sub-blocks: Map search, Polygon search, a calendar's month. */
  subheading: 'text-xs font-semibold text-ink',
  /**
   * Anything you read or type in a control (radio labels, inputs, pickers)
   * and the label beside a field: Model, When, Rank by, Hours. One weight for
   * every field label, so none reads as a heading over the others (record
   * 0222).
   */
  control: 'text-xs text-ink',
  /** Secondary text: the app tagline, a place's description, a dialog's note. */
  caption: CAPTION,
  /** Prose that explains a control without being one. */
  helper: `${CAPTION} italic`,
  /** Tiny all-caps labels: the model list's group heads and columns, the player's axis. */
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
  /**
   * The dialog's name: the panel title's own recipe since #687, because both
   * name the surface they head. It was a size up, which put a second title
   * size in the ramp for no difference a reader could name.
   */
  title: TEXT.appTitle,
  /** The line under it saying what the dialog is for. */
  subtitle: 'text-sm text-ink-soft',
  /** A heading inside the body copy. */
  heading: 'text-sm font-semibold text-ink-strong',
  /** Body copy. */
  body: 'text-sm text-ink-mid',
  /**
   * Inline emphasis — the lead-in naming what a sentence is about. The one
   * role that sets no size: it modifies whatever it sits inside.
   */
  strong: 'font-semibold text-ink-strong',
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
 * the two: a data credit in a caption is a link *and* an 11px line, and had
 * they disagreed the class list would not have decided which won. It is also
 * the dimmest step that keeps every link in the app readable — several of
 * these sat at 3.1:1 by inheriting the prose around them.
 *
 * `LINK_ACTION` is a command that stands as words rather than as a button: a
 * menu's Reset all, Restore all and Remove all, and a sheet's Done. Sky at rest
 * says a thing acts, so it is kept to commands. The results table's
 * destination names wore it until #786, and read as text now (`LINK_QUIET`).
 *
 * `LINK_QUIET` is a link inside the content itself, in the colour of the text
 * it stands in: the results table's names, a linked value and a footnote mark
 * (the maintainer, 2026-10-21 on PR #789, record 0212). Nothing marks it at
 * rest at a desk; a hover underlines it, and so does keyboard focus, the cue
 * WCAG's technique G183 asks of a link that colour cannot tell apart. A touch
 * screen has no hover, so there it wears a thin underline at rest in the
 * secondary ink, which a finger can find: 5.5:1 on the dark panel and 7.47:1
 * at the least on a light surface. The faint ink, one step quieter, measured
 * 2.6:1 on the popup's grid band, under the 3:1 the one cue that marks a link
 * owes. The marker popup's links read the same way (`[data-popup-link]` in
 * `map.css`).
 *
 * Neither sets a size, because a link takes the size of the sentence holding
 * it. That means they belong inside text a role has already sized — put one on
 * a bare element and it inherits the browser's 16px, which is how the Options
 * section briefly got a Clear button twice the size of everything near it.
 */
export const LINK = 'text-ink-mid hover:text-accent-ink underline'
export const LINK_ACTION = 'text-accent-ink hover:text-accent-ink-hover hover:underline'
export const LINK_QUIET =
  'cursor-pointer underline-offset-2 hover:underline focus-visible:underline touch:underline touch:decoration-ink-soft'
/**
 * A link that cannot answer right now, said through `aria-disabled` because
 * an anchor has no `disabled` of its own: the footer's Tutorial while a draw
 * or a run is under way (#536). `DISABLED`'s 40 percent and cursor, spelled
 * on the aria variant, so an inert link and a disabled button read as one
 * state. Colourless for the same reason `DISABLED` is, and it keeps the
 * underline, because a link that loses it stops looking like a link rather
 * than like one that is waiting.
 */
export const LINK_INERT = 'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed'

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
 * Material's 48dp. Bluebird Forecast draws a finger's controls 32px tall and
 * presses what it draws (record 0223): past the AA 24 with room to spare,
 * where 44 read chunky on a phone and stood a stack of rows, a calendar or the
 * Metrics list a quarter taller than its content. A control that stands in a
 * band of its own on the map or the results sheet, the chips (`CHIP_HIT`) and
 * the results bar's buttons (`BAR_PRESS`), still presses 44 around what it
 * draws, because nothing above or below it is a target. A button that draws
 * no box of its own, a glyph or a word, takes 44px of width, which a row has
 * to give; a round or square button draws its own box and is no wider
 * (`HEADER_BUTTON`, `TRANSPORT_PLAY`).
 *
 * It does **not** reach into the results panel — not the table's rows, not the
 * two header bars, not the search field. Those are surfaces you read rather
 * than operate, and every pixel a control takes there is a pixel of ranking or
 * of map that a phone stops showing. A finger's 32px table row would show 18
 * rows of a phone's ranking where 28 shows 21, and a 32px chevron would cost
 * its bar for good. The
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
 * never writes one: the linter (`tools/eslint/eslint.config.js`) fails any
 * source that spells a `touch:` utility of its own.
 *
 * `min-h` rather than padding, because padding has to be re-derived per font
 * size to land on the same number — which is how BUTTON_PRIMARY's `py-3` came
 * to be the only control in the app that actually met the target.
 *
 * The keys are layouts, not sizes. Three reach 32 by different routes, because
 * three kinds of control lay their contents out differently and one display
 * value would have been wrong for two of them.
 */
export const TAP = {
  /** A button: grow the box, keep its own label centered inside it. */
  action: 'touch:min-h-8 touch:min-w-11 flex items-center justify-center',
  /** A left-aligned strip — a label and its radio. Growing it is the point; centering it would move the label. */
  row: 'touch:min-h-8 flex items-center',
  /** Height alone, for anything that already lays its own content out: a two-line list item. */
  height: 'touch:min-h-8',
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
 * How far a surface stands off what is under it: three answers, two of which
 * cast a shadow (#687).
 *
 * There were five depths for three jobs, each picked where it was worn: a
 * docked banner at one, the floating map chrome at another, the dialogs and a
 * dragged column at a third, the Layers menu at a fourth and the range thumbs
 * at a fifth. A reader cannot tell five depths apart, and what a depth should
 * say is only which of three things a surface is.
 *
 * - `none`: docked. The panel, the results and the phone sheet sit in the
 *   page rather than on it, and so does the preview banner. Tailwind's
 *   shadows cast downward, so a docked surface has nothing for one to fall
 *   on anyway.
 * - `raised` (`shadow-lg`): resting on the map, the chrome a reader reads
 *   past: the search field, the two map buttons, the legend, the player, the
 *   chart tooltip.
 * - `overlay` (`shadow-2xl`): opened above other chrome, the things a reader
 *   acts in and then closes: every menu, every card over a scrim, and a column
 *   being carried. `2xl` rather than `xl`, measured on the search list: `xl`
 *   is two layers at 0.1 black alpha and `2xl` one 50px blur at 0.25. Over
 *   the light basemap both register, but a menu can hang over the dark
 *   results sheet, where 0.1 alpha on a near-black surface is nothing at all.
 *
 * The glows are not on this scale: `ACCENT_RING` and the tutorial's spotlight
 * point at something rather than lift it. Nor is the marker popup's header
 * band, whose faint shadow is the card's own (`popupChrome.ts`, record 0123).
 */
export const ELEVATION = {
  none: 'shadow-none',
  raised: 'shadow-lg',
  overlay: 'shadow-2xl',
} as const

/**
 * Boxes that float over the map: the search field and its dropdown, the
 * Controls button, the legend, the chart tooltip.
 *
 * Most of those were already byte-identical. The legends were not — they ran a
 * darker fill and a darker border, so the map carried two different ideas of
 * "floating box" within a few hundred pixels of each other. There is one legend
 * box now (#454), the key and the layers sharing it.
 *
 * Its edge is the structural one every menu wears (`SURFACE_CHIP_CARD`), as
 * is every card's here and in `SURFACE_CARD`, so one floating card has one
 * rim (record 0222). The quiet `frame` token measures under the 3:1 a
 * boundary owes on the card's own fill (1.93:1 dark, 2.51:1 light), so no
 * floating card wears it.
 */
export const SURFACE_FLOATING =
  `bg-floating/95 border border-edge ${RADIUS.surface} ${ELEVATION.raised} backdrop-blur-sm`

/**
 * The ground every full page stands on: the app's root, the standalone pages'
 * frame, and the error boundary's fallback. The fallback is the one that forced
 * a name, because it replaces the whole tree it guards and so cannot borrow the
 * ground from the component that just failed. Three spellings of one fill are
 * how the three would come to disagree about what "the page" looks like.
 */
export const SURFACE_PAGE = 'bg-page'

/**
 * Opaque cards that sit above a scrim: the dialogs, the analysis overlay and
 * the tutorial's card. `ELEVATION.overlay` since #687, where it wore the `xl`
 * step alone; over the scrim the step hardly shows. A menu stands on the chip
 * card's surface instead (`SURFACE_CHIP_CARD.menu`, record 0201), and both
 * wear the same structural edge (record 0222).
 */
export const SURFACE_CARD =
  `bg-panel border border-edge ${RADIUS.surface} ${ELEVATION.overlay}`

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
export const SURFACE_SHEET =
  `bg-panel border-t border-frame rounded-t-lg overflow-hidden ${ELEVATION.none}`

/**
 * How a menu comes and goes (#714; record 0201): it fades in and slides 4px
 * from its trigger's side over 150ms, leaves the same way back, and does
 * neither where the reader asked their system for less. `MOTION.menu` is this
 * value; it is declared up here because the chip cards below wear it, and a
 * const read before its declaration is a temporal-dead-zone throw.
 *
 * The same animation in both directions, the maintainer's rule for motion.
 * `@starting-style` (Tailwind's `starting:`) gives a card the faded, shifted
 * style for the frame it mounts in, so the browser transitions it in with no
 * script. A close keeps the card mounted with `data-state="closing"`, which
 * transitions it back to that style, for as long as the transition runs
 * (`useExit`, which reads the time off the card rather than copying it). Its
 * presses pass through while it goes, so a reader who closed it by pressing
 * the map is not stopped by its ghost.
 *
 * Down from above, the way a card under its trigger drops, and back up as it
 * goes; a card that had to open above its trigger (`data-side="above"`, which
 * `Menu` writes) rises from below instead and sinks back.
 */
const MENU_MOTION =
  'transition-[opacity,translate] duration-150 ease-out starting:opacity-0 starting:-translate-y-1 ' +
  'data-[side=above]:starting:translate-y-1 data-[state=closing]:pointer-events-none ' +
  'data-[state=closing]:opacity-0 data-[state=closing]:-translate-y-1 ' +
  'data-[side=above]:data-[state=closing]:translate-y-1 motion-reduce:transition-none'

/**
 * The two cards a desk's map chips open (#714; record 0174), and since record
 * 0201 every desk menu: the legend card under Legend, the Layers menu under
 * Layers, and the card `Menu.tsx` draws for every other trigger, the search
 * list included. One fill and one edge for all, because they are twins:
 * controls that each open a card under them, so a reader takes each as what
 * that control opened, and two looks would ask them to find a difference that
 * is not there (TJ, 2026-10-18).
 *
 * The fill is the chips' own colour (`bg-floating`), opaque: under the
 * calendar the frosted 95% let the Analyze button show through, so every menu
 * and both chip cards went solid (TJ, 2026-10-20), and with nothing seen
 * through them the blur went too. The chips themselves keep the frosted fill.
 * The edge is the structural one, `PANEL_EDGE`'s slate-500, rather than the
 * quiet frame, because the Layers menu opens across the legend card and its
 * outline is what separates the two there: slate-500 reads 3.07:1 on the
 * slate-800 card and 4.24:1 on the light theme's, where the frame manages
 * 1.93:1 and 2.51:1. Both clear the 3:1 a boundary owes (WCAG 1.4.11), and the
 * segment and the coverage well inside the menu keep the recessed edge they
 * wear on the panel, which was derived against this same slate-800.
 *
 * The shadow is what differs: the legend rests on the map with the chips
 * (`ELEVATION.raised`), and a menu stands over it (`ELEVATION.overlay`), the
 * step every menu takes. Two finished recipes rather than a base and a shadow
 * added at the call site, so the linter can hold each card to its own.
 */
const CHIP_CARD_FACE = `bg-floating border border-edge ${RADIUS.surface} ${MENU_MOTION}`
export const SURFACE_CHIP_CARD = {
  /** The legend card, which rests on the map like the chips. */
  key: `${CHIP_CARD_FACE} ${ELEVATION.raised}`,
  /** Every menu, which opens over whatever is under it. */
  menu: `${CHIP_CARD_FACE} ${ELEVATION.overlay}`,
} as const

/**
 * A map popup's card: the floating card's corners, its structural edge and
 * the overlay step, on the content box MapLibre builds, which has no call
 * site, so `map/mapPopups.ts` adds these classes to each popup as it opens.
 * The fill stays the popup's own (`--popup-surface` in `map.css`). MapLibre's
 * 3px corners and faint shadow sit in the base layer and lose to these
 * utilities, so a popup reads as the app's floating card (record 0222).
 *
 * The edge is a 1px ring outside the box rather than a border inside it: the
 * ranked card's cap (`RESULT_POPUP_MAX_WIDTH_PX`) holds its widest grid to
 * the pixel, and a border took 2px of that room, so a two-digit total
 * scrolled on a 360px phone. A ring composes with the shadow and draws the
 * same line a card's border does.
 */
export const POPUP_FACE = `ring-1 ring-edge ${RADIUS.surface} ${ELEVATION.overlay}`

/**
 * The accent, named by the jobs it does, because it does six.
 *
 * Every one of these was spelled at a call site before, in fourteen places
 * across five files, which is how the fill and the button that wears it came to
 * disagree about their own contrast. The rule this section exists to make
 * enforceable is in `tools/eslint/eslint.config.js`: **no component names a hue.** A component
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
 * that window, which is where the derivation lives. White reads 4.56:1 on it,
 * and it holds 3.20:1 on the panel, 3.04:1 on `DAY.range` and 3.91:1 on the
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
 *
 * ## The light theme paints the same shade
 *
 * The light fill and mark are this sky-650 too (the maintainer's call on PR
 * #733), so the accent is one colour in both themes. On the light grounds the
 * label keeps its 4.56:1 and every edge has more room than the dark ones: 4.06
 * on the panel, 3.54 on the range band and 3.17 on its hover, the tightest.
 * Only the hover differs, for the reason on `fillHover` below. The accent as
 * text does not follow: sky-650 reads 4.06:1 on the light panel, under 4.5,
 * so `accent-ink` stays the darker `#00639b` there.
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
  fill: 'bg-accent text-on-fill',
  /**
   * The hover step for a fill that is a button: `BUTTON_PRIMARY` and the
   * inline `BUTTON_ACCENT`.
   *
   * In light it darkens, to `#00639b` (white 6.45:1): there the app's other
   * hovers darken too, so the direction that gains contrast is also the one
   * that matches.
   *
   * In dark it still lightens, matching every other hover there. That is the
   * one state left below AA: white on sky-600 is **4.02:1** against 4.5. It cannot
   * be fixed by lightening less, because with a white label *every* lightening
   * costs contrast — a conformant hover would have to darken, making the app's
   * one primary action the only control that dims under the pointer.
   *
   * Kept deliberately, and it is a strict improvement on what it replaced: the
   * hover used to be sky-500 at 2.71:1. 4.02:1 is also exactly the ratio the
   * *resting* fill carried before #167, so no state is worse than what the app
   * already shipped, and the state you read while not touching it now passes.
   */
  fillHover: 'hover:bg-accent-hover',
  /** The accent as a bare graphic with nothing on it: the progress bar's fill. */
  mark: 'bg-mark',
  /**
   * Native checkbox and radio tint, at the one size every one of them wears.
   * Six inputs across three files had the tint, and five of the six the size;
   * the chart's metric radio had drifted to the browser default.
   */
  input: 'accent-mark h-3.5 w-3.5',
  /** Resting accent text that is not a link: the table's detail-sort arrow. */
  text: 'text-accent-ink',
  /** An icon or control reaching for the accent on hover. */
  hoverText: 'hover:text-accent-ink',
  /** The accent on a boundary rather than a fill, in the two states that use it. */
  edgeHover: 'hover:border-accent-ink',
  edgeFocus: 'focus-within:border-accent-ink',
} as const

/**
 * The visible keyboard-focus indicator for interactive controls.
 *
 * Fires only on focus-visible, not on pointer focus, so mouse users see no
 * change while keyboard users get a clear outline. The outline is 2px with a
 * 2px offset, and uses sky-400 which comfortably clears the 3:1 boundary
 * contrast on the slate-800 panel.
 */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink'

/**
 * `FOCUS_RING` drawn inside the element's edge rather than 2px outside it: the
 * results table's sortable headers.
 *
 * A header sits in a sticky bar at the top of a scroll box, so an outer ring
 * loses its top edge to the box's clip, the first column loses its left edge
 * the same way, and the bottom edge lands on the first row, whose metric
 * cells wear band fills this role cannot measure against. Drawn inside, the
 * whole ring stands on the bar's own slate-700, where sky-400 is 4.75:1. The
 * ring never reaches a row, so a hovered one (slate-700 at 30% over the
 * slate-800 sheet, 6.10:1) cannot hide it either. Same width and colour as
 * `FOCUS_RING`, so a keyboard reader meets one indicator in two placements.
 */
export const FOCUS_RING_INSET =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink'

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
 * restyled the label. `TAP.action` states a finger's height directly, and
 * states it the same way as every other control in the app (#160).
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
  `bg-raised hover:bg-raised-hover ${FOCUS_RING}`

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
 * The size is set bare rather than by composing `TEXT.control`: that role
 * carries a colour of its own, which would race `ACCENT.fill`'s white by
 * stylesheet order and could not be overridden here. (The error box's
 * `BUTTON_DANGER` first fell into exactly that, and `styles.test.ts` pins the
 * rule since; the role itself went with #736, which made Analyze the one
 * retry.)
 */
export const BUTTON_ACCENT =
  `text-xs ${TAP.action} px-3 py-1.5 ${RADIUS.control} transition-colors ` +
  `${ACCENT.fill} ${ACCENT.fillHover} ${FOCUS_RING}`

/**
 * The Polygon row (#687): the mode button, Cancel and Clear, always the three,
 * a third of the panel each, so the row stands on the edges the coordinates
 * box above it does.
 *
 * The two button roles at a 4px inset rather than 12px, and nothing else
 * changed. In a third the cell sets the width and the label is centred in it,
 * so the inset is only the floor under the widest label, `Draw polygon`
 * (77.4px at 12px on a Mac): at 12px a side it needs 101.4px, where a third of
 * the row is 100.3px on a desktop and 93px on a 360px phone (the row is
 * 317px and 295px, less two 8px gaps), so the label would wrap; at 4px it
 * needs 85.4px and fits both. Derived from the roles rather than spelled
 * again, so the fill, the type and the tap target cannot drift from the
 * buttons everywhere else.
 */
export const DRAW_ROW = {
  row: 'grid grid-cols-3 gap-2',
  secondary: BUTTON_SECONDARY.replace(' px-3 ', ' px-1 '),
  accent: BUTTON_ACCENT.replace(' px-3 ', ' px-1 '),
} as const

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
 * `ACCENT.fill`'s white on `--color-sky-650` measures 4.56:1, so the label
 * clears AA at this size without the fill needing a shade of its own.
 *
 * The type is spelled out rather than composed from `TEXT.overline`, for the
 * same reason `BUTTON_ACCENT` above spells its size: that role carries
 * slate-300, which would race `ACCENT.fill`'s white by stylesheet order rather
 * than by class order, so the winner would not be decidable from this line.
 * `styles.test.ts` caught exactly that when this was written the short way.
 * The size is `MICRO_SIZE` itself rather than a number of its own, so it
 * follows the ramp's smallest step (#687).
 */
export const BADGE_ACCENT =
  `${MICRO_SIZE} font-semibold uppercase tracking-wider ` +
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
 * fill against the neutral chip beside it measures 2.27:1, under the 3:1 that
 * WCAG 1.4.11 asks of a boundary carrying meaning on its own. A resting chip
 * SHOWS its remove ×, an active one shows the same slot empty, and the row
 * carries a header naming what the highlight means, so the state survives a
 * reader the fill does not reach. The labels are above the text floor in both
 * states — white on `--color-sky-650` is 4.56:1 (the derivation is in
 * `index.css`) and slate-200 on slate-700 is 8.4:1.
 *
 * The size is spelled bare rather than composed from `TEXT.control`, for the
 * reason `BADGE_ACCENT` above spells its own: that role carries slate-200,
 * which would race `ACCENT.fill`'s white by stylesheet order rather than by
 * class order, so the winner would not be decidable from this line.
 */
export const CHIP = {
  /** A selected member that is not the one in force. */
  rest: `${CHIP_SHAPE} bg-raised text-ink`,
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
 * A button floating over the page rather than sitting in a panel: the skip
 * link's look while it has the keyboard (`SKIP_LINK`).
 *
 * It was the map's two buttons' too, Controls and Layers in the desk's column,
 * until #714 gave a desk the phone's chips (`MAP_CHIP`). The skip link kept
 * it: it is one word on the floating surface, pressed with a keyboard, and a
 * chip's capsule would read as one more chip in the map's row.
 *
 * Its label is `CONTROL_SIZE`, colorless, so the ink below does not race it by
 * stylesheet order. It takes `SURFACE_FLOATING` whole and adds what
 * pressability needs: the accent on hover, and a pressed state. Layout stays
 * at the call site, the way `FIELD` leaves padding to the control that wears
 * it.
 */
export const BUTTON_FLOATING =
  `${SURFACE_FLOATING} ${CONTROL_SIZE} font-semibold text-ink-strong transition-colors ` +
  `${ACCENT.edgeHover} ${ACCENT.hoverText} active:bg-raised ${FOCUS_RING}`

/**
 * The preview-deployment banner, the one surface that is deliberately loud.
 *
 * It lived as a local constant inside its own component, which is the same
 * bespoke-recipe problem as the accent had, just with only one call site to
 * drift from. White on red-600 reads 4.76:1, so it clears AA as it stands.
 *
 * Docked, so `ELEVATION.none` (#687): it sits in the page above the panel and
 * the map like the panel sits beside the map, and it was the one docked
 * surface casting a shadow.
 */
export const BANNER_PREVIEW =
  'flex-shrink-0 bg-red-600 text-on-fill text-center text-xs sm:text-sm ' +
  `font-semibold py-1.5 px-4 ${ELEVATION.none}`

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
 * usual reason, and so does the size, which is `GLYPH_SIZE`, the named
 * exception under the ramp's floor. It was 9px in a 14px box, the one 9px
 * text in the app; a 10px letter does not fit a 14px box inside its own
 * border, so the box grew to 16px instead (#687). The other keys stay 14px:
 * this one is three chips side by side, read against each other.
 *
 * The one palette step left in this file, and it is the same in both themes
 * (#706): the chip's fill is the smoke layer's own colour, which the theme
 * does not touch because the map does not change, so the letter on it does
 * not either.
 */
export const SWATCH_CHIP =
  `inline-flex h-4 w-4 items-center justify-center ${RADIUS.control} border ` +
  `${GLYPH_SIZE} font-semibold text-slate-900`

/**
 * A legend swatch for a layer that draws LINES: a 14px dashed rule with no
 * fill, the width of a single-value key (the fire's and the area closure's
 * 14px squares) so it lines up in the same column.
 *
 * The closed-trail layer (#550) is a dashed line on the map, and a filled
 * square beside its label would say "area", which is the other closure layer's
 * key. Two pixels thick against the map's 2.5, because at 14px long a heavier
 * rule reads as a bar. The colour is the layer's own, passed in as a value for
 * `SWATCH_EDGE`'s reason: the border IS the swatch here, and a colour class
 * beside an inline one would resolve by stylesheet order.
 */
export const SWATCH_LINE = 'inline-block w-3.5 flex-shrink-0 border-t-2 border-dashed'

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
 * ground to be read against — slate-200 on this one measures **6.48:1** at its
 * worst, on that same cyan-300, where a text-shadow would be carrying the
 * legibility and no test could measure it.
 *
 * It takes the strip's lower 11px and leaves the colour the upper 7, which is
 * within a pixel of the whole strip before the numbers moved in. Full width
 * rather than a chip per number, so the numbers read along one baseline on one
 * ground instead of as four dark blocks punched through a six-band scale.
 */
export const SWATCH_RAMP_SCRIM =
  'pointer-events-none absolute inset-x-0 bottom-0 h-[11px] bg-recessed/70'

/**
 * One number on that band: 10px, `GLYPH_SIZE`, on the scrim. It stayed at 10
 * when the ramp's floor rose to 11 (#687), because the band is measured for a
 * 10px numeral and the strip's height for the band.
 *
 * `relative` lifts it over the scrim, which is a later sibling in paint order.
 * `leading-none` is what lets a 10px numeral sit in an 11px band at all, and
 * the 2px of side padding keeps the first and last numbers off the strip's own
 * edges without moving a centred one, which pads symmetrically.
 */
export const SWATCH_RAMP_TICK =
  `relative whitespace-nowrap px-0.5 pb-px ${GLYPH_SIZE} leading-none text-ink`

/**
 * The edge every legend swatch wears, as a VALUE rather than a class.
 *
 * A CSS variable rather than a hex since #706, so it follows the theme without
 * the legend re-rendering: an inline `border-color` resolves `var()` the way a
 * class does. Its dark value is the v3 slate-600 it always was, and its light
 * value the light theme's outline (`--ui-swatch-edge` in `index.css`). It is
 * the app's quiet outline, the line `SURFACE_FLOATING` draws — a swatch is
 * chrome holding somebody else's colour, so its border is the app's and its
 * fill is not. It has to be a value because the fill beside
 * it is one: Tailwind resolves two competing colour utilities by stylesheet
 * order, so a border colour class on a span carrying an inline
 * `borderColor` would be a race rather than a rule. It was this hex spelled at
 * four call sites in `App.tsx` until #454.
 */
export const SWATCH_EDGE = 'var(--ui-swatch-edge)'

export const ICON_ACTION = `text-ink-faint ${ACCENT.hoverText}`

/**
 * A bare icon button: the glyph alone, no surface. The results' collapse
 * chevrons wear it, and so does every × inside a card or a field (record
 * 0222): the tutorial card's, the search's clear (`ICON_CLOSE_BUTTON`), and
 * in their own markup a popup's (`map.css`) and a message's
 * (`NOTICE_DISMISS`). A round button is for a header's close alone.
 */
export const ICON_BUTTON = `px-1 text-ink-soft hover:text-ink-strong transition-colors ${FOCUS_RING}`

/**
 * A bare × with free room around it, the tutorial card's and the search
 * field's, and a 44px press on a coarse pointer: an invisible box 10px
 * either side of the 24 by 16 button and 14px above and below it, the way
 * the chips take theirs (`CHIP_HIT`). The results' chevron keeps
 * `ICON_BUTTON` alone, because the phone's bar stands 5px under it and a
 * box that reached it would take the bar's presses.
 */
export const ICON_CLOSE_BUTTON =
  `${ICON_BUTTON} relative touch:before:absolute touch:before:-inset-x-2.5 touch:before:-inset-y-3.5 ` +
  "touch:before:content-['']"

/**
 * A glyph drawn inside a field rather than beside it: the chevron a `SELECT`
 * reserves its room for (`MENU_CHEVRON.field` at a desk, and the phone's two
 * native selects).
 *
 * `pointer-events-none` is the load-bearing part — the arrow overlays the
 * control it decorates, and without it the one place a user aims for is the one
 * place that does not open the dropdown. slate-400 is 7.0:1 on the recessed
 * fill, well past the 3:1 a UI glyph owes.
 */
export const ICON_ADORNMENT =
  'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-soft'

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
 * — every box below comes out the same at both widths, a chip being as wide
 * as its name — and the number that decided
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
   * row is the search pill's 40px (`MAP_PILL`), which is even: a 16px box
   * centres on 12px of clear space, a 15px box on 12.5. The row also holds two
   * 16px boxes already — the clear cross, and the spinner that stands in its
   * place — which sit at that same 12px. So the odd step bought nothing and
   * cost a half-pixel, on the one glyph in the row that was off the pixel grid
   * and the one that was off the scale.
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
  `animate-spin ${RADIUS.pill} border-2 border-edge border-t-accent-ink`

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
  /**
   * The Controls sheet's dim on a phone (record 0207): over the map, its
   * chrome and the results sheet, under the sheet.
   */
  scrim: 'z-30',
  /**
   * The panel on a phone: the Controls sheet (record 0141), one layer over
   * its own dim (record 0207). Below `popover`, so a sheet opened from
   * inside the panel stands over it.
   */
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
 * The skip link (#576): the page's first Tab stop, which jumps past the panel
 * to the map. Hidden until it has the keyboard, and then the floating button
 * the map's own two buttons are, over everything, in the top-left corner a
 * keyboard reader is already looking at.
 *
 * Transparent and unpressable rather than `sr-only` while idle, because
 * `sr-only` positions the element too and two competing `position` utilities
 * resolve by stylesheet order, not by intent. Transparent, it stands over the
 * corner without catching a press meant for what is under it.
 */
export const SKIP_LINK =
  `${BUTTON_FLOATING} fixed left-2 top-2 ${LAYER.modal} px-3 py-2 ` +
  'pointer-events-none opacity-0 focus:pointer-events-auto focus:opacity-100'

/**
 * Moving a column (#360, #437): the grip it is dragged by, the column it was
 * lifted out of, the copy under the pointer and the line where it will land.
 * One object since #687, because they are five parts of one gesture that two
 * surfaces draw (the table header and the Columns picker) and five exports
 * made them read as five unrelated roles.
 */
export const DRAG = {
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
  grip:
    `cursor-grab touch-none text-ink-faint hover:text-ink active:cursor-grabbing ` +
    `transition-colors ${FOCUS_RING}`,
  /** The grip while its column is the one being moved. */
  gripActive: 'text-ink',
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
   * the pointer is already holding it. Not `MUTED` either, which is the 60 percent
   * of a control that works but is not the one in force; this one is not faded for
   * what it does, but for where it is.
   */
  carried: 'opacity-40',
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
   *
   * Its depth is the card's, `ELEVATION.overlay`: it spelled a shadow of its
   * own beside the card's until #687, two shadow utilities racing by
   * stylesheet order.
   */
  ghost:
    `${TEXT.control} pointer-events-none fixed ${LAYER.popover} -rotate-1 opacity-80 ` +
    `${SURFACE_CARD} px-2 py-1 whitespace-nowrap`,
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
  insert: `pointer-events-none fixed ${LAYER.popover} bg-accent ${RADIUS.pill}`,
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
 * (WCAG 1.4.11) and slate-600 clears neither: 1.93:1 against the slate-800
 * panel outside and 2.35:1 against the slate-900 fill inside. slate-500 reads
 * 3.07:1 and 3.74:1. The fill step alone is 1.22:1, nowhere near enough to
 * carry the boundary by itself, so this is the line doing the work.
 *
 * Binding them therefore raised the inputs to spec rather than lowering the
 * calendar to match them.
 */
// Neither is exported (#687): every surface that sinks into the panel
// composes them here, and a call site takes the finished `FIELD`, `SEGMENT`,
// `SEGMENT_IDLE`, `SLIDER.track` or `SLIDER.well`.
const RECESSED_FILL = 'bg-recessed'
const RECESSED_EDGE = 'border border-edge'

// What a field looks like, without how big it is (#696): the control type in
// the recessed fill and edge at the control radius. `FIELD` adds the tap
// height and the focus edge; `CHART_TITLE` wears it at 28px with an invisible
// 44px select over it, which is why the look and the size are two things.
const FIELD_LOOK = `${TEXT.control} ${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.control}`

/**
 * `TEXT.caption` re-derived for that same fill: a search result's description.
 *
 * The caption tier is slate-400, which is 5.7:1 on the panel and was 3.94:1
 * on the slate-700 list the search results stood on until record 0201 — under
 * the 4.5:1 WCAG 1.4.3 asks of text. slate-300 was 6.97:1 there and 5.89:1 on
 * a highlighted row (slate-600 at 50%), measured on the v4 oklch steps
 * 2026-09-14. The list stands on the menu card's slate-800 now, where both
 * grounds are darker and every ratio here only grows, and keeps this ink.
 *
 * The results sheet's header bar is the second slate-700 fill a caption lands
 * on: the window caption beside the ranked title. slate-400 is 3.93:1 there
 * (axe measured it in the browser suite) and slate-300 is 6.97:1, so it takes
 * this role rather than `TEXT.caption`, which stays on the panel's step.
 */
export const CAPTION_LIFTED = 'text-xs text-ink-mid'

/**
 * A search result's kind beside its name: the lifted caption at the app's
 * heading weight, so a list of places with similar names still reads by what
 * each one is at a glance (the maintainer on #796; record 0222).
 */
export const SEARCH_KIND = `${CAPTION_LIFTED} font-semibold`

/**
 * The idle half of a segmented choice: the ranking direction toggle's unchosen
 * side, and the calendar's Hours toggle.
 *
 * `ACCENT.fill` above is the chosen half. Naming the pair is what makes the
 * second segmented control in the panel the *same* control rather than a
 * lookalike that drifted — the hazard #159-#165 spent five PRs on.
 */
export const SEGMENT_IDLE = `${RECESSED_FILL} text-ink-soft hover:text-ink`

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
 * above it and its labels carry their units, an hour's (record 0222):
 * `Precipitation (in/hr)` measures 109.0px at text-xs in Chrome on macOS
 * (2026-10-22), where 118px of `SELECT` offers 84px of label. 152px offers
 * 118px, which clears it by 9px; the 144px it was left under a pixel once the
 * label gained its `/hr`. Fixed rather than content-sized for the reason #348
 * gave: a select that grows with its labels lets a sixth metric wrap the row a
 * phone can barely fit.
 */
export const CHART_METRIC_W = 'w-38'

/**
 * The chart's plot under a finger (#336; record 0144): the browser keeps the
 * vertical pan, so a drag up or down still scrolls the results sheet, and
 * hands the horizontal one to the chart, which reads the hour under the
 * finger as a mouse's hover does. Without it a sideways drag was the
 * browser's too, and the chart never heard the finger move.
 */
export const CHART_PLOT_TOUCH = 'touch-pan-y'

/**
 * A phone chart's metric picker, as the plot's title (#696, record 0149): the
 * metric's full label with its unit in the app's own select, at the plot's
 * top left, `CHART_TITLE_INSET_PX` (12px, `top-3 left-3`) from the grip's
 * rule above it and the sheet's edge, the results bar's own inset, and the
 * same 12px over the plot's top label (`TITLED_PLOT_MARGIN`). The field row above the plot was
 * 44px a phone's chart could not spare, and a plain title did not read as a
 * control, so it is look 4 of the second picker mockups (TJ 2026-10-14): the
 * desktop picker's look shrunk to its label. `box` wears `FIELD_LOOK`, the
 * recessed fill, edge and radius every select here wears, with `SELECT`'s
 * `pr-6` holding the chevron in `ICON_ADORNMENT`'s place, and it sizes to
 * its words rather than to `CHART_METRIC_W`. It is 28px tall (`h-7`), which
 * is `CHART_TITLE_PX` and what `TITLED_PLOT_MARGIN` reserves over the plot,
 * so nothing the plot draws, its dashed lines and their labels included,
 * meets the box. `select` is the native select laid over it, transparent, so
 * a tap opens the phone's own picker; 44px tall on a coarse pointer, centred
 * on the box, so it reaches 8px into the room on either side and meets
 * neither the rule nor the plot's label. The focus edge
 * is `FIELD`'s, moved to the box because the select is invisible.
 */
export const CHART_TITLE = {
  box:
    `absolute left-3 top-3 z-[1] flex h-7 max-w-[calc(100%-1.5rem)] items-center ` +
    `${FIELD_LOOK} pl-2 pr-6 has-[select:focus]:border-mark`,
  text: 'min-w-0 truncate',
  select: 'absolute inset-x-0 top-1/2 -translate-y-1/2 h-full touch:h-11 w-full cursor-pointer appearance-none opacity-0',
} as const

/**
 * The width of a chip's menu on a desk (#714): the Layers menu and the legend
 * card, each unfurling out of its chip in the row under the search pill.
 *
 * A chip is its word's width, 65 to 70px, and both menus need more, so each is
 * wider than its chip and stands under it from its left edge (`MAP_CHIP_MENU`).
 * The two share the width so a reader who opens one over the other sees one
 * edge.
 *
 * ## The number
 *
 * Measured in Chrome on macOS 2026-09-14 at the app's own type sizes: the grid
 * legend's wait line, "Forecast grid" against "Waiting · 99s", is
 * 74.7 + 8 + 74.1 = 156.8px of content, so 176.8px with the 20px of side
 * padding a card carries. The countdown switches to minutes past 99s, so that
 * row's widest case is bounded. 184 leaves 7.2px; at 176 (`w-44`) the wait
 * line wraps. The widest Layers row, "Forecast player", needs 130.0px
 * (measured 2026-10-07). Re-measure before lengthening a line in either.
 *
 * It was the width of the whole left column until #714, when the search field
 * became the pill and the buttons became chips at both widths.
 */
export const MAP_MENU_W = 'w-46'

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
   * hand `TEXT.micro` to. And the map's own height, as a size container: a
   * desk's legend card hangs from its chip in the rows and scrolls inside
   * what is left of the map below them (`legendMaxPx`), which only `cqh` can
   * read from inside the rows without measuring the map in script.
   */
  publish: '[--map-edge-inset:0.75rem] [--map-credit-size:11px] [container-type:size]',
  /** The left edge every floating box on the map's left shares. */
  left: 'left-[var(--map-edge-inset)]',
  /**
   * The right edge, for the one box that spans the map: the phone's draw bar
   * (`DRAW_BAR`), which stands the same inset off both sides.
   */
  right: 'right-[var(--map-edge-inset)]',
  /** The top edge the map's rows take. */
  top: 'top-[var(--map-edge-inset)]',
  /**
   * On a phone, where the app's two rows span the map's top (#696), the
   * vendor's stack, which is the compass alone there, starts one inset below
   * them rather than beside the pill: 92 + 12. While a ring is drawn the draw
   * bar stands under the rows (`MAP_ROWS.drawBar`, 46px tall at 100), so the
   * stack starts one inset under it instead: 100 + 46 + 12. `map.css` reads
   * `--map-vendor-top` as the stack's top margin, and `styles.test.ts` holds
   * both numbers to the rows' geometry.
   */
  belowRows: '[--map-vendor-top:104px]',
  belowDrawBar: '[--map-vendor-top:158px]',
} as const

/**
 * The draw bar on a phone (#687): while a ring is being drawn, the panel's
 * readout and its Done and Cancel stand on the map, because Draw polygon
 * closes the drawer on a phone and left the map with no way to finish but
 * reopening Controls.
 *
 * A floating box like the player it stands in place of, the map's own inset
 * off both sides, and as tall as its 32px buttons plus the box's padding:
 * 366 by 46 on a 390px phone. Its bottom is the player's (`transportBottomPx`),
 * which puts it in the band above the scale bar that the legend stack already
 * clears. Phone only: a desk keeps Done and Cancel in the docked panel beside
 * the map, where they were never out of reach.
 */
export const DRAW_BAR =
  `${SURFACE_FLOATING} ${LAYER.base} absolute ${MAP_EDGE.left} ${MAP_EDGE.right} ` +
  'flex items-center gap-2 px-3 py-1.5'

/**
 * On a box laid over the map: the box gives its empty area back to the map,
 * and each member it holds takes pointer events again.
 *
 * The map's rows span more of the map than their members cover, and a press
 * in the gaps belongs to the map: a vertex in draw mode, a peak, a fire
 * perimeter. Written on the box with a child variant rather than as two
 * roles, so a member added later yields nothing by accident.
 */
export const YIELD_EMPTY = 'pointer-events-none [&>*]:pointer-events-auto'

/**
 * The map's two rows across its top (#696; record 0135, the maintainer's
 * approved mockup, 2026-10-14): the search pill, with the locate button at its
 * right on a phone, and under it the chip row, the controls summary, Legend
 * and Layers.
 * A desk has worn them too since #714 (record 0174), where they replaced a
 * column of boxed buttons so a reader meets one map at both widths.
 *
 * The geometry is four numbers, and every other anchor on the map's top is
 * built from them: the map's 12px inset (`MAP_EDGE`), the 40px first row, 8px
 * between the rows and the 32px chip row. So the rows end 92px down the map at
 * both widths, and `styles.test.ts` holds each anchor below to that sum.
 *
 * A phone's rows span the map. A desk's are as wide as the wider of the pill
 * and the chip row (`lg:w-max`, no narrower than the pill's `lg:min-w-80`),
 * because a desk's map buttons stand in the map's bottom-right corner
 * (`MAP_CORNER`, record 0174) and the first row holds the pill alone. The pill is 320, the width its
 * results list opened at beside the old column, searching or not: a map 1080px
 * wide does not need a search field across it.
 *
 * `MAP_ROWS.stack` stands both rows one inset off the top and both sides and
 * takes no press itself; each row yields every press that lands between its
 * members (`YIELD_EMPTY`), so the map under the gaps, and under the chip
 * row's empty right end, stays the map's. The stack cannot wear
 * `YIELD_EMPTY` too: its `[&>*]` rule would hand the rows their presses
 * back, a child selector outranking their own by stylesheet order. `row` is the first row: the pill
 * hangs from its left edge and the locate button from its right.
 */
export const MAP_ROWS = {
  stack: `absolute ${MAP_EDGE.top} ${MAP_EDGE.left} ${MAP_EDGE.right} lg:right-auto lg:w-max lg:min-w-80 flex flex-col gap-2 pointer-events-none`,
  row: `relative h-10 ${YIELD_EMPTY}`,
  /**
   * Where the pill stands: on a phone across the row less the locate button
   * and the 8px between them (`right-12`, 40 + 8) at rest, and across the
   * whole row while the field has the keyboard or its list is open, over the
   * button. At a desk 320px either way (`lg:w-80`), with no button beside it.
   * Raised so its results list paints over the chip row and the map.
   */
  pill: 'absolute inset-y-0 left-0 right-12 lg:right-auto lg:w-80 z-10',
  pillWide: 'absolute inset-y-0 left-0 right-0 lg:right-auto lg:w-80 z-10',
  /** The second row: one line of chips, 6px apart, never wrapping. */
  chips: `flex h-8 items-center gap-1.5 ${YIELD_EMPTY}`,
  /**
   * The draw bar on a phone (#687): under the chip row, 8px below it (92 +
   * 8), so every chip stays in reach while a ring is drawn and the foot of
   * the map stays the notices' and the player's.
   */
  drawBar: 'top-[100px]',
} as const

/**
 * The search field as a pill (#696): the floating surface at the row's 40px,
 * fully rounded, its icon and its clear button inside the same 14px of
 * padding the mockup drew. The ring the panel's hover lights rides a wrapper
 * of the same radius (`ACCENT_RING`). `styles.test.ts` holds the fill, edge
 * and blur to `SURFACE_FLOATING`'s.
 */
export const MAP_PILL =
  `bg-floating/95 border border-edge ${RADIUS.pill} ${ELEVATION.raised} backdrop-blur-sm ` +
  `h-10 flex items-center gap-2 px-3.5 transition-colors ${ACCENT.edgeFocus}`

/**
 * The pill's field on a coarse pointer: 40px seen, 44 pressed. The input is
 * transparent, so it stretches to the height inside the pill's 1px border
 * (38) and reaches 3px past that at each edge, 2px past the pill, which is a
 * target the reader cannot see. The clear button is
 * `ICON_BUTTON` with `TAP.action`: 44 wide and a finger's 32 tall, a glyph
 * with no box of its own inside the pill's 38.
 */
export const MAP_PILL_FIELD = 'self-stretch touch:-my-[3px]'

/**
 * A map button: the locate button and the compass, at both widths (TJ,
 * 2026-10-14; record 0147). 40px and round, in the pill's dark chrome, with
 * the floating buttons' sky edge on hover and the app's focus ring. The
 * buttons are MapLibre's own, so their states (asking, tracking, failed; a
 * compass that resets north) stay the library's: `map/controls.ts` hands each
 * of them this role when the map is built, the one way a class reaches markup
 * the library makes, and `map.css` draws their glyphs light and gives each a
 * 44px rim on a coarse pointer. They stood in the library's white box until
 * then, which the audit's M01 kept; the maintainer reversed that for the
 * buttons on 2026-10-14. A desk's zoom buttons wear the same chrome joined
 * into one capsule instead (`MAP_ZOOM_PAIR`).
 */
export const MAP_ROUND_BUTTON =
  `size-10 bg-floating/95 border border-edge ${RADIUS.pill} ${ELEVATION.raised} backdrop-blur-sm ` +
  `transition-colors ${ACCENT.edgeHover} ${FOCUS_RING}`

/**
 * Where a phone stands one of those buttons at a row's right end (#696): the
 * map moves its own control into the slot (`placeControl`), so the button
 * keeps the library's states and its permission prompt, and `map.css`, keyed
 * on `map-slot`, takes the library's margin off it. A desk's rows have no
 * slots: its buttons stand in the map's bottom-right corner (`MAP_CORNER`).
 *
 * `locate` is a 40px box beside the search pill. `compass` is the chip row's
 * last member, under the locate button (record 0147), and takes no room of
 * its own: while the map is north-up the compass is hidden and the slot is
 * nothing, so the row's empty end stays the map's, about 20px at 360 wide.
 * While it shows, the slot is the button's 40px and the summary chip, the one
 * member that gives way, gives it up; at 32px the row is shorter than the
 * button, which stands 4px proud of it top and bottom, centred on it.
 */
export const MAP_SLOT = {
  locate: 'map-slot absolute right-0 top-0 size-10',
  compass: 'map-slot ml-auto flex-shrink-0',
} as const

/**
 * A desk's map corner (record 0174), laid out as Google Maps lays out its own
 * (TJ, 2026-10-20): the credit line flush in the map's bottom-right corner,
 * on the results' edge, with the scale at its end, and over it a column of
 * the compass, the locate button and the zoom pair, 24px in from the map's
 * right edge, 6px apart and 10px above the line. A phone keeps its two
 * buttons in its rows (`MAP_SLOT`) and has no zoom pair.
 *
 * Each piece is the library's own control, moved into a slot here
 * (`placeControl`), so it keeps the library's states. `box` rides the lift
 * the library's bottom corners ride, 0 at a desk, and takes no press of its
 * own. `stack` is the column and `credit` the line, each a surface a popup
 * stands clear of (`MapCorner` marks them), and each keyed `map-corner` for
 * `map.css`, which takes the library's margins off what stands in them and
 * the floating box off the credit line inside this one. The line is the
 * floating box's fill, edge and blur, its two outer edges off and its one
 * inner corner rounded because it stands against two edges, with no shadow,
 * which would fall on the results under it. `slot` holds a control in its
 * row as if the slot were not there. `scale` is a box as wide as the bar can
 * draw (`SCALE_MAX_WIDTH_PX`), the bar flush at its right, so the credits
 * stay put while the bar grows and shrinks with the zoom.
 */
export const MAP_CORNER = {
  box: `absolute right-0 bottom-[var(--map-corner-lift,0px)] flex flex-col items-end gap-2.5 pointer-events-none ${LAYER.base}`,
  stack: 'map-corner mr-6 flex flex-col items-end gap-1.5',
  // `leading-5` is the library's own 20px line, which the map's container
  // gives its controls and the corner, outside it, does not: without it the
  // scale shrank to 17px from the 22px box record 0162 holds it to.
  credit:
    'map-corner flex items-center gap-2.5 py-0.5 pl-2.5 pr-2 leading-5 ' +
    'bg-floating/95 border-t border-l border-edge rounded-tl-lg backdrop-blur-sm',
  slot: 'contents',
  scale: 'flex w-27.5 justify-end',
} as const

/**
 * A desk's zoom buttons, joined into one capsule with a rule between them, as
 * Google Maps draws its own (TJ, 2026-10-20; record 0174): each half is a
 * 40px map button with the capsule's end for its outer edge and no edge where
 * the halves meet but the lower half's top, which is the rule. They are the
 * one pair of map buttons that does not take the sky edge on hover, because
 * the rule is the lower half's alone and could not light for the upper one,
 * so each half takes the raised fill under the pointer instead, while it is
 * enabled: the library disables a half at either end of the map's zoom, and
 * `map/controls.ts` greys it then as it greys the idle compass (`DISABLED`).
 */
const MAP_ZOOM_HALF =
  `size-10 bg-floating/95 border border-edge ${ELEVATION.raised} backdrop-blur-sm ` +
  `transition-colors enabled:hover:bg-raised ${FOCUS_RING}`
export const MAP_ZOOM_PAIR = {
  in: `${MAP_ZOOM_HALF} border-b-0 rounded-t-full`,
  out: `${MAP_ZOOM_HALF} rounded-b-full`,
} as const

/**
 * The map's credit line in the app's chrome (record 0147): its (i) a round
 * dark button, smaller than the others at the library's 24px so it stands in
 * the corner band with the scale (`CORNER_CONTROL_PX`), with the same 44px
 * rim under a finger; and the line, folded out on a phone and always out at
 * a desk, on the floating box's surface, edge and radius. `map/controls.ts`
 * hands these to the library's markup; `map.css` takes the surface off a
 * folded line, so only the button shows, and dresses the links, which the
 * library rewrites whenever a source's credit changes, the way `LINK` would.
 * The scale bar keeps the library's own look: it is a measurement drawn on
 * the map, like the labels, rather than a control.
 */
export const MAP_CREDIT = {
  button:
    `size-6 bg-floating/95 border border-edge ${RADIUS.pill} transition-colors ` +
    `${ACCENT.edgeHover} ${FOCUS_RING}`,
  card: `${SURFACE_FLOATING} text-ink-mid`,
} as const

/**
 * The chips' hit area on a coarse pointer: 32px seen, 44px pressed, the way
 * Material's chips take their 48dp target: a band of map chrome with no
 * target above or below it keeps the 44 the rest of a finger's controls gave
 * up (`TAP`, record 0223). An invisible
 * box 6px above and below the chip, its own pseudo-element so a press on it
 * is the chip's: 7px from inside the chip's 1px border, which is where a
 * pseudo-element's inset is measured (the 30px inside plus 14 is 44, measured
 * in the built image). Every chip is wider than 44 already, so only the
 * height grows. The row's 6px gaps sit beside the chips, not above them, so no two
 * targets overlap, and the 8px over the row stays clear of the pill's.
 */
const CHIP_HIT = "relative touch:before:absolute touch:before:inset-x-0 touch:before:-inset-y-[7px] touch:before:content-['']"

/**
 * One chip in the phone's second row (#696): the pill's surface at 32px, the
 * control size at the normal weight and 12px of padding a side. A chip
 * takes its content's width and never shrinks, but for the summary
 * (`MAP_CHIP_SUMMARY`). The row's right end is left empty: a primary action
 * may stand there later, and nothing here is placed against it.
 *
 * Lit while its sheet is open (`aria-expanded`), in the accent fill the
 * pressed half of a segment wears. Spelled as variants of `ACCENT.fill`'s two
 * classes, because Tailwind compiles only a class it finds whole and a
 * variant is what lets the lit fill beat the resting one without a race of
 * stylesheet order. Hover is `BUTTON_FLOATING`'s: the accent label and edge.
 * The call site adds `DISABLED`, which greys the Legend chip until it has a
 * key to show.
 *
 * The lit chip's label and glyph take the label-on-fill ink. In dark that is
 * the white the chip wears at rest, so nothing moved there; in light the
 * resting ink is the dark one, which stands 3.75:1 on the accent, under the
 * 4.5:1 a label owes (2.66:1 on the darker fill the theme first had, where it
 * hid the summary chip's menu glyph, #706).
 *
 * 12px, the search pill's size above it (record 0222). The mockup drew the
 * row at 13px (#696), between the compact tier's 12 and the reading tier's
 * 14, the one size off the ramp, and the chips stood a step apart from the
 * pill in the same column of chrome.
 */
const CHIP_FACE =
  `bg-floating/95 border border-edge ${RADIUS.pill} ${ELEVATION.raised} backdrop-blur-sm ` +
  `${CONTROL_SIZE} text-ink-strong h-8 flex items-center gap-1.5 px-3 whitespace-nowrap ${CHIP_HIT} ` +
  `transition-colors ${ACCENT.edgeHover} ${ACCENT.hoverText} active:bg-raised ` +
  `aria-expanded:bg-accent aria-expanded:border-accent aria-expanded:text-on-fill ${FOCUS_RING}`
const MAP_CHIP = `${CHIP_FACE} flex-shrink-0`

/**
 * A chip's menu on a desk (#714; record 0174): the Layers menu and the legend
 * card, each a whole card standing 4px under its chip from the chip's left
 * edge. A phone's open as bottom sheets instead (record 0136).
 *
 * The reference every desk menu was made from (record 0201): the pill kept
 * whole and lit, as a phone's chip is, with the card set apart, because
 * squaring a 32px pill's bottom corners to join a card left a dome (TJ,
 * 2026-10-18). Apart by 4px, closer than the 8px between the pill and the
 * chip row: at that same 8px the card read as a third row rather than as its
 * chip's menu. `CHIP_MENU_GAP_PX` in `resultsSheet.ts` is the gap in pixels,
 * and every other menu stands that far under its trigger. The surface is
 * `SURFACE_CHIP_CARD`'s: one fill and edge for both cards, the menu's shadow a
 * step over the legend's. Its 10px side inset is the one every menu's rows
 * stand at (`MENU.list` and `MENU.row`).
 */
export const MAP_CHIP_MENU = `absolute left-0 top-full mt-1 ${MAP_MENU_W} px-2.5 py-2`

/**
 * The summary chip, `☰ Current · NOAA GFS`, which opens the drawer: a chip
 * that gives way first. It is the one member allowed to shrink, so a phone
 * too narrow for the row cuts the summary with an ellipsis rather than
 * pushing a chip off the edge (`MAP_CHIP_SUMMARY_TEXT`). The ☰ stays whole:
 * it is the mark that says the chip opens the panel.
 */
export const MAP_CHIP_SUMMARY = `${CHIP_FACE} min-w-0`
/**
 * The summary's words: one line, cut at its end, in the slate-400 the mockup
 * reads them in (5.56:1 on the chip). White while the chip is lit, since the
 * Controls sheet it raises is up (record 0141): slate-400 on the accent fill
 * fails AA, where white is the 4.56:1 every label on that fill reads at.
 */
export const MAP_CHIP_SUMMARY_TEXT = 'min-w-0 truncate text-ink-soft in-aria-expanded:text-on-fill'

/**
 * The button's pressed state, Material's for a floating button (TJ,
 * 2026-10-14): a state layer of the label's white at 12% over the whole
 * button, and the shadow dropping from `ELEVATION.overlay` to
 * `ELEVATION.raised` while a finger or a mouse holds it down. A run that
 * reuses every forecast it holds finishes in a frame, so a press had nothing
 * on screen to show it landed; the press itself now does, and the button is
 * never greyed after a run, since a re-run is always the reader's to make.
 * Spelled out rather than built from `ELEVATION.raised`, because Tailwind
 * cannot compile a variant on an interpolated class. `enabled:` keeps a
 * disabled button from answering a press it will not act on.
 */
const MAP_FAB_PRESSED =
  'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-on-fill ' +
  'after:opacity-0 after:transition-opacity enabled:active:after:opacity-[0.12] enabled:active:shadow-lg'

/**
 * The phone's Analyze (#696; record 0135): an extended floating action
 * button in Material's sense, the form for a screen's one primary action. 56px
 * tall (`FAB_PX` in `resultsSheet.ts`, which places it), a 16px corner rather
 * than the capsule the chips wear, and the label in the call to action's 14px
 * semibold. The accent fill is `BUTTON_PRIMARY`'s, `ACCENT.fill` on
 * `--color-sky-650`, so the white label keeps its 4.56:1 (record 0008); the
 * call site adds `DISABLED` and `BLOCKED`, the panel's grey, because the gate
 * is the panel's. The deepest shadow, since it stands over the map and over
 * the sheet's edge alike.
 *
 * It stands in `MAP_FAB_SLOT`, which is what is placed: 16px off the map's
 * right edge on the map chrome's layer, with the button's bottom set in
 * pixels by `fabBottomPx`. The slot rather than the button, so the count
 * badge the button wears (`MESSAGE_BADGE`, record 0208) can stand at its
 * corner as a sibling, outside the button's own grey when it is blocked. The
 * button is `relative` for its pressed state's layer.
 *
 * No icon: none of `icons.tsx` says "run this" without also meaning
 * something else on the same screen (the player's triangle plays the
 * timeline), so the button is its label.
 */
export const MAP_FAB_SLOT = `absolute right-4 ${LAYER.mapControls}`
export const MAP_FAB =
  `relative h-14 rounded-2xl px-5 ${ELEVATION.overlay} ` +
  `${TEXT.cta} transition-[color,background-color,box-shadow] ${ACCENT.fill} ${ACCENT.fillHover} ${FOCUS_RING} ` +
  MAP_FAB_PRESSED


/**
 * The button's words in one cell, the ones not showing kept invisible, so the
 * button is always as wide as the widest of `Analyze`, `Analyzing…` and `Try
 * again` (`ACTION_WORDS`, #736) and never resizes as a run starts, ends or
 * fails. A grid rather than a measured width: the cell is the words' own, in
 * whatever face the reader's system draws.
 */
export const MAP_FAB_WORDS = {
  cell: 'grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1',
  hidden: 'invisible',
} as const

/**
 * The count the Analyze button wears while the panel has something to say
 * (#786; record 0208): a disc at the button's top-right corner, saying how
 * many messages are current in the colour of the worst of them, which opens
 * the list that holds them all. The same disc on the panel's button at a
 * desk and on the map's button on a phone, in a `relative` slot each, as a
 * sibling after the button rather than a child, so a blocked button's grey
 * (`BLOCKED`) does not fade the count.
 *
 * The fill is the severity's ink (`STATUS`), with the panel's own colour as
 * the digit: the ink is the one colour of each severity that is solid, and
 * the tints and lines the boxes wear are translucent, which over the button's
 * accent fill would be a fourth colour nobody chose. Measured in `styles.test.ts`:
 * the panel on the danger ink is the tightest pair, and clears 4.5:1 in both
 * themes. A 2px edge in the panel colour parts the disc from the button it
 * overhangs, the way a badge is cut out of what it sits on.
 *
 * A 20px disc, the dismiss pill's size, and the floor's 11px type: a count a
 * reader presses. The edge is a border rather than a ring outside the box, so
 * the button is the 24px the disc and its edge draw, the least a target owes
 * (WCAG 2.5.8); as a 20px box with a ring it failed Lighthouse's target-size
 * audit on the cold load. On touch that is still no target, so it takes a
 * 44px hit area through an invisible box drawn 10px past its edge on every
 * side (the `before:` box, as `TAP` would size it), without growing the disc.
 * The box overhangs the button's corner, where the label is not.
 */
export const MESSAGE_BADGE = {
  /** The box the button and its badge share, which the badge's corner is placed in. */
  slot: 'relative',
  base:
    `absolute -right-2.5 -top-2.5 flex h-6 min-w-6 items-center justify-center border-2 border-panel px-1 ${RADIUS.pill} ` +
    `${MICRO_SIZE} font-bold leading-none tabular-nums transition-colors ` +
    `touch:before:absolute touch:before:-inset-2.5 touch:before:content-[''] ${FOCUS_RING}`,
  error: 'bg-danger text-panel',
  warn: 'bg-warn text-panel',
  info: 'bg-info text-panel',
} as const

/**
 * A control that is shut for a reason the reader can act on, as against one
 * that is busy (`DISABLED`): the Analyze button while a blocker holds it,
 * which a press then opens the message list from (record 0208, the
 * maintainer's call of 2026-10-21: a greyed button opens the list from
 * anywhere on it). The same 40% as `DISABLED`, keyed on `aria-disabled` since
 * the button is not disabled, and no cursor claim: a press does something.
 */
export const BLOCKED = 'aria-disabled:opacity-40'

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
export const SEGMENT_DIVIDER = 'border-l border-edge'

/**
 * The results bar's two groups, the mode switch and the buttons, on a finger
 * (record 0223): each button draws 32px and presses 44, its own pseudo-element
 * 6px above and below it, the way a chip takes its press (`CHIP_HIT`). The bar
 * stands in a band of its own on the sheet, so nothing above or below it is a
 * target. Its halves are `segmentHalf`'s, so this is added to them rather than
 * built into a segment: the panel's segments press what they draw.
 *
 * A group that clipped its halves to its corners would clip that press too,
 * so `BAR_GROUP` is `SEGMENT_FLUID`'s well without the clip, and the two end
 * halves round their own outer corners instead: 3px, the group's 4px less its
 * 1px edge, so a lit end's fill follows the edge's curve.
 */
export const BAR_GROUP = `inline-flex ${RADIUS.control} ${RECESSED_EDGE}`
export const BAR_PRESS =
  'relative first:rounded-l-[3px] last:rounded-r-[3px] ' +
  "touch:before:absolute touch:before:inset-x-0 touch:before:-inset-y-1.5 touch:before:content-['']"

/**
 * The results bar's buttons, Columns, Models, Removed and Download CSV, as one
 * group that reads as the mode switch's sibling (#687, the maintainer on
 * #709): the same bordered well (`BAR_GROUP`), the same half
 * (`segmentHalf`, so the same height on either pointer) and the same idle
 * fill, divided by `SEGMENT_DIVIDER`. They were ghost buttons that wrapped to
 * three rows on a 402px phone with Removed showing.
 *
 * Each item is sized by its content (`flex-none`), with a 6px inset (`px-1.5`)
 * where a ghost button had 6px plus a hover fill's room: less than that and a
 * glyph alone is under 28px wide. At 28px wide and 22px tall on a fine pointer
 * an icon-only item is short of the 24px of WCAG 2.2's target size, and it
 * passes by spacing instead, the way record 0130 settles the Metrics rows: a
 * 24px circle on its centre reaches 12px either side, inside its own 28px, so
 * it meets neither neighbour. On a coarse pointer `TAP.action` makes each 44px
 * wide and 32 tall, and `BAR_PRESS` presses 44 around it.
 * The label is the slate-400 idle half's, as on the switch beside it.
 *
 * Under the pointer the label takes the accent, the hover every menu trigger
 * wears (record 0201), where the switch's idle half brightens to white. An
 * item has no edge of its own inside the group, so the label is the whole
 * of its hover. The three that open a menu wear `MENU_TRIGGER.bar` over this,
 * which adds the lit state; Download CSV opens nothing and wears this alone.
 */
export const ACTION_GROUP = BAR_GROUP
export const ACTION_ITEM =
  `${segmentHalf('flex-none')} ${BAR_PRESS} px-1.5 cursor-pointer whitespace-nowrap ${RECESSED_FILL} text-ink-soft ${ACCENT.hoverText}`

/**
 * The word on a results bar control, shown only where the bar can hold the
 * switch and all four buttons on one line with their words (#687); under that,
 * every control is its glyph alone and keeps the word as its accessible name,
 * as the switch's halves already did on a phone. A container rule, because the
 * bar's width is the viewport less the docked panel.
 *
 * 584px of the bar's content, measured 2026-10-13 at text-xs: the labelled
 * switch is 176.7px, the labelled group with `Removed (1)` showing 377.8px,
 * and the groups stand at least 16px apart (`gap-x-4`) on the folded line,
 * 570.5px; then two more digits of a Removed count, 13.4px, so a reader with
 * a hundred removals still gets one line. The bar beside the docked panel at
 * 1024 wide has 640px and keeps its words; a phone has 336px at 360 wide and
 * 406px at 430, and shows the switch and the glyphs on one line, Removed or
 * not. It replaces the switch's `sm:` viewport rule, so the bar's words come
 * and go together.
 *
 * At a desk the three menu buttons carry chevrons, which a phone's never do
 * (record 0201), and the labelled group is 437.8px, measured 2026-10-20. A
 * desk's bar is never under the 640px it has beside the docked panel at 1024,
 * which holds the line with a two-digit Removed count (637.2px); a
 * three-digit count wraps the group onto a line of its own there.
 */
export const BAR_LABEL = 'hidden @min-[584px]:inline'

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
  `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink`
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
  ok: 'text-ok',
  /** Survivable: the analysis can still run, but something is worth knowing. */
  warn: 'text-warn',
  /** Blocking: it did not work, or it will not run as asked. */
  error: 'text-danger',
  /** Neither good nor bad, just a fact about the data you are about to get. */
  info: 'text-info',
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
 * `ELEVATION.raised`: two shadow utilities on one element resolve by stylesheet order,
 * not by intent.
 *
 * Carries no radius, and that is load-bearing rather than an omission. A ring
 * is a box-shadow, so it fades out under `transition-shadow` while a corner
 * radius does not: bundling the radius in here meant that on un-hover the
 * corners squared off instantly and the still-visible ring spent the fade as a
 * rectangle standing off a rounded field. The element wearing this owns its
 * radius permanently, and only the ring toggles.
 */
export const ACCENT_RING = 'ring-4 ring-accent-ink shadow-[0_0_18px_var(--ui-accent-glow)]'

/**
 * The box a status line sits in when it is a block rather than a sentence: the
 * forecast-window warning, the AQI-coverage note, the refusal, the run error,
 * and the failed wildfire check.
 *
 * There is no unboxed alternative in the list. A `CUE` role used to hold the
 * centred, borderless variant, and the panel's footer showed both: a commit cue
 * as centred amber text directly above a blocker in an amber box, saying the
 * same kind of thing in two shapes for no reason a reader could act on. Every
 * message in the list is one of these three now, and severity is the only
 * thing that varies (`MessageBox` in `MessageList.tsx`, record 0208).
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
  warn: `text-xs bg-warn-tint border border-warn-line ${RADIUS.control} p-2`,
  error: `text-xs bg-danger-tint border border-danger-line ${RADIUS.control} p-2`,
  info: `text-xs bg-info-tint border border-info-line ${RADIUS.control} p-2`,
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
  warn: '-my-1.5 divide-y divide-warn-line',
  error: '-my-1.5 divide-y divide-danger-line',
  info: '-my-1.5 divide-y divide-info-line',
} as const

/**
 * The X that dismisses one message in the list (#253). Every message but a
 * blocker carries its own — a box dismisses line by line, not whole (TJ,
 * 2026-08-22); which dismissal it triggers, and when that dismissal
 * expires, is `utils/notices.ts`'s business, not this recipe's.
 *
 * Three parts, because the touch target and the visible control must be
 * different sizes. The `row` is the message the X belongs to and the hover
 * surface that reveals it. The `button` carries `TAP.action`, 44 wide and 32
 * tall on touch. The `pill` inside it is the glyph's 20px box and nothing more:
 * the bare × every card and field wears (record 0222).
 *
 * A box with an X stands exactly as tall as one without (the maintainer,
 * 2026-10-21 on PR #789, where a phone's dismissable box stood nearly twice
 * the height of a blocker's beside it): the button's negative block margins
 * hand back everything past the 16px line of text, 2px each side of the
 * glyph's box on a mouse and 8px each side of the target on touch, so the row
 * is the line, its padding and nothing else. The target overhangs the line
 * into the row's padding instead, and a lone message's stays inside its box.
 * In a box of several dismissable messages two neighbouring targets overlap
 * by 3px, which leaves each 29px no other target covers, past the 24px WCAG
 * 2.5.8 asks, and the lower one takes a press in the overlap.
 *
 * The row centres its two members against each other, so the × sits level
 * with the text. Every message is written to fit one line, so there is no
 * first line for the X to align to.
 *
 * The glyph inherits its box's `STATUS` voice (a slate X would read as chrome
 * that escaped into a status message) and stands on the box's own tint.
 * Measured there over the panel, every voice clears the 3:1 a UI glyph owes;
 * the figures are pinned in styles.test.ts so a tint or `STATUS` change
 * forces a re-measurement.
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
  row: `group/notice flex items-center gap-2 py-1.5 ${RADIUS.control} hover:bg-lift/[0.04]`,
  /**
   * Hidden until asked for: the X appears when the pointer rests on its row,
   * on keyboard focus, and is always on where hover does not exist (`touch:`)
   * — a hover-only control on a phone is a control that does not exist (the
   * tooltip rule, applied to a button). Opacity rather than `hidden`, so the
   * reveal can fade and the row never reflows.
   *
   * On a coarse pointer the target is 44px wide and the glyph's box inside it
   * is 20, and the difference used to come out of the message beside it: the
   * text column was 257px on a 360px panel, where the longest commit cue needs
   * 267. The negative left margin hands those 24px back. Nothing moves on
   * screen — the button's box still ends at the row's right edge, so the
   * centred × sits exactly where it did — and the target simply reaches further left, over
   * the tail of the text. That costs nothing, because the text is not a target
   * and a press on it has never done anything; what it buys is the one-line
   * budget every message in this app is written to, which is measured against
   * the column rather than against the box. `gap-2` on the row stays the
   * visible distance from the × to the last word. The negative vertical
   * margins hold the row at the glyph's height on either pointer: 2px of a
   * fine pointer's 20px box, 8px of a finger's 32 (`TAP.action`).
   */
  button:
    `group ${TAP.action} -my-0.5 touch:-my-2 touch:-ml-6 opacity-0 transition-[color,opacity] ` +
    `group-hover/notice:opacity-100 focus-visible:opacity-100 touch:opacity-100 ` +
    `hover:text-ink-strong ${FOCUS_RING}`,
  pill: 'flex h-5 w-5 items-center justify-center',
} as const

/**
 * The three weights of rule in the app.
 *
 * `PANEL_EDGE` closes the panel: the line under the app title, the one over
 * the Analyze button, and the panel's right edge where it meets the map and
 * the results. Those are structural: the first two separate the scrolling
 * body from the fixed chrome above and below it, and the third separates the
 * panel from everything beside it, so they are the heavier weight.
 *
 * The right edge was `SURFACE_DIVIDER` until #697, at 1.41:1 on slate-800,
 * which is no boundary at all between the panel and the desktop results
 * sheet, two slate-800 surfaces side by side: they read as one L-shaped
 * block. slate-500 is 3.07:1 on slate-800 and 3.74:1 on slate-900, past the
 * 3:1 a boundary owes under WCAG 1.4.11 when it is the only thing separating
 * two surfaces. An 8px slate-900 gutter between the two was mocked and
 * declined beside it, and so was leaving the seam alone (the maintainer,
 * 2026-10-13).
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
 * - **The weight.** slate-600 at 1.93:1 read heavy once the gutters
 *   tightened, so it was half-opacity slate-600 for a while, compositing to
 *   1.37:1. That is `SURFACE_DIVIDER`'s 1.41:1 by eye, so since #687 it is
 *   that colour: one quiet line in the app rather than two that only a
 *   measurement could tell apart. The panel's structural edges stay above it
 *   at slate-500 (3.07:1), which is what keeps the two weights distinct.
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
 * the month navigation under the calendar's Hours row. On the slate-800 panel
 * and card it is 1.41:1, and `PANEL_RULE` draws the same colour, which is the
 * point: a surface that has to place its own rule should not look like a
 * different kind of rule. What splits them is only whether the stack or the
 * call site decides WHERE, so a bare colour is all this one carries.
 *
 * It was a slate-700 border class at eleven call sites in eight files before it had a
 * name (#390), which is a third weight nothing had chosen and nothing could
 * change in one place. `styles.test.ts` now fails the literal anywhere under
 * `components/` or in `App.tsx`.
 */
export const PANEL_EDGE = 'border-edge'
export const SURFACE_DIVIDER = 'border-rule'
// SURFACE_DIVIDER's colour under the stack's variant, spelled because Tailwind
// cannot compile an interpolated variant; `styles.test.ts` holds the two to
// one colour (#687).
export const PANEL_RULE =
  '[&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-4'

/**
 * The welcome dialog's actions, in a foot that stays in view while the body
 * scrolls (#687).
 *
 * At 1024x768 and on a phone both actions sat below the fold of a dialog the
 * reader had to scroll to find them in. The foot sticks to the card's bottom
 * edge inside its scroll box, on the card's own slate-800 (so the body slides
 * under it rather than showing through), parted from the body by the quiet
 * rule and padded like the header above it.
 *
 * `secondary` is `BUTTON_PRIMARY`'s button in `BUTTON_SECONDARY`'s fill: the
 * same 14px semibold label, padding and 8px corners, so the two stacked
 * actions read as one pair that differs only in which leads (record 0222).
 * Its ink is named because
 * `TEXT.cta` carries none, where the primary's white comes with its fill.
 */
export const DIALOG_FOOT = {
  bar: `sticky bottom-0 bg-panel border-t ${SURFACE_DIVIDER} px-6 py-4 space-y-2`,
  secondary:
    `${TEXT.cta} text-ink ${TAP.action} w-full py-2.5 ${RADIUS.surface} transition-colors ` +
    `bg-raised hover:bg-raised-hover ${FOCUS_RING}`,
} as const

/**
 * The scroll bar every dark surface wears: the panel body, the results table,
 * the chart legend and the calendar's popover (#697). The rules live in
 * index.css because a scroll bar has no utility to compose; the name lives
 * here so no component spells it, and the app draws one bar style rather than
 * the browser's default beside a styled one. Before, the panel body took the
 * browser's own bar, 15px and light grey in Chromium beside the results'
 * 10px slate one (measured 2026-10-13). The root's `color-scheme: dark` in
 * index.css turns every bar this class does not reach dark as well: the
 * welcome dialog's and the legal pages'.
 */
export const SCROLL_BARS = 'surface-scrollbars'

/**
 * The place search's result list (#696): ten places now, where it held five,
 * so it scrolls inside a bounded box rather than running down the map and
 * under the results sheet. At most 20rem, about six places at a finger's
 * option height so the cut one says the list goes on, and never more than half
 * the viewport, which is what keeps it on a phone turned on its side.
 * `SCROLL_BARS` is the one dark bar every dark surface wears (#697);
 * `overscroll-contain` keeps a flick at the list's end from moving the map.
 */
export const SEARCH_LIST = `${SCROLL_BARS} max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain`

/**
 * The bottom sheet (#696; record 0136): on a phone, every menu the map's chips
 * and the results bar open is one card rising from the screen's bottom edge,
 * modal over a dimmed map, where a desk keeps its menus joined to their
 * controls (record 0134). One component (`BottomSheet.tsx`) wears these,
 * and its Controls sheet takes `dim`, the top and Done from here and the
 * rest from `CONTROLS_SHEET` (record 0207).
 *
 * `scrim` catches every press outside the card, which closes it, and `dim`
 * shades all of it: the whole screen, the search row and the chips included,
 * Material's rule for a modal sheet's scrim. Both are fixed to the viewport
 * rather than placed against the map, so a preview banner that shifts the map
 * down cannot leave a band of it bright (it stopped one inset under the chip
 * row, measured from the viewport, until the maintainer's phone showed the
 * chips half dimmed under a banner). `card` is the results sheet's surface
 * lifted a step, since it stands over that sheet, and it stops one inset under
 * where the chip row ends on a phone with no banner, so a long list leaves
 * the top of the dimmed map in view. `grip` is the bar the
 * mockup draws at the top, which drags the sheet up, down or shut (record
 * 0146), with the title row beside it. `head`
 * is the title at the left and Done at the right; `title` the sheet's own
 * word, the chip's or the button's that opened it. `body` scrolls, and every
 * row in it is at least a finger's 32px (`TAP`, record 0223), one line, with
 * a rule between rows.
 * It ends at its last row and then a phone's home indicator band
 * (`SAFE_AREA.pad`; record 0152), so where no band is reported the space
 * under the last line is the space every line keeps above its rule.
 */
/**
 * The band a phone keeps for its own gestures at the screen's bottom edge,
 * the home indicator on an iPhone (#336, #696; record 0145), which nothing a
 * finger presses may stand in. `index.html` asks for the whole screen
 * (`viewport-fit=cover`), so the browser draws the page under the band and
 * reports its height as `env(safe-area-inset-bottom)`, 34px on a 390x844
 * iPhone and 0 on a desk.
 *
 * `pad` is for a surface that reaches the screen's foot and keeps its own
 * content above the band: the results sheet, whose grip and header then stand
 * on the band's top edge when it is collapsed. A sheet whose body scrolls
 * (`BOTTOM_SHEET.body`, `CONTROLS_SHEET.body`) takes the band at its
 * scroller's end, after its own rhythm, so scrolled to the end its last row
 * stands the band above the screen's foot and nothing a finger presses is in
 * it, while the content still runs under the band as it scrolls (record
 * 0152, the maintainer, 2026-10-14, choosing it over no band after seeing
 * the two drawn side by side). Where the browser reports 0, as Chrome does on
 * the maintainer's Pixel, nothing changes. `probe` is an invisible
 * box as tall as the band, which `useSafeAreaBottom` reads, because the
 * chrome placed in pixels over the map (the Analyze button, the player, the
 * scale and the credit) measures from the sheet's edge, and
 * before there is a sheet that edge is the band's top rather than the
 * screen's foot.
 */
export const SAFE_AREA = {
  pad: 'pb-[env(safe-area-inset-bottom)]',
  probe: 'pointer-events-none invisible fixed bottom-0 left-0 w-0 h-[env(safe-area-inset-bottom)]',
} as const

export const BOTTOM_SHEET = {
  scrim: `fixed inset-0 ${LAYER.popover}`,
  dim: 'absolute inset-0 bg-scrim/40',
  card:
    `fixed inset-x-0 bottom-0 ${LAYER.popover} flex max-h-[calc(100dvh-104px)] flex-col ` +
    `bg-panel border-t border-frame rounded-t-lg ${ELEVATION.overlay} focus:outline-none`,
  grip: 'flex h-5 flex-shrink-0 touch-none items-center justify-center [&>span]:h-1 [&>span]:w-9 [&>span]:rounded-full [&>span]:bg-edge',
  /**
   * 8px under the title row, the same 8px the grip keeps between its bar and
   * the row's top, so Done and the theme switch stand centred between the bar
   * and the rule under them. At 4px the row sat visibly low on the
   * maintainer's phone (2026-10-27).
   */
  head: 'flex flex-shrink-0 items-center gap-2 px-4 pb-2',
  title: TEXT.subheading,
  done: `${CONTROL_SIZE} font-semibold ml-auto ${TAP.action} px-1 ${LINK_ACTION} ${FOCUS_RING}`,
  /**
   * The title row's end when a sheet carries a button beside Done, which only
   * the Controls sheet does (its theme switch, #706): one box at the row's end
   * holding both, so Done's own `ml-auto` has no free space to split with it.
   */
  actions: 'ml-auto flex items-center gap-2',
  body:
    `min-h-0 flex-1 overflow-y-auto overscroll-contain ${SCROLL_BARS} px-4 ${SAFE_AREA.pad} ` +
    'divide-y divide-rule [&>*]:min-h-8',
} as const

/**
 * The shade under a fixed edge that shows only while content continues past
 * it (#697): the panel body under its header and above its footer, and the
 * results table under its sticky header and above its bottom edge. Without it
 * a body that scrolls under a rule is cut flat there, and nothing says it
 * goes on: at the panel's defaults 147px of it is out of sight at 1440x900
 * and 558px on a phone (measured 2026-10-13).
 *
 * index.css owns the drawing, because the shade's visibility is a
 * scroll-driven animation where the browser has one and two data attributes
 * from `useScrollShadows` where it does not. These are the halves, so a
 * container with a sticky header of its own can take the bottom one alone and
 * hang the top one under the header (`head`), where the header would
 * otherwise paint over it. The shade is slate-950 at 70% fading to nothing
 * over 12px: one step under the page ground, so it reads as depth on the
 * slate-800 panel rather than as a third kind of rule.
 */
export const SCROLL_SHADOW = {
  start: 'scroll-shadow-start',
  end: 'scroll-shadow-end',
  both: 'scroll-shadow-start scroll-shadow-end',
  /** The top shade under a sticky table header, on the header itself. */
  head: 'scroll-shadow-head',
} as const

/**
 * The panel's scrolling body, between the header's `PANEL_EDGE` and the
 * footer's.
 *
 * `scrollbar-gutter: stable` reserves the bar's width outside the padding
 * whether or not the body overflows, so the control column does not jump
 * sideways when a section opens and the bar appears, and nothing in the body
 * ever runs against the bar: the closest thing to it is a control's right
 * edge, the full 16px of `px-4` away. What it costs is the bar's width off the
 * content, always rather than only while the body overflows: 327px of content
 * with no bar, 317px beside the shared 10px one in Chromium, where the
 * browser's own 15px bar used to leave 312px whenever it showed (measured
 * 2026-10-13). The footer below is not a scroller, so its Analyze button
 * reaches 10px further right than the body's controls on such a screen. An overlay bar (macOS by default, every phone) takes no width
 * and reserves none. The metric row's label budget is done at the narrower
 * width in `styles.test.ts`. The bleed tells the scroll shadows to reach across
 * the `px-4` to both edges.
 */
export const PANEL_BODY =
  `flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] [--scroll-shadow-bleed:1rem] ` +
  `${SCROLL_BARS} ${SCROLL_SHADOW.both}`

/**
 * The panel's header: the logo and the title block beside it (#687).
 *
 * 56px plus its `PANEL_EDGE` rule, down from 81px: the logo is 40px with 8px
 * of panel around it where it was an 80px square edge to edge, and the title
 * block takes `py-2` for the `py-4` it had. The title and the tagline keep
 * their roles and sizes, so the block is 54.5px of text and padding and the
 * logo's 56px sets the height. That is 24px back to the scrolling body on
 * every screen, 9% of a 900px window spent on fixed chrome becoming 6%
 * (measured 2026-10-13: 81 to 57px). The name and the tagline start together
 * at the block's left edge, as they always have: the maintainer tried them
 * centred and had them put back (#801, record 0229).
 */
export const PANEL_HEADER = {
  logo: 'm-2 h-10 w-10 flex-shrink-0 object-cover',
  title: 'flex flex-col justify-center px-3 py-2',
  /**
   * Where the header's round buttons stand: the theme switch and the close
   * button, at the top right, 8px apart (#706). 12px down, so a 32px circle's
   * centre stands at 28px, on the logo's and the title block's in the 56px
   * header (#801).
   */
  actions: 'absolute top-3 right-2 z-10 flex gap-2',
} as const

/**
 * A round button in a panel's header: the desk panel's close button and the
 * theme switch beside it, and the switch again in a phone's Controls sheet
 * beside Done (#706). A 32px circle on either pointer, a finger's height
 * (`TAP`, record 0223), and no wider: `TAP.action`'s 44px width would draw it
 * as a capsule. The glyph in the control ink, on the raised surface at 80%.
 * The close button's recipe, named once it had a twin, so the two cannot
 * drift apart.
 */
export const HEADER_BUTTON =
  `flex h-8 w-8 items-center justify-center ${TEXT.control} ${RADIUS.pill} ` +
  'bg-raised/80 transition-colors hover:bg-raised-hover active:bg-raised-hover'

/**
 * Movement that answers a reader's action, at two speeds, and stops where
 * they asked their system for less (#687, #714; record 0202).
 *
 * A menu or a card is small and near the hand that opened it, so it fades and
 * slides in 150ms. A panel, a sheet or a results pane moves an edge the whole
 * screen is laid out against, so it takes 300ms, the same in and out. Each
 * recipe names the one property it moves, because a sheet or a pane whose
 * height a grip drags must not chase the finger.
 *
 * `motion-reduce:` drops each to an instant change; the panel's smooth
 * scroll and the tutorial's glide ask the same question through
 * `prefersReducedMotion` in `utils/motion.ts`, and so does a
 * closing pane, which unmounts at once rather than waiting out a transition
 * that will not run. `PANEL_MS` is the slower speed in numbers, for script
 * that waits out a move; `styles.test.ts` holds each class to its speed.
 */
export const MOTION = {
  /**
   * A menu fading and sliding in from its trigger over 150ms, and back out
   * the same way (#714; record 0201): quick enough that the card is there
   * when the eye lands, and slow enough to say which control it came from.
   * Every desk menu wears it through `SURFACE_CHIP_CARD`, which is why the
   * value is declared above it.
   */
  menu: MENU_MOTION,
  /** A phone sheet rising and falling. */
  slide: 'transform transition-transform duration-300 ease-in-out motion-reduce:transition-none',
  /** The desk panel moving the map's edge as it leaves and returns (`DESK_PANEL`). */
  push: 'transition-[margin-left] duration-300 ease-in-out motion-reduce:transition-none',
  /** A results pane opening or closing on a Table, Chart or Both press (`RESULTS_PANE`). */
  pane: 'transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
  /** A progress bar's fill growing to its next width. */
  progress: 'transition-all duration-300 ease-out motion-reduce:transition-none',
} as const

/** The duration `MOTION.slide`, `MOTION.push` and `MOTION.pane` share, in milliseconds. */
export const PANEL_MS = 300

/**
 * The controls panel at a desk (#714; record 0202): a column in the page's
 * row beside the map, 360px wide, that stays in the row while it is shut.
 * Shut, its left margin takes its own width back, so it slides off the left
 * edge and the map's column widens in the same frames; open, the margin
 * returns and the column narrows as the panel comes in. One property moves,
 * and the map's edge is the panel's edge in every frame, so nothing is
 * painted over anything.
 *
 * `relative` because the header's buttons stand absolutely in its top right
 * (`PANEL_HEADER.actions`). `LAYER.base` is a docked panel's layer.
 */
export const DESK_PANEL = {
  card: `relative ${LAYER.base} flex w-90 flex-shrink-0 flex-col overflow-hidden bg-panel border-r ${PANEL_EDGE} ${MOTION.push}`,
  shut: '-ml-90',
} as const

/**
 * A results pane at a desk, the chart or the table with its grip, as a frame
 * that opens on a Table, Chart or Both press or the collapse chevron and
 * closes on the next (#714; record 0202). The frame is one grid row, `1fr`
 * open and `0fr` shut, so it opens to whatever height its body has without
 * being told it, and only a press moves it: a drag on a grip changes the body
 * under a row that stays `1fr`. The body is mounted at the press at the
 * height it will stand at, keeps it, and the frame clips it, so the data is
 * on screen as the pane grows and as it shrinks.
 *
 * The chart's body holds to the results bar (`top`) and the table's to the
 * column's foot (`foot`), the edges each stands against in Both. So the chart
 * comes down from the bar, the table comes up from the foot, and neither
 * picture slides under the other: Table to Chart wipes the boundary down the
 * column, and Table to Both lifts the bar off a table that stays where it
 * stands.
 */
export const RESULTS_PANE = {
  frame: 'grid flex-shrink-0',
  open: 'grid-rows-[1fr]',
  shut: 'grid-rows-[0fr]',
  top: 'flex min-h-0 flex-col overflow-hidden',
  foot: 'flex min-h-0 flex-col justify-end overflow-hidden',
} as const

/**
 * The chart-only legend: one chip per charted line, under the plot in Chart
 * alone. At a desk it is a results pane of its own between the chart's and
 * the table's, held to the foot like the table, so Chart to Both shuts it
 * while the table opens and the chart keeps one size in every mode (#795).
 * On a phone it stands in the chart's box, where panes change at once.
 *
 * Two rows of 26px chips and the 6px gap between them, 58px, then it
 * scrolls. With its padding and its edge it stands 71px at most, which fits
 * inside the table's floor (`PANEL_FLOOR_PX`), the room a desk keeps free
 * under the chart in Chart, so the legend never takes the map's floor.
 */
export const CHART_LEGEND = {
  strip: 'flex-shrink-0 border-t border-frame bg-page/50 px-3 py-1.5',
  chips: `${SCROLL_BARS} flex max-h-[58px] flex-wrap gap-1.5 overflow-y-auto`,
} as const

/**
 * What holds one size while a desk's layout moves (#714; record 0202,
 * `useLayoutMotion`), so a frame of the move shifts boxes rather than
 * resizing a map canvas or laying out a table of a thousand rows.
 *
 * The map's box is the window's width while the panel moves and the window's
 * height while a pane moves, centred on the map's column, which clips it
 * (`clip`). MapLibre keeps the centre on a resize, so the map draws the way
 * it would at every width in between and is resized only where the box
 * changes: at the start of a close and the end of an open, the closed width
 * being the window's. `rest` is the box the rest of the time.
 *
 * The panes' bodies hold a width while the panel moves. The table's box takes
 * the window's, the widest it will be, so a close lays it out once at the
 * start and an open once at the end, with the spare width in its filler
 * column. The chart keeps the width it had (`chartClosing` is the window less
 * the panel), because drawing it is the costliest thing on the page, and is
 * drawn once at the end.
 *
 * While the panel moves, what moves with it stands on a layer of its own
 * (`layer`): the panel, the map's column, the results and each pane's body
 * (record 0216). A frame of the move then shifts layers the GPU already holds
 * rather than painting the panel, the table and the chart again where they
 * now stand, which was 185 ms of painting across a 300 ms close of a 200-row
 * report, and 35 ms on layers (2026-10-22). Only while it moves, because a
 * layer is a containing block for anything fixed inside it, and the table's
 * column-drag ghost is. Not while the panes move: the table stands still on
 * the screen then, the chart is cheap to paint where it now stands, and
 * lifting both onto layers at the press cost more than the frames saved.
 */
export const LAYOUT_HOLD = {
  rest: 'absolute inset-0',
  mapPush: 'absolute inset-y-0 left-[calc(50%-50vw)] w-screen',
  mapPanes: 'absolute inset-x-0 top-[calc(50%-50dvh)] h-dvh',
  clip: 'overflow-clip',
  layer: 'will-change-transform',
  table: 'w-screen',
  chartClosing: 'w-[calc(100vw-22.5rem)]',
  chartOpening: 'w-screen',
} as const

/**
 * The Controls sheet (#696; record 0141): on a phone the panel is a sheet
 * the summary chip raises from the map's foot, where a desk docks it beside
 * the map. A bottom sheet (`BOTTOM_SHEET`), modal over the same dim, which
 * moves nothing under it: the Analyze button, the scale and the (i) stand
 * where they stood, under the dim and out of reach (record 0207). Three
 * differences come from what it holds. It never unmounts, so the panel's
 * state outlives a close, and shut it slides below the map's foot (`shut`)
 * and goes inert. Its height is set where it is placed (`controlsSheetPx`),
 * a fixed share of the map. And it stands on the panel's own layer,
 * `LAYER.drawer`, with its dim (`scrim`) one layer under, where the menu
 * sheets stand both on `popover`, so a sheet opened from inside the panel
 * stands over both. `focus:outline-none` because the card itself takes the
 * keyboard as it opens, as a menu sheet's does.
 */
export const CONTROLS_SHEET = {
  scrim: `fixed inset-0 ${LAYER.scrim}`,
  card:
    `absolute inset-x-0 bottom-0 ${LAYER.drawer} flex flex-col overflow-hidden ` +
    `bg-panel border-t border-frame rounded-t-lg ${ELEVATION.overlay} ${MOTION.slide} focus:outline-none`,
  shut: 'translate-y-full',
  /** The panel under the sheet's top, which takes the rest and scrolls inside. */
  panel: 'min-h-0 flex-1',
  /**
   * The panel's scrolling body on a phone: its own 16px at the end, the gap
   * the stack keeps above each rule, plus the home indicator band
   * (`SAFE_AREA`; record 0152), so the document links clear the band once
   * scrolled to. The end shade is told the band, since it stands on the
   * scroller's padding.
   */
  body: 'pb-[calc(1rem+env(safe-area-inset-bottom))] [--scroll-shadow-end-inset:env(safe-area-inset-bottom)]',
} as const

/**
 * The space above and below each metric's radio label in the Metrics grid,
 * which sets the row pitch at 32px on a fine pointer (#687, record 0130).
 *
 * The rows stood 28px apart: a 16px radio label and a 22px bound box with the
 * grid's 6px gap between rows, which failed the spacing test of WCAG 2.2
 * SC 2.5.8 (a 24px circle on each undersized target may meet no other
 * target). 5px above and below the label makes each row 26px tall and the
 * pitch 32px, and nothing anyone presses changes size: the targets pass by
 * spacing rather than by growing. 24px targets at a 30px pitch were mocked
 * beside it and declined. The Metrics section grows from 359 to 387px.
 *
 * Fine pointer only: on a touch screen `TAP.row` already makes the label a
 * finger's 32px, the pitch the margin buys here, and the margin there would
 * only spend height.
 */
export const METRIC_LABEL_PITCH = 'my-[5px] touch:my-0'

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
 * The ground the calendar stands on inside its popover (#687, record 0129).
 *
 * The calendar was a bordered well in the panel body until the date field
 * replaced it; it now opens on `Menu.tsx`'s card, which draws the edge, so
 * this carries the well's recessed fill and not its border. The fill is what
 * matters: `DAY.range` is sky-950, which sits within a point and a half of
 * slate-800's lightness and reads there by hue alone (1.05:1), where on
 * slate-900 there is real lightness between them (1.28:1). Every ratio in the
 * calendar holds on this ground as it did in the well:
 *
 * | on slate-900 | |
 * | --- | --- |
 * | day text (slate-200) | 14.49 |
 * | dimmed day + today ring (slate-400) | 6.79 |
 * | range band (sky-950) | 1.28 |
 *
 * `DAY.range` itself does not move, so the selected end still reads against it
 * at the pinned 3.04:1 and `--color-sky-650` needs no re-derivation.
 *
 * The radius is the card's, so the fill does not paint over its rounded
 * corners, and the ground is what scrolls when a short window caps the card's
 * height, wearing the one shared bar.
 */
export const CALENDAR_GROUND =
  `${RECESSED_FILL} ${RADIUS.surface} min-h-0 overflow-y-auto p-2 ${SCROLL_BARS}`

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
   * cells, wider than they are tall.
   *
   * 28px on a fine pointer (#687), where it was 36: a mouse needs no more,
   * and five or six week rows at 36px made the calendar the tallest thing in
   * the panel. The popover card is 312x265px with five week rows at 28px,
   * 40px shorter than at 36 (measured 2026-10-13). A touch screen takes 32,
   * every finger's row height (`TAP`, record 0223).
   */
  cell: 'flex h-7 touch:h-8 items-center justify-center',
  /**
   * The weekday initials over the grid: the height the day rows had, kept
   * when they came down to 28px, so the initials stand apart from the first
   * week rather than reading as a row of days, on either pointer.
   */
  head: 'flex h-9 items-center justify-center',
  full: 'text-ink hover:bg-raised',
  partial: 'text-ink-soft hover:bg-raised',
  unservable: 'text-ink-ghost',
  range: 'bg-range hover:bg-range-hover',
  selected: ACCENT.fill,
  today: 'ring-1 ring-inset ring-ink-soft',
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
  `${FIELD_LOOK} ${TAP.height} ` +
  'focus:outline-none focus:border-mark placeholder-ink-soft'

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
 *   which the call site draws back as the chevron every menu trigger wears
 *   (`IconChevron` in `ICON_ADORNMENT`, record 0201), one glyph we control
 *   on every platform rather than one we control on none.
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
 * One menu for every control that opens one at a desk (#714; record 0201).
 * The maintainer found five menus behaving five ways ("Right now it feels
 * like chaos"): a chart dropdown square and drawn over its own field, the
 * model list joined to its field, the results bar's lists the width of the
 * whole button group, three hovers and two of them none. So there is one
 * menu, the Layers chip's card, and these roles are its parts. `Menu.tsx`
 * draws the card, `MenuButton` the trigger and `MenuSelect` the two lists
 * that were native selects; the linter's `style-one-menu` check holds every
 * desk menu to them.
 *
 * The trigger keeps one of three shapes, on purpose: a pill on the map, a
 * field in the panel, a button in the results bar's group (TJ, 2026-10-20:
 * "Three shapes, recorded"). Each is where it stands and reads as its
 * neighbours do. Everything else is the one menu: the chevron, the hover,
 * the open state, the card, its gap and width, the rows and their type.
 */

// The field chevron's inks: the adornment's slate at rest, and the accent
// under the pointer and while its menu is open, where the field's edge turns
// accent with it. On the chevron rather than inherited from the field,
// because an open field keeps its label's ink and only its edge and chevron
// say it is open. `group-enabled` so a faded field does not light.
const FIELD_CHEVRON_INK = 'group-enabled:group-hover:text-accent-ink group-aria-expanded:text-accent-ink'

/**
 * The three trigger shapes (record 0201), each with the one hover and the
 * one open state:
 *
 * - `chip`: `MAP_CHIP`, which already had both: under the pointer its edge
 *   and label take the accent (`ACCENT.edgeHover`, `ACCENT.hoverText`), and
 *   while its menu is out it is lit in the accent fill.
 * - `field`: `SELECT`, with the same accent edge and label under the pointer,
 *   and the accent edge while open. A field is not lit while open, because a
 *   filled field would read as a value chosen rather than a list shown.
 *   Spelled with `enabled:` here rather than composed from `ACCENT`'s hover
 *   roles, so the faded model picker over an archive window does not light.
 *   `relative`, because its chevron stands inside it.
 * - `bar`: `ACTION_ITEM`, whose hover is the accent label alone (it has no
 *   edge of its own inside its group), lit like a chip while open.
 *
 * The lit fill is `ACCENT.fill`'s two classes as `aria-expanded` variants,
 * which sort after the resting fill and the hover and so win without a race.
 */
export const MENU_TRIGGER = {
  chip: MAP_CHIP,
  field:
    `${SELECT} group relative enabled:hover:border-accent-ink enabled:hover:text-accent-ink ` +
    'aria-expanded:border-accent-ink',
  bar: `${ACTION_ITEM} aria-expanded:bg-accent aria-expanded:text-on-fill`,
} as const

/**
 * Where each shape's chevron stands: `IconChevron`, down while the menu is
 * shut and up while it is open, because a desk's menu drops from its trigger.
 * A phone's chip and a phone's bar button carry none: their sheet rises from
 * the bottom, so the arrow would point the wrong way (TJ, 2026-10-18).
 *
 * The chevron's stroke spans the middle 8px of `ICON.control`'s 16px, so its
 * box holds 4px of nothing past the stroke. A chip takes all 4px back
 * (`-mr-1`), so the glyph stands 12px from its right edge as the label does
 * from its left. A bar button takes 2px (`-mr-0.5`): its inset is 6px, and
 * the stroke then stands 8px from its edge, where its leading glyph's stroke
 * stands. A field's stands in `ICON_ADORNMENT`'s place, inside the room
 * `SELECT` reserves, where the filled select arrow stood until record 0201.
 */
export const MENU_CHEVRON = {
  chip: '-mr-1',
  bar: '-mr-0.5',
  field: `${ICON_ADORNMENT} ${FIELD_CHEVRON_INK}`,
} as const

// A row's shape in any menu: 6px in from the list's 4px, so its words stand
// 10px from the card's edge as the Layers rows do, and one line however long.
const MENU_ROW = 'rounded px-1.5 py-0.5 whitespace-nowrap'

/**
 * The card and what stands in it (record 0201).
 *
 * - `card`: the Layers menu's surface (`SURFACE_CHIP_CARD.menu`), on the
 *   popover layer, as a column so a list inside it can take the room left and
 *   scroll. Placed 4px under its trigger by `usePopover`.
 * - `foot`: the strip under a list (Restore all), at the rows' 10px inset.
 *   No card repeats its own name over its rows: it stands under the
 *   trigger that names it (record 0222). The model picker's overlines name
 *   groups of rows inside its card, which is a different job.
 * - `list`: the scrolling list, 4px in from the card's sides and 6px from its
 *   top and bottom, so a row's words stand 10px from the edge and the first
 *   one 8px down, where the Layers menu's `px-2.5 py-2` stands its own.
 * - `row`: a row's inset and shape, for a row that brings its own type and
 *   control (a checkbox row wears `CHOICE_ROW` beside it).
 * - `cardRow`: the same inset and pitch for a row that stands straight on a
 *   card's 10px padding rather than in a `list` (the Layers rows): pulled out
 *   6px and padded back, so its words stay where they were and its fill
 *   starts 4px from the card's edge, where a `list` row's does, and 20px
 *   apart like every other menu's rows (record 0222).
 * - `hover`: the raised fill under the pointer, on every row a press acts
 *   on: a checkbox row's whole width toggles its box, so it lights the way a
 *   pick-one row does under `active`. A disabled row takes none, because
 *   nothing happens there, and neither does a row whose only control is a
 *   link inside it (Removed rows), which lights on its own.
 * - `option`: a row a reader picks, at the control type, 20px apart.
 * - `active`: the row under the pointer or the arrow keys, in the raised fill.
 * - `current`: the value a list that replaced a select holds, set semibold
 *   the way the model list sets its ranking model. No check mark: the weight
 *   says it, and a mark would take a column from every row.
 */
export const MENU = {
  card: `${SURFACE_CHIP_CARD.menu} ${LAYER.popover} flex flex-col`,
  list: `min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1.5 ${SCROLL_BARS}`,
  row: MENU_ROW,
  cardRow: '-mx-1.5 rounded px-1.5 py-0.5',
  option: `${TEXT.control} ${TAP.row} ${MENU_ROW} cursor-pointer`,
  active: 'bg-raised',
  hover: 'hover:bg-raised',
  current: 'font-semibold',
  foot: `border-t ${SURFACE_DIVIDER} px-2.5 py-2`,
} as const

/**
 * A row of the model list (#801). The checkbox comes first, as in every other
 * checkbox menu (`CHOICE_ROW`), and a hairline parts each model from the next
 * with 8px over and under it: a row is a name, two figures and a sentence or
 * two, and eight of them with nothing between read as one paragraph, most of
 * all on a phone. Every name is semibold (`name`), so each row starts on its
 * box and its name; the ranking model is the one under the Ranking chip, its
 * tick fixed.
 *
 * The raised fill follows a mouse (`MENU.hover`) and the keyboard (`keys`,
 * while the list shows its focus ring), never a finger. The list's cursor
 * stands on the ranking row from the moment it opens and moves to wherever a
 * tap lands; lit for a finger, with nothing to steer it away, it read as the
 * selection. `keys` reads the listbox's focus through `list`.
 */
export const MODEL_ROW = {
  list: 'group/list',
  row: `flex items-start gap-2 border-t first:border-t-0 ${SURFACE_DIVIDER} px-1.5 py-2 ${MENU.hover}`,
  keys: 'group-focus-visible/list:bg-raised',
  name: TEXT.subheading,
} as const

/**
 * The message list the Analyze button's badge opens (record 0208): the
 * severity boxes in a column, 8px apart, on the one menu's card at a desk,
 * where they stand in `MENU.list`'s inset and scroll in it when the card is
 * capped, and in a bottom sheet headed Messages on a phone, where the
 * sheet's body carries the side inset and the column takes 8px top and
 * bottom.
 */
export const MESSAGE_LIST = {
  card: `${MENU.list} space-y-2`,
  sheet: 'space-y-2 py-2',
} as const

/**
 * The calendar's field under Dates (#687, record 0129): a field holding the
 * window in the results bar's words, which may wrap to two lines. It is a
 * menu trigger like any field (`MENU_TRIGGER.field`), and these are the two
 * things it does differently.
 *
 * It is the one panel control that may stand two lines tall, because its words
 * are the window itself and the longest of them, an hourly window with a year
 * (`Tue, Oct 14 2025, 10:00 AM to Wed, Oct 15 2025, 11:59 PM`, about 322px at
 * 12px on a Mac), cannot fit the 261 to 293px the field has: an ellipsis there
 * cut off the end time, the part a reader set by hand.
 *
 * So the box aligns to its top and grows downward only when the words need a
 * second line: the first line and the chevron stand exactly where a one-line
 * field centres them. 7px is the 1px border plus `py-1.5` on a fine pointer
 * (one line is 30px); 8px is the border plus 7px on a touch screen, where a
 * one-line field is `TAP.height`'s 32px. The chevron is `ICON_ADORNMENT`'s
 * placement pinned to that first line rather than to the middle of the box,
 * in the field chevron's inks (`FIELD_CHEVRON_INK`).
 */
export const CALENDAR_FIELD = {
  box: 'flex w-full items-start px-2 py-1.5 touch:py-[7px] text-left',
  arrow: `pointer-events-none absolute right-2 top-[7px] touch:top-[8px] text-ink-soft ${FIELD_CHEVRON_INK}`,
} as const

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
 * Quieter than nothing and louder than off: 60% against `DISABLED`'s 40%, and
 * unscoped rather than behind the `disabled:` variant, because none of these
 * elements is disabled and the variant would never fire.
 *
 * 60 is the lowest multiple of ten that keeps a muted label legible. WCAG exempts
 * only INACTIVE controls from 1.4.3, and these still work, so their text owes
 * 4.5:1. At 50% the slate-200 label measured 4.14:1 on the slate-800 panel
 * (Include unnamed peaks), 4.61:1 on an idle metric row's select, and 4.23:1
 * on an unplotted chart chip; at 60% the three are 5.26, 5.98 and 5.41.
 *
 * Three sites spelled it before it had a name (#390). No colour of its own,
 * for the same reason `DISABLED` carries none: it composes over whatever role
 * the control already wears instead of racing it by stylesheet order.
 *
 * The amount is a theme token since #706 (`--ui-muted` in `index.css`): 60%
 * in dark, and 65% in light, where the light ink at 60% measured 4.31:1 on
 * the panel, 4.50 on a select and 4.38 on a chip, and 65% measures 5.07,
 * 5.34 and 5.08. A dark ink fading toward a light ground loses contrast
 * faster than a light one fading toward a dark ground, so the light theme
 * needs the louder step for the same claim.
 */
export const MUTED = 'opacity-(--ui-muted)'

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
 * the one part that has to be findable at a glance while it moves. In the
 * light theme (#706) the thumb is the ink instead (`--ui-thumb`): half of it
 * stands on the white well there, where a white thumb would vanish, and the
 * ink reads 3.75:1 on the light theme's mark, beside the white thumb's 2.71:1
 * on the dark one's. It is 14px,
 * which is under a finger's 32px — deliberately, and it is the exception
 * `TAP.grip` already argues for: the control is a horizontal drag on a bar that
 * is itself the target, so the height that matters is the input's, and the
 * thumb is a mark on it rather than a thing to hit.
 *
 * No shadow, which is `ELEVATION.none` (#687): the thumb rides a track inside
 * a floating box rather than standing off it, a white mark on a dark well
 * needs no lift to be found, and the Firefox thumb never carried the shadow
 * the WebKit one did, so the two engines now draw one thumb.
 */
const SLIDER_THUMB =
  '[&::-webkit-slider-thumb]:[appearance:none] [&::-webkit-slider-thumb]:h-3.5 ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-thumb ' +
  '[&::-moz-range-thumb]:[appearance:none] [&::-moz-range-thumb]:h-3.5 ' +
  '[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-thumb'

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
  '[&::-webkit-slider-thumb]:bg-thumb ' +
  '[&::-moz-range-thumb]:[appearance:none] [&::-moz-range-thumb]:h-6 ' +
  '[&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:rounded-sm ' +
  '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-thumb'

/**
 * The parts of the two range inputs that are not the input itself: the
 * coverage slider's overlay input and the two text layers it reads through,
 * and the rail the timeline's scrubber slides on. One object since #687, the
 * way `DAY` and `TABLE` group theirs, because five exports for one control's
 * parts read as five controls.
 */
export const SLIDER = {
  /** The coverage slider's range input itself: see `SLIDER_BAR_THUMB` above. */
  overlay:
    'absolute inset-0 h-full w-full appearance-none cursor-pointer bg-transparent ' +
    `${FOCUS_RING} ` +
    SLIDER_BAR_THUMB,
  /** The slider's value readout: the colorless control size above. */
  value: CONTROL_SIZE,
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
  wordmark: `${CONTROL_SIZE} font-semibold`,
  /**
   * The coverage slider's un-filled text layer: the same idle slate the resting
   * segment wears, carried by the layer rather than the shape so the filled
   * copy of the identical line can be white without two colors racing.
   */
  idle: 'text-ink-soft',
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
  track: `h-2 ${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.pill}`,
  /**
   * The well the coverage slider's layers stack in: the same recessed fill
   * and edge as every other well, at the control radius the segment above it
   * wears. The caller sizes and positions it.
   */
  well: `${RECESSED_FILL} ${RECESSED_EDGE} ${RADIUS.control}`,
} as const

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
// Not exported (#687): the call site takes `TRANSPORT_AXIS_ITEM`, which
// carries it, and `styles.test.ts` reads the floor off that role.
const TRANSPORT_AXIS_W = 'min-w-[58px] touch:min-w-[58px]'

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
 * The player's play button: a 28px square on a fine pointer and a finger's
 * 32 on touch (`TAP`, record 0223), square on both. `TAP.action` would give
 * it 44px of width under a finger and draw it as a bar.
 */
export const TRANSPORT_PLAY = 'flex h-7 w-7 touch:h-8 touch:w-8 flex-shrink-0 items-center justify-center'

/**
 * The results grid's two cell insets, which had been spelled out ten times
 * across one file.
 *
 * A row is 28px and stays 28px: this is the one surface that holds the 24px AA
 * floor (`TAP.dense`) rather than a finger's 32, because the ranking is the
 * thing the phone is there to read and 32px rows would show 18 of them instead
 * of 21. The controls living in a cell — the remove ×, the chart checkbox, the
 * destination link — get the floor; the row keeps its density.
 */
export const TABLE = {
  cell: 'px-2 py-1.5',
  head: `${TEXT.subheading} px-2 py-2 text-left`,
  /**
   * A number column's header and cells stand at the cell's end (record 0222):
   * the elevation and every metric, so a column's digits line up down the
   * table as the popup's do (`isNumberColumn`). The header is a recipe of its
   * own rather than `head` plus `text-right`, because two alignments on one
   * element resolve by stylesheet order rather than by which was written last.
   */
  headNumber: `${TEXT.subheading} px-2 py-2 text-right`,
  number: 'text-right',
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
  row: 'group border-t border-rule/50 hover:bg-raised/30 transition-colors',
  /**
   * A ranked row a press opens the marker popup from (#696; record 0143):
   * the pointer says the whole row answers, where it said so over the name
   * alone. A pending row has no forecast card to open and does not wear it.
   */
  rowOpens: 'cursor-pointer',
  /**
   * The Name column stands still while the rest of the table scrolls
   * sideways under it, at both widths (#696; record 0142): on a phone the
   * table is three or four columns of a dozen wide, and a number read two
   * swipes from its name was a number with no destination. Left 0, so the
   * chart box and the rank scroll away under it like any other column
   * rather than sticking at offsets the rank's digits would move.
   *
   * A sticky cell must be opaque or the columns under it show through, so
   * the body cell lays the panel's slate-800 and the header cell the
   * header's slate-700. The row's hover tint is a gradient laid over that
   * fill on hover (`group-hover`, the row's group), since a translucent
   * fill cannot tint an opaque one from underneath; one layer over the
   * columns that scroll and under the header, which stands above every
   * body cell as it does now.
   */
  stickyNameCell:
    'sticky left-0 z-[1] bg-panel bg-linear-to-r ' +
    'group-hover:from-raised/30 group-hover:to-raised/30',
  /** The same column's header cell, on the header's fill. */
  stickyNameHead: 'sticky left-0 z-[1] bg-raised',
  /**
   * The most a phone's Name column takes before a reader sizes it (#696;
   * record 0142): its widest name and the cell's padding, but never more than
   * 45% of the results sheet, 162px at 360 wide and 175 at 390, so a column
   * that stands still leaves the columns scrolling past it most of the
   * screen. It stood at its widest name, 210px on the sample report, which
   * left a 360px phone 150px for every number. On the name's line inside the
   * cell (`cqi` is the table's scroller, `@container`), less the cell's `px-2`
   * either side, so the name truncates as it does in a column sized narrow;
   * the popup a row tap opens carries it whole. Off once the reader drags or
   * fits the column, whose width is then theirs, and off at a desk, whose
   * table has the room.
   */
  nameCap: 'max-lg:max-w-[calc(45cqi-1rem)]',
  /**
   * The rank cell's two faces, the number and the remove ×, laid in ONE grid
   * cell so the column is as wide as the wider face at all times and a hover
   * trades only visibility. Swapping them with display let the column grow by
   * the icon's extra width on every hover and shove every column to its right
   * (#339). A coarse pointer has no hover and draws the number alone: its
   * remove is the marker card's, which the row tap opens (#696).
   */
  rankStack: 'group/rank inline-grid items-center justify-items-center',
  rankFace: 'col-start-1 row-start-1',
  /**
   * Which face shows. The number gives way on row hover, and while the × has
   * keyboard focus. The × idles at no OPACITY rather than `invisible`, which is
   * the whole of #576 item 9: an element with `visibility: hidden` cannot take
   * focus, so Tab skipped every row's remove and a keyboard could reach it
   * only through the chart legend. Opacity keeps it in the Tab order, and the
   * focus it takes is what shows it.
   *
   * On a coarse pointer the × is not drawn at all (#696). It used to stand
   * beside the number there, forced visible because a finger has no hover;
   * now a finger removes a row from the card its row tap opens, which says
   * `Remove from analysis` in words. Hidden rather than left at no opacity,
   * because an invisible button in the number's cell would take the tap the
   * reader aimed at the row and remove it.
   */
  rankIdleFace: 'group-hover:invisible group-has-[:focus-visible]/rank:invisible',
  removeFace: 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:hidden',
  /**
   * A footnote reference on a cell: the `*` a Model cell carries when its
   * model ends inside the window (#508), pointing at the line under the table.
   * Raised and muted so it reads as a pointer to that line rather than as part
   * of the label beside it, in the footnote's own size and color.
   *
   * It must add no row height, or a comparison's marked rows would sit taller
   * than their neighbours. Preflight raises a `sup` by a relative offset, which
   * moves the glyph and not the line box, and `leading-0` states the zero line
   * height preflight also gives it, so a size step that carries its own
   * leading cannot put one back. `styles.test.ts` holds both.
   */
  mark: `${TEXT.micro} leading-0`,
  /**
   * A cell whose text can run longer than a column should: the Closure cell,
   * which names the order that closed the ground under a row. Region 6 titles
   * the orders in fifteen to forty-three characters ("Bear Creek South Area
   * Closure"), and every one fit as a plain column in #550. Regions 3 and 4
   * (#551) title a forest order in up to a hundred ("Upper & Lower Tonto Creek
   * Campground and Horton Creek Trailhead Parking Area Temporary Closure
   * Order"), which is wider than the map column and the name column together.
   * So the cell is capped and the tail is clipped to an ellipsis, with the
   * whole name on the link's hover (TJ, 2026-09-30: "clip and ellipses").
   *
   * 256px is the cap: it holds every Region 6 title but the three "Area,
   * Road, and Trail" ones in full at the table's 12px mono, and clips the
   * forest-order ones after roughly two clauses, which is where the ground
   * has been named and the rest is the order's paperwork. `inline-block`
   * because `max-w` clamps an inline-block's contribution to auto table
   * layout, so the column defends its content up to the cap and no further;
   * the cap rides only while the column is UNSIZED, because a dragged or
   * fitted width is the reader's choice and `sized()` clips to it already.
   */
  clip: 'inline-block max-w-64 truncate align-bottom',
} as const

/**
 * The guided tutorial (#536): a spotlight over one control and a card beside
 * it. The spotlight is ONE element wearing a shadow as wide as the screen, so
 * the dim layer and its rounded cut-out are the same box and cannot drift
 * apart the way four separate rects around a target would. Its corners are
 * not a role: the tour reads them off the target (`spotRadius` in
 * `tour/place.ts`, #696), square around a section between two rules and a
 * sheet with straight edges, the target's own radius plus the pad around a
 * rounded control. The card is the welcome
 * dialog's surface at the modal layer (above the drawer and every popover),
 * fixed and sized by the same 320px the welcome card reads at on a phone. Under
 * `SHEET_MAX_W` (`tour/place.ts`) it is a full-width sheet along the bottom
 * edge instead, because a card beside a control has nowhere to go at 360px. Every colour here is a role the
 * app already wears; the dim is the welcome backdrop's black at 60%. No role
 * here carries a transition: the light and the card move between steps by a
 * glide `Tour.tsx` runs a frame at a time (`glide` in `tour/place.ts`), since
 * a transition handed a new end every frame by a moving target restarts
 * every frame and stands still (#786).
 */
export const TOUR = {
  spotlight: 'absolute pointer-events-none shadow-[0_0_0_200vmax_rgba(0,0,0,0.6)]',
  card: `${SURFACE_CARD} fixed w-80 p-4 space-y-3 focus:outline-none`,
  sheet: `${SURFACE_CARD} fixed inset-x-4 bottom-4 p-4 space-y-3 focus:outline-none`,
  /** The sheet at the top edge, for a target that stands where the bottom sheet would. */
  sheetTop: `${SURFACE_CARD} fixed inset-x-4 top-4 p-4 space-y-3 focus:outline-none`,
}
