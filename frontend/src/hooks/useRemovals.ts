import { useCallback, useMemo, useRef, useState } from 'react'
import type { AnalyzeResponse, CustomDestination, DestinationResult } from '../types'
import type { Place } from '../utils/geocode'
import { geoKey } from '../utils/points'
import { type RemovedEntry, activeRemovals, recordRemoval, restorePlace } from '../utils/removals'

export interface RemovalInputs {
  /** The searched places. A × on one deregisters it, so a restore can re-register it. */
  places: Place[]
  addPlace: (place: Place) => void
  removePlace: (latitude: number, longitude: number) => void
  /** The user-authored scope (`authoredScope`) a removal is recorded under. */
  destinationScope: string
  /** The pasted rows, whose text survives a × and re-emerges as a pending row. */
  csvRows: CustomDestination[]
  /** The field the client path holds. */
  universe: DestinationResult[] | null
  /** The report, whose trimmed rows are all the server path holds. */
  response: AnalyzeResponse | null
}

/**
 * The rows a reader ×-removed from the current report (#241), and every way
 * one comes back.
 *
 * Keyed by coordinate, and each entry carries what a restore needs (see
 * utils/removals.ts). The set outlives a re-analysis on purpose: an analysis
 * extends the held field rather than rebuilding it, so the rows a reader
 * struck out stay struck out until a genuine discovery change clears them.
 */
export function useRemovals({
  places,
  addPlace,
  removePlace,
  destinationScope,
  csvRows,
  universe,
  response,
}: RemovalInputs) {
  const [removed, setRemoved] = useState<Map<string, RemovedEntry>>(new Map())
  // Every key, for the two snapshot consumers: the displayed report and the
  // refresh echo. The preview reads `activeRemovedKeys` instead.
  const removedKeys = useMemo(() => new Set(removed.keys()), [removed])
  // Reads the ACTIVE removals rather than the whole map (#158). The report and
  // the refresh echo are snapshots of one analysis and keep the full map; the
  // pending preview is live over a list the user is still typing, so a × made
  // against an earlier list must stop hiding a line that is still pasted.
  const activeRemovedKeys = useMemo(
    () => activeRemovals(removed, destinationScope),
    [removed, destinationScope],
  )

  // The discovery scope the set was last cleared under. Only an Analyze reads
  // it, so a ref: nothing renders from it.
  const scopeRef = useRef<string | null>(null)
  // Clears the set when an Analyze runs under a different discovery scope than
  // the last one. Searched places are deliberately absent from that scope,
  // because removing one shrinks their list, and a removal must not count as
  // the change that undoes it.
  const clearForScope = useCallback((scope: string) => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    setRemoved(new Map())
  }, [])

  // Registering a destination the user named, however they named it: by
  // searching, or by clicking a labeled peak or lake on the basemap (#119).
  // Naming a spot that was ×-removed is an explicit request for it again, so
  // the stale removal goes, or the place would be filtered out of its next
  // report.
  const registerPlace = useCallback((place: Place) => {
    addPlace(place)
    setRemoved((prev) => {
      const key = geoKey(place.lat, place.lon)
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [addPlace])

  // × on a table row. Removing a searched place also deregisters it, or the
  // next analysis would simply rediscover it from the searched list. The
  // backing place is captured first, so a restore can re-register it.
  const removeResult = useCallback(
    (row: DestinationResult) => {
      setRemoved((prev) => recordRemoval(prev, row, places, destinationScope))
      removePlace(row.latitude, row.longitude)
    },
    [destinationScope, removePlace, places],
  )

  // What the browser still holds a forecast row for: the field on the client
  // path, the trimmed rows on the server path. Decides whether a restore is a
  // pure unhide or must re-register a place (see restorePlace).
  const heldKeys = useMemo(
    () =>
      new Set((universe ?? response?.results ?? []).map((r) => geoKey(r.latitude, r.longitude))),
    [universe, response],
  )
  const csvKeys = useMemo(
    () => new Set(csvRows.map((r) => geoKey(r.latitude, r.longitude))),
    [csvRows],
  )

  // Undo for the × (#241): drop the removal, and re-register the place when
  // nothing held can re-present the row. Never fetches: a restored row not in
  // the held field reappears as a pending row and rejoins the next Analyze.
  const restoreRemoved = useCallback(
    (key: string) => {
      const entry = removed.get(key)
      if (!entry) return
      const place = restorePlace(entry, heldKeys, csvKeys)
      setRemoved((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      if (place) addPlace(place)
    },
    [removed, heldKeys, csvKeys, addPlace],
  )

  const restoreAllRemoved = useCallback(() => {
    for (const entry of removed.values()) {
      const place = restorePlace(entry, heldKeys, csvKeys)
      if (place) addPlace(place)
    }
    setRemoved(new Map())
  }, [removed, heldKeys, csvKeys, addPlace])

  return {
    removed,
    removedKeys,
    activeRemovedKeys,
    clearForScope,
    registerPlace,
    removeResult,
    restoreRemoved,
    restoreAllRemoved,
  }
}
