/**
 * The drawn ring on the map: its source, the fill, the outline, the midpoint
 * and vertex handles, the drags that move a vertex or insert one, and the popup
 * that removes one.
 *
 * The ring itself (the array of points) belongs to the component, because it
 * exists before the map loads (a restored link hydrates it) and after (Clear
 * and Done read it). This module is handed that holder and edits it through
 * the pure edits in `utils/drawGeometry.ts`; every edit it makes is committed
 * to React the same way, through `commitRing`.
 */
import type { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { GeoPolygon } from '../types'
import { emptyFC, setSource } from './basemap'
import type { MapController } from './controller'
import type { MapPopups } from './mapPopups'
import {
  insertOnSegment,
  makeDrawData,
  moveVertex,
  removeVertex,
  ringHasRoom,
  ringPolygon,
} from '../utils/drawGeometry'
import { addVertex } from '../utils/polygonEdit'
import { popupButton } from '../utils/popupChrome'
import {
  DRAW_COLOR,
  DRAW_FILL_OPACITY,
  DRAW_LINE_WIDTH,
  MIDPOINT_HANDLE_PAINT,
  VERTEX_HANDLE_PAINT,
} from './mapStyles'

type Pts = [number, number][]

export interface DrawRing {
  /** Place a point where a click in draw mode asked for one. */
  addPoint(pt: [number, number]): void
  /** Show the handles in draw mode and hide them outside it. */
  setDrawing(drawing: boolean): void
  /** Draw the ring as the holder has it now, after an edit made elsewhere. */
  redraw(): void
  /** Take down the remove-point popup, if one is open. */
  closePopup(): void
}

export function mountDrawRing(
  map: maplibregl.Map,
  deps: {
    ring: { current: Pts }
    controller: MapController
    popups: MapPopups
    restCursor: () => void
    onPolygonChange: (polygon: GeoPolygon | null) => void
    onDrawUpdate: (count: number) => void
  },
): DrawRing {
  const { ring } = deps
  let popup: Popup | null = null
  // The vertex being dragged, so leaving a handle mid-drag keeps the grab
  // cursor rather than resetting it under the reader's hand.
  let dragging: number | null = null

  map.addSource('draw', {
    type: 'geojson',
    data: (ring.current.length > 0 ? makeDrawData(ring.current) : emptyFC) as FeatureCollection,
  })
  map.addLayer({
    id: 'draw-fill',
    type: 'fill',
    source: 'draw',
    filter: ['==', ['get', 'kind'], 'polygon'],
    paint: { 'fill-color': DRAW_COLOR, 'fill-opacity': DRAW_FILL_OPACITY },
  })
  map.addLayer({
    id: 'draw-line',
    type: 'line',
    source: 'draw',
    paint: { 'line-color': DRAW_COLOR, 'line-width': DRAW_LINE_WIDTH },
  })
  // Midpoints render below vertices so vertices are always on top.
  //
  // Both handle layers are hidden outside draw mode, and hiding them is what
  // makes the mode real rather than cosmetic: MapLibre resolves layer-scoped
  // events through queryRenderedFeatures, which skips invisible layers, so a
  // hidden handle fires no mousedown and cannot be dragged. That is the
  // accidental-vertex-move half of #118 (a 6 px hit target beside a finger
  // reaching for the map) closed at the source instead of guarded at each of
  // the four handlers.
  const handleVisibility = {
    visibility: deps.controller.inputs.drawing ? 'visible' : 'none',
  } as const
  map.addLayer({
    id: 'draw-midpoints',
    type: 'circle',
    source: 'draw',
    filter: ['==', ['get', 'kind'], 'midpoint'],
    layout: handleVisibility,
    paint: MIDPOINT_HANDLE_PAINT,
  })
  map.addLayer({
    id: 'draw-vertices',
    type: 'circle',
    source: 'draw',
    filter: ['==', ['get', 'kind'], 'vertex'],
    layout: handleVisibility,
    paint: VERTEX_HANDLE_PAINT,
  })

  function redraw() {
    setSource(map, 'draw', makeDrawData(ring.current))
  }

  // Called at every discrete edit (point add, drag end, midpoint insert,
  // vertex delete), never during pointermove, so App can live-sync the URL
  // without thrashing replaceState mid-drag. Under 3 points there's no polygon
  // yet, so commit null.
  function commitRing() {
    deps.onDrawUpdate(ring.current.length)
    deps.onPolygonChange(ringPolygon(ring.current))
  }

  function edit(next: Pts) {
    ring.current = next
    redraw()
    commitRing()
  }

  // Shared by the vertex and the midpoint mousedown handlers.
  function startVertexDrag(vertexIdx: number) {
    dragging = vertexIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'

    const canvas = map.getCanvas()

    function moveTo(clientX: number, clientY: number) {
      if (dragging === null) return
      const rect = canvas.getBoundingClientRect()
      const lngLat = map.unproject([clientX - rect.left, clientY - rect.top])
      ring.current = moveVertex(ring.current, dragging, [lngLat.lng, lngLat.lat])
      redraw()
    }

    function onMouseMove(me: MouseEvent) {
      moveTo(me.clientX, me.clientY)
    }

    // Touch drag: track the single active finger and preventDefault so the
    // browser doesn't scroll or zoom the page while dragging the vertex.
    function onTouchMove(te: TouchEvent) {
      if (te.touches.length !== 1) return
      te.preventDefault()
      moveTo(te.touches[0].clientX, te.touches[0].clientY)
    }

    function onUp() {
      dragging = null
      map.dragPan.enable()
      deps.restCursor()
      commitRing()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onUp)
      document.removeEventListener('touchcancel', onUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onUp)
    document.addEventListener('touchcancel', onUp)
  }

  // Vertex: mousedown or touchstart starts a drag. MapLibre doesn't synthesize
  // mouse events from touches, so touch needs its own handler, and
  // preventDefault stops the map's own pan handler starting.
  map.on('mousedown', 'draw-vertices', (e) => {
    e.preventDefault()
    startVertexDrag(Number(e.features?.[0]?.properties?.index))
  })
  map.on('touchstart', 'draw-vertices', (e) => {
    e.preventDefault()
    startVertexDrag(Number(e.features?.[0]?.properties?.index))
  })

  // The handles are a click target like any other, first in the rank, and
  // the only one besides a marker that takes a click in draw mode. A click
  // (the mouse didn't move) on a vertex offers to remove it; a midpoint
  // claims the click and opens nothing, because its mousedown has already
  // inserted the point a drag would place, and a fall-through would place a
  // second one there. The grab hand stays while a drag holds it.
  deps.popups.register({
    target: 'vertex',
    layers: ['draw-vertices', 'draw-midpoints'],
    holdsCursor: () => dragging !== null,
    open: ({ feature, lngLat }) => {
      if (feature.layer.id !== 'draw-vertices') return
      const idx = Number(feature.properties?.index)
      popup?.remove()
      const opened = deps.popups.create(lngLat, popupButton('data-rm', 'danger', '✕ Remove point'), {
        owner: 'vertex',
        offset: [0, -8],
        closeButton: false,
      })
      popup = opened
      setTimeout(() => {
        opened
          .getElement()
          ?.querySelector<HTMLButtonElement>('[data-rm]')
          ?.addEventListener('click', () => {
            edit(removeVertex(ring.current, idx))
            opened.remove()
            popup = null
          })
      }, 0)
    },
  })

  // Whether the ring can take another point. Read from the controller at the
  // moment a point would be added, because the cap arrives from
  // /api/capabilities after the map has mounted. At the cap a click or a
  // midpoint grab simply does nothing: the server refuses a longer ring.
  function hasRoom() {
    return ringHasRoom(ring.current, deps.controller.inputs.maxPolygonPoints)
  }

  // Midpoint: mousedown or touchstart inserts a vertex on that segment, then
  // drags it. On a full ring it is left to the map, which pans as it would
  // anywhere else.
  function startMidpointDrag(e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) {
    if (!hasRoom()) return
    e.preventDefault()
    const segIdx = Number(e.features?.[0]?.properties?.segment)
    edit(insertOnSegment(ring.current, segIdx, [e.lngLat.lng, e.lngLat.lat]))
    startVertexDrag(segIdx + 1)
  }
  map.on('mousedown', 'draw-midpoints', startMidpointDrag)
  map.on('touchstart', 'draw-midpoints', startMidpointDrag)

  function closePopup() {
    popup?.remove()
    popup = null
  }

  return {
    addPoint(pt) {
      if (hasRoom()) edit(addVertex(ring.current, pt))
    },
    setDrawing(drawing) {
      for (const id of ['draw-vertices', 'draw-midpoints']) {
        map.setLayoutProperty(id, 'visibility', drawing ? 'visible' : 'none')
      }
      // Leaving draw mode drops an open remove-point popup, which offers an
      // edit the map no longer accepts.
      if (!drawing) closePopup()
    },
    redraw,
    closePopup,
  }
}
