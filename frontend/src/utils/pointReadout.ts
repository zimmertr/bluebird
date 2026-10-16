/**
 * What a picture on the map says at a point, and the one card that says it
 * (#737).
 *
 * The rain radar and the snow depth are raster layers: the map holds pixels
 * for them rather than features, so a click finds nothing under it to
 * describe. Each instead reads the tile it drew there, which the app keeps a
 * copy of (`heldTiles.ts`): the radar's pixel is its reflectivity
 * (`radarPoint.ts`), the snow's names its band, and the snow then asks NOAA
 * for the numbers (`snowPoint.ts`). So a card opens as fast as any other, and
 * a value still on its way stands as a bar until it lands.
 *
 * A card is laid out like every other on the map (TJ, 2026-10-16): what the
 * thing IS on the band, its name and its source, and what is said ABOUT it in
 * the body, including when it was measured. Every section a click gathered
 * goes on one card, so a reader who clicks a storm over a snowpack hears about
 * both rather than the rank choosing which half to hide; the band then names
 * both and lists both sources, and each section opens on its own name, ruled
 * off from the other's.
 *
 * A third such layer writes a reader that returns a section and registers it
 * with `registerPoint` in `map/mapPopups.ts`; the card, the rank, the abort of
 * a stale answer and the failure posture are all here or there already.
 */
import { bodyLines, bodySection, escapeHtml, factsLine, metaBand, popupCard, sectionHeading, widestName } from './popupChrome'

/** What one layer says at the clicked point. Every string is markup the reader has escaped. */
export interface PointSection {
  /** What is there, as a name: `Moderate precipitation`, `Deep snow`. */
  title: string
  /**
   * Every name this section can take, for one a card shows changing while it
   * is open: the card stays as wide as the widest of them, so it does not
   * jump sideways when the name changes (#752).
   */
  titles?: readonly string[]
  /** Where it comes from: `NEXRAD radar`. */
  source: string
  /** The values, each a `row`, the last saying when it was measured. */
  rows: readonly string[]
}

/** A layer's reading: the section as it stands at the click, and the finished one where part of it is still coming. */
export interface PointReading {
  section: PointSection
  /**
   * The finished section, for a reading whose values are asked for after the
   * card opens. It settles to a section on failure too, carrying the failure,
   * and rejects only when the card it was for is gone.
   */
  later?: Promise<PointSection>
}

/**
 * The band's name for a card that describes both pictures (TJ, 2026-10-16):
 * the two sections under it carry the specifics, and a name joining both of
 * theirs ran past the card. The radar and the snow are the only two point
 * layers, so this is their pair's name; a third would need its own.
 */
export const BOTH_TITLE = 'Precipitation and snow'

/**
 * The card for every section one click gathered, in rank order. One section
 * names the card on its band, with its source under the name, and lists its
 * values in the body. Two share a band naming both and listing both sources,
 * and each section opens on its own name, so a reader can tell the rain's
 * values from the snow's and still sees how heavy each is (TJ, 2026-10-16).
 */
export function pointCardHtml(sections: readonly PointSection[]): string {
  const name = (s: PointSection) => (s.titles ? widestName(s.title, s.titles) : s.title)
  if (sections.length === 1) {
    const [only] = sections
    return popupCard({ title: name(only), meta: metaBand([factsLine([only.source])]), body: bodyLines(only.rows) })
  }
  return popupCard({
    title: escapeHtml(BOTH_TITLE),
    meta: metaBand([factsLine(sections.map((s) => s.source))]),
    body: sections
      .map((s, i) => {
        const inner = sectionHeading(name(s)) + bodyLines(s.rows)
        return i === 0 ? inner : bodySection(inner)
      })
      .join(''),
  })
}

/**
 * The one door the two pictures reach their hosts through: the radar's and
 * the snow's tiles (`map/heldTileProtocol.ts`) and the snow's `identify`.
 * Neither host is this app's API, so `apiFetch`'s translation of an
 * unreachable pod into a message is the wrong answer for them. A status that
 * is not a success throws, so a reader sees only answers it can read.
 */
export async function layerFetch(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${new URL(url).host} answered HTTP ${response.status}`)
  return response
}

/** Whether a point is inside a `[west, south, east, north]` box. */
export function inBounds(lng: number, lat: number, [west, south, east, north]: readonly number[]): boolean {
  return lng >= west && lng <= east && lat >= south && lat <= north
}
