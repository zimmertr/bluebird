/**
 * The rain radar's reading at a clicked point, from the tile the map drew
 * there (#737).
 *
 * IEM serves no point value for the N0Q composite: its WMS advertises
 * `GetFeatureInfo` and marks every N0Q layer `queryable="0"`. It does not need
 * to, because **the tiles are lossless**. The composite is an 8-bit image
 * whose palette gives each of its 256 values a colour of its own, index `i`
 * being `i * 0.5 - 32.5` dBZ, and the tiles keep those colours exactly:
 * measured 2026-10-16 over seven tiles from z4 to z8, all 13,348 painted
 * pixels were an exact palette colour and fully opaque, and every other pixel
 * fully transparent. So the colour of one tile pixel IS the radar's value
 * there, to its own 0.5 dBZ step, rather than a band read off a ramp.
 *
 * The pixel is read from the copy of the tile the app keeps as MapLibre
 * loads it (`heldTiles.ts`), never from the map's canvas, which carries the
 * layer at 0.65 opacity over the basemap and MapLibre's resampling, so a
 * canvas pixel is a blend no palette entry matches. Reading the copy costs no
 * request, which is what lets the pointer change over an echo on every move
 * and the card open whole the moment it is clicked.
 *
 * Reflectivity is all the radar measures. It says nothing of the wind, of
 * whether the echo is rain, snow or hail, or of how much has fallen; the rain
 * rate on the card is an estimate from the reflectivity alone
 * ({@link rainRateInPerHour}), and `docs/DATA.md` says what it cannot know.
 */
import type { HeldTiles, Rgba } from './heldTiles'
import { inBounds, type PointReading, type PointSection } from './pointReadout'
import { escapeHtml, row, updatedLine } from './popupChrome'
import { RADAR_EXTENTS } from './radar'

/**
 * The N0Q composite's palette, 256 colours as RGB hex, index 0 first.
 *
 * Read on 2026-10-16 from the PLTE chunk of IEM's own composite,
 * `data/gis/images/4326/USCOMP/n0q_0.png` (a 4 KB ranged read of its header).
 * Every entry is distinct, which is what lets a colour name its value. If IEM
 * ever changes the ramp, no painted pixel matches and no radar card opens,
 * which is the safe way for this to break: it can stop answering, never
 * answer wrong.
 */
const N0Q_PALETTE =
  '00000085718f85728f86738d87758b87768b887789897987897a878a7b858b7d848b7e848c7f828d81808d82808e837e' +
  '8f847c8f857c90877b918879918979928b77938d759691539894579b975b9d9a60a09d64a3a068a5a36da8a671aaa976' +
  'adac7ab0af7eb2b283b7b88cbabb90bdbe94bfc199c2c49dc4c7a2c7caa6cacdaaccd0afd2d4b4cfd2b4c9ccb4c6c9b4' +
  'c3c7b4c0c4b4bdc1b4b9beb4b6bbb4b3b9b4b0b6b4adb3b4aab0b4a4abb4a0a8b49da5b49aa2b497a0b4949db4919ab4' +
  '949bb59098b48c95b38892b2808cb07c89af7886ae7483ac7080ab6c7daa6779a96376a85f73a75b70a6576da44f67a2' +
  '4b64a14761a0435e9f415b9e4361a24568a6486faa4a76ae4d7db24f84b6518bbb5699c3599fc75ba6cb5eadcf60b4d4' +
  '62bbd865c2dc67c9e06ad0e46fd6e868d6d759d6b352d6a24bd69043d67e3cd66d35d65b11d51811d11710cd1710c816' +
  '10c4160fbc150fb7140eb3140eaf130eab130da6120da2120d9e110c99110c95100c91100b880f0b840e0a800e0a7c0d' +
  '0a770d09730c096f0c096b0b08660b08620a095e09327308467d085b88076f9207849d0698a806adb205c1bd05d6c704' +
  'ead204ffe200ffd800ffd300ffce00ffc900ffc400ffc000ffbb00ffb600ffb100ffac00ffa700ffa200ff9900ff9400' +
  'ff8f00ff8a00ff8500ff8000ff0000f80000f10000ea0000e30000d50000cd0000c60000bf0000b80000b10000aa0000' +
  'a300009b00009400008d00007f0000780000710000fffffffff5ffffeaffffdfffffd4ffffc9ffffbeffffb3ffff9dff' +
  'ff92ffff75fffc6bfdf960faf656f7f34bf4f040f1ed36efea2bece720e9e10be3b200ffac00fca400f79b00f49300ef' +
  '8800ea8300e87900e27200dd6900db05ecf005ebf005eaf005dde005dce005dbe005cdd005ccd004bdc004bcc004bbc0' +
  '04aeb004adb0049ea0049da0049ca0038e90038d90038c90037e80037d80036f70036e70036d70025f60025e60024f50' +
  '024e50024d50023f40023e40023d40013030012f30012020011f20011e203a67b53a66b53a65b53a64b53a63b53a62b5'

/** Each palette colour, as `r,g,b`, to the index that wears it. */
const INDEX_OF_COLOR: ReadonlyMap<string, number> = new Map(
  Array.from({ length: N0Q_PALETTE.length / 6 }, (_, i) => {
    const hex = N0Q_PALETTE.slice(i * 6, i * 6 + 6)
    const rgb = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(',')
    return [rgb, i] as const
  }),
)

/**
 * The reflectivities at the composite's two ends, index 1 and index 255: an
 * echo past either is encoded there, so a pixel at an end says only that the
 * echo reached it. The card marks them as bounds, inclusive (TJ, 2026-10-16),
 * which is true whether IEM clamps to them or merely reaches them. No storm
 * reaches the top, and IEM may never paint the bottom; the mark is there so
 * either reads right if it does.
 */
export const N0Q_FLOOR_DBZ = 1 * 0.5 - 32.5
export const N0Q_CEILING_DBZ = 255 * 0.5 - 32.5

/** A reflectivity as the card prints it, to the composite's half-dBZ step, marked as a bound at either end. */
export function formatReflectivity(dbz: number): string {
  const shown = `${dbz.toFixed(1)} dBZ`
  if (dbz >= N0Q_CEILING_DBZ) return `≥${shown}`
  if (dbz <= N0Q_FLOOR_DBZ) return `≤${shown}`
  return shown
}

/** How many colours the palette carries: one per value of the 8-bit composite. */
export const N0Q_PALETTE_SIZE = INDEX_OF_COLOR.size

/**
 * The reflectivity a tile pixel paints, in dBZ, or null where it paints
 * nothing: a transparent pixel, index 0 (the composite's no-data black), or a
 * colour that is not in the palette at all.
 */
export function dbzOfPixel(r: number, g: number, b: number, a: number): number | null {
  if (a === 0) return null
  const index = INDEX_OF_COLOR.get(`${r},${g},${b}`)
  if (index === undefined || index === 0) return null
  return index * 0.5 - 32.5
}

/**
 * The reflectivity under which an echo is not called precipitation: birds,
 * insects and ground clutter paint there as readily as drizzle, and IEM paints
 * echoes down to -30 dBZ. The thresholds above it are the common convention
 * rather than a published NWS table (TJ, 2026-10-16).
 */
export const WEAK_ECHO_DBZ = 15

const INTENSITY: readonly { from: number; word: string }[] = [
  { from: 50, word: 'Very heavy' },
  { from: 40, word: 'Heavy' },
  { from: 30, word: 'Moderate' },
  { from: WEAK_ECHO_DBZ, word: 'Light' },
]

/**
 * What the card calls a reflectivity. "Precipitation" rather than "rain",
 * because reflectivity cannot tell rain from snow.
 */
export function radarTitle(dbz: number): string {
  const band = INTENSITY.find((b) => dbz >= b.from)
  return band ? `${band.word} precipitation` : WEAK_ECHO_TITLE
}

const WEAK_ECHO_TITLE = 'Weak radar echo'

/**
 * The reflectivity a rain rate is read at most from, the NEXRAD rainfall
 * algorithm's hail cap: past it an echo is usually hail, whose reflectivity
 * says little about the water falling, and the NWS's own estimate stops
 * rising there. Without it the strongest cell measured on 2026-10-16, 59 dBZ
 * over Wilkes-Barre, read 7.0 in/h, which no rain does.
 */
export const HAIL_CAP_DBZ = 53

/**
 * The rain rate a reflectivity implies, in inches an hour, by Marshall and
 * Palmer's Z = 200 R^1.6 with R in mm/h: the textbook Z-R relation for
 * stratiform rain, read no higher than {@link HAIL_CAP_DBZ}. It assumes rain,
 * so it reads wrong under snow, and it is an estimate even in rain, since the
 * relation varies by storm.
 */
export function rainRateInPerHour(dbz: number): number {
  const z = 10 ** (Math.min(dbz, HAIL_CAP_DBZ) / 10)
  return (z / 200) ** (1 / 1.6) / 25.4
}

/**
 * A rain rate as the card prints it: two decimals under an inch an hour, one
 * above. A rate read at {@link HAIL_CAP_DBZ} or past it is the cap's rather
 * than the echo's, so it says it is a floor (`≥2.9 in/h`) the way the cloud
 * deck marks a reading at its ceiling (TJ, 2026-10-16), and loses the `~`
 * that an estimate under the cap carries.
 */
export function formatRainRate(inPerHour: number, atCap = false): string {
  const shown = `${inPerHour.toFixed(inPerHour < 1 ? 2 : 1)} in/h`
  return atCap ? `≥${shown}` : `~${shown}`
}

/**
 * When the frame was measured, as the card's `Updated` line says it: `now` for
 * the newest and its age for an older one, in the timeline's own terms. A
 * clock time would claim a precision the relative frames do not carry
 * (`radar.ts`): IEM's per-frame times exist, but a tile can sit in its edge
 * cache for five minutes, so a time asked for at the click can be a frame off
 * the picture on screen.
 */
export function radarUpdated(offsetMin: number): string {
  return offsetMin === 0 ? 'now' : `${offsetMin} min ago`
}

/** What the card names the radar as, on its band. */
export const RADAR_SOURCE = 'NEXRAD radar'

/** What a radar row the frame cannot fill reads: the table's own mark for a value it does not have. */
const NO_VALUE = 'N/A'

/**
 * The radar's section of the card, for a painted reflectivity on one frame.
 * The rate leads, being what a reader came to ask, and the reflectivity it is
 * read from follows it (TJ, 2026-10-16). A weak echo, which may be birds or
 * clutter, has no rate to give and says so rather than dropping the row, so
 * every radar section has the same lines and a card that follows the player
 * keeps its height (TJ, 2026-10-16, #748).
 */
export function radarSection(dbz: number, offsetMin: number): PointSection {
  const rate = dbz >= WEAK_ECHO_DBZ ? formatRainRate(rainRateInPerHour(dbz), dbz >= HAIL_CAP_DBZ) : NO_VALUE
  return {
    title: escapeHtml(radarTitle(dbz)),
    titles: RADAR_TITLES,
    source: escapeHtml(RADAR_SOURCE),
    rows: [row('Rate', escapeHtml(rate)), row('Reflectivity', formatReflectivity(dbz)), updatedLine(radarUpdated(offsetMin))],
  }
}

/** What an open card names a frame that painted nothing at its point (TJ, 2026-10-16, #748). */
export const NO_ECHO_TITLE = 'No radar echo'

/**
 * Every name a radar section can take, which its card is kept as wide as the
 * widest of, so a card the forecast player renames does not jump sideways
 * (#752).
 */
export const RADAR_TITLES: readonly string[] = [
  ...INTENSITY.map((b) => `${b.word} precipitation`),
  WEAK_ECHO_TITLE,
  NO_ECHO_TITLE,
].map(escapeHtml)

/**
 * The radar's section for a frame with no echo at the point: a card already
 * open stays open through it, since the storm may come back on the next
 * frame. No echo means the radar saw nothing falling, so the rate is a
 * reading of 0, and there is no reflectivity to give.
 */
export function noEchoSection(offsetMin: number): PointSection {
  return {
    title: escapeHtml(NO_ECHO_TITLE),
    titles: RADAR_TITLES,
    source: escapeHtml(RADAR_SOURCE),
    rows: [row('Rate', '0 in/h'), row('Reflectivity', NO_VALUE), updatedLine(radarUpdated(offsetMin))],
  }
}

/** The radar tiles' size, which is the `tileSize` the overlay declares. */
export const RADAR_TILE_PX = 256

/**
 * The zoom MapLibre loads a 256 px raster at: `round(zoom + 1)`, since its own
 * tiles are 512 px and it rounds for a raster (`coveringZoomLevel` in
 * maplibre-gl 6.13.0, read rather than assumed).
 */
export function radarTileZoom(mapZoom: number): number {
  return Math.max(0, Math.min(22, Math.round(mapZoom + 1)))
}

/** Where one frame's tiles are kept in `heldTiles.ts`. */
export function radarHeldLayer(offsetMin: number): string {
  return `radar-${offsetMin}`
}

/** The reflectivity a held pixel paints, or null where it painted nothing. */
function dbzOfHeld(pixel: Rgba | null): number | null {
  return pixel === null ? null : dbzOfPixel(...pixel)
}

/**
 * Whether the frame on screen painted at a point, from the tile the map
 * drew: at once where that tile is decoded, and once it is otherwise. False
 * outside every radar's reach, without a lookup.
 */
export function radarPaints(
  tiles: HeldTiles,
  offsetMin: number,
  { lng, lat, zoom }: { lng: number; lat: number; zoom: number },
): boolean | Promise<boolean> {
  if (!RADAR_EXTENTS.some((box) => inBounds(lng, lat, box))) return false
  const layer = radarHeldLayer(offsetMin)
  const now = tiles.pixelNow(layer, lng, lat, radarTileZoom(zoom))
  if (now !== 'pending') return dbzOfHeld(now) !== null
  return tiles.pixel(layer, lng, lat, radarTileZoom(zoom)).then((p) => dbzOfHeld(p) !== null)
}

/**
 * The radar's reading at a point on the frame on screen, or null where that
 * frame painted nothing. Every value is in the pixel, so nothing is asked of
 * anyone and the reading is whole at once.
 */
export async function readRadarAt(
  tiles: HeldTiles,
  offsetMin: number,
  { lng, lat, zoom }: { lng: number; lat: number; zoom: number },
): Promise<PointReading | null> {
  const dbz = await heldDbz(tiles, offsetMin, { lng, lat, zoom })
  return dbz === null ? null : { section: radarSection(dbz, offsetMin) }
}

/**
 * The radar's section at a point for a card already open, read again when the
 * frame on screen changes (#748), and again as each of that frame's tiles
 * arrives (#752). A frame that painted nothing there, or whose tiles have not
 * arrived, answers the no-echo section rather than closing the card: the map
 * shows no echo at the point either, so that is what the card says until a
 * tile says otherwise.
 */
export async function rereadRadarAt(
  tiles: HeldTiles,
  offsetMin: number,
  at: { lng: number; lat: number; zoom: number },
): Promise<PointSection> {
  const dbz = await heldDbz(tiles, offsetMin, at)
  return dbz === null ? noEchoSection(offsetMin) : radarSection(dbz, offsetMin)
}

/** The reflectivity one frame painted at a point, or null where it painted nothing. */
async function heldDbz(
  tiles: HeldTiles,
  offsetMin: number,
  { lng, lat, zoom }: { lng: number; lat: number; zoom: number },
): Promise<number | null> {
  if (!RADAR_EXTENTS.some((box) => inBounds(lng, lat, box))) return null
  return dbzOfHeld(await tiles.pixel(radarHeldLayer(offsetMin), lng, lat, radarTileZoom(zoom)))
}
