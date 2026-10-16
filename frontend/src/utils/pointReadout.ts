/**
 * What a picture on the map says at a point, and the one card that says it
 * (#737).
 *
 * The rain radar and the snow depth are raster layers: the map holds pixels
 * for them rather than features, so a click finds nothing under it to
 * describe. Each instead answers a question about the point: the radar by
 * decoding the pixel of the tile it drew there (`radarPoint.ts`), the snow by
 * asking NOAA (`snowPoint.ts`). An answer is a section, or null where the
 * layer painted nothing, and every section a click gathered goes on one card,
 * the highest-ranked first, its name on the band and the rest ruled off below
 * it. So a reader who clicks a storm over a snowpack hears about both, rather
 * than the rank choosing which half of the answer to hide.
 *
 * A third such layer writes a reader that returns a section and registers it
 * with `registerPoint` in `map/mapPopups.ts`; the card, the rank, the abort of
 * a stale answer and the failure posture are all here or there already.
 */
import { bodyLines, bodySection, factsLine, metaBand, popupCard } from './popupChrome'

/** What one layer says at the clicked point. Every string is markup the reader has escaped. */
export interface PointSection {
  /** What is there, as a name: `Moderate precipitation`, `20 in of snow`. */
  title: string
  /** Where it comes from and when: `NEXRAD radar, now`. */
  source: string
  /** The values, each a `row`. */
  rows: readonly string[]
}

/**
 * The card for every section one click gathered, in rank order. The first is
 * the card's own name and band; each one after it is a section of the body
 * with its name, its source line in the band's ink, and its values.
 */
export function pointCardHtml(sections: readonly PointSection[]): string {
  const [lead, ...rest] = sections
  const parts = [
    bodyLines(lead.rows),
    ...rest.map((s) => bodyLines([s.title]) + metaBand([factsLine([s.source])]) + bodyLines(s.rows)),
  ].filter(Boolean)
  return popupCard({
    title: lead.title,
    meta: metaBand([factsLine([lead.source])]),
    // The rule goes between parts, so a lead with no values of its own does
    // not open the body on an edge.
    body: parts.map((p, i) => (i === 0 ? p : bodySection(p))).join(''),
  })
}

/**
 * The one door a point reading reaches a third-party host through: the IEM
 * tile host for the radar and NOAA's map service for the snow. Neither is
 * this app's API, so `apiFetch`'s translation of an unreachable pod into a
 * message is the wrong answer for them, and a failed reading shows no message
 * at all: it opens no card and warns in the console, which is what every
 * overlay's failed fetch does (`map/overlays/recovery.ts`). A status that is
 * not a success is a failure here, so a reader sees only answers it can read.
 */
export async function pointFetch(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Point reading failed: HTTP ${response.status}`)
  return response
}

/** Whether a point is inside a `[west, south, east, north]` box. */
export function inBounds(lng: number, lat: number, [west, south, east, north]: readonly number[]): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north
}
