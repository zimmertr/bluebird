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
import { geoKey } from './points'

/**
 * The user-authored destination inputs, as one comparable string: the checked
 * types and the pasted CSV. It is what a × is an edit of — the user struck a
 * row out of a list they had authored — so re-authoring that list ends the
 * strikeout's authority over the new list.
 *
 * The polygon ring is deliberately absent, and folding it in is the caller's
 * job where a caller needs it (`handleAnalyze` does, for its reset). The ring
 * resolves only mid-Analyze, out of the map's always-editable geometry, so
 * between analyses there is no ring to compare; and a ring never names a
 * pending destination, which is the one consumer this scope serves.
 */
export function authoredScope(types: readonly string[], csv: string): string {
  // Sorted so checking peaks then lakes and lakes then peaks are one scope,
  // matching the reset comparison and the order-independent cache key upstream.
  return JSON.stringify({ types: [...types].sort(), csv: csv.trim() })
}

export interface RemovedEntry {
  /** The row as it read when removed: the restore list's label, and the
   * identity a place is rebuilt from when nothing held can re-present it. */
  row: DestinationResult
  /** The searched-place record backing the row at removal time. × on a
   * searched place also deregisters it (or the next analysis would simply
   * rediscover it), so restoring one must re-register this rather than merely
   * unhide the row. `null` for discovered and CSV rows. */
  place: Place | null
  /** The `authoredScope` in force when the row was removed. Removals can
   * straddle an edit, so each carries its own and they expire one by one. */
  scope: string
}

/** The removal set plus this row, capturing what a later restore will need. */
export function recordRemoval(
  removed: ReadonlyMap<string, RemovedEntry>,
  row: DestinationResult,
  places: readonly Place[],
  scope: string,
): Map<string, RemovedEntry> {
  const key = geoKey(row.latitude, row.longitude)
  const next = new Map(removed)
  next.set(key, {
    row,
    place: places.find((p) => geoKey(p.lat, p.lon) === key) ?? null,
    scope,
  })
  return next
}

/**
 * The removal keys still in force under the live authored scope (#158).
 *
 * Only the pending preview reads this. The preview is live by design — it
 * answers "what have you named that no analysis has covered?" on every
 * keystroke — so a removal recorded against a list the user has since rewritten
 * must stop hiding a line that is plainly still pasted. The displayed report
 * and the re-analysis echo read the full map instead: both are snapshots of one
 * analysis, and expiring a removal under them would resurrect a struck-out row
 * mid-typing, or send it back upstream.
 */
export function activeRemovals(
  removed: ReadonlyMap<string, RemovedEntry>,
  scope: string,
): Set<string> {
  const active = new Set<string>()
  for (const [key, entry] of removed) if (entry.scope === scope) active.add(key)
  return active
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
  const key = geoKey(entry.row.latitude, entry.row.longitude)
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
