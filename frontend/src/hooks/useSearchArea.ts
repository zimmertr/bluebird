import { type RefObject, useCallback, useMemo, useState } from 'react'
import type { GeoPolygon } from '../types'
import type { BBox } from '../utils/wildfires'
import { bboxAreaKm2, ringToPts } from '../utils/drawGeometry'
import { boxRing, sameRing, searchArea } from '../utils/searchArea'

export interface SearchAreaInputs {
  /** The map, whose view is the area while no ring is drawn. */
  mapRef: RefObject<{ getViewBox: () => BBox | null } | null>
  /** The drawn ring and how many points it has. */
  drawn: GeoPolygon | null
  drawPointCount: number
  /** The reader chose a list: search no ring, the view included. */
  listOnly: boolean
}

/**
 * The area a Forecast searches (record 0309): the drawn ring, or the view
 * when none is drawn, with the area the cap measures. `reportView` is the
 * map's settled-move callback; the view is state, so a pan that lands renders
 * the bar and the button, and a pan of a few metres keeps the old ring.
 */
export function useSearchArea({ mapRef, drawn, drawPointCount, listOnly }: SearchAreaInputs) {
  const [view, setView] = useState<GeoPolygon | null>(null)
  const reportView = useCallback(() => {
    const box = mapRef.current?.getViewBox() ?? null
    if (box === null) return
    const ring = boxRing(box)
    setView((prev) => (sameRing(prev, ring) ? prev : ring))
  }, [mapRef])
  const area = useMemo(() => searchArea(drawn, drawPointCount, view, listOnly), [drawn, drawPointCount, view, listOnly])
  const areaKm2 = useMemo(() => (area.polygon ? bboxAreaKm2(ringToPts(area.polygon)) : null), [area.polygon])
  return { ...area, areaKm2, reportView }
}
