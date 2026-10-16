/**
 * The snow depth's reading at a clicked point, asked of NOAA (#737).
 *
 * The card opens at once, named from the tile the map drew (`heldTiles.ts`):
 * the field's renders paint every cell in exactly one of NOAA's legend
 * colours, fully opaque (6,481 painted pixels over three renders, measured
 * 2026-10-16), so the pixel under the click names its band with no request.
 * The numbers then come from NOAA: the map service the layer is drawn from
 * answers ArcGIS `identify` at a point, so the body shows the analysis's own
 * values rather than a colour's reading of them, and they replace the bars
 * they were standing in for. Measured 2026-10-16 against the live service:
 *
 * - **Layer 3 is the depth, in metres; layer 7 the snow water equivalent, in
 *   millimetres.** Neither unit is published. Both are read off NOAA's own
 *   classification, which comes back beside each value and indexes the legend
 *   in inches: 0.11 m of depth came back in class 3 (3.9 to 9.8 in, where
 *   0.11 m is 4.3 in) and 18 of water in class 3 of its own legend (0.39 to
 *   0.98 in, where 18 mm is 0.71 in).
 * - **Layer 2 carries the time the analysis is valid for**, as
 *   `idp_validtime`, `10/16/2026 12:00:00 PM`, in UTC: that run was ingested
 *   at 18:07 against a service that states its runs in UTC.
 * - **The picture decides whether a card opens, not the number.** NOAA paints
 *   by its class, and class and number disagree at the bottom: 0.02 m
 *   (0.8 in) came back in class 0, which NOAA draws transparent, though the
 *   legend starts painting at 0.39 in. A card opens where the map shows snow,
 *   and nowhere else, and says the number NOAA answers there.
 * - **The answer depends on the extent sent.** The service resamples to the
 *   pixel the request's `mapExtent` and `imageDisplay` imply: the Rainier
 *   summit read 52.13 m with a continent at 1000 px, 74.58 m with a hundredth
 *   of a degree at 10 px, and `NoData` with a degree at 10 px. So the request
 *   sends a box a hundredth of a degree wide at 10 px, a pixel of about 100 m,
 *   well inside one cell of the 1 km grid, and reads the cell under the click.
 * - **About 0.8 s an answer, about 1 KB, CORS open, nothing cached**
 *   (`max-age=0`), and `{"results":[]}` outside the analysis.
 * - **It sometimes fails inside a 200.** Three answers in about twenty came
 *   back `{"status":"error","messages":["Could not access any server
 *   machines. ..."]}` and the next thirty all answered, so a failure of that
 *   shape is asked once more before the card says it failed. Once rather than
 *   on a schedule, because the reader's next click is the next attempt.
 */
import type { HeldTiles, Rgba } from './heldTiles'
import { inBounds, layerFetch, type PointReading, type PointSection } from './pointReadout'
import { escapeHtml, pendingValue, row, updatedAt, updatedLine } from './popupChrome'
import { SNOW_BANDS, SNOW_BOUNDS, SNOW_MAX_ZOOM, SNOW_SERVICE_URL } from './snowDepth'
import { GLACIERS, type GlacierCheck } from './glacierCell'

const METRES_TO_INCHES = 1 / 0.0254
const MM_TO_INCHES = 1 / 25.4

/** Half the side of the box the request reads the point in, in degrees. */
const HALF_BOX_DEG = 0.005

/** Where the field's tiles are kept in `heldTiles.ts`. */
export const SNOW_HELD_LAYER = 'snow'

/**
 * The zoom MapLibre loads the field's 512 px tiles at, no deeper than the
 * source's `maxzoom`, past which it magnifies the tiles it holds.
 */
export function snowTileZoom(mapZoom: number): number {
  return Math.max(0, Math.min(SNOW_MAX_ZOOM, Math.round(mapZoom)))
}

/**
 * The card's name for each depth, by NOAA's own band boundaries (TJ,
 * 2026-10-16). Every word says how deep and nothing more, because the depth
 * is all the colour knows: a top word of `Permanent snow` once stood past
 * 197 in, and a record winter's snowpack can pass that where nothing is
 * permanent (TJ, 2026-10-16, #748). A glacier is named by where it is
 * instead (`glacierCell.ts`).
 */
const SNOW_WORDS: readonly { from: number; word: string }[] = [
  { from: 59, word: 'Very deep snow' },
  { from: 20, word: 'Deep snow' },
  { from: 3.9, word: 'Moderate snow' },
  { from: 0, word: 'Light snow' },
]

/** The name for a depth in inches. */
export function snowWord(inches: number): string {
  return SNOW_WORDS.find((w) => inches >= w.from)!.word
}

/** Each painted legend colour, as `r,g,b`, to the band that wears it. */
const BAND_OF_COLOR: ReadonlyMap<string, { from: number }> = new Map(
  SNOW_BANDS.filter((b) => b.color !== null).map((b) => {
    const hex = b.color!.slice(1)
    return [[0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(','), b] as const
  }),
)

/** The name a held pixel's band takes, or null where the field painted nothing there. */
export function snowWordOfPixel(pixel: Rgba | null): string | null {
  if (pixel === null || pixel[3] === 0) return null
  const band = BAND_OF_COLOR.get(`${pixel[0]},${pixel[1]},${pixel[2]}`)
  return band ? snowWord(band.from) : null
}

/** Whether the field painted at a point, from the tile the map drew: at once where it is decoded, and once it is otherwise. */
export function snowPaints(
  tiles: HeldTiles,
  { lng, lat, zoom }: { lng: number; lat: number; zoom: number },
): boolean | Promise<boolean> {
  if (!inBounds(lng, lat, SNOW_BOUNDS)) return false
  const now = tiles.pixelNow(SNOW_HELD_LAYER, lng, lat, snowTileZoom(zoom))
  if (now !== 'pending') return snowWordOfPixel(now) !== null
  return tiles.pixel(SNOW_HELD_LAYER, lng, lat, snowTileZoom(zoom)).then((p) => snowWordOfPixel(p) !== null)
}

/** The `identify` request for one point. */
export function snowIdentifyUrl(lng: number, lat: number): string {
  const box = [lng - HALF_BOX_DEG, lat - HALF_BOX_DEG, lng + HALF_BOX_DEG, lat + HALF_BOX_DEG]
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'all:2,3,7',
    tolerance: '0',
    mapExtent: box.join(','),
    imageDisplay: '10,10,96',
    returnGeometry: 'false',
    f: 'json',
  })
  return `${SNOW_SERVICE_URL}/identify?${params.toString()}`
}

/** What the analysis holds at a point. */
export interface SnowReading {
  depthIn: number
  /** Null where the water equivalent did not come back as a number. */
  sweIn: number | null
  /** When the analysis is valid for, or null where it did not say. */
  validMs: number | null
}

interface IdentifyResult {
  layerId?: number
  attributes?: Record<string, string>
}

/** An answer that is ArcGIS's error inside a 200, rather than an empty result. */
export function isServiceError(body: unknown): boolean {
  return typeof body !== 'object' || body === null || !Array.isArray((body as { results?: unknown }).results)
}

/** `10/16/2026 12:00:00 PM`, read as UTC, to epoch ms. */
export function parseValidTime(text: string | undefined): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(text?.trim() ?? '')
  if (!m) return null
  const hour = (Number(m[4]) % 12) + (m[7] === 'PM' ? 12 : 0)
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]))
}

/**
 * The reading in an `identify` answer, or null where it holds no depth: no
 * depth layer in the answer, or a value that is not a number (`NoData`). The
 * class is not consulted, because the card only asks where the map shows snow.
 */
export function parseSnowIdentify(body: unknown): SnowReading | null {
  if (isServiceError(body)) return null
  const results = (body as { results: IdentifyResult[] }).results
  const attrs = (id: number) => results.find((r) => r.layerId === id)?.attributes
  const depthM = Number(attrs(3)?.['Service Pixel Value'] ?? NaN)
  if (!Number.isFinite(depthM)) return null
  const sweMm = Number(attrs(7)?.['Service Pixel Value'] ?? NaN)
  return {
    depthIn: depthM * METRES_TO_INCHES,
    sweIn: Number.isFinite(sweMm) ? sweMm * MM_TO_INCHES : null,
    validMs: parseValidTime(attrs(2)?.idp_validtime),
  }
}

/**
 * Inches as the card prints them: one decimal under ten, whole above, grouped
 * by thousands, because the glacier cells the analysis never melts out run to
 * thousands of inches (`docs/DATA.md`).
 */
export function formatInches(inches: number): string {
  return inches < 10 ? `${inches.toFixed(1)} in` : `${Math.round(inches).toLocaleString('en-US')} in`
}

/** What the card names the snow analysis as, on its band. */
export const SNOW_SOURCE = 'NOAA snow analysis'

/** The line the body carries when NOAA could not answer (TJ, 2026-10-16). */
export const SNOW_FAILED = 'NOAA snow analysis failed. Try again later.'

/**
 * What the card names a cell on a glacier (TJ, 2026-10-16, #748). The
 * analysis has no glacier in it, and where snow never melts out its depth
 * keeps building from year to year, so the number there is neither a
 * season's snow nor the ice's thickness: Baker's summit read 834 in of depth
 * over 499 in of water, a density of 0.60, which is firn's rather than ice's
 * (about 0.9). So the name says where the numbers stand and claims nothing
 * about what they are made of, and the card still gives NOAA's numbers,
 * because they are what the source says. `docs/DATA.md` says what they are.
 */
export const GLACIER_TITLE = 'Glacier'

/** What a snow row NOAA cannot fill reads: the table's own mark for a value it does not have. */
const NO_VALUE = 'N/A'

/**
 * The snow's section the moment it is clicked: its name, and a bar for each
 * value on its way. A cell not yet known to be on a glacier or off one wears
 * a bar for its name too, rather than a depth word that a glacier would
 * replace a moment later (TJ, 2026-10-16, #748).
 */
export function pendingSnowSection(word: string, glacier: boolean | undefined): PointSection {
  return {
    title: glacier === undefined ? pendingValue() : escapeHtml(glacier ? GLACIER_TITLE : word),
    source: escapeHtml(SNOW_SOURCE),
    rows: [row('Depth', pendingValue()), row('Snow water equivalent', pendingValue()), updatedLine(pendingValue())],
  }
}

/**
 * The snow's section once NOAA has answered. A value it did not give reads
 * `N/A` rather than leaving its row off, so every snow section has the same
 * lines (#748).
 */
export function snowSection(word: string, reading: SnowReading, glacier = false): PointSection {
  const inches = (v: number | null) => (v === null ? NO_VALUE : escapeHtml(formatInches(v)))
  const valid = updatedAt(reading.validMs)
  return {
    title: escapeHtml(glacier ? GLACIER_TITLE : word),
    source: escapeHtml(SNOW_SOURCE),
    rows: [
      row('Depth', inches(reading.depthIn)),
      row('Snow water equivalent', inches(reading.sweIn)),
      updatedLine(valid === null ? NO_VALUE : escapeHtml(valid)),
    ],
  }
}

/** The snow's section when NOAA could not answer: its name kept, and the failure in place of the values. */
export function failedSnowSection(word: string): PointSection {
  return { title: escapeHtml(word), source: escapeHtml(SNOW_SOURCE), rows: [escapeHtml(SNOW_FAILED)] }
}

/** Ask NOAA for the analysis at a point, once more after an error inside a 200. */
export async function fetchSnowAt(lng: number, lat: number, signal: AbortSignal): Promise<SnowReading> {
  const ask = async () => (await layerFetch(snowIdentifyUrl(lng, lat), signal)).json() as Promise<unknown>
  let body = await ask()
  if (isServiceError(body)) body = await ask()
  if (isServiceError(body)) throw new Error('The snow analysis answered with an error')
  const reading = parseSnowIdentify(body)
  if (reading === null) throw new Error('The snow analysis held no depth at a painted point')
  return reading
}

/**
 * The snow's reading at a point, or null where the field painted nothing:
 * named at once from the held tile, its values asked of NOAA for `later`,
 * which settles to the failure line if NOAA cannot answer and rejects only
 * when `signal` says the card is gone.
 */
export async function readSnowAt(
  tiles: HeldTiles,
  { lng, lat, zoom }: { lng: number; lat: number; zoom: number },
  signal: AbortSignal,
  fetchReading: typeof fetchSnowAt = fetchSnowAt,
  glaciers: GlacierCheck = GLACIERS,
): Promise<PointReading | null> {
  if (!inBounds(lng, lat, SNOW_BOUNDS)) return null
  const word = snowWordOfPixel(await tiles.pixel(SNOW_HELD_LAYER, lng, lat, snowTileZoom(zoom)))
  if (word === null) return null
  // A cell whose glacier tiles are in hand is named at once; one whose are
  // not opens with a bar for its name and takes it with its numbers.
  const known = glaciers.now(lng, lat)
  const onGlacier = known ?? glaciers.ask(lng, lat, signal).catch(() => false)
  const later = Promise.all([fetchReading(lng, lat, signal), onGlacier]).then(
    ([reading, glacier]) => snowSection(word, reading, glacier),
    async (err: unknown) => {
      if (signal.aborted) throw err
      console.warn('The snow reading failed', err)
      return failedSnowSection((await onGlacier) ? GLACIER_TITLE : word)
    },
  )
  return { section: pendingSnowSection(word, known), later }
}
