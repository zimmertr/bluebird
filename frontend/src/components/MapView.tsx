import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
// Namespace import: maplibre-gl v6 is ESM-only and no longer has a default export
import * as maplibregl from 'maplibre-gl'
// v6 resolves its web worker with a runtime-computed `new URL(...)` that Vite
// can't statically bundle, so production builds 404 the worker and silently
// render no tiles. Bundle the worker as its own entry and point maplibre at it.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
import type { FilterSpecification } from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection, Point } from 'geojson'
// All maplibre CSS enters through map.css, which wraps the vendor stylesheet
// in layer(base) — see the comment there before "simplifying" this to a direct
// vendor import. Importing it here rather than in index.css is what keeps map
// styling out of the text-page entries.
import '../map.css'
import { GeoPolygon, DestinationResult, SortBy } from '../types'
import { resultsFeatureCollection } from '../utils/resultFeatures'
import { resultPopupHtml } from '../utils/resultPopup'
import { FireWarning, fireKey } from '../utils/fireProximity'
import { Place, boundsAround, boundsForPoints } from '../utils/geocode'
import type { PendingDestination } from '../utils/customList'
import {
  COARSE_TOLERANCE_DEG,
  fetchWildfires,
  wildfirePopupHtml,
  nifcFireUrl,
  type BBox,
  type WildfireProps,
} from '../utils/wildfires'

export interface MapViewHandle {
  finishDrawing: () => GeoPolygon | null
  cancelDrawing: () => void
  flyToPlace: (place: Place) => void
  fitToPoints: (points: { latitude: number; longitude: number }[]) => void
  focusResult: (result: DestinationResult) => void
}

interface Props {
  polygon: GeoPolygon | null // initial ring (e.g. restored from the URL)
  // Custom CSV destinations restored from the URL, parsed once at mount. Like
  // a restored polygon they suppress geolocation and are framed on load, so a
  // shared list link opens on the list, not on the visitor's hometown.
  restoredCustomPoints: { latitude: number; longitude: number }[]
  onPolygonChange: (polygon: GeoPolygon | null) => void
  onDrawUpdate: (count: number, areaKm2: number | null) => void
  results: DestinationResult[]
  sortBy: SortBy
  // Fire-proximity warnings keyed by fireKey(lat,lon), mirroring the results
  // table — a clicked point's popup surfaces the same ⚠️ when one applies.
  fireWarnings: Map<string, FireWarning>
  showWildfires: boolean
  // Custom destinations — pasted CSV rows and searched places alike — not (or
  // not yet) in the displayed analysis: awaiting the next Analyze, or ranked
  // below the cutoff. Drawn as neutral blue dots so a point the user named
  // never vanishes. Analyzed ones arrive inside `results`.
  pending: PendingDestination[]
  minElevationFt: number | null
  maxElevationFt: number | null
}

// Build a filter for the basemap peak layer from the elevation knobs so the
// mountains drawn on the map match the band an analysis would actually consider.
// Peaks whose vector tiles carry no `ele_ft` pass through — the backend's
// elevation filter keeps unknown-elevation candidates, so the map matches it.
// Returns null to clear the filter (no band set).
function peakElevationFilter(
  minFt: number | null,
  maxFt: number | null,
): FilterSpecification | null {
  // Written as three static cases (min, max, both) so the expressions type-check
  // against FilterSpecification without a cast. `['!', ['has', 'ele_ft']]` keeps
  // peaks whose tiles have no elevation.
  if (minFt != null && maxFt != null) {
    return [
      'any',
      ['!', ['has', 'ele_ft']],
      ['all', ['>=', ['get', 'ele_ft'], minFt], ['<=', ['get', 'ele_ft'], maxFt]],
    ]
  }
  if (minFt != null) {
    return ['any', ['!', ['has', 'ele_ft']], ['>=', ['get', 'ele_ft'], minFt]]
  }
  if (maxFt != null) {
    return ['any', ['!', ['has', 'ele_ft']], ['<=', ['get', 'ele_ft'], maxFt]]
  }
  return null
}

// A search result frames at least this much map around the hit; features with
// a larger extent (cities, parks, rivers) get their whole bounding box instead.
const SEARCH_VIEW_MILES = 10

// Breathing room around a multi-point fit, and how long that fit stays
// re-appliable while the surrounding layout settles — long enough to cover the
// results panel opening in response to the same paste, short enough that a
// later panel drag isn't mistaken for it.
const FIT_PADDING_PX = 60
const REFIT_WINDOW_MS = 1_000

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

// A GeoPolygon's ring (closed: last vertex repeats the first) → editable points
function ringToPts(polygon: GeoPolygon): [number, number][] {
  const ring = (polygon.coordinates[0] ?? []).map((c) => [c[0], c[1]] as [number, number])
  if (ring.length > 1) {
    const [first, last] = [ring[0], ring[ring.length - 1]]
    if (first[0] === last[0] && first[1] === last[1]) ring.pop()
  }
  return ring
}

const emptyFC = { type: 'FeatureCollection', features: [] }

function setSource(map: maplibregl.Map, id: string, data: object) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data as FeatureCollection)
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
  (
    {
      polygon,
      restoredCustomPoints,
      onPolygonChange,
      onDrawUpdate,
      results,
      sortBy,
      fireWarnings,
      showWildfires,
      pending,
      minElevationFt,
      maxElevationFt,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const loadedRef = useRef(false)
    const ptsRef = useRef<[number, number][]>([])
    const pendingResultsRef = useRef<DestinationResult[]>([])
    const pendingSortByRef = useRef<SortBy>('precip_total_in')
    const pendingSearchRef = useRef<Place | null>(null)
    // CSV list pasted before the map finished loading — folded into the load
    // handler's opening frame, mirroring pendingSearchRef.
    const pendingFitPointsRef = useRef<{ latitude: number; longitude: number }[] | null>(null)
    // A fit issued moments ago, held just long enough to survive the layout it
    // triggers. Pasting a CSV also opens the results panel, which shrinks the
    // map *after* these bounds became a camera — so the far edge of the list
    // would end up tucked under the panel. React can't be relied on to order
    // this (the panel opens from a passive effect, which runs after paint), so
    // the resize observer re-applies the fit instead.
    const refitPointsRef = useRef<{ latitude: number; longitude: number }[] | null>(null)
    const refitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // True once anything has deliberately framed the view (restored-state fit,
    // search, CSV fit, result focus). A late geolocation grant checks this so
    // it can't yank the camera away from a frame the user asked for.
    const cameraCommittedRef = useRef(false)
    const vertexPopupRef = useRef<maplibregl.Popup | null>(null)
    const draggingVertexRef = useRef<number | null>(null)
    const firePopupRef = useRef<maplibregl.Popup | null>(null)
    // The single popup opened by focusResult (table-rank click), tracked so
    // repeated clicks replace it instead of stacking popups.
    const resultPopupRef = useRef<maplibregl.Popup | null>(null)
    const fireAbortRef = useRef<AbortController | null>(null)
    // Latest fire warnings for the marker-click handler, which is registered once
    // in the load effect and would otherwise close over an empty map. focusResult
    // reads the live prop directly (its imperative handle re-runs every render).
    const fireWarningsRef = useRef(fireWarnings)
    // Flipped once the load handler has added every source/layer. A ref wouldn't
    // re-run the wildfire effect, so this is state — it lets a restored `fires=1`
    // link turn the overlay on as soon as the map is ready.
    const [mapReady, setMapReady] = useState(false)

    useImperativeHandle(ref, () => ({
      // Snapshot the current ring as a GeoPolygon. The points stay editable —
      // the user iterates by dragging vertices and clicking Analyze again.
      finishDrawing() {
        const pts = ptsRef.current
        if (pts.length < 3) return null
        const geo: GeoPolygon = { type: 'Polygon', coordinates: [[...pts, pts[0]]] }
        onPolygonChange(geo)
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
      // Frame a searched place. Only the camera move — the place renders
      // declaratively as a pending dot until the next Analyze ranks it.
      flyToPlace(place: Place) {
        cameraCommittedRef.current = true
        const map = mapRef.current
        if (!map || !loadedRef.current) {
          pendingSearchRef.current = place
          return
        }
        map.fitBounds(boundsAround(place, SEARCH_VIEW_MILES), { padding: 40, duration: 1500 })
      },
      // Frame a pasted custom CSV list whole. Deferred like a pre-load search
      // when the map isn't ready — the load handler folds the points into its
      // opening frame.
      fitToPoints(points: { latitude: number; longitude: number }[]) {
        const bounds = boundsForPoints(points, SEARCH_VIEW_MILES)
        if (!bounds) return
        cameraCommittedRef.current = true
        const map = mapRef.current
        if (!map || !loadedRef.current) {
          pendingFitPointsRef.current = points
          return
        }
        refitPointsRef.current = points
        if (refitTimerRef.current) clearTimeout(refitTimerRef.current)
        refitTimerRef.current = setTimeout(() => (refitPointsRef.current = null), REFIT_WINDOW_MS)
        map.fitBounds(bounds, { padding: FIT_PADDING_PX, duration: 1500 })
      },
      // Center on a result (clicked from its rank in the table) and open the
      // same popup a marker click gives. Rank is the analyzed order the markers
      // are labeled with, so the popup matches the marker it lands on.
      focusResult(result: DestinationResult) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        cameraCommittedRef.current = true
        const center: [number, number] = [result.longitude, result.latitude]
        map.flyTo({ center, zoom: Math.max(map.getZoom(), 10), duration: 800 })
        resultPopupRef.current?.remove()
        resultPopupRef.current = new maplibregl.Popup({ maxWidth: '240px' })
          .setLngLat(center)
          .setHTML(
            resultPopupHtml({
              rank: results.indexOf(result) + 1,
              name: result.name,
              type: result.type,
              osmId: result.osm_id ?? null,
              elevationFt: result.elevation_ft,
              precipTotalIn: result.precip_total_in,
              windAvgMph: result.wind_avg_mph,
              tempAvgF: result.temp_avg_f,
              aqiAvg: result.aqi_avg,
              aqiMax: result.aqi_max,
              longitude: result.longitude,
              latitude: result.latitude,
              warning: fireWarnings.get(fireKey(result.latitude, result.longitude)) ?? null,
            }),
          )
          .addTo(map)
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

      // Keep the canvas in sync with its container. MapLibre only tracks window
      // resizes, but our container also changes size when the results panel
      // opens/closes or the device rotates — observe it directly.
      const resizeObserver = new ResizeObserver(() => {
        map.resize()
        // Re-frame a just-issued fit against the size the map actually ended up
        // with. Re-issued with the same easing so it reads as one camera move,
        // not a jump partway through.
        const points = refitPointsRef.current
        if (!points) return
        const bounds = boundsForPoints(points, SEARCH_VIEW_MILES)
        if (bounds) map.fitBounds(bounds, { padding: FIT_PADDING_PX, duration: 1500 })
      })
      resizeObserver.observe(containerRef.current)

      // A polygon or custom CSV list restored from the URL takes precedence
      // over geolocation — don't scroll the user away from the area their link
      // points at. The committed-camera guard covers the rest: geolocation can
      // resolve seconds late (8s timeout), after a paste or search has already
      // framed the view, and must not yank the user away from it.
      const restoredPolygon = polygon
      let pendingGeo: [number, number] | null = null
      if (navigator.geolocation && !restoredPolygon && restoredCustomPoints.length === 0) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cameraCommittedRef.current) return
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
        // One opening frame for everything the session starts with: a restored
        // polygon ring, restored CSV destinations, and any list pasted while
        // the map was still loading — their union, so a link carrying both a
        // polygon and a CSV shows the whole analysis area. Geolocation is only
        // the fallback when none of these exist.
        const corners: [number, number][] = []
        if (restoredPolygon) {
          const ring = restoredPolygon.coordinates[0] ?? []
          if (ring.length >= 3) for (const [lng, lat] of ring) corners.push([lng, lat])
        }
        const pastedEarly = pendingFitPointsRef.current ?? []
        pendingFitPointsRef.current = null
        const pointBounds = boundsForPoints(
          [...restoredCustomPoints, ...pastedEarly],
          SEARCH_VIEW_MILES,
        )
        if (pointBounds) corners.push(...pointBounds)
        if (corners.length > 0) {
          cameraCommittedRef.current = true
          const bounds = corners.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(corners[0], corners[0]),
          )
          // Pull back one zoom level from the tight fit so the whole area
          // clears the viewport with margin — a snug fit can clip vertices
          // behind the controls drawer or browser chrome on small screens.
          const camera = map.cameraForBounds(bounds, { padding: 60 })
          if (camera?.zoom !== undefined) {
            map.jumpTo({ center: camera.center, zoom: camera.zoom - 1 })
          } else {
            map.fitBounds(bounds, { padding: 60, duration: 0 })
          }
        } else if (pendingGeo) {
          map.flyTo({ center: pendingGeo, zoom: 9 })
        }

        enhanceBasemap(map)

        // The polygon is always editable — clicks add points, vertices drag,
        // midpoints insert. A restored polygon hydrates the same points array
        // so a shared link is immediately adjustable too.
        if (restoredPolygon) {
          ptsRef.current = ringToPts(restoredPolygon)
          onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
        }
        map.getCanvas().style.cursor = 'crosshair'

        // ── Wildfire overlay (NIFC) ────────────────────────────────────
        // Added before draw/results so the red perimeters sit beneath the
        // drawing UI and result markers. Data is populated on demand by the
        // showWildfires effect; the layers render nothing until then.
        map.addSource('wildfires', { type: 'geojson', data: emptyFC as FeatureCollection })
        map.addLayer({
          id: 'wildfire-fill',
          type: 'fill',
          source: 'wildfires',
          paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.3 },
        })
        map.addLayer({
          id: 'wildfire-outline',
          type: 'line',
          source: 'wildfires',
          paint: { 'line-color': '#b91c1c', 'line-width': 1.5, 'line-opacity': 0.9 },
        })

        // NIFC map link, centered where the cursor/click sits on the fire (which
        // is inside its perimeter). Zoom is clamped so a fire clicked from a
        // zoomed-out view still opens framed rather than tiny, then nudged one
        // level closer so the fire fills more of the NIFC map.
        function fireLink(e: maplibregl.MapLayerMouseEvent) {
          return nifcFireUrl(e.lngLat.lng, e.lngLat.lat, Math.max(map.getZoom(), 10) + 1)
        }

        // Hover (desktop) surfaces the fire's stats. The popup is updated in
        // place as the cursor moves so it tracks smoothly across overlapping
        // perimeters instead of flickering.
        function showFirePopup(e: maplibregl.MapLayerMouseEvent) {
          const props = e.features?.[0]?.properties
          if (!props) return
          const html = wildfirePopupHtml(props as WildfireProps, fireLink(e))
          if (firePopupRef.current) {
            firePopupRef.current.setLngLat(e.lngLat).setHTML(html)
          } else {
            firePopupRef.current = new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map)
          }
        }
        map.on('mouseenter', 'wildfire-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          showFirePopup(e)
        })
        map.on('mousemove', 'wildfire-fill', showFirePopup)
        map.on('mouseleave', 'wildfire-fill', () => {
          map.getCanvas().style.cursor = 'crosshair'
          firePopupRef.current?.remove()
          firePopupRef.current = null
        })
        // Clicking (or tapping) a fire opens NIFC's live map centered on that
        // fire in a new tab. 'wildfire-fill' is in the general click handler's
        // blocked list below, so this fires instead of dropping a polygon point.
        // The hover popup carries the same link for pointer users.
        map.on('click', 'wildfire-fill', (e) => {
          window.open(fireLink(e), '_blank', 'noopener,noreferrer')
        })

        // ── Draw source + layers ───────────────────────────────────────
        map.addSource('draw', {
          type: 'geojson',
          data: (ptsRef.current.length > 0
            ? makeDrawData(ptsRef.current)
            : emptyFC) as FeatureCollection,
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
        map.addSource('results', { type: 'geojson', data: emptyFC as FeatureCollection })

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

        // ── Pending custom destinations ────────────────────────────────
        // A pasted CSV row or searched place not yet in the displayed analysis:
        // a neutral bluebird-blue dot so the point never vanishes, no forecast
        // popup yet. Absent from the blocked-click list on purpose — a pending
        // dot must never swallow a polygon click while you draw around a
        // just-added spot; it starts blocking (opening a popup) once it ranks in.
        map.addSource('pending-destinations', {
          type: 'geojson',
          data: emptyFC as FeatureCollection,
        })
        map.addLayer({
          id: 'pending-destinations-circles',
          type: 'circle',
          source: 'pending-destinations',
          paint: {
            'circle-radius': 10,
            'circle-color': '#3b82f6',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.9,
          },
        })
        map.addLayer({
          id: 'pending-destinations-labels',
          type: 'symbol',
          source: 'pending-destinations',
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

        // ── Commit the ring to React state ─────────────────────────────
        // Called at every discrete edit (point add, drag end, midpoint
        // insert, vertex delete) — never during pointermove — so App can
        // live-sync the URL without thrashing replaceState mid-drag.
        // Under 3 points there's no polygon yet, so commit null.
        function commitRing() {
          const pts = ptsRef.current
          onDrawUpdate(pts.length, bboxAreaKm2(pts))
          onPolygonChange(
            pts.length >= 3 ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : null,
          )
        }

        // ── Shared vertex drag ─────────────────────────────────────────
        // Called from both the vertex mousedown and midpoint mousedown handlers.
        function startVertexDrag(vertexIdx: number) {
          draggingVertexRef.current = vertexIdx
          map.dragPan.disable()
          map.getCanvas().style.cursor = 'grabbing'

          const canvas = map.getCanvas()

          function moveTo(clientX: number, clientY: number) {
            const i = draggingVertexRef.current
            if (i === null) return
            const rect = canvas.getBoundingClientRect()
            const lngLat = map.unproject([clientX - rect.left, clientY - rect.top])
            ptsRef.current = ptsRef.current.map((p, j) =>
              j === i ? ([lngLat.lng, lngLat.lat] as [number, number]) : p,
            )
            setSource(map, 'draw', makeDrawData(ptsRef.current))
          }

          function onMouseMove(me: MouseEvent) {
            moveTo(me.clientX, me.clientY)
          }

          // Touch drag: track the single active finger and preventDefault so the
          // browser doesn't scroll/zoom the page while dragging the vertex.
          function onTouchMove(te: TouchEvent) {
            if (te.touches.length !== 1) return
            te.preventDefault()
            moveTo(te.touches[0].clientX, te.touches[0].clientY)
          }

          function onUp() {
            draggingVertexRef.current = null
            map.dragPan.enable()
            map.getCanvas().style.cursor = 'crosshair'
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

        // ── Vertex: mousedown / touchstart starts drag ─────────────────
        // MapLibre doesn't synthesize mouse events from touches, so touch needs
        // its own handler. preventDefault stops the map's pan handler starting.
        map.on('mousedown', 'draw-vertices', (e) => {
          e.preventDefault() // prevents MapLibre's DragPanHandler from starting
          startVertexDrag(Number(e.features?.[0]?.properties?.index))
        })
        map.on('touchstart', 'draw-vertices', (e) => {
          e.preventDefault()
          startVertexDrag(Number(e.features?.[0]?.properties?.index))
        })

        // ── Vertex: click (mouse didn't move) → delete popup ───────────
        map.on('click', 'draw-vertices', (e) => {
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
                commitRing()
                popup.remove()
                vertexPopupRef.current = null
              })
          }, 0)
        })

        map.on('mouseenter', 'draw-vertices', () => {
          map.getCanvas().style.cursor = 'grab'
        })
        map.on('mouseleave', 'draw-vertices', () => {
          if (draggingVertexRef.current === null) map.getCanvas().style.cursor = 'crosshair'
        })

        // ── Midpoint: mousedown / touchstart inserts vertex then drags ─
        function startMidpointDrag(e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) {
          e.preventDefault()
          const segIdx = Number(e.features?.[0]?.properties?.segment)
          const newPt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          ptsRef.current = [
            ...ptsRef.current.slice(0, segIdx + 1),
            newPt,
            ...ptsRef.current.slice(segIdx + 1),
          ]
          setSource(map, 'draw', makeDrawData(ptsRef.current))
          commitRing()
          startVertexDrag(segIdx + 1)
        }
        map.on('mousedown', 'draw-midpoints', (e) => {
          startMidpointDrag(e)
        })
        map.on('touchstart', 'draw-midpoints', (e) => {
          startMidpointDrag(e)
        })

        map.on('mouseenter', 'draw-midpoints', () => {
          map.getCanvas().style.cursor = 'grab'
        })
        map.on('mouseleave', 'draw-midpoints', () => {
          if (draggingVertexRef.current === null) map.getCanvas().style.cursor = 'crosshair'
        })

        // ── Results & searched destinations: popup + cursor ────────────
        // Both layers share one handler — a searched destination opens the same
        // forecast popup as a ranked result (its feature just carries an empty
        // rank, so the popup title drops the "#N").
        const openResultPopup = (e: maplibregl.MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (!f?.properties) return
          const p = f.properties
          // Anchor the popup at the rendered geometry, but take the exact
          // coordinates from properties for the readout and the fireKey lookup —
          // a clicked feature's geometry is snapped to the tile grid, so it won't
          // reliably match the warning map keyed on exact coordinates.
          const anchor = (f.geometry as Point).coordinates as [number, number]
          const lon = p.lon as number
          const lat = p.lat as number
          // Track this popup in the same ref focusResult uses so only one result
          // popup is ever open. Marker→marker already dismisses via the map's
          // closeOnClick, but a table-name click (focusResult) fires no map click,
          // so without a shared ref the marker popup would linger beside it.
          resultPopupRef.current?.remove()
          resultPopupRef.current = new maplibregl.Popup({ maxWidth: '240px' })
            .setLngLat(anchor)
            .setHTML(
              resultPopupHtml({
                rank: p.rank,
                name: p.name,
                type: p.type,
                osmId: p.osm_id ?? null,
                elevationFt: p.elevation_ft ?? null,
                precipTotalIn: p.precip,
                windAvgMph: p.wind_avg,
                tempAvgF: p.temp_avg,
                aqiAvg: p.aqi_avg ?? null,
                aqiMax: p.aqi_max ?? null,
                longitude: lon,
                latitude: lat,
                warning: fireWarningsRef.current.get(fireKey(lat, lon)) ?? null,
              }),
            )
            .addTo(map)
        }
        const showPointer = () => {
          map.getCanvas().style.cursor = 'pointer'
        }
        const showCrosshair = () => {
          map.getCanvas().style.cursor = 'crosshair'
        }
        for (const layer of ['results-circles']) {
          map.on('click', layer, openResultPopup)
          map.on('mouseenter', layer, showPointer)
          map.on('mouseleave', layer, showCrosshair)
        }

        // ── General click → add new polygon point ──────────────────────
        map.on('click', (e) => {
          const blocked = map.queryRenderedFeatures(e.point, {
            layers: [
              'results-circles',
              'draw-vertices',
              'draw-midpoints',
              'wildfire-fill',
            ],
          })
          if (blocked.length > 0) return

          const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          ptsRef.current = [...ptsRef.current, pt]
          setSource(map, 'draw', makeDrawData(ptsRef.current))
          commitRing()
        })

        if (pendingResultsRef.current.length > 0) {
          updateResults(map, pendingResultsRef.current, pendingSortByRef.current)
          pendingResultsRef.current = []
        }
        if (pendingSearchRef.current) {
          map.fitBounds(boundsAround(pendingSearchRef.current, SEARCH_VIEW_MILES), {
            padding: 40,
            duration: 1500,
          })
          pendingSearchRef.current = null
        }

        // All sources/layers exist now — let the wildfire effect run (and enable
        // the overlay if a restored `fires=1` link had it on).
        setMapReady(true)
      })

      return () => {
        loadedRef.current = false
        vertexPopupRef.current = null
        resizeObserver.disconnect()
        if (refitTimerRef.current) clearTimeout(refitTimerRef.current)
        map.remove()
        mapRef.current = null
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (!mapRef.current || !loadedRef.current) {
        pendingResultsRef.current = results
        pendingSortByRef.current = sortBy
        return
      }
      pendingResultsRef.current = []
      updateResults(mapRef.current, results, sortBy)
    }, [results, sortBy])

    // Keep the ref current so the once-registered marker-click popup reads live
    // fire warnings (they arrive asynchronously, after a result set renders).
    useEffect(() => {
      fireWarningsRef.current = fireWarnings
    }, [fireWarnings])

    // Neutral blue dot per custom destination not yet in the displayed analysis.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return
      setSource(map, 'pending-destinations', pendingFC(pending))
    }, [pending, mapReady])

    // Filter the basemap peak layer by the elevation knobs so the mountains
    // shown on the map track the band an analysis would consider. Runs on every
    // knob change and once the layer exists (mapReady) so a restored min/max
    // link applies on load too.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady || !map.getLayer('ofm-peaks')) return
      map.setFilter('ofm-peaks', peakElevationFilter(minElevationFt, maxElevationFt))
    }, [minElevationFt, maxElevationFt, mapReady])

    // Toggle the NIFC wildfire overlay. On: fetch perimeters for the current
    // viewport and re-fetch (debounced) as the user pans/zooms. Off: clear it.
    // Best-effort — a failed fetch just leaves the overlay empty and never
    // disrupts the map or an analysis. Depends on mapReady so a restored
    // `fires=1` link enables it the moment the sources/layers exist.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return

      if (!showWildfires) {
        setSource(map, 'wildfires', emptyFC)
        firePopupRef.current?.remove()
        firePopupRef.current = null
        return
      }

      let disposed = false

      async function refresh() {
        if (!map) return
        fireAbortRef.current?.abort()
        const ac = new AbortController()
        fireAbortRef.current = ac
        const b = map.getBounds()
        const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
        // The server's coarse copy is simplified to ~56 m. Ask for it whenever
        // that is finer than two screen pixels of longitude, which is every
        // view wide enough to show a whole fire, and take the full-resolution
        // shapes only when zoomed close enough to see the difference. Same
        // trade the old per-request maxAllowableOffset made, expressed as a
        // choice between two cached copies so no zoom level costs an upstream
        // query.
        const width = map.getCanvas().clientWidth || 1
        const tol = ((b.getEast() - b.getWest()) / width) * 2
        try {
          const fc = await fetchWildfires(
            bbox,
            tol > COARSE_TOLERANCE_DEG ? 'coarse' : 'full',
            ac.signal,
          )
          if (!disposed) setSource(map, 'wildfires', fc)
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.warn('Wildfire overlay fetch failed', err)
          }
        }
      }

      let debounce: ReturnType<typeof setTimeout> | undefined
      const onMoveEnd = () => {
        clearTimeout(debounce)
        debounce = setTimeout(refresh, 400)
      }

      refresh()
      map.on('moveend', onMoveEnd)

      return () => {
        disposed = true
        clearTimeout(debounce)
        fireAbortRef.current?.abort()
        map.off('moveend', onMoveEnd)
      }
    }, [showWildfires, mapReady])

    return <div ref={containerRef} className="absolute inset-0" />
  },
)

MapView.displayName = 'MapView'
export default MapView

function updateResults(map: maplibregl.Map, results: DestinationResult[], sortBy: SortBy) {
  setSource(map, 'results', resultsFeatureCollection(results, sortBy))
}

// Minimal features for pending custom destinations — just position + name
// label. There is no forecast to color or rank by yet.
function pendingFC(pending: PendingDestination[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pending.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: { name: d.name },
    })),
  }
}
