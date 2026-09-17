// The one glyph the app draws twice: as a React element in the results table,
// and as markup in the map popup's title row.
//
// `components/icons.tsx` owns every glyph the app draws (#386), and it cannot
// own this one by itself. A popup is an HTML string handed to MapLibre's
// setHTML, and `utils/popupChrome.ts` records why that string lives in utils:
// it has to stay free of anything component-shaped so a node test can read it.
// A util importing the icon module would be the first import of a component in
// the app, so the shape sits below both instead and each side renders it in
// its own syntax (#435). Until then the popup typed the three elements out for
// itself, which made it the one copy of an icon nothing checked.

/**
 * The mark on a link that leaves the app: a card with an arrow leaving its
 * open corner.
 *
 * The geometry AND the stroke, because a copy that drew the same path at a
 * different weight would be the same drift under a thinner disguise. What each
 * side still spells for itself is the attribute NAME, which differs between
 * JSX and markup, and the size, which `icons.tsx` takes from the `ICON` ramp
 * and a setHTML string cannot.
 */
export const EXTERNAL_LINK = {
  viewBox: '0 0 24 24',
  strokeWidth: 2,
  linecap: 'round',
  linejoin: 'round',
  /** The card, open at the corner the arrow leaves through. */
  frame: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  /** The arrowhead, in the corner it points out of. */
  head: '15 3 21 3 21 9',
  /** The shaft, from inside the card to the head. */
  shaft: { x1: 10, y1: 14, x2: 21, y2: 3 },
} as const

/**
 * How big the popup draws it: the `inline` step of the `ICON` ramp, the same
 * step the results table's copy takes, because both are a mark inside a line
 * of text rather than a glyph in a control.
 *
 * A number rather than that role, because Tailwind generates CSS for the class
 * names it finds in source and a string passed to setHTML is never a class
 * list it sees. `styles.test.ts` pins this against the ramp, so the two
 * cannot part.
 */
export const EXTERNAL_LINK_PX = 14

/**
 * The same glyph as standalone markup, for a popup built as a string.
 *
 * It carries `aria-hidden` like every drawn glyph: it stands inside an anchor
 * that names where it goes.
 */
export function externalLinkMarkup(): string {
  const { viewBox, strokeWidth, linecap, linejoin, frame, head, shaft } = EXTERNAL_LINK
  return (
    `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="${linecap}" stroke-linejoin="${linejoin}" ` +
    `width="${EXTERNAL_LINK_PX}" height="${EXTERNAL_LINK_PX}" aria-hidden="true">` +
    `<path d="${frame}" />` +
    `<polyline points="${head}" />` +
    `<line x1="${shaft.x1}" y1="${shaft.y1}" x2="${shaft.x2}" y2="${shaft.y2}" />` +
    `</svg>`
  )
}
