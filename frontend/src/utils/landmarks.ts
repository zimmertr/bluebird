// The map's trailhead and crag markers, read from Bluebird Forecast's own
// `GET /api/landmarks` (#734).
//
// The basemap tiles cannot supply either. OpenMapTiles' `poi` layer does not
// source `highway=trailhead`, so a trailhead is in the tile only as the bus
// stop or parking lot beside it (measured 2026-10-15 at Mount Si), and it
// holds climbing as one `class=climbing` with OSM's `climbing=` subtype
// dropped, so a crag cannot be told from a single route on it. The pod reads
// every named OSM trailhead and crag from its own copy of OpenStreetMap
// instead (#760), and the map asks it for the viewport. Coordinates are OSM's
// own, a node's position or a way's or relation's centre, and one kind and
// name within 300 m is one place, so a marker is the row a polygon search
// around it returns. Each marker brings its `osm_id`, so a clicked one links
// to its own OSM object where a tile label cannot.
import type { FeatureCollection, Point } from 'geojson'
import { apiFetch, retryAfterSeconds } from './apiFetch'
import type { BBox } from './wildfires'

export const LANDMARKS_URL = '/api/landmarks'

/**
 * The zoom the markers draw from, the trails' own floor (`ofm-trails` in
 * `map/basemap.ts`), so a trailhead appears with the trail it starts (the
 * maintainer, 2026-10-16). It also bounds what a viewport fetch can ask for:
 * the map asks nothing below it.
 */
export const LANDMARK_MINZOOM = 11

/** The kinds the route answers, as its `kind` property spells them. */
export type LandmarkKind = 'trailhead' | 'crag'

/**
 * The two marker layers, one per kind, in the order they stack. Here rather
 * than in the map module so `basemapPoi.ts` can name them as click targets
 * without importing MapLibre's side of the app.
 */
export const LANDMARK_LAYERS = ['landmark-trailheads', 'landmark-crags'] as const

type LandmarkLayerId = (typeof LANDMARK_LAYERS)[number]

const KIND_OF: Record<LandmarkLayerId, LandmarkKind> = {
  'landmark-trailheads': 'trailhead',
  'landmark-crags': 'crag',
}

/** The kind a marker layer draws, or null for any other layer. */
export function landmarkKindOf(layerId: string): LandmarkKind | null {
  return (LANDMARK_LAYERS as readonly string[]).includes(layerId) ? KIND_OF[layerId as LandmarkLayerId] : null
}

/** One marker's properties, as the route answers them. */
interface LandmarkProps {
  name: string
  kind: LandmarkKind
  /** The backend's osm_id format, `node/4578891234`. */
  osm_id: string
  /** Whole feet, or null where OSM has no `ele`. */
  elevation_ft: number | null
}

export interface LandmarkResponse extends FeatureCollection<Point, LandmarkProps> {
  fetched_at?: number
}

/** The route's URL for the markers inside `bbox`. Pure, so it is testable. */
export function landmarkQueryUrl(bbox: BBox): string {
  const params = new URLSearchParams({ bbox: bbox.join(',') })
  return `${LANDMARKS_URL}?${params.toString()}`
}

/**
 * Fetch the markers inside `bbox`, on `fetchWildfires`'s contract: `signal`
 * drops a stale request when the reader pans again, and a 429 (this client
 * over its address limit) or a 503 (a deployment with no database, or one
 * whose first fill has not finished) is marked `rateLimited` with the pod's
 * `Retry-After`, because in both cases the next thing to do is wait. The
 * message reaches the console alone: the markers are scenery, and a map
 * without them still works.
 */
export async function fetchLandmarks(bbox: BBox, signal: AbortSignal): Promise<LandmarkResponse> {
  const res = await apiFetch(landmarkQueryUrl(bbox), { signal })
  if (!res.ok) {
    const err = new Error('Map destinations unavailable. Try again later.') as Error & {
      rateLimited?: boolean
      retryAfterS?: number | null
    }
    err.rateLimited = res.status === 429 || res.status === 503
    // How long the pod asked for, which the layer waits out before asking
    // again (`map/overlays/recovery.ts`).
    err.retryAfterS = retryAfterSeconds(res)
    throw err
  }
  const data = await res.json()
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Map destinations could not be read.')
  }
  return data as LandmarkResponse
}
