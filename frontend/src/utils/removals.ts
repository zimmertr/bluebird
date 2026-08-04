// Undoing a × (#241). The removal set used to be a bare Set of coordinate
// keys, which is enough to hide rows but not to bring one back: restoring
// needs the row's name for the list, and — because × on a searched place also
// deregisters it — the Place record to re-register. So removal is a Map from
// coordinate key to what was removed, and this module owns what gets captured
// and what a restore must do. Restore never fetches: it edits the removal set
// and, where held data cannot re-present the row, the searched list, so the
// row rejoins through machinery that already exists (pending rows, the next
// Analyze's custom union).

import { DestinationResult } from '../types'
import { Place } from './geocode'
import { pinKey } from './customList'

export interface RemovedEntry {
  /** The row as it read when removed: the restore list's label, and the
   * identity a place is rebuilt from when nothing held can re-present it. */
  row: DestinationResult
  /** The searched-place record backing the row at removal time. × on a
   * searched place also deregisters it (or the next analysis would simply
   * rediscover it), so restoring one must re-register this rather than merely
   * unhide the row. `null` for discovered and CSV rows. */
  place: Place | null
}

/** The removal set plus this row, capturing what a later restore will need. */
export function recordRemoval(
  removed: ReadonlyMap<string, RemovedEntry>,
  row: DestinationResult,
  places: readonly Place[],
): Map<string, RemovedEntry> {
  const key = pinKey(row.latitude, row.longitude)
  const next = new Map(removed)
  next.set(key, {
    row,
    place: places.find((p) => pinKey(p.lat, p.lon) === key) ?? null,
  })
  return next
}

/**
 * The place a restore must re-register, or `null` when deleting the removal
 * key is enough on its own.
 *
 * Deleting the key restores visibly only when something held still carries the
 * row: the ranked field (client path), the trimmed response rows (server
 * path), or the CSV textarea, whose text survives a × and re-emerges as a
 * pending row. A searched place is never in that position — its backing
 * record left with the removal — and a discovered row stops being in it after
 * any refresh Analyze, because the refresh echo excludes removals and the new
 * field genuinely lacks the row. Those restore by re-registering a place, the
 * same way a clicked basemap POI becomes one (`poiToPlace`), so the row
 * reappears immediately as a pending dot and rejoins the next Analyze. Every
 * listed entry therefore restores visibly; none is a silent no-op.
 */
export function restorePlace(
  entry: RemovedEntry,
  heldKeys: ReadonlySet<string>,
  csvKeys: ReadonlySet<string>,
): Place | null {
  if (entry.place !== null) return entry.place
  const key = pinKey(entry.row.latitude, entry.row.longitude)
  if (heldKeys.has(key) || csvKeys.has(key)) return null
  return {
    label: entry.row.name,
    // The list names it and the map will pin it; there is no Nominatim line
    // to carry, same as a basemap POI.
    description: '',
    kind: entry.row.type === 'custom' ? '' : entry.row.type,
    lat: entry.row.latitude,
    lon: entry.row.longitude,
    ...(entry.row.elevation_ft !== null ? { elevationFt: entry.row.elevation_ft } : {}),
    ...(entry.row.osm_id !== null ? { osmId: entry.row.osm_id } : {}),
  }
}
