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
 * The popup's measurements as a grid: a row per metric family, a column per
 * aggregate, headed once at the top (TJ, 2026-10-08, at every width). It
 * replaced a heading line per family with its "Min: … | Max: … | Avg: …"
 * values indented under it, which spelled the aggregate words on every family
 * and took two lines each. On a phone that card grew past the map under the
 * top control stack once the cloud deck joined every report (#683).
 *
 * A real table, so a screen reader hears each number with its row and column:
 * the family is the row header, the aggregate the column header, and a rate
 * line under a total carries its whole name in `aria-label`, since "(in/hr)"
 * names nothing on its own. The label column takes the room the numbers leave
 * and wraps there, a long noun such as "Freezing level (ft)" onto two lines,
 * and every cell sits on the bottom line, so a wrapped noun's numbers stand
 * beside its last line. Numbers never wrap and are right-aligned, so a column
 * lines up on its last digit in the mono face, the way the table's do.
 */
export function metricGrid(grid: PopupGrid): string {
  const span = Math.max(1, grid.columns.length)
  const cell = (c: { text: string; href: string | null }) => {
    const shown = `<span style="${VALUE_FACE}">${c.text}</span>`
    return c.href ? popupLink(c.href, shown) : shown
  }
  const head = grid.columns.length
    ? `<tr><td></td>${grid.columns.map((c) => `<th scope="col" style="${GRID_HEAD}">${c}</th>`).join('')}</tr>`
    : ''
  const rows = grid.rows.map((r) => {
    if (r.kind === 'aggregates') {
      const label = `<th scope="row" style="${GRID_LABEL}${r.nested ? ';padding-left:8px' : ''}"${
        r.nested ? ` aria-label="${escapeHtml(r.fullLabel)}"` : ''
      }>${r.label}</th>`
      return `<tr>${label}${r.cells.map((c) => `<td style="${GRID_VALUE}">${c ? cell(c) : ''}</td>`).join('')}</tr>`
    }
    const value = r.kind === 'total' ? `${rowLabel(r.aggregate)}: ${cell(r.cell)}` : cell(r.cell)
    return `<tr><th scope="row" style="${GRID_LABEL}">${r.label}</th><td colspan="${span}" style="${GRID_VALUE}">${value}</td></tr>`
  })
  // The aggregate heads go over the first line that has aggregates, so the
  // elevation, a fact about the place that leads the grid, does not read as
  // one of their columns.
  const at = grid.rows.findIndex((r) => r.kind !== 'value')
  if (head && at !== -1) rows.splice(at, 0, head)
  return `<table style="border-collapse:collapse;width:100%">${rows.join('')}</table>`
}

// The grid's three cell kinds. Every cell sits on the bottom line, which is
// where a wrapped label ends.
const GRID_LABEL = `text-align:left;font-weight:normal;padding:0;vertical-align:bottom;${LABEL_COLOR}`
const GRID_HEAD = `text-align:right;font-weight:normal;padding:0 0 0 8px;vertical-align:bottom;${LABEL_COLOR}`
const GRID_VALUE = 'text-align:right;white-space:nowrap;padding:0 0 0 8px;vertical-align:bottom'

/**
 * The class a too-tall marker popup's body wears while it scrolls, and the
 * attribute that finds that body. `map.css` draws the scrollbar it keeps
 * visible; `map/resultsLayer.ts` sets the height (`capPopupBody`).
 */
export const POPUP_SCROLL_CLASS = 'popup-scroll'
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
export function linkIcon(url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:${LINK_ICON_COLOR};flex-shrink:0;display:inline-flex">${externalLinkMarkup()}</a>`
}

/**
 * A popup: a title row, a rule, then whatever the caller puts below it.
 *
 * The rule is what makes the card read as a labelled thing rather than a run
 * of lines whose first happens to be bold — the title names the destination,
 * everything under it describes it, and the separation should be visible
 * rather than inferred from weight alone.
 */
export function popupShell(title: string, url: string, body: string, meta = ''): string {
  // The name stays at the reading size and everything under it steps down one.
  // Setting both the same made the details compete with the thing they
  // describe, and the step also narrows the widest row, which is what lets the
  // card itself be narrower.
  //
  // `meta` sits between the title and the rule, so the rule separates what the
  // destination IS from what the forecast says about it. It is optional: the
  // basemap POI popup shares this shell and has no analysis behind it.
  return `<div style="${POPUP_FACE}">
    <div style="display:flex;align-items:center;gap:6px;${POPUP_TITLE_SIZE}"><strong>${title}</strong>${linkIcon(url)}</div>
    ${meta}
    <hr style="border:none;border-top:1px solid ${RULE_COLOR};margin:5px 0" />
    <div ${POPUP_BODY_ATTR} style="${POPUP_BODY_SIZE}">${body}</div>
  </div>`
}

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
