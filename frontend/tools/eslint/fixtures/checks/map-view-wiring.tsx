// Must trip: every ban, and no requirement is met.
import { useEffect, useRef } from 'react'
export function helper() {}
export const View = ({ polygon, results }: any) => {
  const seeded = useRef(results)
  const restoredPolygonRef = useRef(polygon)
  const snapshot = restoredPolygonRef.current
  const copy = polygon
  const resultPopupRef = useRef(null)
  useEffect(() => {
    seeded.current = results
  })
  const map: any = {}
  map.addSource('results', {})
  map.on('click', () => {})
  const popup = new maplibregl.Popup()
  mountDrawRing(map)
  const color = DRAW_COLOR
  const area = bboxAreaKm2(polygon)
  return [snapshot, copy, resultPopupRef, popup, color, area]
}
