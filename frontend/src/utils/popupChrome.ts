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
 */
export function popupLink(href: string, inner: string, extra = ''): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR};text-decoration:underline;${extra}">${inner}</a>`
}

/**
 * The colour a separator takes between two values on one line.
 *
 * Slate-500, which measures 4.76:1 on the white MapLibre draws a popup on. It
 * is a pass for text and a step lighter than `LABEL_COLOR`, which is what the
 * pipe wants to be: present enough to part two numbers, quiet enough that a
 * row of them does not read as a third column of content.
 */
export const SEPARATOR_COLOR = '#64748b'

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
  return `<div style="font-size:12px;${LABEL_COLOR}">${shown.join('\n    ')}</div>`
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
 * A metric family: a heading line, then its values indented under it.
 *
 * Two lines rather than one (TJ, 2026-09-14). A family's three aggregates and
 * their noun do not fit the card's 280px ceiling on one line — the temperature
 * runs past it and the freezing level's comma-grouped feet run further — and a
 * wrapped line breaks between a label and the number it names. Splitting the
 * noun off puts every values line inside the ceiling and costs one line per
 * family against the four it saves.
 *
 * The indent is what binds the values to their heading rather than to the
 * family above them, and it is the only structure the card needs: the heading
 * already sits in the label colour and the values already sit in the mono face.
 */
export function groupBlock(label: string, values: string[], first: boolean): string {
  const joined = values.join(
    `<span style="color:${SEPARATOR_COLOR}"> | </span>`,
  )
  return `<div style="${first ? '' : 'margin-top:4px'}">${rowLabel(label)}</div>
    <div style="padding-left:8px">${joined}</div>`
}

/**
 * One measurement inside a values line: how it was reduced, then the number.
 *
 * The aggregate wears the label colour and the value wears the mono face, the
 * same split every "label: value" row uses, so a values line is legible as
 * pairs rather than as a run of numbers.
 *
 * The pair is `nowrap`, which leaves the separators between pairs as the only
 * places a values line may break. Precipitation is what proved it necessary:
 * it is the one family whose values carry their own units, so its line is long
 * enough to wrap, and unprotected it broke between "0.0000" and "in/hr" and
 * left a bare unit on the next line. That is the same failure that split the
 * old shared wind-and-temperature row, and the rule is the same one the
 * coordinate line already states: a value and what names it are one thing.
 */
export function groupValue(aggregate: string | null, value: string, href?: string | null): string {
  const shown = `<span style="${VALUE_FACE}">${value}</span>`
  const linked = href ? popupLink(href, shown) : shown
  const pair = aggregate ? `${rowLabel(aggregate)}: ${linked}` : linked
  return `<span style="white-space:nowrap">${pair}</span>`
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
 * Height is deliberately unbounded. A tall card on a short map is easier to
 * live with than one that has to be scrolled inside a popup on a map that
 * itself scrolls.
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

/** The link-out glyph, sitting to the right of a popup's title. */
export function linkIcon(url: string): string {
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;flex-shrink:0;display:inline-flex">
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
export function popupShell(title: string, url: string, body: string, meta = ''): string {
  // The name stays at the reading size and everything under it steps down one.
  // Setting both the same made the details compete with the thing they
  // describe, and the step also narrows the widest row, which is what lets the
  // card itself be narrower.
  //
  // `meta` sits between the title and the rule, so the rule separates what the
  // destination IS from what the forecast says about it. It is optional: the
  // basemap POI popup shares this shell and has no analysis behind it.
  return `<div style="font-family:sans-serif;line-height:1.5">
    <div style="display:flex;align-items:center;gap:6px;font-size:13px"><strong>${title}</strong>${linkIcon(url)}</div>
    ${meta}
    <hr style="border:none;border-top:1px solid #cbd5e1;margin:5px 0" />
    <div style="font-size:12px">${body}</div>
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
