import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { GeoPolygon } from '../types'

export interface DrawModeInputs {
  /** The map, which owns the ring's vertices while the mode is on. */
  mapRef: RefObject<MapViewHandle | null>
  /** The ring as the app holds it: what a Cancel puts back. */
  polygon: GeoPolygon | null
  /** The ring a link restored, which seeds the point count before the map loads. */
  restoredPolygon: GeoPolygon | null | undefined
  isDesktop: boolean
  /** Closes the controls drawer, which on a phone covers the map. */
  closeDrawer: () => void
}

/**
 * Draw mode (#118): whether a click on the map adds a vertex, how many the
 * ring has, and the ways in and out of the mode — Draw or Edit, Done, Cancel,
 * Clear, and Enter and Escape for a hand already on the keyboard.
 *
 * The map owns the ring's vertices while the mode is on and reports every edit
 * as it happens; this hook owns the mode and the one copy of the ring a Cancel
 * can put back.
 */
export function useDrawMode({ mapRef, polygon, restoredPolygon, isDesktop, closeDrawer }: DrawModeInputs) {
  // The map used to be permanently in draw mode, which is why a pan could move
  // a vertex and why a click could only ever mean "polygon corner". Every
  // session — including one restored from a link with a ring already in it —
  // starts out of it: the common case is looking at the map, not editing it,
  // and leaving the gesture free is what lets a basemap peak be clickable at
  // all (#119).
  const [drawing, setDrawing] = useState(false)
  // A restored polygon seeds the count so Analyze unlocks before the map loads
  // (MapView re-emits the authoritative count once its points hydrate).
  const [drawPointCount, setDrawPointCount] = useState(
    () => Math.max(0, (restoredPolygon?.coordinates[0]?.length ?? 1) - 1),
  )

  const handleDrawUpdate = useCallback((count: number) => {
    setDrawPointCount(count)
  }, [])

  // The ring as it stood when Draw polygon or Edit polygon was pressed. Every
  // edit reaches the polygon and the URL as it happens, so this is the only
  // copy of the ring a Cancel can put back (#478).
  const drawStartRingRef = useRef<GeoPolygon | null>(null)

  const startDrawing = useCallback(() => {
    drawStartRingRef.current = polygon
    setDrawing(true)
    // Editing a shape that has scrolled off screen is the one thing
    // the draw/idle split made easy to do by accident.
    mapRef.current?.framePolygon()
    // On a phone the panel is an off-canvas drawer covering the map,
    // so entering draw mode behind it leaves nothing to draw on. On
    // desktop it is docked beside the map and closing it would be
    // taking away the Done button you are about to need.
    if (!isDesktop) closeDrawer()
  }, [closeDrawer, isDesktop, mapRef, polygon])

  const finishDrawing = useCallback(() => setDrawing(false), [])

  const handleCancelDrawing = useCallback(() => {
    mapRef.current?.restoreRing(drawStartRingRef.current)
    setDrawing(false)
  }, [mapRef])

  // Clear changes the ring and nothing else: inside draw mode it starts the
  // ring over, and outside it there is no mode to leave.
  const handleClearDrawing = useCallback(() => {
    mapRef.current?.restoreRing(null)
  }, [mapRef])

  // Enter and Escape are Done and Cancel for a hand already on the keyboard.
  // Enter shares Done's 3-point floor, because it means "the ring is
  // finished", which two points cannot be. Escape is what a hand reaches for
  // to back out of a mode, so it backs out the way Cancel does, and puts the
  // ring back rather than leaving a half-edited one with no handles to fix it.
  useEffect(() => {
    if (!drawing) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      // Not while the user is in the CSV box or a number field, where Enter
      // and Escape belong to the control they are typing into.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') handleCancelDrawing()
      else if (drawPointCount >= 3) setDrawing(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawing, drawPointCount, handleCancelDrawing])

  return {
    drawing,
    drawPointCount,
    handleDrawUpdate,
    startDrawing,
    finishDrawing,
    handleCancelDrawing,
    handleClearDrawing,
  }
}

/** What `useDrawMode` hands its callers; the controls drawer reads it whole. */
export type DrawMode = ReturnType<typeof useDrawMode>
