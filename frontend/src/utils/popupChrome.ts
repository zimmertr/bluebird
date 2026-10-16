// The shared chrome of every map popup: the card (`popupCard`), its header
// band with the title, link-out glyph and facts line, and the notices, body
// and action sections below it.
//
// Every popup that describes a thing wears it: a ranked result, a clicked
// basemap feature, a fire, a closure and a smoke plume (#738). They had
// drifted into three looks for what is one kind of object, a thing on the map
// that says what it is, and the overlays kept the old ruled shell after the
// destination card moved on. The linter's `style-popup-card` check fails a
// popup builder that does not return `popupCard`, so a new layer's card
// cannot start a fourth look.
//
// Every colour in it is a `--popup-*` value `map.css` declares once per theme
// (#740), named here as `var(--popup-label)` and resolved where the markup
// lands, so one card is dark in the dark theme and white in the light one.
// The hexes and ratios below are the light card's, which is the white it has
// always been; `styles.test.ts` measures every pair in both themes.
//
// It lives in utils, like the popup bodies that compose it, because this markup
// is handed to MapLibre's setHTML and the design system in styles.ts cannot
// reach it: Tailwind scans source for class names and generates CSS for the
// document, but a string passed to setHTML is not a class list the scanner ever
// sees. Keeping it out of the component is also what makes it unit-testable
// without pulling maplibre-gl into a node test.
import { externalLinkMarkup } from '../iconPaths'
import { AGGREGATE } from '../metrics'
import type { PopupGrid, PopupGridCell } from './popupRows'

/**
 * The popup's type ramp, and the face everything in it is set in.
 *
 * Three sizes and no more: the title at 13px, the body a step down at 12px so
 * the details do not compete with the thing they describe (and so the widest
 * row, the coordinates, fits a narrower card), and 11px for the one line that
 * qualifies the rest, an overlay's "last updated" date. The same three numbers
 * were spelled in five files before #365 (`popupChrome.ts`, `poiPopup.ts`,
 * `smoke.ts`, `wildfires.ts`, `closures.ts`), which is how a popup gets a
 * fourth size: the linter's inline-style ban now fails a `font-size:` written
 * outside this file. The face and the title size are not exported: the card
 * is the only thing that sets them (#738), where three overlays used to
 * compose a card of their own from them.
 */
const POPUP_FACE = 'font-family:sans-serif;line-height:1.5'
const POPUP_TITLE_SIZE = 'font-size:13px'
export const POPUP_BODY_SIZE = 'font-size:12px'
export const POPUP_FINE_SIZE = 'font-size:11px'

/**
 * The face a value is set in. Monospace, because that is what the results table
 * already does — every metric cell is mono there and only the name is sans — so
 * the same numbers look the same in both places, and a column of them lines up
 * on the decimal.
 *
 * It is not the whole of the label/value split. The face alone was too quiet
 * to read as a split (TJ, 2026-09-14), so the two halves separate on two axes:
 * the value keeps this face, and the LABEL steps back in colour. `LABEL_COLOR`
 * below is where that second axis is measured, and why it is colour rather
 * than a second weight.
 *
 * Weight is not the free axis it looks like. The popup carries exactly one
 * <strong>, on the title, and that is the whole of its emphasis: a bold inside
 * a row marks a favourite row rather than a kind of text, which is what two
 * VALUES wearing one by no rule at all — precipitation's total and the AQI
 * average, singled out since the original implementation — read as.
 *
 * The stack is spelled out rather than left to a bare `monospace` keyword
 * because this markup is handed to MapLibre's setHTML.
 */
export const VALUE_FACE = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

/**
 * One "label: value" line.
 *
 * Every stat gets its own. Wind and temperature used to share a line separated
 * by a "·" — the only line carrying two metrics, and the only one long enough
 * to wrap, so on a narrow map it broke at whatever character reached the edge
 * and the second label landed mid-line under the first one's number.
 *
 * `href` links the VALUE rather than the whole line, which is where the table
 * puts its link too: the label names the metric and the number is the thing
 * that has somewhere to go (TJ, 2026-09-14).
 */
export function row(label: string, value: string, href?: string | null): string {
  const shown = `<span style="${VALUE_FACE}">${value}</span>`
  return `<div>${rowLabel(label)}: ${href ? popupLink(href, shown) : shown}</div>`
}

/**
 * The colour a row's label takes, so it reads as a label rather than as the
 * first half of the value (TJ, 2026-09-14).
 *
 * **Colour rather than weight, and that is a measurement rather than a taste.**
 * The obvious answer was a lighter weight than the title's 700. It does not
 * work here: this markup declares `font-family:sans-serif`, and under the
 * generic keyword Chrome on macOS resolves exactly TWO faces — 400 and 500
 * render identically, 600 and 700 render identically (measured 2026-09-14:
 * 126.73px for the first pair, 133.27px for the second). So every weight
 * available is either invisible or the title's own. Pointing the popup at the
 * app's stack instead gave four widths, but evenly spaced ones — the signature
 * of synthetic emboldening rather than four drawn faces — and the pairs still
 * read alike.
 *
 * Colour has no such dependency: it renders the same wherever the card opens,
 * and it is the axis the app's own panels already use to step text back.
 * Slate-600 measures 7.4:1 on the light card's white, well past AA for text,
 * so the label recedes without becoming hard to read. Anything lighter starts
 * to: slate-500 is 4.76:1, which is a pass for text you glance at and thin for
 * text you read. The dark card's label is the panel's own soft ink.
 *
 * The popup's one <strong> therefore stays where it was, on the title.
 */
export const LABEL_COLOR = 'color:var(--popup-label)'

/**
 * A row's label.
 *
 * The colon stays outside it: it is punctuation joining the two halves rather
 * than part of the name, and it reads better light between a weighted label
 * and a mono value than swept into either.
 */
export function rowLabel(label: string): string {
  return `<span style="${LABEL_COLOR}">${label}</span>`
}

/**
 * The colour a link takes inside a popup.
 *
 * The light card is black on white, where `LINK_ACTION`'s sky-400 would land
 * at 2.1:1, so it takes sky-700, 5.74:1 on white. The title's link glyph
 * keeps a lighter shade because an icon answers to the 3:1 rule instead. The
 * dark card's links are the panel's own accent ink.
 */
export const LINK_COLOR = 'var(--popup-link)'

/**
 * A grid number's link, in the card's ink: underlined like any link here, but
 * without the sky, as the results table's numbers are (`metricGrid`). Passed
 * as `popupLink`'s `extra`, so it overrides `LINK_COLOR` by coming after it.
 */
export const VALUE_LINK = 'color:var(--popup-ink)'

/**
 * A link inside a popup body.
 *
 * `extra` is appended AFTER the colour, so a caller that owns its own colour —
 * the fire warning, which is amber before it is a link — overrides it by
 * declaring it again rather than by not using this.
 *
 * `href` is the raw url and is escaped here, as `linkIcon`'s is: an attribute
 * value is the one place in this markup where a quote mark ends the value and
 * whatever follows it becomes markup, so the link cannot leave it to every
 * caller to remember (#621). `inner` is markup the caller has already built.
 */
export function popupLink(href: string, inner: string, extra = ''): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR};text-decoration:underline;${extra}">${inner}</a>`
}

/**
 * The firmer of the grid's two rules, slate-300, under its heads. It was the
 * rule between a popup's title and its body until every popup became a card
 * (#738), whose header band parts the two instead.
 */
export const RULE_COLOR = 'var(--popup-rule)'

/**
 * The amber a safety warning wears in a popup: the fire line and the closure
 * line, which are flags rather than measurements. Amber-500, the popup-side
 * counterpart of the `STATUS` amber the table's Wildfire column wears in the
 * stylesheet. On white it measures 2.15:1, under the 4.5:1 AA asks of 12px
 * text, and stays by the maintainer's choice: amber-700 (5.02:1) was tried on
 * the #700 preview and TJ kept this one (2026-10-08). The one colour the two
 * themes share, because on the dark card the same amber clears AA. Pinned in
 * `styles.test.ts`, so a change re-measures rather than inherits.
 */
export const WARNING_COLOR = '#f59e0b'

/**
 * One safety warning, the whole sentence a link where it has one. It carries
 * no glyph of its own: the section's one ⚠️ stands for every line in it
 * (`popupCard`). It keeps one line and ends in an ellipsis where it
 * outruns the card, as a title does (TJ, 2026-10-08): a closure order's name
 * wrapped most cards onto a second line, which on a phone is a row of the
 * grid scrolled out of view. The card still widens to its cap first, so the
 * cut takes only what no card could show. The text is escaped by the caller,
 * since it carries third-party names, and stays whole in the markup for a
 * screen reader.
 */
export function warningLine(text: string, href: string | null): string {
  const style = `color:${WARNING_COLOR};font-weight:600;display:block;${ONE_LINE}`
  return href ? popupLink(href, text, style) : `<span style="${style}">${text}</span>`
}

/** One line, cut with an ellipsis: a popup's title and its warnings. */
const ONE_LINE = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

/**
 * The colour of the one line that qualifies a card rather than adding to it:
 * an overlay popup's "last updated" date, set small and italic in slate-400.
 * It is the colour those popups shipped with and #365 only named it; on the
 * light card's white it measures 2.98:1, under AA for text, and raising it is
 * a colour decision for the maintainer rather than a move. The dark card's is
 * the panel's faint ink, the same step back from its label.
 */
export const FINE_COLOR = 'var(--popup-fine)'

/**
 * A line of fine print: small, italic, stepped back. The overlay cards end
 * their body on one, because a survey date qualifies everything above it
 * rather than being another fact in the list. The text is escaped by the
 * caller.
 */
export function fineprint(inner: string): string {
  return `<span style="color:${FINE_COLOR};${POPUP_FINE_SIZE};font-style:italic">${inner}</span>`
}

/**
 * A button inside a popup.
 *
 * MapLibre's popup is outside the stylesheet, so `BUTTON_PRIMARY` and its
 * siblings in `styles.ts` cannot dress it; these are their popup-side
 * counterparts, one recipe with the colour as the only variable, where three
 * files used to spell three near-identical buttons (#365). `primary` acts
 * (sky-600 under white on the light card, the app's accent fill on the dark
 * one), `secondary` undoes (slate-700 under slate-200 on the light card, the
 * panel's raised hover on the dark one), and `danger` removes (red-500 under
 * white in both). `attr` is the attribute the map
 * handler finds the button by, written whole (`data-rm`, or
 * `data-poi-action="add"`); `extra` is appended last, as `popupLink`'s is, for
 * the one button that sits under rows and needs a margin above it.
 */
export type PopupButtonVariant = 'primary' | 'secondary' | 'danger'
const POPUP_BUTTON_LOOK: Record<PopupButtonVariant, string> = {
  primary: 'background:var(--popup-primary);color:#fff',
  secondary: 'background:var(--popup-secondary);color:var(--popup-secondary-ink)',
  danger: 'background:#ef4444;color:#fff',
}
export function popupButton(
  attr: string,
  variant: PopupButtonVariant,
  label: string,
  extra = '',
): string {
  return `<button ${attr} style="border:none;padding:5px 12px;border-radius:4px;cursor:pointer;${POPUP_BODY_SIZE};font-family:sans-serif;font-weight:600;${POPUP_BUTTON_LOOK[variant]}${extra ? ';' + extra : ''}">${label}</button>`
}

/**
 * The band between the title and the rule: what the destination IS, ahead of
 * what the forecast says about it (TJ, 2026-09-14).
 *
 * The coordinates moved here from the foot of the card, and the type and the
 * model came with them, because all three identify the point rather than
 * measure it. It carries no labels. A latitude/longitude pair under a place
 * name reads as coordinates without being told, and labelling three facts that
 * are each one word would cost more width than the facts.
 *
 * Every line sets in `LABEL_COLOR` rather than black, so the band reads as the
 * title's subtitle instead of as the first row of data.
 */
export function metaBand(lines: string[]): string {
  const shown = lines.filter(Boolean)
  if (shown.length === 0) return ''
  return `<div style="${POPUP_BODY_SIZE};${LABEL_COLOR}">${shown.join('\n    ')}</div>`
}

/**
 * A destination's facts on one line under its name: the type, the elevation
 * and the coordinates, parted by a light pipe (TJ, 2026-10-08). A ranked
 * result and a clicked basemap feature both draw it, so the same mountain
 * reads the same before and after an analysis (TJ, 2026-10-14, #712); a
 * fact the card does not have is left off rather than filled in.
 *
 * The pipe is drawn in `FINE_COLOR`, which shows on the header band where
 * `RULE_COLOR` all but vanishes, and is hidden from a screen reader, which
 * hears the three facts as a list; it is a divider, not a character to read.
 *
 * The line never wraps. A latitude and a longitude are one value in two
 * halves, and breaking between them leaves a bare negative number on its own
 * line looking like a third figure; it stays at the popup's own size, since a
 * line that shrank to fit would read as an afterthought, so the room comes
 * from the card's width instead. A trailhead's is the longest, 274.7px
 * measured on macOS with the pipes' 5px, which the 340px card holds beside a
 * touch screen's close-button lane.
 *
 * `href` is where the pair links to: CalTopo, centred on the point (#712, TJ
 * 2026-10-14). The coordinates are the one fact on a card that names a place,
 * and the place is what a reader takes elsewhere to see the ground around it.
 * The elevation stays plain: it is a measurement rather than a place, and
 * nothing on the card is its forecast.
 */
export function factsRow(
  type: string | null,
  elevation: string | null,
  latitude: number,
  longitude: number,
  href: string | null,
): string {
  const pair = `<span style="${VALUE_FACE}">${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}</span>`
  const coords = href ? popupLink(href, pair) : pair
  const parts = [
    type ? escapeHtml(type) : '',
    elevation ? `<span style="${VALUE_FACE}">${escapeHtml(elevation)}</span>` : '',
    coords,
  ].filter(Boolean)
  return `<div style="white-space:nowrap">${parts.join(FACTS_PIPE)}</div>`
}

/** The light pipe between two facts, which a screen reader skips. */
const FACTS_PIPE = `<span aria-hidden="true" style="color:${FINE_COLOR};padding:0 5px">|</span>`

/**
 * An overlay's facts line: what kind of thing it is, in the Layers menu's own
 * word for it, and the one figure that identifies it, parted by the pipe a
 * destination's facts wear (#738, TJ 2026-10-16). `Wildfire | 138,285 acres`
 * under a fire's name reads the way `Peak | 7,000 ft` does under a summit's.
 *
 * Unlike a destination's it may be cut with an ellipsis: a route name or a
 * satellite is third-party text with no bound on its length, where a
 * destination's line is three facts of known width. The parts are markup the
 * caller has escaped; an empty one is left off.
 */
export function factsLine(parts: readonly (string | null | undefined)[]): string {
  return `<div style="${ONE_LINE}">${parts.filter(Boolean).join(FACTS_PIPE)}</div>`
}

/**
 * A card's body as plain lines, one block each, for a card whose details are
 * a few sentences rather than a grid: a fire's containment, a closure's forest
 * and dates. Empty lines are left off, so a field the provider left blank is
 * not filled with a word it never said.
 */
export function bodyLines(lines: readonly (string | null | undefined)[]): string {
  return lines
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join('')
}

/**
 * The popup's measurements as a grid: a row per metric family, a column per
 * aggregate with the window total last, headed once at the top (TJ,
 * 2026-10-08, at every width). It replaced a heading line per family with its
 * "Min: … | Max: … | Avg: …" values indented under it, which spelled the
 * aggregate words on every family and took two lines each.
 *
 * A real table, so a screen reader hears each number with its row and column:
 * the family is the row header and the aggregate the column header. Each
 * column is a shaded band with a white gutter on its left, so Min, Max, Avg
 * and Total read as four columns rather than as numbers that happen to line
 * up (TJ, 2026-10-08, column bands over striped rows or tiles). A family's
 * label keeps one line: the card is sized to the widest label beside the
 * widest numbers (`RESULT_POPUP_MAX_WIDTH_PX`). A line with one value, a
 * family narrowed to a single column, may break its longer label rather than
 * push the card wider. Numbers never wrap and are right-aligned, so a column
 * lines up on its last digit in the mono face, the way the table's do.
 *
 * A number that links is underlined in the card's ink rather than in
 * `LINK_COLOR` (`VALUE_LINK`), which is how the results table marks the same
 * number (`TABLE.valueLink`): sky at rest is the accent that says a
 * thing acts, and on every number of a grid it was the card's loudest colour
 * (TJ, 2026-10-16, #740).
 *
 * The number the report ranks by is bold on a cell one slate darker than its
 * column (`GRID_RANKED_COLOR`), so the card says why its destination stands
 * where it does (TJ, 2026-10-08). `compact` narrows every band's inset and the
 * label's gap to fit a map too narrow for the widest grid at full inset
 * (`compactGrid`).
 */
export function metricGrid(grid: PopupGrid, { compact = false }: { compact?: boolean } = {}): string {
  const band = gridBand(compact ? GRID_COMPACT_INSET_PX : GRID_INSET_PX)
  const labelLoose = gridLabel(compact ? GRID_COMPACT_LABEL_GAP_PX : GRID_LABEL_GAP_PX)
  const label = `${labelLoose};white-space:nowrap`
  const headStyle = `text-align:center;font-weight:700;vertical-align:bottom;white-space:nowrap;${band};${GRID_HEAD_RULE};${LABEL_COLOR}`
  const valueStyle = `text-align:right;white-space:nowrap;vertical-align:bottom;${band}`
  const value = (c: PopupGridCell, line: string, span = '') =>
    `<td${span} style="${valueStyle}${c.ranked ? `;background:${GRID_RANKED_COLOR}` : ''}${line}">${cell(c)}</td>`
  const cell = (c: PopupGridCell) => {
    const shown = `<span style="${VALUE_FACE}${c.ranked ? ';font-weight:700' : ''}">${c.text}</span>`
    return c.href ? popupLink(c.href, shown, VALUE_LINK) : shown
  }
  // A one-value line stands across Min, Max and Avg and leaves the Total
  // column empty, so the number cannot read as a window total.
  const hasTotal = grid.columns[grid.columns.length - 1] === AGGREGATE.total
  const lead = Math.max(1, grid.columns.length - (hasTotal ? 1 : 0))
  const head = grid.columns.length
    ? `<tr><td style="${GRID_HEAD_RULE}"></td>${grid.columns.map((c) => `<th scope="col" style="${headStyle}">${c}</th>`).join('')}</tr>`
    : ''
  // A hairline under every line but the last, which the card's edge closes.
  const rows = grid.rows.map((r, i) => {
    const line = i < grid.rows.length - 1 ? GRID_ROW_RULE : ''
    if (r.kind === 'aggregates') {
      return `<tr><th scope="row" style="${label}${line}">${r.label}</th>${r.cells
        .map((c) => (c ? value(c, line) : `<td style="${valueStyle}${line}"></td>`))
        .join('')}</tr>`
    }
    const rest = hasTotal ? `<td style="${valueStyle}${line}"></td>` : ''
    return `<tr><th scope="row" style="${labelLoose}${line}">${r.label}</th>${value(r.cell, line, ` colspan="${lead}"`)}${rest}</tr>`
  })
  return `<table style="border-collapse:separate;border-spacing:0;width:100%">${head}${rows.join('')}</table>`
}

/**
 * The shade behind each column, slate-100 on the light card: 6.92:1 under
 * `LABEL_COLOR` and 19.17:1 under the ink its numbers take, so both stay well
 * above AA's 4.5. It is 1.1:1 against the white beside it, which is
 * enough to read as a band and no more: the heads and the alignment carry the
 * columns, and the shade only groups them. Pinned in `styles.test.ts`.
 */
export const GRID_BAND_COLOR = 'var(--popup-band)'
/** The gutter between bands is the card's own surface, which `map.css` paints. */
export const GRID_GUTTER_COLOR = 'var(--popup-surface)'

/**
 * The hairline between the grid's lines, slate-200, and the firmer rule under
 * its heads, `RULE_COLOR` (TJ, 2026-10-08: "very thin minimal lines"). The
 * heads take a rule rather than an underline because every number in the grid
 * is an underlined link, and an underlined head would read as one more.
 */
export const GRID_LINE_COLOR = 'var(--popup-line)'

/**
 * The ranked number's cell, slate-200 on the light card: one step darker than
 * the column's slate-100, with no hue, so the card's only colour is its links
 * (TJ, 2026-10-08, option H, over a sky-100 cell). It is 1.13:1 against the
 * column, so the number's bold carries most of the mark. The number on it
 * is the ink (`VALUE_LINK`), 17.03:1. The dark card's is the panel's raised slate, a step past its
 * column the other way. Pinned in `styles.test.ts`.
 */
export const GRID_RANKED_COLOR = 'var(--popup-ranked)'

/**
 * Each band's inset a side: 5px, so a number as wide as `0.000` has visible
 * room inside its band, behind a 2px white gutter (TJ, 2026-10-08; it was 3px,
 * which left the widest numbers touching the edges). A map too narrow for the
 * widest grid at 5px takes 3px instead (`compactGrid`).
 */
export const GRID_INSET_PX = 5
export const GRID_COMPACT_INSET_PX = 3
/**
 * The gap between a family's label and the first band: 8px (TJ, 2026-10-08),
 * or 6px on a compact grid, which is the 2px that lets a two-digit window
 * total fit a 360px phone.
 */
export const GRID_LABEL_GAP_PX = 8
export const GRID_COMPACT_LABEL_GAP_PX = 6

/**
 * The widest grid, in Chrome on macOS: `Precipitation (in/hr)` beside Min,
 * Max, Avg and Total at their widest numbers (`10,600` heights, `≥30,000`
 * under Max, and a three-digit total, `123.456`, which a stormy window's
 * snowfall can reach). 344.6px at full inset (measured 2026-10-08). A
 * two-digit total, which a winter window's rain often reaches, is 337.4px;
 * the first measurement used `0.000`, 330.1px, and undersized the card.
 *
 * Compact, the same grid is 326.6px, and 319.4px with a two-digit total, which
 * is what a 360px phone's 320px of body holds. A change to the grid's
 * columns, insets or type re-measures these. `e2e/popupFit.spec.ts` holds the
 * built card to them with the Mac's wider monospace emulated.
 */
export const WIDEST_GRID_PX = 345
/** The result card's body padding a side, `popupCard`'s 10px. */
export const RESULT_CARD_PAD_PX = 10

/**
 * Whether a result card on a map this wide takes the compact insets: when its
 * body is narrower than the widest grid at full inset. That is every map under
 * 385px, a 360px phone among them, where a wide grid would otherwise scroll
 * sideways (TJ, 2026-10-08). The card's own width does not change.
 */
export function compactGrid(canvasWidthPx: number): boolean {
  return parseFloat(resultPopupWidth(canvasWidthPx)) - 2 * RESULT_CARD_PAD_PX < WIDEST_GRID_PX
}

// The grid's cells. A head is centred over its band and bold, the one weight
// the popup's sans-serif has besides regular (TJ, 2026-10-08), while the
// numbers stay right-aligned so a column lines up on its last digit, the way a
// table of figures does.
// A label keeps 8px clear of the first band. On a phone the card is wider
// than its grid and the table spreads the spare room into this column; on a
// desktop the card shrinks to the grid, and without it the longest label sat
// against the band (TJ, 2026-10-08).
const gridLabel = (gapPx: number) =>
  `text-align:left;font-weight:normal;padding:1px ${gapPx}px 1px 0;vertical-align:bottom;${LABEL_COLOR}`
const gridBand = (insetPx: number) =>
  `background:${GRID_BAND_COLOR};border-left:2px solid ${GRID_GUTTER_COLOR};padding:1px ${insetPx}px`
const GRID_HEAD_RULE = `border-bottom:1px solid ${RULE_COLOR}`
const GRID_ROW_RULE = `;border-bottom:1px solid ${GRID_LINE_COLOR}`

/**
 * The class a too-tall marker popup's body wears while it scrolls, and the
 * attribute that finds that body. `map.css` draws the scrollbar it keeps
 * visible; `openCard` in `map/mapPopups.ts` sets the height (`capPopupBody`).
 */
export const POPUP_SCROLL_CLASS = 'popup-scroll'
/**
 * The class every card wears, which `map.css` frames (`popupCard`). Put on by
 * `openCard` in `map/mapPopups.ts` rather than by each caller, so no card can
 * open without it.
 */
export const POPUP_CARD_CLASS = 'popup-card'
export const POPUP_BODY_ATTR = 'data-popup-body'

/**
 * Cap a popup's body so the whole card stands in the free map area, and let
 * the body scroll inside it. The title and the band under it stay put, so a
 * reader always sees which destination the numbers belong to.
 */
export function capPopupBody(body: HTMLElement, maxHeightPx: number): void {
  body.classList.add(POPUP_SCROLL_CLASS)
  body.style.maxHeight = `${Math.floor(maxHeightPx)}px`
}

/**
 * How wide a popup may get.
 *
 * Width is still set by the coordinate row — the longest line either popup can
 * hold and the one that must not wrap — but the data sets at 12px now rather
 * than 13, which buys back most of the room it was costing: "Coordinates: "
 * runs about 80px and a five-decimal pair in the monospace face about 144px,
 * so the text needs ~224px inside the card's padding and the lane kept clear
 * for the close button.
 *
 * It is a ceiling rather than a size, because on a phone the map is the
 * constraint and not the content: a 300px card on a 320px map is the whole
 * map. So a popup measures itself against the canvas it opens on and takes
 * whichever is smaller.
 *
 * Height is bounded only where it must be: a card that cannot stand whole in
 * the free map area caps its body and scrolls it (`capPopupBody`, TJ,
 * 2026-10-08). That reversed the rule that height was never bounded, which
 * held that a tall card was easier to live with than one scrolled inside a
 * map that itself scrolls; on a phone the tall card covered the controls.
 */
export const POPUP_MAX_WIDTH_PX = 280

/**
 * How wide a ranked destination's popup may get: 366px, or the map less 10px
 * a side where the map is narrower (TJ, 2026-10-08).
 *
 * Its grid is wider than any other popup's, `WIDEST_GRID_PX`, and the body
 * has the card less 10px a side. On a 360px phone the card is 340px, 94% of
 * the map, which reverses the four-fifths share `popupWidth` keeps for the
 * other popups; TJ accepted the cost for one grid over two. There the bands
 * take their compact insets (`compactGrid`) and a two-digit total fits; only
 * a three-digit one, or a map narrower still, scrolls sideways, which TJ
 * accepted for narrow phones. A desktop card shrinks to its grid, so the cap
 * is reached only by a card with the widest numbers.
 */
export const RESULT_POPUP_MAX_WIDTH_PX = 366

export function resultPopupWidth(canvasWidthPx: number): string {
  return Math.max(180, Math.min(RESULT_POPUP_MAX_WIDTH_PX, canvasWidthPx - 20)) + 'px'
}

/**
 * A share of the canvas rather than a fixed inset, which is the difference
 * between a card that fits and one that merely does not overflow: subtracting
 * a margin from a 320px phone map still left the 280px ceiling winning, so the
 * popup was 88% of the map and the complaint stood. Four fifths leaves a real
 * band of map either side at every width, and on anything desktop-sized the
 * ceiling takes over long before the fraction matters.
 */
export function popupWidth(canvasWidthPx: number): string {
  const share = Math.round(canvasWidthPx * 0.8)
  return Math.max(180, Math.min(POPUP_MAX_WIDTH_PX, share)) + 'px'
}

/**
 * The link-out glyph, sitting to the right of a popup's title.
 *
 * The anchor is this file's — where it goes, and the sky the header band
 * gives it — and the glyph inside it is `iconPaths.ts`'s, the same shape the
 * results table draws through `IconExternalLink` (#435). The shape was typed
 * out here until then, which made it the one icon in the app that could drift
 * without anything noticing: the component lint reads the React tree, and this
 * file has none. The linter's `style-popup-glyph` check now fails a glyph
 * spelled here at all.
 *
 * The url is escaped here for the reason `popupLink` gives. It is usually built
 * from numbers and OSM's own `type/id`, but a pin restored from a share link
 * carries its id from the link's text, and so does a place the geocoder named.
 */
export function linkIcon({ href, label }: PopupCardLink): string {
  return `<a href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" target="_blank" rel="noopener noreferrer" style="color:${HEADER_ICON_COLOR};flex-shrink:0;display:inline-flex">${externalLinkMarkup()}</a>`
}

/**
 * Where a card's title links out, and what a screen reader hears for it. The
 * glyph is `aria-hidden`, so the label is the link's whole name: without it
 * the glyph read as a bare "link" (TJ, 2026-10-16, #738), which the overlay
 * cards' text links never did. Required with the url, so no card can link
 * out unnamed.
 */
export interface PopupCardLink {
  href: string
  label: string
}

/** What a card is made of; every part but the title is optional. */
export interface PopupCard {
  /** The name, as markup the caller has escaped. */
  title: string
  /** Where the title's link-out glyph goes and its name; no glyph without one. */
  link?: PopupCardLink | null
  /** The lines under the title on the band, usually `metaBand([...])`. */
  meta?: string
  /** Safety lines, each a `warningLine`, in a section of their own. */
  warnings?: readonly string[]
  /** The details: a destination's grid, or an overlay's `bodyLines`. */
  body?: string
  /** One button, in a section of its own under the body. */
  action?: string
}

/**
 * A card: the name and its facts on a slate band, shadowed onto the sections
 * below it, so what a thing IS reads apart from what is said about it (TJ,
 * 2026-10-08). Four sections, each but the band optional (#738):
 *
 * 1. The header band: the title and its link-out glyph, and the facts line.
 * 2. The notices: what is wrong there, in amber under one ⚠️.
 * 3. The body: a destination's grid, an overlay's lines.
 * 4. The action: one centred button.
 *
 * Every popup that describes a thing wears it. A ranked result and a clicked
 * basemap feature did first (#712: one mountain, one card, before and after an
 * analysis); a fire, a closure and a smoke plume followed (#738), because a
 * thing on the map that says what it is should read as one kind of card
 * whatever it is. A section the caller leaves empty is left out, rather than
 * drawn as an empty strip.
 *
 * The name stays at the reading size and everything under it steps down one.
 * Setting both the same made the details compete with the thing they describe,
 * and the step also narrows the widest row, which is what lets the card itself
 * be narrower.
 *
 * The card draws its own padding (`map.css` zeroes MapLibre's for
 * `.popup-card`), so the band can run edge to edge and the grid can stand 10px
 * from both sides. The band keeps a lane on its right for the close button,
 * `--popup-close-lane` in `map.css`: 2rem, or 3.375rem on a touch screen,
 * where the button is 44px and reaches past the name's line into the facts
 * line below it. The body is `border-box` because the scroll cap sets its
 * height from its measured outer height (`capPopupBody`), and it scrolls
 * sideways on a map narrower than its grid.
 */
export function popupCard({ title, link = null, meta = '', warnings = [], body = '', action = '' }: PopupCard): string {
  // The warnings, between the header and the grid and closed off from the grid
  // by the header's own edge (TJ, 2026-10-08), so the card reads as three
  // parts: what the place is, what is wrong there, what the forecast says.
  // Without the edge they ran into the first row of numbers. No shadow, so
  // the header stays the one raised band. Outside the body, so a capped card
  // that scrolls its numbers keeps its warnings in view with its name.
  const notice = warnings.length
    ? `<div style="${POPUP_BODY_SIZE};display:flex;align-items:flex-start;padding:${SECTION_PAD_Y} 0 ${SECTION_PAD_Y} 10px;border-bottom:${SECTION_EDGE}"><div style="flex:1;min-width:0">${warningList(warnings)}</div>${WARNING_GLYPH}</div>`
    : ''
  const content = body
    ? `<div ${POPUP_BODY_ATTR} style="${POPUP_BODY_SIZE};padding:8px 10px 12px;box-sizing:border-box;overflow-x:auto">${body}</div>`
    : ''
  return `<div style="${POPUP_FACE}">
    <div style="background:${HEADER_BAND_COLOR};border-bottom:1px solid ${HEADER_EDGE_COLOR};box-shadow:0 1px 3px ${HEADER_SHADOW_COLOR};border-radius:3px 3px 0 0;padding:10px var(--popup-close-lane, 2rem) 8px 10px">
      <div style="${TITLE_ROW}"><strong style="${TITLE_TEXT}">${title}</strong>${link ? linkIcon(link) : ''}</div>
      ${meta}
    </div>${notice}${content}${
      // Under the body rather than in it, so a card whose numbers the scroll
      // cap shortened keeps its action in view the way it keeps its name. A
      // section of its own, ruled off from the grid by the edge and padding
      // the warnings section wears (#696, TJ 2026-10-14): without the rule
      // the button read as one more row of the grid.
      action
        ? `<div style="padding:${SECTION_PAD_Y} 10px;border-top:${SECTION_EDGE}">${popupAction(action)}</div>`
        : ''
    }
  </div>`
}

/**
 * A card's one action, centred on its own line (TJ, 2026-10-14): a lone button
 * left against the edge of a card the facts line made wider than it read as a
 * row that lost its label. One spelling for the clicked feature's add or
 * remove and the ranked result's remove, so the two cards place it alike.
 */
export function popupAction(button: string): string {
  return `<div style="text-align:center">${button}</div>`
}

/**
 * The title row and the name in it. A name keeps one line and ends in an
 * ellipsis where it outruns the card, which is what the results table does
 * with the same name (TJ, 2026-10-08). A long name used to wrap the rank onto
 * a line of its own and then run past the card's edge, since a single word as
 * long as `Taumatawhakatangihangakōauauotamateapōkaiwhenuakitānatahu` has no
 * place to break. The full name stays in the markup for a screen reader, and
 * the link-out glyph never shrinks, so it stays beside the visible part.
 */
const TITLE_ROW = `display:flex;align-items:center;gap:6px;min-width:0;${POPUP_TITLE_SIZE}`
const TITLE_TEXT = `min-width:0;${ONE_LINE}`

/**
 * The result card's header band: slate-100 on the light card, the grid's own
 * band colour, under an edge of slate-200 and a faint slate shadow (TJ, 2026-10-08, option H of
 * eight). It replaced a sky-100 band, which was the one light blue surface
 * in an app of slate, and sky is the accent that says a thing acts. The
 * labels on it measure 6.92:1 and the title 19.17:1 (pinned in
 * `styles.test.ts`).
 */
export const HEADER_BAND_COLOR = 'var(--popup-band)'
export const HEADER_EDGE_COLOR = 'var(--popup-line)'
export const HEADER_SHADOW_COLOR = 'var(--popup-shadow)'

/**
 * The edge and the padding a result card's sections wear below the header:
 * the warnings above the grid and the action below it (#696). One spelling,
 * so the card's two ruled-off parts cannot drift apart. The edge is the
 * header's own, which is what lets a section read as part of the card rather
 * than as a second card.
 */
export const SECTION_EDGE = `1px solid ${HEADER_EDGE_COLOR}`
export const SECTION_PAD_Y = '8px'

/**
 * The warning section's one ⚠️, which stands for every line in it (TJ,
 * 2026-10-08). A glyph per line spent 20px of every line and wrapped a
 * closure name that fits without it. It stands in a column of its own down
 * the section's right side, the header's close-button lane carried on below
 * it, so it reads as the section's rather than the first line's: floated, the
 * lines below ran under it and it looked like the first warning's alone. The
 * column is the lane plus 2px, so the glyph centred in it sits under the
 * button's centre, which is half the lane plus 1px in from the card's edge
 * (`map.css`: a 0.375rem inset, and the lane is the button, that inset and
 * 0.25rem of air). 17px from the edge on a mouse, 28px on a touch screen.
 */
const WARNING_GLYPH = `<span aria-hidden="true" style="flex:none;width:calc(var(--popup-close-lane, 2rem) + 2px);text-align:center">⚠️</span>`

/**
 * The warnings themselves: a lone one as its sentence, two or more as a
 * bulleted list (TJ, 2026-10-08), the bullets in the warning amber. A rule
 * between them was tried and read as a section per warning.
 */
function warningList(warnings: readonly string[]): string {
  if (warnings.length === 1) return warnings[0]
  return `<ul style="margin:0;padding-left:16px;list-style:disc;color:${WARNING_COLOR}">${warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`
}

/**
 * The link-out glyph on the band, sky-600 at 3.74:1 on the light card. The
 * sky-400 the old ruled shell gave it would fall under the 3:1 an icon owes
 * there; on the dark card's band that same sky-400, the panel's accent ink,
 * is what clears it.
 */
export const HEADER_ICON_COLOR = 'var(--popup-glyph)'

/**
 * Third-party text on its way to setHTML — OSM names, NIFC incident names —
 * and every url on its way into an href. Every string a provider chose passes
 * through here. The quote mark is escaped because an attribute value is
 * double-quoted here throughout; text between elements needs only the first
 * three.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
