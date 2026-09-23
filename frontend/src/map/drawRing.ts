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
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { GeoPolygon } from '../types'
import { emptyFC, setSource } from './basemap'
import type { MapController } from './controller'
import {
  insertOnSegment,
  makeDrawData,
  moveVertex,
  removeVertex,
  ringPolygon,
} from '../utils/drawGeometry'
import { addVertex } from '../utils/polygonEdit'

export const DRAW_COLOR = '#38bdf8'

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
    paint: { 'fill-color': DRAW_COLOR, 'fill-opacity': 0.12 },
  })
  map.addLayer({
    id: 'draw-line',
    type: 'line',
    source: 'draw',
    paint: { 'line-color': DRAW_COLOR, 'line-width': 2 },
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
    paint: {
      'circle-radius': 5,
      'circle-color': '#fff',
      'circle-stroke-color': DRAW_COLOR,
      'circle-stroke-width': 2,
      'circle-opacity': 0.85,
    },
  })
  map.addLayer({
    id: 'draw-vertices',
    type: 'circle',
    source: 'draw',
    filter: ['==', ['get', 'kind'], 'vertex'],
    layout: handleVisibility,
    paint: {
      'circle-radius': 6,
      'circle-color': DRAW_COLOR,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
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

  // Vertex: a click (the mouse didn't move) offers to remove it.
  map.on('click', 'draw-vertices', (e) => {
    const props = e.features?.[0]?.properties
    if (props == null) return
    const idx = Number(props.index)

    popup?.remove()
    const opened = new Popup({ offset: [0, -8], closeButton: false })
      .setLngLat(e.lngLat)
      .setHTML(
        '<button data-rm style="background:#ef4444;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-family:sans-serif;font-weight:600">✕ Remove point</button>',
      )
      .addTo(map)
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
  })

  // Midpoint: mousedown or touchstart inserts a vertex on that segment, then
  // drags it.
  function startMidpointDrag(e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) {
    e.preventDefault()
    const segIdx = Number(e.features?.[0]?.properties?.segment)
    edit(insertOnSegment(ring.current, segIdx, [e.lngLat.lng, e.lngLat.lat]))
    startVertexDrag(segIdx + 1)
  }
  map.on('mousedown', 'draw-midpoints', startMidpointDrag)
  map.on('touchstart', 'draw-midpoints', startMidpointDrag)

  for (const layer of ['draw-vertices', 'draw-midpoints']) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'grab'
    })
    map.on('mouseleave', layer, () => {
      if (dragging === null) deps.restCursor()
    })
  }

  function closePopup() {
    popup?.remove()
    popup = null
  }

  return {
    addPoint(pt) {
      edit(addVertex(ring.current, pt))
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
