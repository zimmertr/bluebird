// Satellite fire detections from NASA FIRMS, read from Bluebird Forecast's own
// `GET /api/fire-activity` rather than from FIRMS directly (#799).
//
// FIRMS's files carry no CORS header, so the browser cannot read them; the pod
// fetches the three Global 48-hour files every hour and answers a view's
// slice. A detection is one hot pixel, 375 m across for VIIRS and 1 km for
// MODIS, that a satellite flagged when it passed: where something was
// burning, not a fire's outline, which is what the wildfire perimeters draw.
//
// The answer carries when each pixel was seen rather than how old it is,
// because the age moves while the map is open. This module turns the instant
// into one of three age bands against the browser's own clock, and the map
// layer asks it again every minute, so a detection turns from red to orange
// at 12 hours without a fetch.
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import type { FireActivityResponse, FireDetectionProps } from '../types'
import { apiFetch, overlayFeatures } from './apiFetch'
import { clamp, grouped, isFiniteNumber, roundTo } from './numbers'
import { ageAgo, escapeHtml, monthDayTime, popupCard, row } from './popup/popupChrome'
import type { BBox } from './wildfires'

const FIRE_ACTIVITY_URL = '/api/fire-activity'

/**
 * Where the layer's credit points: FIRMS's own home on Earthdata, the page
 * its acknowledgement names. Beside the other overlays' hrefs in their own
 * modules (`NIFC_HREF`, `HMS_HREF`), so the legend reads every credit from
 * the module that owns the data.
 */
export const FIRMS_HREF = 'https://earthdata.nasa.gov/firms'

const HOUR_MS = 60 * 60 * 1000

/**
 * The three age bands, by the hour each one ends at: under 12 hours, 12 to
 * 24, and 24 to 48. A detection older than the last is not drawn. The
 * maintainer's call, 2026-10-27: CalTopo's Fire Activity layer reads the same
 * way, and 48 hours is what the pod keeps.
 */
export const AGE_BANDS = [12, 24, 48] as const

/**
 * What the legend's chip for each band reads, in `AGE_BANDS` order: the hour
 * the band ends at, bare, because the chip is the smoke chips' 16px box.
 * Approved 2026-10-29 (record 0237).
 */
export const AGE_BAND_CHIPS = ['12', '24', '48'] as const

/**
 * The words each chip stands for, in `AGE_BANDS` order, hidden in the chip
 * for a screen reader the way the smoke chips hide theirs: `12` alone does
 * not say whether it is an age, a bound or a span. Approved 2026-10-27
 * (record 0237).
 */
export const AGE_BAND_WORDS = ['Under 12 hours', '12 to 24 hours', '24 to 48 hours'] as const

/**
 * The band a detection seen at `acquiredMs` falls in at `nowMs`, or null when
 * it is older than 48 hours or its stamp is unreadable.
 *
 * Each band holds its lower edge, so a detection exactly 12 hours old is in
 * the second band, and exactly 48 hours old is still drawn. A stamp ahead of
 * the browser's clock, which a slow clock can give, reads as new.
 */
export function ageBand(acquiredMs: number, nowMs: number): number | null {
  if (!Number.isFinite(acquiredMs) || !Number.isFinite(nowMs)) return null
  const ageMs = nowMs - acquiredMs
  if (ageMs < AGE_BANDS[0] * HOUR_MS) return 0
  if (ageMs < AGE_BANDS[1] * HOUR_MS) return 1
  if (ageMs <= AGE_BANDS[2] * HOUR_MS) return 2
  return null
}

/**
 * How each band draws, and the one place that decides it (#365).
 *
 * Red, orange and yellow, newest first, the way CalTopo's layer reads, and
 * lighter as a detection ages, so the ramp holds without the hue. Each
 * starburst wears `FIRE_ACTIVITY_STROKE` as its halo, because one mark has to
 * read on two grounds
 * the fills cannot both clear: Liberty's pale land, where the near-black
 * stroke carries it, and dark forest under the satellite imagery, where the
 * fill does.
 *
 * Measured 2026-10-27 against Liberty's land tone (`#efece6`, the smoke
 * swatch's `BASEMAP_TONE`) and against dark forest, the mean of a USGS
 * imagery tile over the Oregon Cascades at zoom 13 (`#2c4844`):
 *
 * | band | fill | fill on forest | stroke on Liberty | fill on stroke |
 * |---|---|---|---|---|
 * | under 12 h | `#ff5a45` | 3.21:1 | 14.83:1 | 5.66:1 |
 * | 12 to 24 h | `#fb923c` | 4.38:1 | 14.83:1 | 7.73:1 |
 * | 24 to 48 h | `#fde047` | 7.52:1 | 14.83:1 | 13.27:1 |
 *
 * The red is not a Tailwind step: red-500 (`#ef4444`) measures 2.64:1 on
 * that forest, and this is the reddest fill that clears 3:1 with a margin.
 * The orange is orange-400 and the yellow yellow-300. The stroke is
 * stone-900, the warm near-black the smoke layer's stone sits beside, and it
 * measures 1.76:1 on the forest, which is why the fill is the one that
 * carries the mark there. (Measured on the discs the layer drew first; a
 * starburst wears the same fill and the same edge.)
 */
export const FIRE_ACTIVITY_FILLS = ['#ff5a45', '#fb923c', '#fde047'] as const
export const FIRE_ACTIVITY_STROKE = '#1c1917'

/**
 * The zoom below which the layer neither fetches nor draws. A view at zoom 5
 * on a wide screen is about 60° of longitude, and the densest such view
 * measured (southern Africa, 2026-10-27, late in its burning season) held
 * 76,792 detections, 15.5 MB of GeoJSON and 1.0 MB gzipped. A zoom lower
 * would ask for most of the world's 200,000. What is held stays, for the zoom
 * back in, the way the trailhead markers do it (`map/landmarks.ts`).
 */
export const FIRE_ACTIVITY_MINZOOM = 5

/**
 * The starburst's size by zoom, as MapLibre's `icon-size` over the image
 * `starburstSdf` draws, whose points span `FIRE_STAR_PX` at 1: 6 px across at
 * the floor, about the 5 px disc the layer drew first, where a view holds a
 * country's fires and a bigger mark would merge them into a smear, to 14 px at
 * zoom 12, where one 375 m pixel is about 12 screen pixels across.
 */
export const FIRE_STAR_PX = 14
export const FIRE_ACTIVITY_ICON_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  FIRE_ACTIVITY_MINZOOM,
  6 / FIRE_STAR_PX,
  12,
  1,
]
/**
 * The halo's width in pixels: a thin dark edge round each star, the ring the
 * disc's stroke was, so a star reads on Liberty's pale land.
 */
export const FIRE_ACTIVITY_HALO_WIDTH = 1

/** The star's colour, from the `band` property `withAgeBands` sets. */
export const FIRE_ACTIVITY_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'band'],
  0,
  FIRE_ACTIVITY_FILLS[0],
  1,
  FIRE_ACTIVITY_FILLS[1],
  FIRE_ACTIVITY_FILLS[2],
]

/** Newer over older where stars overlap: a higher key draws on top. */
export const FIRE_ACTIVITY_SORT_KEY: ExpressionSpecification = ['-', AGE_BANDS.length - 1, ['get', 'band']]

/** How often the bands are read again while the layer is shown. */
export const FIRE_ACTIVITY_RECOLOR_MS = 60 * 1000

/** A detection as the map draws it: the route's properties and its band. */
export type BandedDetectionProps = FireDetectionProps & { band: number }

/**
 * The detections the map can draw at `nowMs`, each with its band, and the
 * bands in order so a caller can tell whether a minute changed any.
 *
 * A detection past 48 hours, or with a stamp that does not parse, is left
 * out rather than drawn in a band it is not in.
 */
export function withAgeBands(
  fc: FireActivityResponse,
  nowMs: number,
): { data: FeatureCollection<Point, BandedDetectionProps>; bands: string } {
  const features: Feature<Point, BandedDetectionProps>[] = []
  let bands = ''
  for (const feature of fc.features) {
    const band = ageBand(Date.parse(feature.properties?.acquired ?? ''), nowMs)
    if (band === null) {
      bands += '-'
      continue
    }
    bands += band
    features.push({ ...feature, properties: { ...feature.properties, band } })
  }
  return { data: { type: 'FeatureCollection', features }, bands }
}

/** Build the API URL for detections inside `bbox`. Pure, so it's testable. */
export function fireActivityQueryUrl(bbox: BBox): string {
  return `${FIRE_ACTIVITY_URL}?${new URLSearchParams({ bbox: bbox.join(',') }).toString()}`
}

/**
 * Fetch the detections inside `bbox`.
 *
 * `signal` lets a stale request be aborted when the reader pans again. A 429
 * or a 503 is marked `rateLimited` with the pod's `Retry-After`, as for the
 * other overlays, so the layer waits rather than asks again.
 */
export async function fetchFireActivity(bbox: BBox, signal: AbortSignal): Promise<FireActivityResponse> {
  const res = await apiFetch(fireActivityQueryUrl(bbox), { signal })
  // `fetched_at` rides the answer for API callers; the map does not read it,
  // for the reason `fetchWildfires` gives.
  return overlayFeatures<FireActivityResponse>(
    res,
    'Fire activity data unavailable. Try again later.',
    'Fire activity data could not be read.',
  )
}

/**
 * The starburst a detection is drawn as, on the map and in the legend (#799):
 * twelve points, as CalTopo draws its fire activity, with the inner corners
 * at a share of the points' radius that differs by size. On the map, 0.65:
 * at 0.8 a 14px mark at zoom 12 read as a fuzzy disc, its points a pixel deep
 * under the halo's blur, and at 0.65 and 0.55 it read as a star (tried
 * 2026-10-28 over Munds Park at zooms 9 and 12). In the legend, 0.8: the chip
 * is 16px, the smoke chips' box, and its 10px label, 11.1px wide, has to sit
 * inside the inner corners to stand on the fill, which at 0.65 it would not
 * (their apothem is 4.7px from the centre there and the label reaches 5.55px;
 * at 0.8 it is 5.8px). Tried at 16px in both themes on 2026-10-29: at 0.65
 * the star's edge ran through every digit, and on the dark card the digits'
 * ends stood on the card in their dark ink.
 */
export const STARBURST_POINTS = 12
export const STARBURST_INNER = { map: 0.65, chip: 0.8 } as const

/**
 * The starburst's corners about `[cx, cy]`, `outer` the radius of its points
 * and `inner` its inner corners' share of it, starting from the point straight
 * up and going clockwise on a screen.
 */
export function starburst(outer: number, inner: number, cx = 0, cy = 0): [number, number][] {
  const corners: [number, number][] = []
  for (let i = 0; i < STARBURST_POINTS * 2; i++) {
    const r = i % 2 === 0 ? outer : outer * inner
    const angle = (i * Math.PI) / STARBURST_POINTS
    corners.push([cx + r * Math.sin(angle), cy - r * Math.cos(angle)])
  }
  return corners
}

/**
 * The density of the icon the map draws, so a 14 px star is 28 image pixels
 * and stays sharp on a high-density screen.
 */
export const FIRE_STAR_PIXEL_RATIO = 2

/**
 * How far the distance field reaches past the star's points, in image
 * pixels: room for the halo at the floor, where a 1 px halo on a star drawn
 * at under half size is 2.3 of the image's pixels at its 1x.
 */
const SDF_BUFFER = 8

/**
 * MapLibre's SDF scale: an edge at 192 of 255, and 32 steps of alpha per
 * pixel at the size the shader reads, which for an icon is a CSS pixel at
 * `icon-size` 1 (`SDF_PX` 8 in its symbol shader, where the halo's edge is
 * `(6 - halo_width / size) / 8`). At `FIRE_STAR_PIXEL_RATIO` that is 16 per
 * image pixel.
 */
const SDF_EDGE = 192
const SDF_STEP = 32 / FIRE_STAR_PIXEL_RATIO

/** The starburst as MapLibre takes an image: its size and its RGBA bytes. */
export interface StarburstImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * The starburst as a signed distance field, for a symbol layer with `sdf`
 * on, so `icon-color` paints each band and `icon-halo-color` edges it from
 * one image. Built from the shape's corners rather than on a canvas: each
 * pixel's alpha is its distance to the nearest edge, positive inside, so it
 * needs no DOM and the node tests read it whole. The colour channels are
 * white; MapLibre reads the alpha alone.
 */
export function starburstSdf(): StarburstImage {
  const outer = (FIRE_STAR_PX / 2) * FIRE_STAR_PIXEL_RATIO
  const size = 2 * (outer + SDF_BUFFER)
  const c = size / 2
  const corners = starburst(outer, STARBURST_INNER.map, c, c)
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [px, py] = [x + 0.5, y + 0.5]
      let nearest = Infinity
      let inside = false
      for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const [ax, ay] = corners[j]
        const [bx, by] = corners[i]
        // The ray cast for inside, and the distance to this edge.
        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
        const [dx, dy] = [bx - ax, by - ay]
        const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        nearest = Math.min(nearest, Math.hypot(px - ax - t * dx, py - ay - t * dy))
      }
      const signed = inside ? nearest : -nearest
      const at = (y * size + x) * 4
      data[at] = data[at + 1] = data[at + 2] = 255
      data[at + 3] = clamp(Math.round(SDF_EDGE + SDF_STEP * signed), 0, 255)
    }
  }
  return { width: size, height: size, data }
}

/** One legend chip: a band's label, its hidden words and the starburst it sits in. */
export interface FireActivityLegendChip {
  label: string
  words: string
  fill: string
  stroke: string
}

/**
 * The legend's three chips, newest first, each a starburst of the band's
 * fill in the layer's edge, so the key and the picture cannot disagree.
 */
export function fireActivityLegendChips(): FireActivityLegendChip[] {
  return AGE_BAND_CHIPS.map((label, band) => ({
    label,
    words: AGE_BAND_WORDS[band],
    fill: FIRE_ACTIVITY_FILLS[band],
    stroke: FIRE_ACTIVITY_STROKE,
  }))
}

/**
 * The card a click on a star opens (#799; the maintainer, 2026-10-29: every
 * other thing on the map opens one). Its title and its four labels are the
 * approved copy, word for word; the values are the feed's.
 */
export const HOTSPOT_TITLE = 'Hotspot'

/** One line of the card: an approved label and the detection's value for it. */
export interface HotspotRow {
  label: 'Detected' | 'Satellite' | 'Confidence' | 'Fire power'
  value: string
}

/**
 * The satellites FIRMS names in its `satellite` column, by the code each file
 * spells: `N20` and `N21` in the VIIRS files, `T` and `A` in the MODIS one
 * (read off the files on 2026-10-27, `backend/tests/data/firms_*.csv`), with
 * the long names FIRMS's own documentation also uses. Suomi NPP's `N` is
 * absent because its file is not read (record 0237).
 */
const SATELLITES: Readonly<Record<string, string>> = {
  N20: 'NOAA-20',
  N21: 'NOAA-21',
  T: 'Terra',
  Terra: 'Terra',
  A: 'Aqua',
  Aqua: 'Aqua',
}

/** VIIRS's confidence as a letter, which some FIRMS products spell it as. */
const CONFIDENCE_WORDS: Readonly<Record<string, string>> = { l: 'low', n: 'nominal', h: 'high' }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * The satellite and its instrument, `NOAA-20 VIIRS` or `Terra MODIS`. A code
 * this table does not know names the instrument alone rather than printing a
 * bare letter, and with neither the row is left out.
 */
function satelliteOf(satellite: unknown, instrument: unknown): string | null {
  const name = SATELLITES[text(satellite)] ?? ''
  return [name, text(instrument)].filter(Boolean).join(' ') || null
}

/**
 * The confidence as the feed gives it: VIIRS's word (`low`, `nominal`,
 * `high`) in sentence case, MODIS's number from 0 to 100 as a percent.
 */
function confidenceOf(raw: unknown): string | null {
  const c = typeof raw === 'number' ? String(raw) : text(raw)
  if (c === '') return null
  if (/^\d+(\.\d+)?$/.test(c)) return `${Math.round(Number(c))}%`
  const word = CONFIDENCE_WORDS[c.toLowerCase()] ?? c
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * The radiative power in megawatts, one decimal under 10 and whole from 10,
 * where a tenth is noise beside the number. Rounded to a tenth before the
 * test, so 9.96 reads `10 MW` rather than `10.0 MW`.
 */
function firePowerOf(frp: unknown): string | null {
  if (!isFiniteNumber(frp)) return null
  const tenths = roundTo(frp, 1)
  return `${tenths < 10 ? tenths.toFixed(1) : grouped(Math.round(frp))} MW`
}

/** When the pixel was seen and how long ago, against `nowMs`. */
function detectedOf(acquired: unknown, nowMs: number): string | null {
  const ms = Date.parse(text(acquired))
  if (!Number.isFinite(ms)) return null
  try {
    return `${monthDayTime(new Date(ms))} (${ageAgo(nowMs - ms)})`
  } catch {
    return null
  }
}

/**
 * A detection's card lines, in order, each the label and its value as text.
 * A field the feed left out, or one that does not read, leaves its line off
 * rather than standing a dash in it. Pure, so the node tests hold every form.
 * Takes a feature as MapLibre hands one to a click, whose properties may have
 * lost a null.
 */
export function hotspotRows(
  feature: { properties?: Partial<Record<keyof FireDetectionProps, unknown>> | null },
  nowMs: number,
): HotspotRow[] {
  const p = feature.properties ?? {}
  const rows: [HotspotRow['label'], string | null][] = [
    ['Detected', detectedOf(p.acquired, nowMs)],
    ['Satellite', satelliteOf(p.satellite, p.instrument)],
    ['Confidence', confidenceOf(p.confidence)],
    ['Fire power', firePowerOf(p.frp)],
  ]
  return rows.flatMap(([label, value]) => (value === null ? [] : [{ label, value }]))
}

/** The card itself, on the card every popup wears (`popupCard`). */
export function hotspotPopupHtml(
  feature: { properties?: Partial<Record<keyof FireDetectionProps, unknown>> | null },
  nowMs: number,
): string {
  return popupCard({
    title: HOTSPOT_TITLE,
    body: hotspotRows(feature, nowMs)
      .map(({ label, value }) => row(label, escapeHtml(value)))
      .join(''),
  })
}
