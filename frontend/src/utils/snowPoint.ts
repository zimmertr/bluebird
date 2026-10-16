/**
 * The snow depth's reading at a clicked point, asked of NOAA (#737).
 *
 * The NOHRSC map service the layer is drawn from answers ArcGIS `identify` at
 * a point, so the card shows the analysis's own numbers rather than a colour's
 * reading of them. Measured 2026-10-16 against the live service:
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
 * - **The class decides whether a card opens, not the number.** The class is
 *   what the layer paints by, and the two disagree at the bottom: 0.02 m
 *   (0.8 in) came back in class 0, which NOAA draws transparent, though the
 *   legend starts painting at 0.39 in. A click opens a card where the map
 *   shows snow, and nowhere else.
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
 *   shape is asked once more before the click is given up. Once rather than
 *   on a schedule, because the reader's next click is the next attempt.
 */
import { pointFetch, inBounds, type PointSection } from './pointReadout'
import { escapeHtml, row } from './popupChrome'
import { SNOW_BOUNDS, SNOW_SERVICE_URL } from './snowDepth'

const METRES_TO_INCHES = 1 / 0.0254
const MM_TO_INCHES = 1 / 25.4

/** Half the side of the box the request reads the point in, in degrees. */
const HALF_BOX_DEG = 0.005

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

/** What the analysis holds at a point where it paints snow. */
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
 * The reading in an `identify` answer, or null where the layer paints nothing
 * there: no depth layer in the answer, a value that is not a number
 * (`NoData`), or a class of 0, which NOAA draws transparent.
 */
export function parseSnowIdentify(body: unknown): SnowReading | null {
  if (isServiceError(body)) return null
  const results = (body as { results: IdentifyResult[] }).results
  const attrs = (id: number) => results.find((r) => r.layerId === id)?.attributes
  const depth = attrs(3)
  const depthM = Number(depth?.['Service Pixel Value'])
  const painted = Number(depth?.['Classify.Class value']) >= 1
  if (!painted || !Number.isFinite(depthM)) return null
  const sweMm = Number(attrs(7)?.['Service Pixel Value'])
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

/**
 * When the analysis is valid for, in the reader's own time: the time alone on
 * the day it is read, the date with it otherwise, as the smoke card dates its
 * imagery.
 */
export function formatValidTime(validMs: number, nowMs: number): string {
  const at = new Date(validMs)
  const sameDay = at.toDateString() === new Date(nowMs).toDateString()
  return sameDay
    ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** The snow's section of the card. */
export function snowSection(reading: SnowReading, nowMs: number): PointSection {
  const source =
    reading.validMs === null ? 'NOAA snow analysis' : `NOAA snow analysis, ${formatValidTime(reading.validMs, nowMs)}`
  return {
    title: escapeHtml(`${formatInches(reading.depthIn)} of snow`),
    source: escapeHtml(source),
    rows: reading.sweIn === null ? [] : [row('Snow water equivalent', escapeHtml(formatInches(reading.sweIn)))],
  }
}

/**
 * The snow's section at a point, or null where the analysis paints nothing or
 * does not reach. A failed request, or a second error inside a 200, rejects,
 * and the caller warns.
 */
export async function readSnowAt(
  lng: number,
  lat: number,
  signal: AbortSignal,
  nowMs: number = Date.now(),
): Promise<PointSection | null> {
  if (!inBounds(lng, lat, SNOW_BOUNDS)) return null
  const ask = async () => (await pointFetch(snowIdentifyUrl(lng, lat), signal)).json() as Promise<unknown>
  let body = await ask()
  if (isServiceError(body)) body = await ask()
  if (isServiceError(body)) throw new Error('The snow analysis answered with an error')
  const reading = parseSnowIdentify(body)
  return reading === null ? null : snowSection(reading, nowMs)
}
