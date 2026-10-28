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
// Every colour in it is a `--popup-*` value `map.css` declares once, each the
// app's own `--ui-*` token for the part it is (#740, #786), named here as
// `var(--popup-label)` and resolved where the markup lands, so the card is the
// panel's surface, inks and rules in either theme and cannot drift from them.
// `styles.test.ts` fails a `--popup-*` value that is not a token and measures
// every pair in both themes.
//
// The popup is in the same document as the panel, and Tailwind emits a class
// for any name it finds in the source, wherever that string ends up, so the
// design system reaches a card handed to MapLibre's `setHTML`: its button is
// the panel's `BUTTON_ACCENT` itself (`popupButton`). It lives in utils, like
// the popup bodies that compose it, because a string module is unit-testable
// without pulling maplibre-gl into a node test.
import { externalLinkMarkup } from '../../iconPaths'
import { BUTTON_ACCENT } from '../../styles'
import { AGGREGATE, SEP } from '../../metrics'
import type { PopupGrid, PopupGridCell } from './popupRows'
import { clamp, isFiniteNumber } from '../numbers'
import { coordinateLabel } from '../points'
import { utcDayKey } from '../calendarDates'

/**
 * The popup's type ramp and its leading. The face is the app's own: the card
 * sets none, and `map.css` hands the map the app's (`.maplibregl-map`), so a
 * popup and the panel are one face (#786, record 0217).
 *
 * Three sizes and no more: the title at 13px, the body a step down at 12px so
 * the details do not compete with the thing they describe (and so the widest
 * row, the coordinates, fits a narrower card), and 11px for the one line that
 * qualifies the rest, an overlay's "last updated" date. The same three numbers
 * were spelled in five files before #365 (`popupChrome.ts`, `poiPopup.ts`,
 * `smoke.ts`, `wildfires.ts`, `closures.ts`), which is how a popup gets a
 * fourth size: the linter's inline-style ban now fails a `font-size:` written
 * outside this file. The leading and the title size are not exported: the
 * card is the only thing that sets them (#738), where three overlays used to
 * compose a card of their own from them.
 */
const POPUP_LEADING = 'line-height:1.5'
const POPUP_TITLE_SIZE = 'font-size:13px'
const POPUP_BODY_SIZE = 'font-size:12px'
const POPUP_FINE_SIZE = 'font-size:11px'

/**
 * The card's one bold, the app's: 600, the weight its headings and the
 * table's heads take (record 0222). The title, the grid's heads, a section's
 * name and the ranked value wear it; a `<strong>` alone would draw 700.
 */
const BOLD = 'font-weight:600'

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
const VALUE_FACE = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

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
 * The obvious answer was a lighter weight than the title's 600. It does not
 * hold up across faces: under the generic `sans-serif` Chrome on macOS
 * resolves exactly two, 400 and 500 alike and 600 and 700 alike (126.73px and
 * 133.27px, measured 2026-09-14), and under the app's stack the four weights
 * measured evenly spaced and the pairs still read alike. A face that offers
 * fewer weights on another system would lose the step outright.
 *
 * Colour has no such dependency: it renders the same wherever the card opens,
 * and it is the axis the app's own panels already use to step text back. The
 * label is the panel's own soft ink, 5.56:1 on the dark card and 8.34:1 on
 * the light one (pinned in `styles.test.ts`), so it recedes without becoming
 * hard to read.
 *
 * A row's label and value therefore never go bold. The bold in a card is the
 * title's, and a section's name where a card holds two (`sectionHeading`).
 */
export const LABEL_COLOR = 'color:var(--popup-label)'

/**
 * A row's label.
 *
 * The colon stays outside it: it is punctuation joining the two halves rather
 * than part of the name, and it reads better light between a weighted label
 * and a mono value than swept into either.
 */
function rowLabel(label: string): string {
  return `<span style="${LABEL_COLOR}">${label}</span>`
}

/**
 * A link inside a popup body, in the colour of the text around it (TJ,
 * 2026-10-16, #740): a grid number links in the card's ink and the
 * coordinates in the facts line's grey, because sky at rest is the accent
 * that says a thing acts, and on every number of a grid it was the card's
 * loudest colour. Its underline is `map.css`'s, on `data-popup-link`, since
 * an inline style cannot answer a hover: none at rest at a desk, one on hover
 * and keyboard focus, and a thin one at rest in the label grey on a touch
 * screen, the way the results table's links read (`LINK_QUIET`, #786, record
 * 0212).
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
function popupLink(href: string, inner: string, extra = ''): string {
  return `<a data-popup-link href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;${extra}">${inner}</a>`
}

/**
 * The firmer of the grid's two rules, the panel's frame, under its heads. It was the
 * rule between a popup's title and its body until every popup became a card
 * (#738), whose header band parts the two instead.
 */
export const RULE_COLOR = 'var(--popup-rule)'

/**
 * The amber a safety warning wears in a popup: the fire line and the closure
 * line, which are flags rather than measurements. The `STATUS` amber the
 * table's Wildfire column wears, the same token, so the two cannot part
 * (#786, record 0215); it clears AA on the card in both themes.
 */
export const WARNING_COLOR = 'var(--popup-warn)'

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
 * an overlay popup's "last updated" date, set small and italic in the
 * panel's faint ink, a step back from its label. It measures 3.07:1 on the
 * dark card, under AA for text, and 4.32:1 on the light one; raising the dark
 * one is a colour decision for the maintainer rather than a move.
 */
export const FINE_COLOR = 'var(--popup-fine)'

/**
 * A line of fine print: small, italic, stepped back. The overlay cards end
 * their body on one, because a date qualifies everything above it rather than
 * being another fact in the list: a fire's survey, a plume's imagery, a
 * closure's span. The text is escaped by the
 * caller.
 */
export function fineprint(inner: string): string {
  return `<span style="color:${FINE_COLOR};${POPUP_FINE_SIZE};font-style:italic">${inner}</span>`
}

/**
 * The fine print that ends a card whose source says when it measured: a
 * fire's survey, the snow analysis, the radar frame. One label for all of them
 * (`Updated:`; TJ, 2026-10-16), so the source's date reads the same on every
 * card. `when` is markup the caller escaped, which lets a card still waiting
 * on its source stand a `pendingValue` there.
 */
export function updatedLine(when: string): string {
  return fineprint(`Updated: ${when}`)
}

/**
 * Epoch ms as a Date, or null where there is no instant to name: no stamp, a
 * stamp that is not a finite number, or one past Date's range (9e15 is
 * finite and still an Invalid Date, which prints as `Invalid Date` rather than
 * throwing). Every card stamp is read through it, so an unreadable one leaves
 * its line off rather than saying so on the card.
 */
export function dateOfMs(ms: number | null | undefined): Date | null {
  if (!isFiniteNumber(ms)) return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Epoch ms as the date and time an `updatedLine` carries, in the reader's own
 * zone and locale, or null to leave the line off. Falls back to a bare ISO
 * date where the locale cannot format it, so it never throws.
 */
export function updatedAt(ms: number | null | undefined): string | null {
  const d = dateOfMs(ms)
  if (d === null) return null
  try {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return utcDayKey(d.getTime())
  }
}

/**
 * A popup's one action, the add, the remove or a ring's remove-point: the
 * panel's own `BUTTON_ACCENT`, worn as its class list (#786, record 0215), so
 * its fill, label, corners, size and hover are the app's button's in both
 * themes rather than a copy of them, which would be free to drift. One look
 * for all three, because a card has one action and the app marks every
 * command in the accent. `attr` is the
 * attribute the map handler finds the button by, written whole (`data-rm`, or
 * `data-poi-action="add"`).
 */
export function popupButton(attr: string, label: string): string {
  return `<button ${attr} class="${BUTTON_ACCENT}">${label}</button>`
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
 * and the coordinates, parted by a light dot (TJ, 2026-10-08), the app's
 * one separator (`SEP`; record 0222). A ranked
 * result and a clicked basemap feature both draw it, so the same mountain
 * reads the same before and after an analysis (TJ, 2026-10-14, #712); a
 * fact the card does not have is left off rather than filled in.
 *
 * The dot is drawn in `FINE_COLOR`, which shows on the header band where
 * `RULE_COLOR` all but vanishes, and is hidden from a screen reader, which
 * hears the three facts as a list; it is a divider, not a character to read.
 *
 * The line never wraps. A latitude and a longitude are one value in two
 * halves, and breaking between them leaves a bare negative number on its own
 * line looking like a third figure; it stays at the popup's own size, since a
 * line that shrank to fit would read as an afterthought, so the room comes
 * from the card's width instead. A trailhead's is the longest, 274.7px
 * measured on macOS with the bars' 5px, which the 340px card holds beside a
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
  const pair = `<span style="${VALUE_FACE}">${coordinateLabel(latitude, longitude)}</span>`
  const coords = href ? popupLink(href, pair) : pair
  const parts = [
    type ? escapeHtml(type) : '',
    elevation ? `<span style="${VALUE_FACE}">${escapeHtml(elevation)}</span>` : '',
    coords,
  ].filter(Boolean)
  return `<div style="white-space:nowrap">${parts.join(FACTS_DOT)}</div>`
}

/** The light dot between two facts, which a screen reader skips. */
const FACTS_DOT = `<span aria-hidden="true" style="color:${FINE_COLOR};padding:0 5px">${SEP}</span>`

/**
 * An overlay's facts line: what kind of thing it is, in the Layers menu's own
 * word for it, and the one figure that identifies it, parted by the dot a
 * destination's facts wear (#738, TJ 2026-10-16). `Wildfire · 138,285 acres`
 * under a fire's name reads the way `Peak · 7,000 ft` does under a summit's.
 *
 * Unlike a destination's it may be cut with an ellipsis: a route name or a
 * satellite is third-party text with no bound on its length, where a
 * destination's line is three facts of known width. The parts are markup the
 * caller has escaped; an empty one is left off.
 */
export function factsLine(parts: readonly (string | null | undefined)[]): string {
  return `<div style="${ONE_LINE}">${parts.filter(Boolean).join(FACTS_DOT)}</div>`
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
 * A value still on its way, drawn as a bar where the number will stand
 * (#737): the snow card opens the moment it is clicked and NOAA's numbers
 * arrive most of a second later. A bar rather than a word, so the wait adds
 * no copy, in the rule colour so it reads as a blank rather than as data, and
 * still, since a shimmer would move under a reader who has asked for less
 * motion. Hidden from a screen reader, which hears the label alone until the
 * number lands.
 */
export function pendingValue(): string {
  return `<span aria-hidden="true" style="display:inline-block;width:3.5em;height:0.8em;vertical-align:-0.05em;border-radius:2px;background:${RULE_COLOR}"></span>`
}

/**
 * The name a section opens on, where one card describes two things at one
 * point: the rain radar and the snow depth under one click (#737). The band
 * names the pair and lists both sources, and each section says which of the
 * two it is and how much, `Moderate precipitation` over its rows (TJ,
 * 2026-10-16). Bold, because it names the section rather than being one more
 * row in it; the band's title still outranks it on size. The text is markup
 * the caller escaped.
 */
export function sectionHeading(inner: string): string {
  return `<div style="${BOLD}">${inner}</div>`
}

/**
 * A name set as wide as the widest name its card can take (#752). The radar
 * card renames itself on every frame the forecast player shows, and a card
 * as wide as its name then grew and shrank around its tip, carrying the
 * close button sideways under a reader reaching for it: 129px on `No radar
 * echo`, 181px on `Moderate precipitation`, measured 2026-10-16 (TJ: "always
 * as wide as max"). Every name stands in one grid cell, so the cell takes the
 * widest one's width in whatever font and size the card is set in, and all
 * but the shown one are hidden, from a screen reader too. The names are
 * markup the caller escaped.
 */
export function widestName(shown: string, every: readonly string[]): string {
  const cell = 'grid-area:1/1'
  const others = every
    .filter((name) => name !== shown)
    .map((name) => `<span aria-hidden="true" style="${cell};visibility:hidden">${name}</span>`)
  return `<span style="display:inline-grid"><span style="${cell}">${shown}</span>${others.join('')}</span>`
}

/**
 * A second part of a card's body, ruled off from the part above it by the
 * edge the card's own sections wear, run from edge to edge through the body's
 * 10px sides. Inside the body rather than a section of `popupCard` after it,
 * so a capped card scrolls the two together. The text is markup the caller
 * escaped.
 */
export function bodySection(inner: string): string {
  return `<div style="margin:${SECTION_PAD_Y} -10px 0;padding:${SECTION_PAD_Y} 10px 0;border-top:${SECTION_EDGE}">${inner}</div>`
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
 * column is a shaded band with a gutter of the card's surface on its left, so Min, Max, Avg
 * and Total read as four columns rather than as numbers that happen to line
 * up (TJ, 2026-10-08, column bands over striped rows or tiles). A family's
 * label keeps one line: the card is sized to the widest label beside the
 * widest numbers (`RESULT_POPUP_MAX_WIDTH_PX`). A line with one value, a
 * family narrowed to a single column, may break its longer label rather than
 * push the card wider. Numbers never wrap and are right-aligned, so a column
 * lines up on its last digit in the mono face, the way the table's do.
 *
 * A number that links is underlined in the card's ink (`popupLink`), which
 * is how the results table marks the same number (`TABLE.valueLink`).
 *
 * Every number in the family the report ranks by wears the results table's
 * colour for it, a 20% fill of its band and the band's ink (`PopupTint`, TJ
 * 2026-10-16, #740), so the card colours a number the way the table and the
 * marker under it do. The ranked number itself is bold, which is how the
 * card says why its destination stands where it does (TJ, 2026-10-08): the
 * table says it with the arrow on its column's head, and the card has none.
 * A ranked number with no colour falls back to `GRID_RANKED_COLOR`. `compact` narrows every band's inset and the
 * label's gap to fit a map too narrow for the widest grid at full inset
 * (`compactGrid`).
 */
export function metricGrid(grid: PopupGrid, { compact = false }: { compact?: boolean } = {}): string {
  const band = gridBand(compact ? GRID_COMPACT_INSET_PX : GRID_INSET_PX)
  const labelLoose = gridLabel(compact ? GRID_COMPACT_LABEL_GAP_PX : GRID_LABEL_GAP_PX)
  const label = `${labelLoose};white-space:nowrap`
  const headStyle = `text-align:center;${BOLD};vertical-align:bottom;white-space:nowrap;${band};${GRID_HEAD_RULE};${LABEL_COLOR}`
  const valueStyle = `text-align:right;white-space:nowrap;vertical-align:bottom;${band}`
  const value = (c: PopupGridCell, line: string, span = '') =>
    `<td${span}${c.tint ? ` ${POPUP_TINT_ATTR}` : ''} style="${valueStyle}${shade(c)}${line}">${cell(c)}</td>`
  // The ranked family's colour where its scale gives one, the table's own;
  // the slate step marks the ranked number only where it has none.
  const shade = (c: PopupGridCell) =>
    c.tint
      ? `;background:${c.tint.fill};--tint-dark:${c.tint.ink.dark};--tint-light:${c.tint.ink.light};color:var(--popup-tint)`
      : c.ranked
        ? `;background:${GRID_RANKED_COLOR}`
        : ''
  const cell = (c: PopupGridCell) => {
    const shown = `<span style="${VALUE_FACE}${c.ranked ? `;${BOLD}` : ''}">${c.text}</span>`
    return c.href ? popupLink(c.href, shown) : shown
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
 * The shade behind each column, halfway from the panel to its raised step:
 * the label and the ink its numbers take both stay well above AA's 4.5 on it.
 * It stands 1.18:1 off the dark card and 1.06:1 off the light one, which is
 * enough to read as a band and no more: the heads and the alignment carry the
 * columns, and the shade only groups them. Pinned in `styles.test.ts`.
 */
export const GRID_BAND_COLOR = 'var(--popup-band)'
/** The gutter between bands is the card's own surface, which `map.css` paints. */
export const GRID_GUTTER_COLOR = 'var(--popup-surface)'

/**
 * The hairline between the grid's lines, the panel's rule, and the firmer rule under
 * its heads, `RULE_COLOR` (TJ, 2026-10-08: "very thin minimal lines"). The
 * heads take a rule rather than an underline because every number in the grid
 * is an underlined link, and an underlined head would read as one more.
 */
export const GRID_LINE_COLOR = 'var(--popup-line)'

/**
 * The ranked number's cell, the panel's raised step: one half step past the
 * column's band, with no hue, so the card's only colour is its links (TJ,
 * 2026-10-08, option H, over a sky-100 cell). It stands 1.2:1 off the column
 * on the dark card and 1.06:1 on the light one, so the number's bold carries
 * most of the mark. Pinned in `styles.test.ts`.
 */
export const GRID_RANKED_COLOR = 'var(--popup-ranked)'

/**
 * Each band's inset a side: 5px, so a number as wide as `0.000` has visible
 * room inside its band, behind a 2px gutter (TJ, 2026-10-08; it was 3px,
 * which left the widest numbers touching the edges). A map too narrow for the
 * widest grid at 5px takes 2px instead (`compactGrid`): 3px until the card
 * took the app's face, whose wider labels a 360px phone could hold only by
 * giving back the 8px four bands' insets made (TJ, 2026-10-22).
 */
export const GRID_INSET_PX = 5
export const GRID_COMPACT_INSET_PX = 2
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
 * snowfall can reach). 352.9px at full inset. A two-digit total, which a
 * winter window's rain often reaches, is 345.7px; the first measurement used
 * `0.000` and undersized the card. The grid was measured at 344.6px on
 * 2026-10-08 in the card's own Helvetica, and the app's face sets the label
 * 8.32px wider (109.03px against 100.71px at 12px, 2026-10-22).
 *
 * Compact, the same grid is 326.9px, and 319.7px with a two-digit total, which
 * is what a 360px phone's 320px of body holds. A change to the grid's
 * columns, insets or type re-measures these. `e2e/popupFit.spec.ts` holds the
 * built card to them with the Mac's wider fonts emulated.
 */
export const WIDEST_GRID_PX = 353
/** The result card's body padding a side, `popupCard`'s 10px. */
export const RESULT_CARD_PAD_PX = 10

/**
 * Whether a result card on a map this wide takes the compact insets: when its
 * body is narrower than the widest grid at full inset. That is every map under
 * 393px, a 360px phone among them, where a wide grid would otherwise scroll
 * sideways (TJ, 2026-10-08). The card's own width does not change.
 */
export function compactGrid(canvasWidthPx: number): boolean {
  return parseFloat(resultPopupWidth(canvasWidthPx)) - 2 * RESULT_CARD_PAD_PX < WIDEST_GRID_PX
}

// The grid's cells. A head is centred over its band and bold (TJ,
// 2026-10-08), while the
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
const POPUP_SCROLL_CLASS = 'popup-scroll'
/**
 * The class every card wears, which `map.css` frames (`popupCard`). Put on by
 * `openCard` in `map/mapPopups.ts` rather than by each caller, so no card can
 * open without it.
 */
export const POPUP_CARD_CLASS = 'popup-card'
export const POPUP_BODY_ATTR = 'data-popup-body'
/**
 * The attribute a coloured grid cell wears, which `map.css` reads to give it
 * the theme's ink out of the two the cell carries (`--tint-dark` and
 * `--tint-light`), so the markup names no theme.
 */
export const POPUP_TINT_ATTR = 'data-tint'

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
 * How wide a ranked destination's popup may get: 374px, or the map less 10px
 * a side where the map is narrower (TJ, 2026-10-08; 366px until the card took
 * the app's wider face, 2026-10-22).
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
export const RESULT_POPUP_MAX_WIDTH_PX = 374

export function resultPopupWidth(canvasWidthPx: number): string {
  return clamp(canvasWidthPx - 20, 180, RESULT_POPUP_MAX_WIDTH_PX) + 'px'
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
  return clamp(share, 180, POPUP_MAX_WIDTH_PX) + 'px'
}

/**
 * The link-out glyph, sitting to the right of a popup's title.
 *
 * The anchor is this file's — where it goes, and the grey the header band
 * gives it, the accent on hover — and the glyph inside it is `iconPaths.ts`'s, the same shape the
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
function linkIcon({ href, label }: PopupCardLink): string {
  return `<a data-popup-glyph href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" target="_blank" rel="noopener noreferrer" style="color:${HEADER_ICON_COLOR};flex-shrink:0;display:inline-flex">${externalLinkMarkup()}</a>`
}

/**
 * Where a card's title links out, and what a screen reader hears for it. The
 * glyph is `aria-hidden`, so the label is the link's whole name: without it
 * the glyph read as a bare "link" (TJ, 2026-10-16, #738), which the overlay
 * cards' text links never did. Required with the url, so no card can link
 * out unnamed.
 */
interface PopupCardLink {
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
 * The band's top corners are the card's 8px (`POPUP_FACE`), so its fill meets
 * the card's corners without a gap.
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
  return `<div style="${POPUP_LEADING}">
    <div style="background:${HEADER_BAND_COLOR};border-bottom:1px solid ${HEADER_EDGE_COLOR};box-shadow:0 1px 3px ${HEADER_SHADOW_COLOR};border-radius:8px 8px 0 0;padding:10px var(--popup-close-lane, 2rem) 8px 10px">
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
 * Centred by flex rather than by `text-align`, which centres only an inline
 * box: the button wears the panel's class, whose tap target is a flex box
 * (`TAP.action`), and a flex box is a block.
 */
export function popupAction(button: string): string {
  return `<div style="display:flex;justify-content:center">${button}</div>`
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
const TITLE_TEXT = `min-width:0;${BOLD};${ONE_LINE}`

/**
 * The result card's header band: the grid's own band colour, under an edge
 * of the panel's rule and the shade the app's scroll shadows wear (TJ,
 * 2026-10-08, option H of eight). It replaced a sky-100 band, which was the
 * one light blue surface in an app of slate, and sky is the accent that says
 * a thing acts. Every text on it is pinned in `styles.test.ts`.
 */
export const HEADER_BAND_COLOR = 'var(--popup-band)'
export const HEADER_EDGE_COLOR = 'var(--popup-line)'
const HEADER_SHADOW_COLOR = 'var(--popup-shadow)'

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
 * The link-out glyph on the band, in the label grey at rest, as the results
 * table's matching glyph rests in a grey (#786, record 0212), and the accent
 * on hover and keyboard focus, which `map.css` swaps in by setting
 * `--popup-glyph` on the hovered anchor. The table's glyph wears the faint
 * ink, which measures 2.6:1 on the dark card's band, under the 3:1 an icon
 * owes, so the card's takes the next ink up.
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
