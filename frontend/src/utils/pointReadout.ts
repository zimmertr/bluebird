/**
 * What a layer on the map says at a point (#737, #832).
 *
 * The rain radar and the snow depth are raster layers: the map holds pixels
 * for them rather than features, so a click finds nothing under it to
 * describe. Each instead reads the tile it drew there, which the app keeps a
 * copy of (`heldTiles.ts`): the radar's pixel is its reflectivity
 * (`radarPoint.ts`), the snow's names its band, and the snow then asks NOAA
 * for the numbers (`snowPoint.ts`). So a card opens as fast as any other, and
 * a value still on its way stands as a bar until it lands.
 *
 * The five hazard layers answer the same question from the features they
 * hold (`hazardSections.ts`, TJ 2026-11-03): the wildfire within ten miles,
 * the hotspot within ten, the plume over the point, the closure it stands in
 * and the closed trail within a mile. Each is a section like the pictures',
 * so a hotspot over snow in a closed area under rain is one card of four
 * sections, as unlikely as that is, and not four cards that cannot share.
 *
 * Every section a layer gathered goes on the card of the place
 * (`destinationCard.ts`): a ranked marker's, a pending dot's, a label's and
 * the spot's, each section on its own name and ruled off from the other's,
 * folded or open by the reader's hand.
 *
 * A new layer writes a reader that returns a section and registers it with
 * `registerPoint` in `map/mapPopups.ts`; the card, the rank, the fold, the
 * abort of a stale answer and the failure posture are all there or in the
 * card already.
 */
import type { MapTarget } from './mapClick'

/** Where a layer is asked about: the clicked coordinate, its longitude wrapped, and the map's zoom. */
export interface MapPoint {
  lng: number
  lat: number
  zoom: number
}

/**
 * Where a section's name links out, and what a screen reader hears for the
 * glyph. The url as given, not escaped: the chrome escapes it into the
 * attribute (`linkIcon` in `popup/popupChrome.ts`), as it does the band's.
 */
export interface SectionLink {
  href: string
  label: string
}

/** What one layer says at the clicked point. Every string is markup the reader has escaped. */
export interface PointSection {
  /**
   * The target it is a reading of: the key its fold is kept under across
   * every card, and what takes it off a card when that layer is switched off.
   */
  kind: MapTarget
  /**
   * Which layer it is a reading of, in the word its heading opens on: the
   * Layers menu's row (`Rain radar`, `Snow depth`), in the singular where
   * the row is plural (`Active wildfire`, `Area closure`). It also names the
   * section's fold for a screen reader.
   */
  layer: string
  /** What is there, as a name: `Moderate precipitation`, `Deep snow`, a fire's name. */
  title: string
  /**
   * Every name this section can take, for one a card shows changing while it
   * is open: the card stays as wide as the widest of them, so it does not
   * jump sideways when the name changes (#752).
   */
  titles?: readonly string[]
  /** Where the name links out: NIFC's map at a fire, a closure order's page. */
  link?: SectionLink
  /** A line in the warning amber under the name: a closure order's own type. */
  warn?: string
  /**
   * Whether the section is a warning: a wildfire or a hotspot within reach,
   * or a closure the point is in or beside (`hazardSections.ts`). Its heading
   * stands on the amber band with the warning mark, and it opens on a ranked
   * card, where every other layer folds (TJ, 2026-11-03). Smoke, the radar
   * and the snow describe the weather rather than a reason to stay away, so
   * they are not.
   */
  warning?: boolean
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
 * A layer's reading at a point, or null where it has nothing there: at once
 * where it holds what it needs, as a hazard layer always does and a picture
 * does once its tile is decoded, and as a promise otherwise. At once is what
 * puts a section in a card's first paint, where the card is fitted whole,
 * rather than landing on it a moment later (#832).
 */
export type PointAnswer = PointReading | null | Promise<PointReading | null>

/** `f` of a value now, or of a promised one once it settles, staying synchronous where the value is. */
export function whenReady<T, U>(value: T | Promise<T>, f: (value: T) => U): U | Promise<U> {
  return value instanceof Promise ? value.then(f) : f(value)
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
