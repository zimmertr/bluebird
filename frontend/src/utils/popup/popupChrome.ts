// The shared chrome of every map popup: the card (`popupCard`), its header
// band with the title, link-out glyph and facts line, and the sections and
// the action below it.
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
import { chevronMarkup, externalLinkMarkup, gripMarkup } from '../../iconPaths'
import { BUTTON_ACCENT, CARD_FOLD, CARD_RESIZE } from '../../styles'
import { AGGREGATE, SEP } from '../../metrics'
import type { PopupGrid, PopupGridCell } from './popupRows'
import { clamp, isFiniteNumber } from '../numbers'
import { WARNING_MARK } from '../fireProximity'
import { coordinateLabel } from '../points'
import { utcDayKey } from '../calendar/calendarDates'

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
 * table's heads take (record 0222). The title, the grid's heads and row
 * heads, a section's layer word, a row's key and the ranked value wear it; a
 * `<strong>` alone would draw 700.
 */
const BOLD = 'font-weight:600'

/**
 * The face a value is set in. Monospace, because that is what the results table
 * already does — every metric cell is mono there and only the name is sans — so
 * the same numbers look the same in both places, and a column of them lines up
 * on the decimal.
 *
 * It is not the whole of the key/value split. The face alone was too quiet
 * to read as a split (TJ, 2026-09-14), so a section's row parts its halves
 * on colour and weight as well (`row`), and the grid parts its heads from
 * its values the same way (`metricGrid`).
 *
 * No value is bold but the ranked one: a bold value marks a favourite row
 * rather than a kind of text, which is what two VALUES wearing one by no rule
 * at all — precipitation's total and the AQI average, singled out since the
 * original implementation — read as.
 *
 * The stack is spelled out rather than left to a bare `monospace` keyword
 * because this markup is handed to MapLibre's setHTML.
 */
const VALUE_FACE = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

/**
 * One "key: value" line in a section: the key semibold in the ink, the value
 * regular in the label's grey and the values' face (TJ, 2026-11-03, the
 * design lab's mockup 1). The key names what the line is about and the value
 * is what a reader reads off it, so the key leads; a grey key over a dark
 * value read as inverted. Weight joins colour and face here, where the old
 * split was colour alone (`LABEL_COLOR` says why): a key that differs from its
 * value on three axes still reads apart in a face whose weights come in
 * pairs.
 *
 * Every stat gets its own. Wind and temperature used to share a line separated
 * by a "·" — the only line carrying two metrics, and the only one long enough
 * to wrap, so on a narrow map it broke at whatever character reached the edge
 * and the second label landed mid-line under the first one's number.
 *
 * `href` links the VALUE rather than the whole line, which is where the table
 * puts its link too: the label names the metric and the number is the thing
 * that has somewhere to go (TJ, 2026-09-14). The link takes the value's grey,
 * as every card link takes the colour of its text.
 */
export function row(label: string, value: string, href?: string | null): string {
  const shown = `<span style="${VALUE_FACE};${LABEL_COLOR}">${value}</span>`
  return `<div>${rowKey(label)}: ${href ? popupLink(href, shown) : shown}</div>`
}

/** The card's ink: its title, a section's heading, a row's key and the grid's heads. */
export const INK_COLOR = 'color:var(--popup-ink)'

/**
 * The colour the facts under a title take, so they read as labels rather
 * than as the first half of the value (TJ, 2026-09-14), and the colour of a
 * value whose key is the ink: a section row's (`row`) and a grid cell's
 * (`metricGrid`).
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
 * A key and its value step on all three axes, weight and face as well as
 * colour (`row`, `metricGrid`), so the split holds in a face whose weights
 * come in pairs.
 */
export const LABEL_COLOR = 'color:var(--popup-label)'

/**
 * A row's key.
 *
 * The colon stays outside it: it is punctuation joining the two halves rather
 * than part of the name, and it reads better light between a weighted key
 * and a mono value than swept into either.
 */
function rowKey(label: string): string {
  return `<span style="${INK_COLOR};${BOLD}">${label}</span>`
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
 * The amber a safety warning wears in a popup: a closure order's type under
 * its section's name (#832; the fire and closure lines of the ranked card
 * before it), a flag rather than a measurement. The `STATUS` amber the
 * table's Wildfire column wears, the same token, so the two cannot part
 * (#786, record 0215); it clears AA on the card in both themes.
 */
export const WARNING_COLOR = 'var(--popup-warn)'

/**
 * One safety warning, the whole sentence a link where it has one, and no
 * glyph. It keeps one line and ends in an ellipsis where it outruns the
 * card, as a title does (TJ, 2026-10-08): a closure order's name wrapped most
 * cards onto a second line, which on a phone is a row of the grid scrolled
 * out of view. The card still widens to its cap first, so the cut takes only
 * what no card could show. The text is escaped by the caller, since it
 * carries third-party names, and stays whole in the markup for a screen
 * reader.
 */
export function warningLine(text: string, href: string | null): string {
  const style = `color:${WARNING_COLOR};font-weight:600;display:block;${ONE_LINE}`
  return href ? popupLink(href, text, style) : `<span style="${style}">${text}</span>`
}

/** One line, cut with an ellipsis: a popup's title, a section's name and a warning. */
const ONE_LINE = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

/**
 * The colour of the one line that qualifies a card rather than adding to it:
 * a section's source and date, set small and italic in the label's ink,
 * stepped back from the values by its size and slant alone. It was the
 * panel's faint ink, 3.07:1 on the dark card, while the only card that wore
 * it was an overlay's; since every card ends on one (#832) it is read on the
 * ranked card too, where the browser suite's axe holds it to AA at 4.5:1,
 * and the label ink clears that on both cards in both themes.
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
 * fire's survey, the snow analysis, the radar frame. Named by its source
 * where the card knows it, `NEXRAD radar: 10 min ago`, and `Updated:`
 * otherwise (TJ, 2026-11-03), so a section on a card that carries two says
 * whose time it is. `when` is markup the caller escaped, which lets a card
 * still waiting on its source stand a `pendingValue` there; `source` is too.
 */
export function updatedLine(when: string, source?: string): string {
  return fineprint(`${source ?? 'Updated'}: ${when}`)
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
 * A date and a time with no year, as a card says when something was seen:
 * `Oct 29, 10:12 AM` in the reader's own zone and locale. A plume's window
 * and a fire detection both read it (#799), since each is hours old at most
 * and a year beside it would be noise.
 */
export function monthDayTime(d: Date): string {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const MINUTE_MS = 60 * 1000

/**
 * How long ago something was seen, in the words the radar card's frame
 * already wore (`now`, `40 min ago`) and in hours from the first one
 * (`1 hour ago`, `3 hours ago`), each count rounded down, so a reading is
 * never called newer than it is. A stamp ahead of the reader's clock, which
 * a slow clock can give, reads `now`.
 */
export function ageAgo(ageMs: number): string {
  const minutes = Math.floor(ageMs / MINUTE_MS)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
}

/**
 * A popup's one action, the add, the remove or a ring's remove-point: the
 * panel's own `BUTTON_ACCENT`, worn as its class list (#786, record 0215), so
 * its fill, label, corners, size and hover are the app's button's in both
 * themes rather than a copy of them, which would be free to drift. One look
 * for all three, because a card has one action and the app marks every
 * command in the accent. `attr` is the
 * attribute the map handler finds the button by, written whole (`data-rm`, or
 * `data-card-action="add"`).
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
 * A destination's facts under its name, on two lines (TJ, 2026-10-31, #832):
 * the coordinates alone, then the type, the elevation and the slope, parted
 * by a light dot (TJ, 2026-10-08), the app's one separator (`SEP`; record
 * 0222). A ranked result, a clicked basemap feature and a pending dot all
 * draw it, so the same mountain reads the same before and after an analysis
 * (TJ, 2026-10-14, #712); a fact the card does not have is left off rather
 * than filled in, and a line with no fact on it is left off whole.
 *
 * Two lines rather than the one the three facts shared before the slope
 * joined them: on one, a peak's line measured 372px with its slope, past the
 * 340px card, and the line never wraps.
 *
 * The dot is drawn in `FINE_COLOR`, which shows on the header band where
 * `RULE_COLOR` all but vanishes, and is hidden from a screen reader, which
 * hears the facts as a list; it is a divider, not a character to read.
 *
 * Neither line wraps. A latitude and a longitude are one value in two halves,
 * and breaking between them leaves a bare negative number on its own line
 * looking like a third figure; each stays at the popup's own size, since a
 * line that shrank to fit would read as an afterthought.
 *
 * `href` is where the pair links to: CalTopo, centred on the point (#712, TJ
 * 2026-10-14). The coordinates are the one fact on a card that names a place,
 * and the place is what a reader takes elsewhere to see the ground around it.
 * The elevation stays plain: it is a measurement rather than a place, and
 * nothing on the card is its forecast. `ground` is the slope's markup
 * (`groundFact.ts`), empty where the card reads none.
 */
export function factsRow(
  type: string | null,
  elevation: string | null,
  latitude: number,
  longitude: number,
  href: string | null,
  ground = '',
): string {
  const pair = `<span style="${VALUE_FACE}">${coordinateLabel(latitude, longitude)}</span>`
  const coords = href ? popupLink(href, pair) : pair
  const facts = [
    type ? escapeHtml(type) : '',
    elevation ? `<span style="${VALUE_FACE}">${escapeHtml(elevation)}</span>` : '',
    ground,
  ].filter(Boolean)
  const line = (inner: string) => `<div style="white-space:nowrap">${inner}</div>`
  return `${line(coords)}${facts.length ? line(facts.join(FACTS_DOT)) : ''}`
}

/** A number in a facts line, in the face every value on a card wears. */
export function factValue(inner: string): string {
  return `<span style="${VALUE_FACE}">${inner}</span>`
}

/**
 * A square of a layer's colour before the number it keys, as a legend's
 * swatch keys a band (#832): the slope's band beside its angle. A swatch
 * rather than the number in the colour, because the yellow band would read
 * about 1.1:1 as text on a light card. Its edge is the legend swatches' own
 * outline (`SWATCH_EDGE`), which holds a pale fill apart from the band
 * behind it. `color` is the layer's, from its owning module; it is the one
 * value on a card that is somebody else's colour rather than the app's.
 * Hidden from a screen reader, which hears the number.
 */
export function colorSwatch(color: string): string {
  return `<span aria-hidden="true" style="display:inline-block;width:0.8em;height:0.8em;vertical-align:-0.05em;border-radius:2px;margin-right:4px;background:${color};box-shadow:inset 0 0 0 1px var(--popup-swatch-edge)"></span>`
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
 * The attribute the map finds a section's fold button by, with the section's
 * key in its value, so the handler reads which section was pressed off the
 * element (#832).
 */
export const CARD_FOLD_ATTR = 'data-card-fold'

/** What a section of a card is made of; the layer alone is required. */
export interface CardSection {
  /** The key its fold is kept under: a layer's target, or `forecast`. */
  key: string
  /**
   * The layer's word its heading opens on, `Active wildfire`, which also
   * names the fold for a screen reader. Markup the caller escaped.
   */
  layer: string
  /** What is there, after the layer and a colon: `Bolt Creek`. Markup the caller escaped; none for a heading that is the layer alone. */
  name?: string
  /** Whether it is a warning (`PointSection.warning`): the amber band and the warning mark. */
  warning?: boolean
  /** Where the name links out, and what a screen reader hears for the glyph. */
  link?: { href: string; label: string } | null
  /** Whether its body shows. */
  open: boolean
  /** The body under the name: the rows, the fine print, a grid. Drawn only while open. */
  body: string
}

/**
 * A section's heading text: the layer's word and its colon semibold, the
 * name after it regular, both in the ink (TJ, 2026-11-03), so the eye finds
 * which layer spoke before what it said. Exported for the tests that find a
 * heading in a card's markup. Both parts are markup the caller escaped.
 */
export function sectionHeading(layer: string, name?: string): string {
  return name ? `<span style="${BOLD}">${layer}:</span> ${name}` : `<span style="${BOLD}">${layer}</span>`
}

/**
 * One section of a card, where a card describes several things at one point
 * (#737, #832): the rain radar and the snow depth, a wildfire within reach, a
 * closure, and a ranked row's forecast.
 *
 * Its heading is a row on the band fill, the header band's own, run from the
 * card's edge to its edge with the rows' 10px inset inside it (TJ,
 * 2026-11-03, the design lab's mockup 1): the fills part one section from the
 * next, where a hairline ruled them off before and read as one more line of
 * the grid. The heading keeps one line and cuts the name with an ellipsis, as
 * the band's title does, with the link out beside it where the thing has a
 * page and the fold's chevron at the right edge: down while the body shows,
 * up while it is folded, as the results bar's reads. The band is at least
 * 24px tall, the fold's box at a desk, and grows to the 32px box under a
 * finger, so the fold never overhangs its band.
 *
 * A warning section (`warning`) lays the amber over the band
 * (`WARNING_BAND_COLOR`) and stands the warning mark the results table's
 * Wildfire and Closure columns open on before the layer's word, in a slot of
 * its own width, so a name cut short never moves it. The mark is text, as
 * the table's is, which a screen reader names itself.
 *
 * The button is named for the layer and says whether it is open through
 * `aria-expanded`, so a screen reader hears "Active wildfire, expanded"
 * rather than a word of the app's own; it wears the glyph ink the band's
 * link-out does and lights the same way under a pointer (`map.css`,
 * `data-popup-glyph`), and `CARD_FOLD` in `styles.ts` gives it its box and
 * its focus ring. A folded section is its heading and nothing under it.
 */
export function cardSection({ key, layer, name, warning = false, link = null, open, body }: CardSection): string {
  const fill = warning ? WARNING_BAND_COLOR : SECTION_BAND_COLOR
  const mark = warning ? `<span style="${WARNING_SLOT}">${WARNING_MARK}</span>` : ''
  const text = `<div style="flex:1;min-width:0;${INK_COLOR};${ONE_LINE}">${sectionHeading(layer, name)}</div>`
  const fold =
    `<button type="button" ${CARD_FOLD_ATTR}="${key}" data-popup-glyph class="${CARD_FOLD}" ` +
    `aria-expanded="${open}" aria-label="${layer}" style="color:${HEADER_ICON_COLOR}">${chevronMarkup(!open)}</button>`
  const heading =
    `<div style="display:flex;align-items:center;gap:6px;min-height:24px;margin:0 -${BODY_SIDE};padding:0 ${BODY_SIDE};background:${fill}">` +
    `${mark}${text}${link ? linkIcon(link) : ''}${fold}</div>`
  return `${heading}${open ? `<div style="padding-top:${SECTION_BODY_GAP}">${body}</div>` : ''}`
}

/**
 * The fill under a section's heading: the header band's, so a heading reads
 * as the card's own furniture. It is the only band below the header; the
 * grid's columns are the same fill as narrow strips.
 */
export const SECTION_BAND_COLOR = 'var(--popup-band)'

/**
 * A warning section's heading fill: the table's warning amber laid over the
 * band, 15% in dark and 30% in light (`--popup-warn-band` in `map.css`).
 * Every ink on it is pinned in `styles.test.ts`.
 */
export const WARNING_BAND_COLOR = 'var(--popup-warn-band)'

/**
 * The warning mark's slot: one and a half of its ems wide and centred, the
 * design lab's measure, so the layer's word stands at one place on every
 * warning heading whatever the name after it does.
 */
const WARNING_SLOT = 'flex:none;width:1.5em;text-align:center;line-height:1'

/** The body's sides, which a heading runs through to reach the card's edges. */
const BODY_SIDE = '10px'

/** Between a section's heading and the body under it. */
const SECTION_BODY_GAP = '4px'

/** Between one section and the next: the card's surface, which the two bands stand apart on. */
export const SECTION_GAP = '8px'

/**
 * A card's sections, one under the next with `SECTION_GAP` of the card's
 * surface between them, which with each heading's band is what parts them.
 * Inside the body rather than a part of `popupCard` after it, so a capped
 * card scrolls them together. Each is markup from `cardSection`.
 */
export function cardSections(sections: readonly string[]): string {
  return sections.map((inner, i) => (i === 0 ? inner : `<div style="margin-top:${SECTION_GAP}">${inner}</div>`)).join('')
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
 * A ranked number with no colour falls back to `GRID_RANKED_COLOR`, in the
 * ink, since the label grey reads 3.94:1 on that cell in dark.
 *
 * Key and value part as a section's row does (TJ, 2026-11-04): every head,
 * the families down the side and the aggregates across the top, is the ink
 * at 600, and every value the label grey at 400 in the mono face, where a
 * grey head over a value in the ink read as inverted. `compact` narrows every band's inset and the
 * label's gap to fit a map too narrow for the widest grid at full inset
 * (`compactGrid`).
 */
export function metricGrid(
  grid: PopupGrid,
  { compact = false, widths = {} }: { compact?: boolean; widths?: Readonly<Record<string, number>> } = {},
): string {
  const band = gridBand(compact ? GRID_COMPACT_INSET_PX : GRID_INSET_PX)
  const labelLoose = gridLabel(compact ? GRID_COMPACT_LABEL_GAP_PX : GRID_LABEL_GAP_PX)
  const label = `${labelLoose};white-space:nowrap`
  const headStyle = `text-align:right;${BOLD};vertical-align:bottom;white-space:nowrap;${band};${GRID_HEAD_RULE};${INK_COLOR}`
  // On the cell rather than the number, so a link and its underline, which
  // inherit, take the grey too.
  const valueStyle = `text-align:right;white-space:nowrap;vertical-align:bottom;${band};${LABEL_COLOR}`
  const value = (c: PopupGridCell, line: string, span = '') =>
    `<td${span}${c.tint ? ` ${POPUP_TINT_ATTR}` : ''} style="${valueStyle}${shade(c)}${line}">${cell(c)}</td>`
  // The ranked family's colour where its scale gives one, the table's own;
  // the slate step marks the ranked number only where it has none. Each
  // follows the grey in the cell's style, so its colour wins.
  const shade = (c: PopupGridCell) =>
    c.tint
      ? `;background:${c.tint.fill};--tint-dark:${c.tint.ink.dark};--tint-light:${c.tint.ink.light};color:var(--popup-tint)`
      : c.ranked
        ? `;background:${GRID_RANKED_COLOR};${INK_COLOR}`
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
    ? `<tr><td style="${GRID_HEAD_RULE}"></td>${grid.columns.map((c) => gridHead(c, headStyle, widths[c])).join('')}</tr>`
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
 * No column is painted with it since the card took the results table's rows
 * (TJ 2026-10-30); it stays the ground the measurements below are taken on.
 *
 * The shade behind each column, the card's band: halfway from the panel to
 * its raised step in dark, and from the raised step to its hover in light,
 * where the dark theme's half step read 1.06:1 and all but vanished (TJ,
 * 2026-11-03). The label and the ink its numbers take both stay well above
 * AA's 4.5 on it. It stands 1.18:1 off the card in both themes, which is
 * enough to read as a band and no more: the heads and the alignment carry
 * the columns, and the shade only groups them. The grey a value takes reads
 * 4.71:1 on it in dark. Pinned in `styles.test.ts`.
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
 * The ranked number's cell, one half step past the column's band: the
 * raised step in dark and its hover in light, with no hue, so the card's
 * only colour is its links (TJ, 2026-10-08, option H, over a sky-100 cell).
 * It stands 1.2:1 off the column on the dark card and 1.06:1 on the light
 * one, so the number's bold carries most of the mark. Its number keeps the
 * ink rather than the values' grey, which reads 3.94:1 here in dark, under
 * AA's 4.5. Pinned in `styles.test.ts`.
 */
export const GRID_RANKED_COLOR = 'var(--popup-ranked)'

/**
 * Each band's inset a side: 5px, so a number as wide as `0.000` has visible
 * room inside its band, behind a 2px gutter (TJ, 2026-10-08; it was 3px,
 * which left the widest numbers touching the edges). A map too narrow for the
 * widest grid at 5px takes 1px instead (`compactGrid`): 3px until the card
 * took the app's face, whose wider labels a 360px phone could hold only by
 * giving back the 8px four bands' insets made (TJ, 2026-10-22), and 2px
 * until the row heads went to 600 (2026-11-04), whose 6.49px it could hold
 * only by giving back 8px more.
 */
export const GRID_INSET_PX = 5
export const GRID_COMPACT_INSET_PX = 1
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
 * snowfall can reach). 359.4px at full inset. A two-digit total, which a
 * winter window's rain often reaches, is 352.2px; the first measurement used
 * `0.000` and undersized the card. The grid was measured at 344.6px on
 * 2026-10-08 in the card's own Helvetica, the app's face sets the label
 * 8.32px wider (109.03px against 100.71px at 12px, 2026-10-22), and the
 * row heads' 600 another 6.49px (115.52px, 2026-11-04).
 *
 * Compact, the same grid is 325.4px, and 318.2px with a two-digit total, which
 * is what a 360px phone's 320px of body holds. A change to the grid's
 * columns, insets or type re-measures these. `e2e/popupFit.spec.ts` holds the
 * built card to them with the Mac's wider fonts emulated.
 */
export const WIDEST_GRID_PX = 360
/** The result card's body padding a side, `popupCard`'s 10px. */
export const RESULT_CARD_PAD_PX = 10

/**
 * Whether a result card on a map this wide takes the compact insets: when its
 * body is narrower than the widest grid at full inset. That is every map under
 * 400px, a 360px phone among them, where a wide grid would otherwise scroll
 * sideways (TJ, 2026-10-08). The card's own width does not change.
 */
export function compactGrid(canvasWidthPx: number): boolean {
  return parseFloat(resultPopupWidth(canvasWidthPx)) - 2 * RESULT_CARD_PAD_PX < WIDEST_GRID_PX
}

// The grid's cells. A head is centred over its band and bold (TJ,
// 2026-10-08), while the
// numbers stay right-aligned so a column lines up on its last digit, the way a
// table of figures does.
// A label keeps 8px clear of the first band, in the ink at 600 as every
// head is (`metricGrid`). On a phone the card is wider
// than its grid and the table spreads the spare room into this column; on a
// desktop the card shrinks to the grid, and without it the longest label sat
// against the band (TJ, 2026-10-08).
const gridLabel = (gapPx: number) =>
  `text-align:left;${BOLD};padding:1px ${gapPx}px 1px 0;vertical-align:bottom;${INK_COLOR}`
// No band behind a column (TJ 2026-10-30): the card's rows are the results
// table's, a hairline between each and a tint under the pointer (`map.css`),
// and its heads the table's, right over the digits they name.
const gridBand = (insetPx: number) => `padding:1px ${insetPx}px`
const GRID_HEAD_RULE = `border-bottom:1px solid ${RULE_COLOR}`

/**
 * The attributes a grid head carries for `map/resultsLayer.ts`: its aggregate,
 * which a carried head moves the table's columns by, and its right edge, which
 * sizes the column (TJ 2026-10-30), as a results column's head does. The
 * window total is not carried: it is the last column, filled for two families.
 */
export const GRID_AGG_ATTR = 'data-agg'
export const GRID_EDGE_ATTR = 'data-agg-edge'
const gridHead = (c: string, style: string, width: number | undefined) => {
  const carried = c !== AGGREGATE.total ? ';cursor:grab' : ''
  const sized = width ? `;width:${width}px;min-width:${width}px` : ''
  // The divider is drawn, a 1px line in the card's rule that takes the accent
  // under the pointer (`map.css`), so a reader can see the column sizes.
  const edge = `<span ${GRID_EDGE_ATTR} aria-hidden="true" style="position:absolute;top:2px;bottom:2px;right:-4px;width:8px;cursor:col-resize;touch-action:none;display:flex;justify-content:center"><span style="width:1px;background:currentColor"></span></span>`
  return `<th scope="col" ${GRID_AGG_ATTR}="${c}" style="${style};position:relative;user-select:none${carried}${sized}">${c}${edge}</th>`
}
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

/** Take a body's cap off, so it measures at its own height again for a fresh fit (`refit` in `map/mapPopups.ts`). */
export function uncapPopupBody(body: HTMLElement): void {
  body.classList.remove(POPUP_SCROLL_CLASS)
  body.style.maxHeight = ''
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
 * How wide a ranked destination's popup may get: 381px, or the map less 10px
 * a side where the map is narrower (TJ, 2026-10-08; 366px until the card took
 * the app's wider face, 2026-10-22, and 374px until its grid's row heads went
 * to 600). The last 7px are the bold heads' cost: `Precipitation (in/hr)`
 * measured 115.52px at 600 against 109.03px at 400 (Chrome on macOS,
 * 2026-11-04).
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
export const RESULT_POPUP_MAX_WIDTH_PX = 381

/**
 * The narrowest any card on the map is, whatever the map's width, and the
 * narrowest a reader's drag on the resize handle takes one (#832, TJ
 * 2026-11-03): the facts line's coordinates and the action's button still
 * stand on one line at it.
 */
export const POPUP_MIN_WIDTH_PX = 180

/** What a ranked card leaves of a narrow map's width: 10px a side, so its edges never meet the map's. */
const MAP_SIDES_PX = 20

export function resultPopupWidth(canvasWidthPx: number): string {
  return clamp(canvasWidthPx - MAP_SIDES_PX, POPUP_MIN_WIDTH_PX, RESULT_POPUP_MAX_WIDTH_PX) + 'px'
}

/**
 * How wide a reader may drag a card (TJ, 2026-11-03): from the floor every
 * card keeps to the map less the 10px a side a ranked card leaves on a
 * narrow map, which is wider than any card's own rule, since the reader asked
 * for the room.
 */
export function cardWidthRange(canvasWidthPx: number): { min: number; max: number } {
  return { min: POPUP_MIN_WIDTH_PX, max: Math.max(POPUP_MIN_WIDTH_PX, canvasWidthPx - MAP_SIDES_PX) }
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
  return clamp(share, POPUP_MIN_WIDTH_PX, POPUP_MAX_WIDTH_PX) + 'px'
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
  /** The details: the card's sections (`cardSections` of `cardSection`), each on its own band. */
  body?: string
  /** One button, in a section of its own under the body. */
  action?: string
}

/**
 * A card: the name and its facts on a slate band, shadowed onto the parts
 * below it, so what a thing IS reads apart from what is said about it (TJ,
 * 2026-10-08). Three parts, each but the band optional (#738):
 *
 * 1. The header band: the title and its link-out glyph, and the facts line.
 * 2. The body: the card's sections, a layer's reading or a destination's grid
 *    each (`cardSection`, #832).
 * 3. The action: one centred button.
 *
 * Every popup that describes a thing wears it. A ranked result and a clicked
 * basemap feature did first (#712: one mountain, one card, before and after an
 * analysis); a fire, a closure and a smoke plume followed (#738), because a
 * thing on the map that says what it is should read as one kind of card
 * whatever it is, and since #832 those three are sections of the place's
 * card rather than cards of their own. The notices that stood between the
 * band and the body went with them: a closure's type is the amber line in
 * its section. A part the caller leaves empty is left out, rather than
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
 *
 * Every card ends on its resize handle (`resizeHandle`), last in the markup
 * so it stands over the action's foot in the card's bottom-right corner.
 */
export function popupCard({ title, link = null, meta = '', body = '', action = '' }: PopupCard): string {
  const content = body
    ? `<div ${POPUP_BODY_ATTR} style="${POPUP_BODY_SIZE};padding:8px ${BODY_SIDE} 12px;box-sizing:border-box;overflow-x:auto">${body}</div>`
    : ''
  return `<div style="${POPUP_LEADING};position:relative">
    <div style="background:${HEADER_BAND_COLOR};border-bottom:1px solid ${HEADER_EDGE_COLOR};box-shadow:0 1px 3px ${HEADER_SHADOW_COLOR};border-radius:8px 8px 0 0;padding:10px var(--popup-close-lane, 2rem) 8px 10px">
      <div style="${TITLE_ROW}"><strong style="${TITLE_TEXT}">${title}</strong>${link ? linkIcon(link) : ''}</div>
      ${meta}
    </div>${content}${
      // Under the body rather than in it, so a card whose numbers the scroll
      // cap shortened keeps its action in view the way it keeps its name. A
      // part of its own, ruled off from the body by the header's edge (#696,
      // TJ 2026-10-14): without the rule the button read as one more row of
      // the grid.
      action
        ? `<div style="padding:${SECTION_PAD_Y} 10px;border-top:${SECTION_EDGE}">${popupAction(action)}</div>`
        : ''
    }${resizeHandle()}
  </div>`
}

/**
 * The attribute the map finds a card's resize handle by (`map/destinationCards.ts`),
 * which drags the card's width and its body's height (TJ, 2026-11-03).
 */
export const CARD_RESIZE_ATTR = 'data-card-resize'

/**
 * The handle in a card's bottom-right corner that a pointer or a finger
 * drags to size the card (TJ, 2026-11-03): the diagonal grip from
 * `iconPaths.ts` in the glyph grey the band's link-out and the folds rest in,
 * taking the accent under a pointer through `data-popup-glyph` as they do,
 * and its box `CARD_RESIZE` from `styles.ts`.
 *
 * It is pointer-only, so it is `aria-hidden` and carries no name: a name
 * would be a new string for a control a keyboard cannot work, and a keyboard
 * reader has the body's scroll for what a short card hides. It is a span
 * rather than a button for the same reason, so Tab never lands on it.
 */
function resizeHandle(): string {
  return `<span ${CARD_RESIZE_ATTR} data-popup-glyph aria-hidden="true" class="${CARD_RESIZE}" style="color:${HEADER_ICON_COLOR}">${gripMarkup()}</span>`
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
 * The edge and the padding the action's foot wears under the sections (#696).
 * The edge is the header's own, which is what lets the foot read as part of
 * the card rather than as a second card. It is the one ruled part below the
 * header: the sections part on their headings' bands (`cardSection`, TJ
 * 2026-11-03), where each after the first wore this edge before.
 */
export const SECTION_EDGE = `1px solid ${HEADER_EDGE_COLOR}`
export const SECTION_PAD_Y = '8px'

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
