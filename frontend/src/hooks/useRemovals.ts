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
  /** The removals a link carried, by `geoKey`, read once at mount. */
  restoredRemoved: readonly string[] | undefined
  /** The removal scope of the link's own ring and list (`removalScopeFor`). */
  restoredScope: string
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
  restoredRemoved,
  restoredScope,
}: RemovalInputs) {
  const [own, setOwn] = useState<Map<string, RemovedEntry>>(new Map())
  // The removals a link carried. A link holds coordinates and no rows, so
  // these stay bare keys: they hide their rows and pending dots from the first
  // render, and each becomes a full entry, row and all, once a field holding
  // it lands (below). They were made under the link's own list, so that is
  // the authored scope they answer to.
  const [linked, setLinked] = useState<ReadonlySet<string>>(() => new Set(restoredRemoved ?? []))
  const [linkedScope] = useState(destinationScope)

  // The field the browser holds rows for: the client path's, or the server
  // path's trimmed rows.
  const held = universe ?? response?.results ?? null
  // What the browser still holds a forecast row for. Decides whether a restore
  // is a pure unhide or must re-register a place (see restorePlace), and which
  // linked keys are still worth holding.
  const heldKeys = useMemo(
    () => new Set((held ?? []).map((r) => geoKey(r.latitude, r.longitude))),
    [held],
  )
  // Every removal with its row, for the restore list and the restore itself.
  // A linked key joins once the held field has its row; derived rather than
  // copied in an effect, so it follows every report without a render of its
  // own.
  const removed = useMemo(() => {
    if (linked.size === 0 || held === null) return own
    const merged = new Map<string, RemovedEntry>()
    for (const row of held) {
      const key = geoKey(row.latitude, row.longitude)
      if (linked.has(key) && !own.has(key)) merged.set(key, { row, place: null, scope: linkedScope })
    }
    for (const [key, entry] of own) merged.set(key, entry)
    return merged
  }, [own, linked, held, linkedScope])
  // The linked keys still worth holding. Before a field lands, all of them:
  // they hide pending dots. Once one lands, only those it holds, because a key
  // the field lacks hides nothing, cannot be listed or restored, and would
  // otherwise ride every later link. The case is real: × on a searched place
  // deregisters it, so a link can carry its removal and no pin for it.
  const liveLinked = useMemo(
    () => (held === null ? linked : new Set([...linked].filter((key) => heldKeys.has(key)))),
    [linked, held, heldKeys],
  )
  // Every key, for the two snapshot consumers: the displayed report and the
  // refresh echo. The preview reads `activeRemovedKeys` instead. Linked keys
  // first, in the link's order, so a reopened link writes them back unchanged.
  const removedKeys = useMemo(() => new Set([...liveLinked, ...own.keys()]), [liveLinked, own])
  // Reads the ACTIVE removals rather than the whole map (#158). The report and
  // the refresh echo are snapshots of one analysis and keep the full map; the
  // pending preview is live over a list the user is still typing, so a × made
  // against an earlier list must stop hiding a line that is still pasted.
  const activeRemovedKeys = useMemo(() => {
    const active = activeRemovals(own, destinationScope)
    if (destinationScope === linkedScope) for (const key of liveLinked) active.add(key)
    return active
  }, [own, liveLinked, linkedScope, destinationScope])

  // The discovery scope the set was last cleared under. Only an Analyze reads
  // it, so a ref: nothing renders from it. A link that carried removals seeds
  // it with the link's own scope, so its first Analyze keeps them and only a
  // real discovery change clears them.
  const scopeRef = useRef<string | null>(restoredRemoved?.length ? restoredScope : null)
  // Clears the set when an Analyze runs under a different discovery scope than
  // the last one. Searched places are deliberately absent from that scope,
  // because removing one shrinks their list, and a removal must not count as
  // the change that undoes it.
  const clearForScope = useCallback((scope: string) => {
    if (scopeRef.current === scope) return
    scopeRef.current = scope
    setOwn(new Map())
    setLinked(new Set())
  }, [])

  // Registering a destination the user named, however they named it: by
  // searching, or by clicking a labeled peak or lake on the basemap (#119).
  // Naming a spot that was ×-removed is an explicit request for it again, so
  // the stale removal goes, or the place would be filtered out of its next
  // report.
  const registerPlace = useCallback((place: Place) => {
    addPlace(place)
    const key = geoKey(place.lat, place.lon)
    setOwn((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    setLinked((prev) => withoutKey(prev, key))
  }, [addPlace])

  // × on a table row. Removing a searched place also deregisters it, or the
  // next analysis would simply rediscover it from the searched list. The
  // backing place is captured first, so a restore can re-register it.
  const removeResult = useCallback(
    (row: DestinationResult) => {
      setOwn((prev) => recordRemoval(prev, row, places, destinationScope))
      removePlace(row.latitude, row.longitude)
    },
    [destinationScope, removePlace, places],
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
      setOwn((prev) => {
        if (!prev.has(key)) return prev
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      setLinked((prev) => withoutKey(prev, key))
      if (place) addPlace(place)
    },
    [removed, heldKeys, csvKeys, addPlace],
  )

  const restoreAllRemoved = useCallback(() => {
    for (const entry of removed.values()) {
      const place = restorePlace(entry, heldKeys, csvKeys)
      if (place) addPlace(place)
    }
    setOwn(new Map())
    setLinked(new Set())
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

// The set without one key, or the same set when it never held it, so a
// state update that changes nothing renders nothing.
function withoutKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) return keys
  const next = new Set(keys)
  next.delete(key)
  return next
}

/** What `useRemovals` hands its callers; the results sheet reads it whole. */
export type Removals = ReturnType<typeof useRemovals>
