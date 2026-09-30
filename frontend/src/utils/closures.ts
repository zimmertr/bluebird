// Forest Service Region 6 fire closure orders (#550), read from Bluebird
// Forecast's own `GET /api/closures` rather than from the Forest Service.
//
// Through the pod for the reason the fire overlay learned in #203: the orders
// sit on an ArcGIS feature service whose quota is its organization's and shared
// with every other consumer, so one snapshot on the pod serves every visitor
// and a refusal upstream never reaches one.
//
// Two layers from one endpoint, split by `kind`: `area` is the closed ground
// (polygons), `trail` is the closed trails and roads (lines) together with the
// closed trailheads and sites (points). Coverage is Region 6 alone, which is
// Oregon and Washington: outside it an empty answer means "not covered", not
// "open", which is why both Layers rows say so.
//
// The status is the Forest Service's own. An order's end date is what the
// order says, and nothing here decides whether a closure is still in force.
import type { FeatureCollection, MultiPolygon } from 'geojson'
import { apiFetch } from './apiFetch'
import { escapeHtml } from './popupChrome'
import type { BBox, FireDetail } from './wildfires'

const CLOSURES_URL = '/api/closures'

/** Which of the two closure layers: the closed ground, or the closed trails and sites. */
export type ClosureKind = 'area' | 'trail'

/**
 * The closure FeatureCollection plus the foreign members the API rides on it.
 *
 * `coverage` is Oregon and Washington as one geometry, published beside the
 * data it qualifies, the way `WildfireResponse.coverage` is (#256). The map
 * does not read it; the Closure column does (`useClosureProximity`). Optional
 * so a body without it degrades the way the fire check's does: every row is
 * treated as covered, rather than the check failing.
 */
export interface ClosureResponse extends FeatureCollection {
  coverage?: MultiPolygon
}

/**
 * The Forest Service's own properties on a closure feature, as it names them.
 *
 * All optional and nullable: the service leaves fields empty freely, and
 * MapLibre drops a null property from a feature it hands back on a hover, so
 * a field can arrive as `null` from the API and as absent from the map. Text
 * values can carry leading spaces (`" Eagle Creek"`), so every reader trims.
 */
export interface ClosureProps {
  OBJECTID?: number | null
  ForestUnit?: string | null
  District?: string | null
  FireName?: string | null
  ClosureOrderName?: string | null
  ClosureOrderNumber?: string | null
  ClosureDescription?: string | null
  ClosureStartDate?: number | null
  ClosureEndDate?: number | null
  ClosureURLlink?: string | null
  /** Lines only. */
  RouteName?: string | null
  RouteNum?: string | null
  /** Polygons only. */
  GIS_Acres?: number | null
}

/**
 * Where the layers' credit points: the Forest Service's home rather than an
 * order's own page, because a legend credits the SOURCE where a popup links
 * the order. Beside the other overlays' hrefs in their own modules, so the
 * legend reads every credit from the module that owns the data (#454).
 */
export const USFS_HREF = 'https://www.fs.usda.gov/'

/**
 * How both closure layers draw, and the one place that decides it.
 *
 * Fuchsia, the hue trail and aviation maps give restricted ground, and the one
 * hue the map does not already spend: fire is red, smoke warm grey, snow blue,
 * radar green to orange, the markers green, amber, red and purple, and the
 * drawn ring sky. It lives here rather than in `styles.ts` for the smoke
 * fill's reason: these are MapLibre paint values handed to the GL renderer,
 * not Tailwind utilities, and the legend reads the same constants so the
 * picture and its key cannot disagree.
 */
export const CLOSURE_COLOR = '#c026d3'
/** The area outline: one step darker, as the fire outline is to its fill. */
export const CLOSURE_EDGE = '#a21caf'

/**
 * The area swatch's fill: the closure colour at the alpha the fire swatch
 * uses, so the two single-value keys read as the same kind of mark.
 */
export function closureAreaSwatch(): { backgroundColor: string; borderColor: string } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(CLOSURE_COLOR.slice(i, i + 2), 16))
  return { backgroundColor: `rgba(${r},${g},${b},0.35)`, borderColor: CLOSURE_EDGE }
}

/** The trail swatch: a dashed rule in the line's own colour, and no fill. */
export function closureTrailSwatch(): { borderColor: string } {
  return { borderColor: CLOSURE_COLOR }
}

/** Build the API URL for one layer's closures intersecting `bbox`. Pure, so it's testable. */
export function closureQueryUrl(bbox: BBox, kind: ClosureKind, detail: FireDetail): string {
  const params = new URLSearchParams({ bbox: bbox.join(','), kind, detail })
  return `${CLOSURES_URL}?${params.toString()}`
}

/**
 * Fetch one closure layer intersecting `bbox`.
 *
 * The same contract as `fetchWildfires`: `signal` drops a stale request when
 * the reader pans again, and a 429 (this client outpacing its address limit)
 * or a 503 (a pod that has never fetched the orders) is marked `rateLimited`,
 * because in both cases the next thing to do is wait rather than ask again.
 */
export async function fetchClosures(
  bbox: BBox,
  kind: ClosureKind,
  detail: FireDetail,
  signal: AbortSignal,
): Promise<ClosureResponse> {
  const res = await apiFetch(closureQueryUrl(bbox, kind, detail), { signal })
  if (!res.ok) {
    const err = new Error('Closure data unavailable. Try again later.') as Error & {
      rateLimited?: boolean
    }
    err.rateLimited = res.status === 429 || res.status === 503
    throw err
  }
  const data = await res.json()
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Closure data could not be read.')
  }
  return data as ClosureResponse
}

/** A property's text, trimmed, or '' when it is missing. */
function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Which closure a hovered feature is, for telling "the cursor moved along the
 * same closure" from "the cursor crossed into a different one".
 *
 * `OBJECTID` is safe here where `fireIdentity` avoided an id, because the two
 * are different ids. The fire module's worry is MapLibre's top-level feature
 * id, which is not stable across the tiles a GeoJSON source is cut into.
 * `OBJECTID` is one of the feature's PROPERTIES, and properties are copied
 * whole into every tile a feature lands in, so both halves of a closure that
 * spans a tile boundary read the same number. It is unique within one of the
 * service's layers, which is all a hover needs. The name is the fallback for
 * a feature that arrives without one.
 */
export function closureIdentity(props: ClosureProps): string {
  return props.OBJECTID != null ? String(props.OBJECTID) : closureName(props)
}

/** What a closure is called: its order's name, else its number, else `Closure`. */
export function closureName(props: ClosureProps): string {
  return text(props.ClosureOrderName) || text(props.ClosureOrderNumber) || 'Closure'
}

/** Epoch ms as a medium date, or null. Timezone-tolerant like `formatRevised`, so it never throws. */
function closureDate(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/**
 * `{start} to {end}`, or null to omit the line.
 *
 * Both or neither: one date alone would read as a span the order never stated,
 * an open end as "closed forever" or a missing start as "closed since always".
 */
export function formatClosureDates(
  start: number | null | undefined,
  end: number | null | undefined,
): string | null {
  const from = closureDate(start)
  const to = closureDate(end)
  return from && to ? `${from} to ${to}` : null
}

/**
 * The order's own page, when it has one worth linking. Only an http(s) URL
 * passes: the value is the service's free text, and `escapeHtml` keeps it
 * inside the attribute without stopping a `javascript:` link from running.
 * Exported for the results table's Closure column and the marker popup's
 * closure line (closureProximity.ts), which link the same order.
 */
export function closureUrl(props: ClosureProps): string | null {
  const url = text(props.ClosureURLlink)
  return /^https?:\/\//i.test(url) ? url : null
}

/**
 * Popup markup for a hovered closure.
 *
 * Inline styles copy `wildfirePopupHtml`'s so the two hover popups read as one
 * kind of thing; this is markup handed to MapLibre's `setHTML`, which the
 * stylesheet-scanned design system in styles.ts cannot reach.
 *
 * Ordered by what the reader came for: which order, whose forest, which trail
 * (lines only), for how long, and where to read it. Every line but the name is
 * omitted when the service left it empty, rather than filled with a word the
 * order does not say.
 */
export function closurePopupHtml(props: ClosureProps): string {
  const forest = text(props.ForestUnit)
  const route = [text(props.RouteName), text(props.RouteNum)].filter(Boolean).join(' ')
  const dates = formatClosureDates(props.ClosureStartDate, props.ClosureEndDate)
  const url = closureUrl(props)
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong>🚫 ${escapeHtml(closureName(props))}</strong>
      ${forest ? `<br>${escapeHtml(forest)}` : ''}
      ${route ? `<br>${escapeHtml(route)}` : ''}
      ${dates ? `<br>${escapeHtml(dates)}` : ''}
      ${url ? `<br><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none">View closure order ↗</a>` : ''}
    </div>`
}
