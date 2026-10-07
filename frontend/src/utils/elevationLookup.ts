import type { CustomDestination, DiscoveredDestination } from '../types'
import type { Place } from './geocode'
import { buildCustomList } from './customList'
import { geoKey } from './points'

/**
 * What the pod's lookup says about a coordinate the reader supplied (#673):
 * the peak within the match radius, or that there is none. Keyed by `geoKey`
 * wherever it is held. A null elevation here is an answer, not a gap: the
 * lookup finished and found no peak, so the row is never asked about again.
 */
export interface Identity {
  elevation_ft: number | null
  osm_id: string | null
}

/** The identities the browser has learned, by `geoKey`. */
export type IdentityMap = ReadonlyMap<string, Identity>

export const NO_IDENTITY: IdentityMap = new Map()

// How long after the last edit of the coordinates box the lookup is sent. A
// paste is one edit; a hand-typed coordinate is many, and a half-typed line
// is not worth a query against a donated server.
export const LOOKUP_DEBOUNCE_MS = 800

// How long after the pod gives up (the map server was busy) the same rows are
// asked about once more, and once only per change of the list: a busy server
// often answers on the next try (measured 2026-10-06: a 504 after 11 s, then
// 200 in 1 s), and a second failure means waiting for the reader's next edit.
export const LOOKUP_RETRY_MS = 20_000

/**
 * The rows worth asking the pod about: every distinct coordinate the reader
 * supplied that carries no elevation and that the browser has no answer for.
 * Empty above the cap, because the analysis would refuse such a list and a
 * lookup for it would only hold the reader's discovery slot.
 */
export function unanswered(
  csvRows: readonly CustomDestination[],
  places: readonly Place[],
  identity: IdentityMap,
  cap: number,
): CustomDestination[] {
  const rows = buildCustomList([...csvRows], [...places])
  if (rows.length > cap) return []
  return rows.filter((r) => r.elevation_ft == null && !identity.has(geoKey(r.latitude, r.longitude)))
}

/**
 * The identities after a lookup's answer: every row that came back is an
 * answer, a null elevation included, EXCEPT when the lookup did not finish,
 * where a null elevation says nothing and the row stays unanswered so it can
 * be asked again. A row that came back placed is learned either way.
 */
export function learn(
  identity: IdentityMap,
  resolved: readonly DiscoveredDestination[],
  complete: boolean,
): IdentityMap {
  const next = new Map(identity)
  for (const r of resolved) {
    if (!complete && r.elevation_ft == null) continue
    const key = geoKey(r.latitude, r.longitude)
    const was = next.get(key)
    next.set(key, {
      elevation_ft: r.elevation_ft ?? was?.elevation_ft ?? null,
      osm_id: r.osm_id ?? was?.osm_id ?? null,
    })
  }
  return next
}

/** A stable key for a set of rows: the same rows in any order give the same key. */
export function rowsKey(rows: readonly { latitude: number; longitude: number }[]): string {
  return rows
    .map((r) => geoKey(r.latitude, r.longitude))
    .sort()
    .join(';')
}

/**
 * The wire list with the elevations the browser has learned, which is what
 * lets the pod skip the map server for those rows. Nothing else is added: the
 * request's row shape is the API's, and an OSM id is not a field of it.
 */
export function withLearnedElevation(
  custom: readonly CustomDestination[],
  identity: IdentityMap,
): CustomDestination[] {
  return custom.map((c) => {
    if (c.elevation_ft != null) return c
    const known = identity.get(geoKey(c.latitude, c.longitude))
    return known?.elevation_ft != null ? { ...c, elevation_ft: known.elevation_ft } : c
  })
}

/** The same rows with the elevation and OSM id the browser has learned. */
export function withIdentity(
  rows: readonly DiscoveredDestination[],
  identity: IdentityMap,
): DiscoveredDestination[] {
  if (identity.size === 0) return [...rows]
  return rows.map((r) => {
    const known = identity.get(geoKey(r.latitude, r.longitude))
    if (!known) return r
    return {
      ...r,
      elevation_ft: r.elevation_ft ?? known.elevation_ft,
      osm_id: r.osm_id ?? known.osm_id,
    }
  })
}
