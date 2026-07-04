import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { GeoPolygon, DestinationResult, SortBy } from '../types'
import { markerColor } from '../utils/colors'

export interface MapViewHandle {
  finishDrawing: () => GeoPolygon | null
  cancelDrawing: () => void
}

interface Props {
  polygon: GeoPolygon | null
  drawMode: boolean
  onPolygonChange: (polygon: GeoPolygon | null) => void
  onDrawUpdate: (count: number, areaKm2: number | null) => void
  results: DestinationResult[]
  sortBy: SortBy
}

export const MAX_AREA_KM2 = 50_000

function bboxAreaKm2(pts: [number, number][]): number | null {
  if (pts.length < 3) return null
  const lats = pts.map((p) => p[1])
  const lons = pts.map((p) => p[0])
  const latKm = (Math.max(...lats) - Math.min(...lats)) * 111
  const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
  const lonKm = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos((avgLat * Math.PI) / 180)
  return latKm * lonKm
}

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const DRAW_COLOR = '#38bdf8'

function makeDrawData(pts: [number, number][]): object {
  const features: object[] = []

  if (pts.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] },
    })
  } else if (pts.length === 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: pts },
    })
  }

  // Midpoint handle between each segment — drag to insert a new vertex
  const segCount = pts.length >= 3 ? pts.length : pts.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    features.push({
      type: 'Feature',
      properties: { kind: 'midpoint', segment: i },
      geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
    })
  }

  // Vertices rendered last so they sit on top of midpoints
  pts.forEach((pt, i) => {
    features.push({
      type: 'Feature',
      properties: { kind: 'vertex', index: i },
      geometry: { type: 'Point', coordinates: pt },
    })
  })

  return { type: 'FeatureCollection', features }
}

function makePolygonData(polygon: GeoPolygon): object {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { kind: 'polygon' }, geometry: polygon }],
  }
}

const emptyFC = { type: 'FeatureCollection', features: [] }

function setSource(map: maplibregl.Map, id: string, data: object) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data as GeoJSON.FeatureCollection)
}

// The OpenFreeMap "Liberty" style ships the OpenMapTiles vector source but
// leaves features our hikers care about under-rendered: peaks aren't drawn at
// all (the `mountain_peak` layer exists in the tiles but no style layer paints
// it), trails only appear at z14+, and lake labels are faint. Patch the loaded
// style to surface them. All three read from the existing `openmaptiles` source.
function enhanceBasemap(map: maplibregl.Map) {
  // Slot our additions just beneath the style's first text layer so labels
  // (including the ones we add) stay on top of lines and fills.
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id

  // Trails: OSM class=path/track. Liberty only draws these from z14, too late
  // for orienting while drawing a polygon — show them from z11 in a trail hue.
  map.addLayer(
    {
      id: 'ofm-trails',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
      paint: {
        'line-color': '#a0522d',
        'line-dasharray': [2, 1.5],
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.6, 16, 2.5, 20, 6],
        'line-opacity': 0.85,
      },
    },
    firstSymbolId,
  )

  // Peaks: icon + name + elevation (feet). Sorted by OSM prominence rank so the
  // notable summits win label collisions. icon-allow-overlap keeps every marker
  // visible while text-optional drops just the label when space is tight.
  map.addLayer(
    {
      id: 'ofm-peaks',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'mountain_peak',
      minzoom: 9,
      layout: {
        'icon-image': 'mountain_11',
        'icon-allow-overlap': true,
        'text-optional': true,
        'text-field': [
          'case',
          ['has', 'ele_ft'],
          ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele_ft']], ' ft'],
          ['get', 'name'],
        ],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.7],
        'text-max-width': 8,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 10],
      },
      paint: {
        'text-color': '#5c4530',
        'text-halo-color': '#f8f4ef',
        'text-halo-width': 1.4,
      },
    },
    firstSymbolId,
  )

  // Lakes: the label layer already exists but is faint, and small alpine lakes
  // are only sparsely named in the tiles (the app's Overpass query is the
  // reliable path for those). Enlarge and halo the labels that do resolve.
  if (map.getLayer('water_name_point_label')) {
    map.setLayoutProperty('water_name_point_label', 'text-size', [
      'interpolate',
      ['linear'],
      ['zoom'],
      0,
      11,
      10,
      15,
    ])
    map.setPaintProperty('water_name_point_label', 'text-halo-color', '#eaf1ff')
    map.setPaintProperty('water_name_point_label', 'text-halo-width', 1.2)
  }
}

const MapView = forwardRef<MapViewHandle, Props>(
  ({ polygon, drawMode, onPolygonChange, onDrawUpdate, results, sortBy }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const loadedRef = useRef(false)
    const drawModeRef = useRef(false)
    const ptsRef = useRef<[number, number][]>([])
    const pendingResultsRef = useRef<DestinationResult[]>([])
    const pendingSortByRef = useRef<SortBy>('precip_total_in')
    const vertexPopupRef = useRef<maplibregl.Popup | null>(null)
    const draggingVertexRef = useRef<number | null>(null)

    useImperativeHandle(ref, () => ({
      finishDrawing() {
        const pts = ptsRef.current
        if (pts.length < 3) return null
        const geo: GeoPolygon = { type: 'Polygon', coordinates: [[...pts, pts[0]]] }
        ptsRef.current = []
        onDrawUpdate(0, null)
        onPolygonChange(geo)
        if (mapRef.current && loadedRef.current) {
          setSource(mapRef.current, 'draw', makePolygonData(geo))
        }
        return geo
      },
      cancelDrawing() {
        ptsRef.current = []
        vertexPopupRef.current?.remove()
        vertexPopupRef.current = null
        onDrawUpdate(0, null)
        onPolygonChange(null)
        if (mapRef.current && loadedRef.current) {
          setSource(mapRef.current, 'draw', emptyFC)
        }
      },
    }))

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [-120.5, 47.5],
        zoom: 7,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      map.addControl(new maplibregl.ScaleControl(), 'bottom-right')

      let pendingGeo: [number, number] | null = null
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const center: [number, number] = [pos.coords.longitude, pos.coords.latitude]
            if (loadedRef.current) map.flyTo({ center, zoom: 9 })
            else pendingGeo = center
          },
          () => {},
          { timeout: 8000 },
        )
      }

      map.on('load', () => {
        loadedRef.current = true
        if (pendingGeo) map.flyTo({ center: pendingGeo, zoom: 9 })

        enhanceBasemap(map)

        // ── Draw source + layers ───────────────────────────────────────
        map.addSource('draw', { type: 'geojson', data: emptyFC as GeoJSON.FeatureCollection })

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
        // Midpoints render below vertices so vertices are always on top
        map.addLayer({
          id: 'draw-midpoints',
          type: 'circle',
          source: 'draw',
          filter: ['==', ['get', 'kind'], 'midpoint'],
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
          paint: {
            'circle-radius': 6,
            'circle-color': DRAW_COLOR,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
          },
        })

        // ── Results source + layers ────────────────────────────────────
        map.addSource('results', { type: 'geojson', data: emptyFC as GeoJSON.FeatureCollection })

        map.addLayer({
          id: 'results-circles',
          type: 'circle',
          source: 'results',
          paint: {
            'circle-radius': 10,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })
        map.addLayer({
          id: 'results-rank',
          type: 'symbol',
          source: 'results',
          layout: { 'text-field': ['get', 'rank'], 'text-size': 10, 'text-font': ['Noto Sans Bold'] },
          paint: { 'text-color': '#fff' },
        })
        map.addLayer({
          id: 'results-labels',
          type: 'symbol',
          source: 'results',
          layout: {
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.6],
            'text-size': 11,
            'text-anchor': 'top',
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.5,
          },
        })

        // ── Shared vertex drag ─────────────────────────────────────────
        // Called from both the vertex mousedown and midpoint mousedown handlers.
        function startVertexDrag(vertexIdx: number) {
          draggingVertexRef.current = vertexIdx
          map.dragPan.disable()
          map.getCanvas().style.cursor = 'grabbing'

          const canvas = map.getCanvas()

          function onMove(me: MouseEvent) {
            const i = draggingVertexRef.current
            if (i === null) return
            const rect = canvas.getBoundingClientRect()
            const lngLat = map.unproject([me.clientX - rect.left, me.clientY - rect.top])
            ptsRef.current = ptsRef.current.map((p, j) =>
              j === i ? ([lngLat.lng, lngLat.lat] as [number, number]) : p,
            )
            setSource(map, 'draw', makeDrawData(ptsRef.current))
          }

          function onUp() {
            draggingVertexRef.current = null
            map.dragPan.enable()
            map.getCanvas().style.cursor = drawModeRef.current ? 'crosshair' : ''
            onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
          }

          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        }

        // ── Vertex: mousedown starts drag ──────────────────────────────
        map.on('mousedown', 'draw-vertices', (e) => {
          if (!drawModeRef.current) return
          e.preventDefault() // prevents MapLibre's DragPanHandler from starting
          startVertexDrag(Number(e.features?.[0]?.properties?.index))
        })

        // ── Vertex: click (mouse didn't move) → delete popup ───────────
        map.on('click', 'draw-vertices', (e) => {
          if (!drawModeRef.current) return
          const props = e.features?.[0]?.properties
          if (props == null) return
          const idx = Number(props.index)

          vertexPopupRef.current?.remove()
          const popup = new maplibregl.Popup({ offset: [0, -8], closeButton: false })
            .setLngLat(e.lngLat)
            .setHTML(
              '<button data-rm style="background:#ef4444;color:#fff;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-family:sans-serif;font-weight:600">✕ Remove point</button>',
            )
            .addTo(map)
          vertexPopupRef.current = popup

          setTimeout(() => {
            popup
              .getElement()
              ?.querySelector<HTMLButtonElement>('[data-rm]')
              ?.addEventListener('click', () => {
                ptsRef.current = ptsRef.current.filter((_, i) => i !== idx)
                setSource(map, 'draw', makeDrawData(ptsRef.current))
                onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
                popup.remove()
                vertexPopupRef.current = null
              })
          }, 0)
        })

        map.on('mouseenter', 'draw-vertices', () => {
          if (drawModeRef.current) map.getCanvas().style.cursor = 'grab'
        })
        map.on('mouseleave', 'draw-vertices', () => {
          if (draggingVertexRef.current === null)
            map.getCanvas().style.cursor = drawModeRef.current ? 'crosshair' : ''
        })

        // ── Midpoint: mousedown inserts vertex then drags it ───────────
        map.on('mousedown', 'draw-midpoints', (e) => {
          if (!drawModeRef.current) return
          e.preventDefault()
          const segIdx = Number(e.features?.[0]?.properties?.segment)
          const newPt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          ptsRef.current = [
            ...ptsRef.current.slice(0, segIdx + 1),
            newPt,
            ...ptsRef.current.slice(segIdx + 1),
          ]
          setSource(map, 'draw', makeDrawData(ptsRef.current))
          onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
          startVertexDrag(segIdx + 1)
        })

        map.on('mouseenter', 'draw-midpoints', () => {
          if (drawModeRef.current) map.getCanvas().style.cursor = 'grab'
        })
        map.on('mouseleave', 'draw-midpoints', () => {
          if (draggingVertexRef.current === null)
            map.getCanvas().style.cursor = drawModeRef.current ? 'crosshair' : ''
        })

        // ── Results: popup + cursor ────────────────────────────────────
        map.on('click', 'results-circles', (e) => {
          const props = e.features?.[0]?.properties
          if (!props) return
          new maplibregl.Popup({ maxWidth: '240px' })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
                <strong>#${props.rank} ${props.name}</strong>
                ${props.elevation_ft != null ? `<br>Elevation: ${Number(props.elevation_ft).toLocaleString()} ft` : ''}
                <br>Precip total: <strong>${Number(props.precip).toFixed(3)}"</strong>
                <br>Wind avg: ${props.wind_avg} mph · Temp avg: ${props.temp_avg}°F
              </div>`,
            )
            .addTo(map)
        })
        map.on('mouseenter', 'results-circles', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'results-circles', () => {
          map.getCanvas().style.cursor = drawModeRef.current ? 'crosshair' : ''
        })

        // ── General click → add new polygon point ──────────────────────
        map.on('click', (e) => {
          if (!drawModeRef.current) return
          const blocked = map.queryRenderedFeatures(e.point, {
            layers: ['results-circles', 'draw-vertices', 'draw-midpoints'],
          })
          if (blocked.length > 0) return

          const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          ptsRef.current = [...ptsRef.current, pt]
          setSource(map, 'draw', makeDrawData(ptsRef.current))
          onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
        })

        if (pendingResultsRef.current.length > 0) {
          updateResults(map, pendingResultsRef.current, pendingSortByRef.current)
          pendingResultsRef.current = []
        }
      })

      return () => {
        loadedRef.current = false
        vertexPopupRef.current = null
        map.remove()
        mapRef.current = null
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      drawModeRef.current = drawMode
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = drawMode ? 'crosshair' : ''
      }
    }, [drawMode])

    useEffect(() => {
      if (!mapRef.current || !loadedRef.current) return
      if (drawMode) return
      setSource(mapRef.current, 'draw', polygon ? makePolygonData(polygon) : emptyFC)
    }, [polygon, drawMode])

    useEffect(() => {
      if (!mapRef.current || !loadedRef.current) {
        pendingResultsRef.current = results
        pendingSortByRef.current = sortBy
        return
      }
      pendingResultsRef.current = []
      updateResults(mapRef.current, results, sortBy)
    }, [results, sortBy])

    return <div ref={containerRef} className="absolute inset-0" />
  },
)

MapView.displayName = 'MapView'
export default MapView

function updateResults(map: maplibregl.Map, results: DestinationResult[], sortBy: SortBy) {
  setSource(map, 'results', {
    type: 'FeatureCollection',
    features: results.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        name: r.name,
        rank: String(i + 1),
        color: markerColor(r[sortBy] as number, sortBy),
        precip: r.precip_total_in,
        elevation_ft: r.elevation_ft,
        wind_avg: r.wind_avg_mph.toFixed(1),
        temp_avg: r.temp_avg_f.toFixed(1),
      },
    })),
  })
}
