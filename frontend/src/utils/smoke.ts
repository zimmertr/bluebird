// Smoke plumes from NOAA's Hazard Mapping System, read from Bluebird's own
// `GET /api/smoke` rather than from NOAA directly.
//
// Through the pod for the reason the fire overlay learned in #203 — one caller
// instead of N — though the pressure here is milder: NOAA serves this off a
// plain file server with no quota to exhaust. What the pod buys instead is the
// date arithmetic. HMS publishes one dated KML per day and its first analyst
// pass lands around late morning Eastern, so "today's smoke" is a computation
// with a fallback, not a URL, and it should not be done once per visitor in
// three timezones.
//
// Two things worth knowing before reading a plume as weather. It is *observed*
// rather than forecast: analysts trace what they can see in GOES imagery, so a
// plume is where the smoke was during the window it names. And it says nothing
// about the ground: satellites see a column from above, so a plume overhead can
// mean a hazy sky and clean air to breathe, or the opposite. The AQI columns in
// the results table are what measure air; this draws where the smoke is.
//
// Coverage is North America, which is what HMS analyzes. Outside it an empty
// answer means "not covered", not "clear".
import type { FeatureCollection } from 'geojson'
import { escapeHtml } from './popupChrome'

const SMOKE_URL = '/api/smoke'

/** NOAA's own page for the product, for the legend credit. */
export const HMS_HREF = 'https://www.ospo.noaa.gov/Products/land/hms.html'

/** The three densities HMS publishes, lightest first. */
export const SMOKE_DENSITIES = ['Light', 'Medium', 'Heavy'] as const
export type SmokeDensity = (typeof SMOKE_DENSITIES)[number]

/**
 * How each density draws, and the one place that decides it.
 *
 * Stone rather than slate. Slate is the app's own surface family — the panel,
 * the table, the legends are all built from it — so a slate plume would read as
 * chrome that had escaped onto the map. Stone is the warm neighbour of the same
 * neutral: unmistakably smoke-colored, and unmistakably not part of the UI.
 *
 * Opacity is the whole encoding, which is what lets the three stack honestly:
 * HMS emits overlapping plumes routinely (a heavy core inside a medium inside a
 * light), and one hue at three alphas means the overlap darkens in the
 * direction it should rather than turning a fourth color.
 *
 * The ceiling is 0.5 and that is a floor on legibility rather than a taste
 * call: the basemap under a heavy plume still has to show a lake and a summit
 * label, since the point of the overlay is knowing whether a destination is
 * *under* the smoke.
 *
 * Read by both the map layers and the legend swatches, so the picture and its
 * key cannot disagree. It lives here rather than in `styles.ts` because these
 * are MapLibre paint values handed to the GL renderer, not Tailwind utilities
 * — the same reason the fire perimeter's red lives in `MapView.tsx`.
 */
export const SMOKE_FILL = '#a8a29e'
export const SMOKE_EDGE = '#78716c'
export const SMOKE_OPACITY: Record<SmokeDensity, number> = {
  Light: 0.15,
  Medium: 0.3,
  Heavy: 0.5,
}

/** The MapLibre layer id for one density. Derived so the two cannot drift. */
export function smokeLayerId(density: SmokeDensity): string {
  return `smoke-fill-${density}`
}

/**
 * The density fills in the order a click should resolve them: heaviest first.
 *
 * HMS nests its plumes — a heavy core inside a medium inside a light — so a
 * click in the interesting place lands on three features at once, and the one
 * the reader means is the densest.
 */
export const SMOKE_CLICK_ORDER = [...SMOKE_DENSITIES].reverse().map(smokeLayerId)

/**
 * A representative light tone from the basemap's land fill.
 *
 * The legend swatch has to reproduce what the map draws, and what the map draws
 * is this fill *over the basemap* — not over the panel behind the legend. Those
 * are opposite ends of the lightness scale, and the difference is not cosmetic:
 * at 15% over a dark panel a Light plume is invisible, so the legend's first row
 * would be a blank square explaining a shade the map shows perfectly clearly.
 *
 * Sampled from the OpenFreeMap Liberty land fill. Approximate on purpose — the
 * basemap is not one colour, and the swatch's job is to say which of three
 * greys a plume is, not to match a particular pixel.
 */
const BASEMAP_TONE: [number, number, number] = [239, 236, 230]

/**
 * The opaque colour a legend swatch fills with: the layer's fill composited
 * over the basemap, so the key and the picture agree.
 */
export function smokeSwatch(density: SmokeDensity): string {
  const alpha = SMOKE_OPACITY[density]
  const fill = [1, 3, 5].map((i) => parseInt(SMOKE_FILL.slice(i, i + 2), 16))
  const [r, g, b] = fill.map((c, i) => Math.round(c * alpha + BASEMAP_TONE[i] * (1 - alpha)))
  return `rgb(${r},${g},${b})`
}

/** Raw properties on a plume feature, as `GET /api/smoke` returns them. */
export interface SmokeProps {
  density?: string | null
  density_raw?: string | null
  satellite?: string | null
  observed_start?: number | null
  observed_end?: number | null
}

/** Is this failure one that retrying makes worse rather than better? */
export function isRateLimited(err: unknown): boolean {
  return (err as { rateLimited?: boolean } | null)?.rateLimited === true
}

/**
 * Fetch the current smoke analysis.
 *
 * No bounding box: the whole country is under half a megabyte on a busy day, so
 * unlike the fire overlay there is nothing for a viewport to save, and the
 * layer therefore does not refetch on a pan. `signal` aborts a fetch left in
 * flight by a toggle switched back off.
 *
 * A 429 is this client outpacing its own address limit and a 503 is a server
 * that has never managed a fetch from NOAA; both are marked `rateLimited`
 * because in both cases the next thing to do is wait, not ask again.
 */
export async function fetchSmoke(signal: AbortSignal): Promise<FeatureCollection> {
  const res = await fetch(SMOKE_URL, { signal })
  if (!res.ok) {
    const err = new Error('Smoke data unavailable. Try again later.') as Error & {
      rateLimited?: boolean
    }
    err.rateLimited = res.status === 429 || res.status === 503
    throw err
  }
  const data = await res.json()
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Smoke data could not be read.')
  }
  // The response also carries `fetched_at` and `analysis_date`. Neither is
  // surfaced: the cache serves an aged snapshot rather than failing, so a
  // visitor's answer never hinges on a fetch of their own, and each plume
  // already states the window it was observed over — which is the date a reader
  // is actually asking about. Both stay in the payload for API callers.
  return data as FeatureCollection
}

/** The density a feature draws as, defaulting the way the backend does. */
export function densityOf(props: SmokeProps): SmokeDensity {
  const raw = (props.density ?? '').trim()
  return (SMOKE_DENSITIES as readonly string[]).includes(raw)
    ? (raw as SmokeDensity)
    : SMOKE_DENSITIES[0]
}

/**
 * The window a plume was traced over, as one line, or null to omit it.
 *
 * Times only when both ends land on the same local day, which is nearly always
 * — a pass covers a few hours — because repeating the date on both sides of a
 * three-hour window is noise. A window that does straddle midnight locally
 * gets the date back on both ends rather than on one, so neither end is the odd
 * one out.
 *
 * Kept locale-tolerant (falls back to omitting the line) so it never throws
 * inside markup handed to setHTML.
 */
export function formatObserved(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
): string | null {
  if (startMs == null || !Number.isFinite(startMs)) return null
  const start = new Date(startMs)
  if (Number.isNaN(start.getTime())) return null
  const end = endMs != null && Number.isFinite(endMs) ? new Date(endMs) : null
  try {
    const sameDay = end !== null && start.toDateString() === end.toDateString()
    const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const dated = (d: Date) =>
      d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    if (end === null) return `Observed ${dated(start)}`
    if (sameDay) return `Observed ${time(start)} to ${time(end)}`
    return `Observed ${dated(start)} to ${dated(end)}`
  } catch {
    return null
  }
}

/**
 * Popup markup for a hovered/tapped smoke plume.
 *
 * Inline styles mirror the wildfire popup so the two overlays read as one
 * family; this is markup handed to MapLibre's `setHTML`, which the
 * stylesheet-scanned design system in `styles.ts` cannot reach.
 *
 * Shorter than the fire popup and deliberately so: HMS carries the density, the
 * satellite, and the window, and there is no per-plume page anywhere to link
 * to. The observed window sits last, small and italic, for the reason the
 * fire's revision date does — it qualifies everything above it rather than
 * being another fact in the list.
 */
export function smokePopupHtml(props: SmokeProps): string {
  const observed = formatObserved(props.observed_start, props.observed_end)
  const satellite = (props.satellite ?? '').trim()
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong>🌫️ ${densityOf(props)} smoke</strong>
      ${satellite ? `<br>Traced from ${escapeHtml(satellite)} imagery` : ''}
      ${observed ? `<br><span style="color:#94a3b8;font-size:11px;font-style:italic">${escapeHtml(observed)}</span>` : ''}
    </div>`
}
