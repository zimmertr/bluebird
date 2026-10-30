import type { DestinationsRequest, DestinationsResponse, GeoPolygon } from '../types'
import type { DiscoverySource } from '../hooks/useCapabilities'
import type { Discovered } from './analysisPipeline'
import { geoKey } from './points'
import { discoveryKeys, unnamedApplies } from './present'

// The ring's count ahead of Analyze (#803, D1): the pure half of
// `useDestinationCount`. Once the ring and its kinds have been still for a
// moment, the browser asks the pod what the ring holds, the way a run's
// discovery would, so a ring over the analysis cap greys Analyze before any
// press, and the run that follows forecasts the field it already has rather
// than asking again.

// How long the ring and its kinds must be still before the count is asked
// for. Longer than the coordinates box's `LOOKUP_DEBOUNCE_MS` (800 ms): a
// reader dragging a vertex or ticking three kinds in a row makes one settled
// edit, not one per frame or per tick, and every count spends the
// per-address destinations bucket (30 a minute, burst 10) that the run's own
// discovery and the coordinates box's lookup draw on too.
export const COUNT_DEBOUNCE_MS = 1_500

// The least time between two counts: the bucket's refill interval (60 s / 30).
// Spaced at it, counts can never drain the bucket, so the Analyze that
// follows always finds a token for its own discovery, whatever a reader
// fidgeting with the ring did first.
export const COUNT_SPACING_MS = 2_000

/**
 * What a polygon discovery asks the pod, as one string: the ring, the kinds
 * with the unnamed-peaks toggle (`discoveryKeys`), and the reader's list by
 * coordinate, which rides in the same call. A count asks with no list, so its
 * key equals a run's only when the run carries none either: the pod merges a
 * list into the ring's field (`candidates.discover`), and the browser has no
 * port of that union to apply to a ring counted alone.
 */
export function fieldKey(
  polygon: { coordinates: number[][][] } | null | undefined,
  types: readonly string[] | undefined,
  includeUnnamed: boolean | undefined,
  custom: readonly { latitude: number; longitude: number }[] = [],
): string {
  const { polygonKey, typesKey } = discoveryKeys(polygon, types, includeUnnamed)
  const list = custom.map((d) => geoKey(d.latitude, d.longitude)).sort()
  return JSON.stringify([polygonKey, typesKey, list])
}

/**
 * Whether the ring is worth counting: the pod answers rings from its places
 * table (`discovery_source`), the ring is finished and usable, and at least
 * one kind is ticked. Never on a deployment answering from Overpass, which is
 * donated: a count there would spend it on a ring the reader may never
 * analyze.
 */
export function countWanted(
  source: DiscoverySource,
  polygon: GeoPolygon | null,
  usable: boolean,
  drawing: boolean,
  types: readonly string[],
): boolean {
  return source === 'places' && polygon !== null && usable && !drawing && types.length > 0
}

/** The count's request: the ring alone, as a run's discovery would send it with no list. */
export function countRequest(
  polygon: GeoPolygon,
  types: DestinationsRequest['destination_types'],
  includeUnnamed: boolean,
): DestinationsRequest {
  return {
    polygon,
    destination_types: types,
    include_unnamed_peaks: unnamedApplies(types, includeUnnamed),
    top_by_elevation: false,
    elevation_lookup: false,
  }
}

/**
 * What a count learned: the ring's field, or that the pod refused it as over
 * the cap with how many it found. Any other answer teaches nothing, and the
 * run discovers for itself as it always has.
 */
export type CountAnswer =
  | { kind: 'found'; found: Discovered }
  | { kind: 'over'; found: number; limit: number }

/** The count's answer from the pod's reply, or null for anything else. */
export async function readCount(res: Response): Promise<CountAnswer | null> {
  try {
    if (res.ok) {
      const body = (await res.json()) as DestinationsResponse
      if (!Array.isArray(body.destinations)) return null
      return {
        kind: 'found',
        found: {
          candidates: body.destinations,
          totalFound: body.total_found ?? null,
          truncated: body.truncated ?? false,
        },
      }
    }
    if (res.status !== 400) return null
    const body = (await res.json()) as { found?: unknown; limit?: unknown }
    return typeof body.found === 'number' && typeof body.limit === 'number'
      ? { kind: 'over', found: body.found, limit: body.limit }
      : null
  } catch {
    return null
  }
}

/** How many destinations a count found, whichever way it answered. */
export function countOf(answer: CountAnswer): number {
  return answer.kind === 'found' ? answer.found.candidates.length : answer.found
}

/**
 * How many destinations the analysis is known to cover before it runs: the
 * ring's count plus the pasted list and the pins, or the list alone when no
 * ring searches. Null while a ring searches and its count is unknown.
 *
 * The pod refuses the union of the ring and the list, so this is the number a
 * run would be refused for, with one way to differ: a pasted row standing on
 * a destination the ring also finds is one row in the pod's union and two
 * here, so near the cap this can hold Analyze for a union that would fit.
 */
export function knownCount(ringSearches: boolean, ringCount: number | null, customCount: number): number | null {
  if (!ringSearches) return customCount
  return ringCount === null ? null : ringCount + customCount
}

/** How long to wait before sending a count, given when the last one went. */
export function countDelay(nowMs: number, lastSentMs: number | null): number {
  if (lastSentMs === null) return COUNT_DEBOUNCE_MS
  return Math.max(COUNT_DEBOUNCE_MS, lastSentMs + COUNT_SPACING_MS - nowMs)
}
