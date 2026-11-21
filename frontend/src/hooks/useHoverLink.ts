import { type RefObject, useCallback, useEffect } from 'react'
import type { MapViewHandle } from '../components/MapView'

/** The rows of the results table, which carry their place's key. */
const ROW = '[data-results-table] tr[data-key]'

/**
 * The map and the table point at one place (record 0318): a row under the
 * pointer rings its marker, and a marker under the pointer marks its row.
 *
 * Both halves are imperative, the ring a feature-state and the row a
 * `data-hot` attribute the row's role paints, because a hover is a
 * pointer's move and the table is memoized: a key on React state would
 * re-render every row (a 946-row field is two thousand cells) on every
 * marker the pointer crossed.
 *
 * Returns the map's half, stable, for `MapView`'s `onMarkerHover`.
 */
export function useHoverLink(mapRef: RefObject<MapViewHandle | null>): (key: string | null) => void {
  useEffect(() => {
    let over: string | null = null
    function onOver(e: PointerEvent) {
      if (e.pointerType === 'touch') return
      const row = e.target instanceof Element ? e.target.closest<HTMLElement>(ROW) : null
      const key = row?.dataset.key ?? null
      if (key === over) return
      over = key
      mapRef.current?.hotMarker(key)
    }
    document.addEventListener('pointerover', onOver)
    return () => document.removeEventListener('pointerover', onOver)
  }, [mapRef])

  return useCallback((key: string | null) => {
    for (const row of document.querySelectorAll<HTMLElement>(`${ROW}[data-hot]`)) delete row.dataset.hot
    if (key === null) return
    for (const row of document.querySelectorAll<HTMLElement>(`${ROW}[data-key="${CSS.escape(key)}"]`)) row.dataset.hot = ''
  }, [])
}
