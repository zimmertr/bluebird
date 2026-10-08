// The shared chrome of every map popup: the titled header with its external
// link, the rule under it, and the "label: value" rows below.
//
// Two popups wear it — a ranked result and a clicked basemap feature — and
// they had drifted into two looks for what is the same object at two stages of
// its life. A destination you clicked and a destination you analyzed should not
// be a different kind of card.
//
// It lives in utils, like the popup bodies that compose it, because this markup
// is handed to MapLibre's setHTML and the design system in styles.ts cannot
// reach it: Tailwind scans source for class names and generates CSS for the
// document, but a string passed to setHTML is not a class list the scanner ever
// sees. Keeping it out of the component is also what makes it unit-testable
// without pulling maplibre-gl into a node test.
import { externalLinkMarkup } from '../iconPaths'
import { AGGREGATE } from '../metrics'
import type { PopupGrid } from './popupRows'

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
 * outside this file.
 */
export const POPUP_FACE = 'font-family:sans-serif;line-height:1.5'
export const POPUP_TITLE_SIZE = 'font-size:13px'
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
 * Slate-600 measures 7.4:1 on the white MapLibre draws a popup on, well past
 * AA for text, so the label recedes without becoming hard to read. Anything
 * lighter starts to: slate-500 is 4.76:1, which is a pass for text you glance
 * at and thin for text you read.
 *
 * The popup's one <strong> therefore stays where it was, on the title.
 */
export const LABEL_COLOR = 'color:#475569'

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
 * MapLibre draws a popup as black on white, and the roles in `styles.ts` are
 * written for the app's own slate panels, so `LINK_ACTION`'s sky-400 lands at
 * 2.1:1 here. Sky-700 measures 5.74:1 on white and clears AA for text. The
 * title's link glyph keeps the lighter shade because an icon answers to the
 * 3:1 rule instead.
 */
export const LINK_COLOR = '#0369a1'

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
 * The rule between a popup's title and its body: slate-300, a hairline that
 * parts the two without reading as a row of its own.
 */
export const RULE_COLOR = '#cbd5e1'

/**
 * The amber a safety warning wears in a popup: the fire line and the closure
 * line, which are flags rather than measurements. Amber-500, the popup-side
 * counterpart of the `STATUS` amber the table's Wildfire column wears in the
 * stylesheet. It is the colour the warning shipped with and #365 only named
 * it; on white it measures about 2.2:1, so whether it should darken is a
 * colour decision for the maintainer rather than a move.
 */
export const WARNING_COLOR = '#f59e0b'

/**
 * The colour of the one line that qualifies a card rather than adding to it:
 * an overlay popup's "last updated" date, set small and italic in slate-400.
 * It is the colour those popups shipped with and #365 only named it; on the
 * white MapLibre draws a popup on it measures 2.98:1, under AA for text, and
 * raising it is a colour decision for the maintainer rather than a move.
 */
export const FINE_COLOR = '#94a3b8'

/**
 * The lighter sky the title row's link-out glyph wears, and the colour the
 * overlay popups' links shipped with (see `LINK_COLOR` for why a text link in
 * the body does not).
 */
export const LINK_ICON_COLOR = '#38bdf8'

/**
 * A line of fine print: small, italic, stepped back. The overlay popups end on
 * one, because a survey date qualifies everything above it rather than being
 * another fact in the list. The text is escaped by the caller.
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
 * (sky-600 under white), `secondary` undoes (slate-700 under slate-200), and
 * `danger` removes (red-500 under white). `attr` is the attribute the map
 * handler finds the button by, written whole (`data-rm`, or
 * `data-poi-action="add"`); `extra` is appended last, as `popupLink`'s is, for
 * the one button that sits under rows and needs a margin above it.
 */
export type PopupButtonVariant = 'primary' | 'secondary' | 'danger'
const POPUP_BUTTON_LOOK: Record<PopupButtonVariant, string> = {
  primary: 'background:#0284c7;color:#fff',
  secondary: 'background:#334155;color:#e2e8f0',
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
 * The coordinate line, which is the one line that cannot be allowed to wrap.
 *
 * A latitude and a longitude are one value in two halves, and breaking between
 * them leaves a bare negative number on its own line looking like a third
 * figure. It stays at the popup's own size — a line that shrank to fit would be
 * the only one in the card set differently, which reads as an afterthought —
 * so the room comes from the width ceiling below instead.
 */
export function coordinateRow(latitude: number, longitude: number): string {
  return `<div style="white-space:nowrap;${VALUE_FACE}">${Number(latitude).toFixed(5)}, ${Number(
    longitude,
  ).toFixed(5)}</div>`
}

/**
 * A ranked destination's facts on one line under its name: the type, the
 * elevation and the coordinates, parted by a light pipe (TJ, 2026-10-08).
 * The pipe is drawn in `FINE_COLOR`, which shows on the header band where
 * `RULE_COLOR` all but vanishes, and is hidden from a screen reader, which
 * hears the three facts as a list; it is a divider, not a character to read.
 * The line never wraps for the coordinate row's reason. A trailhead's is the
 * longest, 274.7px measured on macOS with the pipes' 5px, which the 340px card
 * holds beside a touch screen's close-button lane.
 */
export function factsRow(type: string | null, elevation: string | null, latitude: number, longitude: number): string {
  const pipe = `<span aria-hidden="true" style="color:${FINE_COLOR};padding:0 5px">|</span>`
  const coords = `<span style="${VALUE_FACE}">${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}</span>`
  const parts = [
    type ? escapeHtml(type) : '',
    elevation ? `<span style="${VALUE_FACE}">${escapeHtml(elevation)}</span>` : '',
    coords,
  ].filter(Boolean)
  return `<div style="white-space:nowrap">${parts.join(pipe)}</div>`
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
 */
export function metricGrid(grid: PopupGrid): string {
  const cell = (c: { text: string; href: string | null }) => {
    const shown = `<span style="${VALUE_FACE}">${c.text}</span>`
    return c.href ? popupLink(c.href, shown) : shown
  }
  // A one-value line stands across Min, Max and Avg and leaves the Total
  // column empty, so the number cannot read as a window total.
  const hasTotal = grid.columns[grid.columns.length - 1] === AGGREGATE.total
  const lead = Math.max(1, grid.columns.length - (hasTotal ? 1 : 0))
  const head = grid.columns.length
    ? `<tr><td style="${GRID_HEAD_RULE}"></td>${grid.columns.map((c) => `<th scope="col" style="${GRID_HEAD}">${c}</th>`).join('')}</tr>`
    : ''
  // A hairline under every line but the last, which the card's edge closes.
  const rows = grid.rows.map((r, i) => {
    const line = i < grid.rows.length - 1 ? GRID_ROW_RULE : ''
    if (r.kind === 'aggregates') {
      return `<tr><th scope="row" style="${GRID_LABEL}${line}">${r.label}</th>${r.cells
        .map((c) => `<td style="${GRID_VALUE}${line}">${c ? cell(c) : ''}</td>`)
        .join('')}</tr>`
    }
    const rest = hasTotal ? `<td style="${GRID_VALUE}${line}"></td>` : ''
    return `<tr><th scope="row" style="${GRID_LABEL_LOOSE}${line}">${r.label}</th><td colspan="${lead}" style="${GRID_VALUE}${line}">${cell(r.cell)}</td>${rest}</tr>`
  })
  return `<table style="border-collapse:separate;border-spacing:0;width:100%">${head}${rows.join('')}</table>`
}

/**
 * The shade behind each column, slate-100: 5.42:1 under `LINK_COLOR` and
 * 6.92:1 under `LABEL_COLOR`, against 5.93 and 7.58 on the card's white, so
 * both stay above AA's 4.5. It is 1.1:1 against the white beside it, which is
 * enough to read as a band and no more: the heads and the alignment carry the
 * columns, and the shade only groups them. Pinned in `popupChrome.test.tsx`.
 */
export const GRID_BAND_COLOR = '#f1f5f9'
/** The gutter between bands is the card's own white, which MapLibre paints. */
export const GRID_GUTTER_COLOR = '#ffffff'

/**
 * The hairline between the grid's lines, slate-200, and the firmer rule under
 * its heads, `RULE_COLOR` (TJ, 2026-10-08: "very thin minimal lines"). The
 * heads take a rule rather than an underline because every number in the grid
 * is an underlined link, and an underlined head would read as one more.
 */
export const GRID_LINE_COLOR = '#e2e8f0'

// The grid's cells. The 2px gutter and 3px inset add up to the 8px the
// columns stood apart by before they had bands. A head is centred over its
// band and bold, the one weight the popup's sans-serif has besides regular
// (TJ, 2026-10-08), while the numbers stay right-aligned so a column lines up
// on its last digit, the way a table of figures does.
// A label keeps 8px clear of the first band. On a phone the card is wider
// than its grid and the table spreads the spare room into this column; on a
// desktop the card shrinks to the grid, and without it the longest label sat
// against the band (TJ, 2026-10-08).
const GRID_LABEL_LOOSE = `text-align:left;font-weight:normal;padding:1px 8px 1px 0;vertical-align:bottom;${LABEL_COLOR}`
const GRID_LABEL = `${GRID_LABEL_LOOSE};white-space:nowrap`
const GRID_BAND = `background:${GRID_BAND_COLOR};border-left:2px solid ${GRID_GUTTER_COLOR};padding:1px 3px`
const GRID_HEAD_RULE = `border-bottom:1px solid ${RULE_COLOR}`
const GRID_HEAD = `text-align:center;font-weight:700;vertical-align:bottom;white-space:nowrap;${GRID_BAND};${GRID_HEAD_RULE};${LABEL_COLOR}`
const GRID_VALUE = `text-align:right;white-space:nowrap;vertical-align:bottom;${GRID_BAND}`
const GRID_ROW_RULE = `;border-bottom:1px solid ${GRID_LINE_COLOR}`

/**
 * The class a too-tall marker popup's body wears while it scrolls, and the
 * attribute that finds that body. `map.css` draws the scrollbar it keeps
 * visible; `map/resultsLayer.ts` sets the height (`capPopupBody`).
 */
export const POPUP_SCROLL_CLASS = 'popup-scroll'
/** The class a ranked destination's popup wears, which `map.css` frames (`resultCardShell`). */
export const RESULT_POPUP_CLASS = 'result-popup'
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
 * How wide a ranked destination's popup may get: 348px, or the map less 10px
 * a side where the map is narrower (TJ, 2026-10-08).
 *
 * Its grid is wider than any other popup's. Measured in Chrome on macOS, the
 * widest label, `Precipitation (in/hr)`, beside Min, Max, Avg and Total at
 * their widest numbers (`≥30,000` under Max) needs 316px, 327px with the last
 * band's inset and the label's 8px, and the body has the card less 10px a
 * side. On a 360px phone the card is 340px, 94% of the map, which reverses
 * the four-fifths share `popupWidth` keeps for the other popups; TJ accepted
 * the cost for one grid over two. There the widest grid scrolls sideways by
 * 7px, which TJ accepted for narrow phones; a typical one fits.
 */
export const RESULT_POPUP_MAX_WIDTH_PX = 348

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
 * The anchor is this file's — where it goes, and the lighter sky the title row
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
export function linkIcon(url: string, color = LINK_ICON_COLOR): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:${color};flex-shrink:0;display:inline-flex">${externalLinkMarkup()}</a>`
}

/**
 * A popup: a title row, a rule, then whatever the caller puts below it.
 *
 * The rule is what makes the card read as a labelled thing rather than a run
 * of lines whose first happens to be bold — the title names the destination,
 * everything under it describes it, and the separation should be visible
 * rather than inferred from weight alone.
 */
export function popupShell(
  title: string,
  url: string,
  body: string,
  meta = '',
  { resultCard = false }: { resultCard?: boolean } = {},
): string {
  // The name stays at the reading size and everything under it steps down one.
  // Setting both the same made the details compete with the thing they
  // describe, and the step also narrows the widest row, which is what lets the
  // card itself be narrower.
  //
  // `meta` sits between the title and the rule, so the rule separates what the
  // destination IS from what the forecast says about it. It is optional: the
  // basemap POI popup shares this shell and has no analysis behind it.
  if (resultCard) return resultCardShell(title, url, body, meta)
  return `<div style="${POPUP_FACE}">
    <div style="${TITLE_ROW}"><strong style="${TITLE_TEXT}">${title}</strong>${linkIcon(url)}</div>
    ${meta}
    <hr style="border:none;border-top:1px solid ${RULE_COLOR};margin:5px 0" />
    <div ${POPUP_BODY_ATTR} style="${POPUP_BODY_SIZE}">${body}</div>
  </div>`
}

/**
 * A ranked destination's card: the name and its facts on a band of Bluebird
 * Forecast's sky, shadowed onto the grid below it, so what the place IS reads
 * apart from what the forecast says about it (TJ, 2026-10-08). It replaces
 * the rule the other popups keep.
 *
 * The card draws its own padding (`map.css` zeroes MapLibre's for
 * `.result-popup`), so the band can run edge to edge and the grid can stand
 * 10px from both sides. The band keeps a lane on its right for the close
 * button, `--popup-close-lane` in `map.css`: 2rem, or 3.375rem on a touch
 * screen, where the button is 44px and reaches past the name's line into the
 * facts line below it. The body is `border-box` because the scroll cap sets
 * its height from its measured outer height (`capPopupBody`), and it scrolls
 * sideways on a map narrower than its grid.
 */
function resultCardShell(title: string, url: string, body: string, meta: string): string {
  return `<div style="${POPUP_FACE}">
    <div style="background:${HEADER_BAND_COLOR};border-bottom:1px solid ${HEADER_EDGE_COLOR};box-shadow:0 1px 3px ${HEADER_SHADOW_COLOR};border-radius:3px 3px 0 0;padding:10px var(--popup-close-lane, 2rem) 8px 10px">
      <div style="${TITLE_ROW}"><strong style="${TITLE_TEXT}">${title}</strong>${linkIcon(url, HEADER_ICON_COLOR)}</div>
      ${meta}
    </div>
    <div ${POPUP_BODY_ATTR} style="${POPUP_BODY_SIZE};padding:8px 10px 12px;box-sizing:border-box;overflow-x:auto">${body}</div>
  </div>`
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
const TITLE_TEXT = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

/**
 * The result card's header band, sky-100, under an edge of sky-200 and a
 * shadow tinted the same blue. The labels on it measure 6.6:1 and the title
 * 18.3:1 (pinned in `popupChrome.test.tsx`).
 */
export const HEADER_BAND_COLOR = '#e0f2fe'
export const HEADER_EDGE_COLOR = '#bae6fd'
export const HEADER_SHADOW_COLOR = 'rgba(3,105,161,0.15)'
/**
 * The link-out glyph on the band, sky-600 at 3.57:1. `LINK_ICON_COLOR`'s
 * sky-400 would fall to 1.87:1 there, under the 3:1 an icon owes.
 */
export const HEADER_ICON_COLOR = '#0284c7'

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
