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

/**
 * The face a value is set in, so the label and the number separate at a glance
 * rather than on a re-read.
 *
 * Weight is not available for this: the popup's one <strong> is its title, and
 * a second bold would stop the title being the emphasis. A face change carries
 * the same separation without spending any. Monospace specifically, because
 * that is what the results table already does — every metric cell is mono there
 * and only the name is sans — so the same numbers look the same in both places,
 * and a column of them lines up on the decimal.
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
 */
export function row(label: string, value: string): string {
  return `<div>${label}: <span style="${VALUE_FACE}">${value}</span></div>`
}

/**
 * The coordinate line, which is the one row that cannot be allowed to wrap.
 *
 * A latitude and a longitude are one value in two halves, and breaking between
 * them leaves a bare negative number on its own line looking like a third
 * figure. It stays at the popup's own size — a row that shrank to fit would be
 * the only line in the card set differently, which reads as an afterthought —
 * so the room comes from POPUP_WIDTH instead.
 */
export function coordinateRow(latitude: number, longitude: number): string {
  return `<div style="white-space:nowrap">Coordinates: <span style="${VALUE_FACE}">${Number(
    latitude,
  ).toFixed(5)}, ${Number(longitude).toFixed(5)}</span></div>`
}

/**
 * How wide a popup may get.
 *
 * Set by the coordinate row, which is the longest line either popup can hold
 * and the one line that must not wrap: at the popup's 13px, "Coordinates: "
 * runs about 82px and a five-decimal pair in the monospace face about 156px,
 * so the text alone needs ~240px before the card's own padding and the space
 * kept clear for the close button.
 */
export const POPUP_WIDTH = '300px'

/** The link-out glyph, sitting to the right of a popup's title. */
export function linkIcon(url: string): string {
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Open in Peakbagger / OpenStreetMap" style="color:#38bdf8;flex-shrink:0;display:inline-flex">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>`
}

/**
 * A popup: a title row, a rule, then whatever the caller puts below it.
 *
 * The rule is what makes the card read as a labelled thing rather than a run
 * of lines whose first happens to be bold — the title names the destination,
 * everything under it describes it, and the separation should be visible
 * rather than inferred from weight alone.
 */
export function popupShell(title: string, url: string, body: string): string {
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
    <div style="display:flex;align-items:center;gap:6px"><strong>${title}</strong>${linkIcon(url)}</div>
    <hr style="border:none;border-top:1px solid #cbd5e1;margin:5px 0" />
    ${body}
  </div>`
}

/**
 * Third-party text on its way to setHTML — OSM names, NIFC incident names.
 * Every string a provider chose passes through here.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
