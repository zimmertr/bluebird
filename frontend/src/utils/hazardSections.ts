/**
 * What each hazard layer says at a point, as a section of the place's card
 * (#832, TJ 2026-11-03): the active wildfire within ten miles, the satellite
 * hotspot within ten, the smoke plume over the point, the area closure it
 * stands in, and the closed trail within a mile.
 *
 * Each layer used to open a card of its own when its shape was clicked, so a
 * click on a hotspot said nothing about the rain under it, and a destination
 * inside a closure carried one amber line where the closure's card carried
 * the order. Now a layer answers the same question the radar and the snow do
 * (`pointReadout.ts`): what is here, in one section with its name, its rows
 * and where and when it was measured in the fine print. The map holds the
 * features the layer drew and asks these readers with them, so a card costs
 * no fetch, and a layer switched off is never asked.
 *
 * Every section opens on the Layers menu's name for the layer and the thing's
 * own name, `Active wildfires: Bolt Creek`, so a reader knows which layer said
 * it. The reach is the table's: a fire or a hotspot within `FIRE_WARN_MILES`,
 * a closure only where the point stands inside it, and a closed trail within
 * `CLOSED_TRAIL_MILES`, because a trail says nothing about the summit it
 * leads to and a mile is as far as a trail's closure reaches a reader
 * standing beside it (TJ, 2026-11-03). A section for a thing the point is
 * not on carries a `Distance` row, how far and which way.
 *
 * Every value here is third-party text on its way to setHTML, so it is
 * escaped at the one place it enters a section; a link's url alone is handed
 * on as given, since the chrome escapes it into the attribute.
 */
import type { Feature, FeatureCollection, Point } from 'geojson'
import type { FireActivityResponse, FireDetectionProps } from '../types'
import {
  CLOSURE_LINK_LABEL,
  CLOSURE_ROW_LABELS,
  type ClosureKind,
  type ClosureProps,
  closureDate,
  closureName,
  closureReason,
  closureUrl,
} from './closures'
import { FIRE_ACTIVITY_ROW_LABEL, FIRMS_SOURCE, HOTSPOT_TITLE, hotspotRows } from './fireActivity'
import { FIRE_WARN_MILES, featureCenter, nearestPoint, type NearestPoint } from './fireProximity'
import { isFiniteNumber } from './numbers'
import type { MapPoint, PointSection } from './pointReadout'
import { escapeHtml, row, updatedAt } from './popup/popupChrome'
import { HMS_SOURCE, SMOKE_DENSITIES, SMOKE_ROW_LABEL, type SmokeProps, densityOf, observedSpan } from './smoke'
import { compassPoint } from './slopeAngle'
import {
  FIRE_LINK_LABEL,
  FIRE_LINK_ZOOM,
  NIFC_SOURCE,
  WILDFIRE_ROW_LABEL,
  type WildfireProps,
  fireName,
  formatAcres,
  nifcFireUrl,
} from './wildfires'

/** How far a closed trail, road or site reaches a point beside it, in miles. */
export const CLOSED_TRAIL_MILES = 1

/** A distance is shown from a twentieth of a mile; under that, the point is on the thing. */
const ON_IT_MILES = 0.05

/** `3.2 mi NW`: how far the thing is and which way, to the tenth the table's cell prints. */
export function distanceText(near: NearestPoint): string {
  return `${near.miles.toFixed(1)} mi ${compassPoint(near.bearing)}`
}

/** The `Distance` row, or null for a point on the thing. */
function distanceRow(near: NearestPoint): string | null {
  return near.miles < ON_IT_MILES ? null : row('Distance', escapeHtml(distanceText(near)))
}

/** The nearest feature within `reach` miles of the point, with how far it is. */
function nearestWithin<F extends Feature>(
  features: readonly F[],
  lat: number,
  lon: number,
  reach: number,
): { feature: F; near: NearestPoint } | null {
  let best: { feature: F; near: NearestPoint } | null = null
  for (const feature of features) {
    const near = nearestPoint(lat, lon, feature.geometry)
    if (near === null || near.miles > reach) continue
    if (best === null || near.miles < best.near.miles) best = { feature, near }
    if (near.miles === 0) break
  }
  return best
}

/**
 * The active wildfire's section: the nearest perimeter within ten miles, its
 * name linked to NIFC's map, and how far, how big and how contained it is,
 * under NIFC's own date for the survey. The link opens on the clicked point
 * for a point inside the perimeter, as the fire's own card did, and on the
 * fire's centre for a point beside it, since a distance asks how close the
 * fire comes and a link asks to be shown the fire.
 */
export function wildfireSectionAt(fires: FeatureCollection, at: MapPoint): PointSection | null {
  const hit = nearestWithin(fires.features, at.lat, at.lng, FIRE_WARN_MILES)
  if (!hit) return null
  const props = (hit.feature.properties ?? {}) as WildfireProps
  const centre = featureCenter(hit.feature.geometry)
  const href =
    hit.near.miles === 0
      ? nifcFireUrl(at.lng, at.lat, Math.max(at.zoom, FIRE_LINK_ZOOM) + 1)
      : nifcFireUrl(centre.longitude, centre.latitude, FIRE_LINK_ZOOM)
  const revised = updatedAt(props.attr_ModifiedOnDateTime_dt)
  return {
    kind: 'fire',
    layer: escapeHtml(WILDFIRE_ROW_LABEL),
    title: escapeHtml(fireName(props)),
    link: { href, label: FIRE_LINK_LABEL },
    source: escapeHtml(NIFC_SOURCE),
    rows: [
      distanceRow(hit.near),
      isFiniteNumber(props.poly_GISAcres) ? row('Size', escapeHtml(formatAcres(props.poly_GISAcres))) : null,
      isFiniteNumber(props.attr_PercentContained) ? row('Containment', `${Math.round(props.attr_PercentContained)}%`) : null,
    ].filter((r): r is string => r !== null),
    ...(revised !== null && { when: escapeHtml(revised) }),
  }
}

/**
 * The fire activity section: the nearest hotspot within ten miles, how far it
 * is, and the detection's four lines (`hotspotRows`), under when the app last
 * fetched the detections from FIRMS, since the detection's own time is the
 * `Detected` row's (TJ, 2026-11-03).
 */
export function hotspotSectionAt(detections: FireActivityResponse, at: MapPoint, nowMs: number): PointSection | null {
  const hit = nearestWithin(detections.features as Feature<Point, FireDetectionProps>[], at.lat, at.lng, FIRE_WARN_MILES)
  if (!hit) return null
  const fetched = updatedAt(detections.fetched_at)
  return {
    kind: 'fire-activity',
    layer: escapeHtml(FIRE_ACTIVITY_ROW_LABEL),
    title: escapeHtml(HOTSPOT_TITLE),
    source: escapeHtml(FIRMS_SOURCE),
    rows: [distanceRow(hit.near), ...hotspotRows(hit.feature, nowMs).map(({ label, value }) => row(label, escapeHtml(value)))].filter(
      (r): r is string => r !== null,
    ),
    ...(fetched !== null && { when: escapeHtml(fetched) }),
  }
}

/**
 * The smoke section: the densest plume over the point, since HMS nests its
 * plumes and the reader means the densest, with the satellite it was traced
 * from and the window it was traced over in the fine print.
 */
export function smokeSectionAt(plumes: FeatureCollection, at: MapPoint): PointSection | null {
  const over = plumes.features.filter((f) => nearestPoint(at.lat, at.lng, f.geometry)?.miles === 0)
  if (over.length === 0) return null
  const densest = [...SMOKE_DENSITIES]
    .reverse()
    .map((density) => over.find((f) => densityOf((f.properties ?? {}) as SmokeProps) === density))
    .find((f) => f !== undefined)!
  const props = (densest.properties ?? {}) as SmokeProps
  const satellite = (props.satellite ?? '').trim()
  const observed = observedSpan(props.observed_start, props.observed_end)
  return {
    kind: 'smoke',
    layer: escapeHtml(SMOKE_ROW_LABEL),
    title: escapeHtml(`${densityOf(props)} smoke`),
    source: escapeHtml(HMS_SOURCE),
    rows: satellite ? [row('Satellite', escapeHtml(satellite))] : [],
    ...(observed !== null && { when: escapeHtml(observed) }),
  }
}

/**
 * A closure layer's section: for the closed ground, the first order whose
 * outer ring holds the point, and for the closed trails, roads and sites, the
 * nearest within a mile with how far it is. The order's name links to its
 * page where it has one, its type stands under the name in the warning amber
 * where the region files one (`closureReason`), and the rows are whose forest
 * and the figure that identifies it, an area's acres or a trail's route, under
 * the span the order states. Every line but the name is left off when the
 * service left it empty, rather than filled with a word the order does not
 * say.
 */
export function closureSectionAt(closures: FeatureCollection, kind: ClosureKind, at: MapPoint): PointSection | null {
  const hit = nearestWithin(closures.features, at.lat, at.lng, kind === 'area' ? 0 : CLOSED_TRAIL_MILES)
  if (!hit) return null
  const props = (hit.feature.properties ?? {}) as ClosureProps
  const text = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')
  const forest = text(props.ForestUnit)
  const route = [text(props.RouteName), text(props.RouteNum)].filter(Boolean).join(' ')
  const figure =
    kind === 'area'
      ? isFiniteNumber(props.GIS_Acres)
        ? row('Size', escapeHtml(formatAcres(props.GIS_Acres)))
        : null
      : route
        ? row('Route', escapeHtml(route))
        : null
  const from = closureDate(props.ClosureStartDate)
  const to = closureDate(props.ClosureEndDate)
  const order = closureUrl(props)
  const reason = closureReason(props)
  return {
    kind: kind === 'area' ? 'closure-area' : 'closure-trail',
    layer: escapeHtml(CLOSURE_ROW_LABELS[kind]),
    title: escapeHtml(closureName(props)),
    ...(order !== null && { link: { href: order, label: CLOSURE_LINK_LABEL } }),
    ...(reason !== null && { warn: escapeHtml(reason) }),
    source: escapeHtml(USFS_SOURCE),
    rows: [kind === 'trail' ? distanceRow(hit.near) : null, forest ? row('Forest', escapeHtml(forest)) : null, figure].filter(
      (r): r is string => r !== null,
    ),
    // Both or neither: one date alone would read as a span the order never
    // stated, an open end as "closed forever" or a missing start as "closed
    // since always".
    ...(from !== null && to !== null && { when: escapeHtml(`${from} to ${to}`) }),
  }
}

/** What the card names the Forest Service as, in a closure section's fine print. */
export const USFS_SOURCE = 'US Forest Service'
