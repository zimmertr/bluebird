/**
 * What a picture on the map says at a point (#737).
 *
 * The rain radar and the snow depth are raster layers: the map holds pixels
 * for them rather than features, so a click finds nothing under it to
 * describe. Each instead reads the tile it drew there, which the app keeps a
 * copy of (`heldTiles.ts`): the radar's pixel is its reflectivity
 * (`radarPoint.ts`), the snow's names its band, and the snow then asks NOAA
 * for the numbers (`snowPoint.ts`). So a card opens as fast as any other, and
 * a value still on its way stands as a bar until it lands.
 *
 * Every section a click gathered goes on the card of the spot clicked
 * (`destinationCard.ts`, #832), so a reader who clicks a storm over a
 * snowpack hears about both, each section on its own name and ruled off from
 * the other's.
 *
 * A third such layer writes a reader that returns a section and registers it
 * with `registerPoint` in `map/mapPopups.ts`; the card, the rank, the abort of
 * a stale answer and the failure posture are all there or in the card already.
 */
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
  /** The values, each a `row`. */
  rows: readonly string[]
  /**
   * When the source measured, as markup, which the section's fine print says
   * beside the source; none for a section that holds a failure instead.
   */
  when?: string
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
