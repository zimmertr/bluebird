import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { GeoPolygon } from '../types'
import { MAX_AREAS } from '../utils/drawGeometry'

export interface DrawModeInputs {
  /** The map, which owns the ring's vertices while the mode is on. */
  mapRef: RefObject<MapViewHandle | null>
  /** Every finished area (`useDestinationInputs`), which Done adds to or edits. */
  areas: GeoPolygon[]
  setAreas: Dispatch<SetStateAction<GeoPolygon[]>>
  isDesktop: boolean
  /** Closes the controls drawer, which on a phone covers the map. */
  closeDrawer: () => void
}

/**
 * Draw mode (#118), for any number of areas up to `MAX_AREAS` (record 0306):
 * whether a click on the map adds a vertex, how many the ring being drawn
 * has, which area it is, and the ways in and out of the mode — Search by
 * area or an area's chip, Done, Cancel, and Enter and Escape for a hand
 * already on the keyboard.
 *
 * The map owns the one editable ring while the mode is on and reports every
 * edit as it happens (`useDestinationInputs.draft`); the finished areas are
 * the app's, drawn beside it, and change only at Done. So Cancel needs no
 * copy of anything: it empties the editable ring, and the areas are as they
 * were.
 */
export function useDrawMode({ mapRef, areas, setAreas, isDesktop, closeDrawer }: DrawModeInputs) {
  // The map used to be permanently in draw mode, which is why a pan could move
  // a vertex and why a click could only ever mean "polygon corner". Every
  // session — including one restored from a link with areas in it — starts
  // out of it: the common case is looking at the map, not editing it, and
  // leaving the gesture free is what lets a basemap peak be clickable at all
  // (#119).
  const [drawing, setDrawing] = useState(false)
  // Which area the ring is, by its index in `areas`, or null for a new one.
  // The map hides that area's own shape while it is edited, so the reader sees
  // one outline, the one under their hand.
  const [editing, setEditing] = useState<number | null>(null)
  const [drawPointCount, setDrawPointCount] = useState(0)

  // The areas as they stand, for a Done or an Analyze reached through a
  // callback that would otherwise read the render it was made in.
  const areasRef = useRef(areas)
  areasRef.current = areas
  const editingRef = useRef(editing)
  editingRef.current = editing

  const handleDrawUpdate = useCallback((count: number) => {
    setDrawPointCount(count)
  }, [])

  const enter = useCallback(
    (index: number | null) => {
      setEditing(index)
      setDrawing(true)
      // On a phone the panel is an off-canvas drawer covering the map,
      // so entering draw mode behind it leaves nothing to draw on. On
      // desktop it is docked beside the map and closing it would be
      // taking away the Done button you are about to need.
      if (!isDesktop) closeDrawer()
    },
    [closeDrawer, isDesktop],
  )

  // Search by area: a new, empty ring. Past the cap there is no new one; the
  // button that calls this is disabled there too.
  const startArea = useCallback(() => {
    if (areasRef.current.length >= MAX_AREAS) return
    mapRef.current?.restoreRing(null)
    enter(null)
  }, [enter, mapRef])

  // An area's chip: that area's ring, editable, framed so a shape scrolled off
  // screen is not edited by accident.
  const editArea = useCallback(
    (index: number) => {
      const area = areasRef.current[index]
      if (!area) return
      mapRef.current?.restoreRing(area)
      mapRef.current?.framePolygon()
      enter(index)
    },
    [enter, mapRef],
  )

  // Done, and the end of drawing an Analyze makes: a ring of three points or
  // more becomes the new area or replaces the one edited, a shorter one is
  // dropped. Answers the areas as they now stand, for a run starting at once.
  const finishDrawing = useCallback((): GeoPolygon[] => {
    const current = areasRef.current
    if (!drawing) return current
    const ring = mapRef.current?.finishDrawing() ?? null
    const index = editingRef.current
    const next = ring === null ? current : index === null ? [...current, ring] : current.map((a, i) => (i === index ? ring : a))
    if (next !== current) {
      areasRef.current = next
      setAreas(next)
    }
    mapRef.current?.restoreRing(null)
    setEditing(null)
    setDrawing(false)
    return next
  }, [drawing, mapRef, setAreas])

  const handleCancelDrawing = useCallback(() => {
    mapRef.current?.restoreRing(null)
    setEditing(null)
    setDrawing(false)
  }, [mapRef])

  // An area's ×. Removing the one being edited leaves the mode too.
  const removeArea = useCallback(
    (index: number) => {
      if (editingRef.current === index) handleCancelDrawing()
      else if (editingRef.current !== null && editingRef.current > index) setEditing(editingRef.current - 1)
      setAreas((now) => now.filter((_, i) => i !== index))
    },
    [handleCancelDrawing, setAreas],
  )

  // Enter and Escape are Done and Cancel for a hand already on the keyboard.
  // Enter shares Done's 3-point floor, because it means "the ring is
  // finished", which two points cannot be. Escape is what a hand reaches for
  // to back out of a mode, so it backs out the way Cancel does.
  useEffect(() => {
    if (!drawing) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      // Not while the user is in the CSV box or a number field, where Enter
      // and Escape belong to the control they are typing into.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') handleCancelDrawing()
      else if (drawPointCount >= 3) finishDrawing()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawing, drawPointCount, finishDrawing, handleCancelDrawing])

  return {
    drawing,
    editing,
    drawPointCount,
    handleDrawUpdate,
    startArea,
    editArea,
    removeArea,
    finishDrawing,
    handleCancelDrawing,
  }
}

/** What `useDrawMode` hands its callers; the controls drawer reads it whole. */
export type DrawMode = ReturnType<typeof useDrawMode>
