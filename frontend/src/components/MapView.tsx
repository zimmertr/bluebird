import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
// Namespace import: maplibre-gl v6 is ESM-only and no longer has a default export
import * as maplibregl from 'maplibre-gl'
// v6 resolves its web worker with a runtime-computed `new URL(...)` that Vite
// can't statically bundle, so production builds 404 the worker and silently
// render no tiles. Bundle the worker as its own entry and point maplibre at it.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection, Point } from 'geojson'
// All maplibre CSS enters through map.css, which wraps the vendor stylesheet
// in layer(base) — see the comment there before "simplifying" this to a direct
// vendor import. Importing it here rather than in index.css is what keeps map
// styling out of the text-page entries.
import '../map.css'
import { GeoPolygon, DestinationResult, SortBy } from '../types'
import { resultPopupHtml } from '../utils/resultPopup'
import { ColDef } from '../utils/tableColumns'
import type { ModelRow } from '../utils/modelCompare'
import { FireWarning } from '../utils/fireProximity'
import { geoKey } from '../utils/points'
import { Place, boundsAround, boundsForPoints } from '../utils/geocode'
import { framePadding, pointsWithinView } from '../utils/mapFraming'
import type { PendingDestination } from '../utils/customList'
// The plain-data half of this component, which is where anything testable
// belongs: Vitest has no DOM, so a helper defined here cannot be reached at all
// (#383). `MapView.test.ts` fails a new one that lands in this file.
import { ringPolygon, ringToPts } from '../utils/drawGeometry'
import { featureRow, pendingFC } from '../utils/mapFeatures'
import {
  dismissesPopups,
  resolveMapClick,
  type MapClickHits,
} from '../utils/mapClick'
import {
  BasemapPoi,
  LAKE_LAYERS,
  POI_LAYERS,
  poiFromFeature,
  poiToPlace,
  samePoi,
} from '../utils/basemapPoi'
import { POI_ACTION_ATTR, poiPopupHtml } from '../utils/poiPopup'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { mountDrawRing, type DrawRing } from '../map/drawRing'
import { createMapController, type MapInputs } from '../map/controller'
import {
  STYLE,
  WIND_ARROW_IMAGE,
  emptyFC,
  enhanceBasemap,
  isPinning,
  lakeAnchor,
  popupOptions,
  setSource,
  updateResults,
} from '../map/basemap'
import { SMOKE_CLICK_ORDER, type SmokeProps } from '../utils/smoke'
import type { GridCell, GridSpec, GridStyle } from '../utils/forecastGrid'
import { mountForecastGrid, type ForecastGridOverlay } from '../map/overlays/forecastGrid'
import { mountRadar, type RadarOverlay } from '../map/overlays/radar'
import { mountSmoke, type SmokeOverlay } from '../map/overlays/smoke'
import { mountSnow, type SnowOverlay } from '../map/overlays/snow'
import {
  WILDFIRE_FILL_LAYER,
  fireLinkAt,
  mountWildfires,
  type WildfireOverlay,
} from '../map/overlays/wildfires'

export interface MapViewHandle {
  framePolygon: () => void
  finishDrawing: () => GeoPolygon | null
  cancelDrawing: () => void
  flyToPlace: (place: Place) => void
  fitToPoints: (points: { latitude: number; longitude: number }[]) => void
  focusResult: (result: DestinationResult) => void
  // The same camera move for a destination with no forecast yet, and nothing
  // else: no popup, because the one `focusResult` opens is a forecast card and
  // this destination has no forecast. Clicking the dot still says what is
  // known about it (TJ, 2026-09-14).
  focusPoint: (at: { latitude: number; longitude: number }) => void
}

interface Props {
  // Is the map in draw mode? The polygon used to be permanently editable, so
  // every click anywhere added a vertex and there was no gesture left over for
  // anything else — you could not pan near a handle without grabbing it, and a
  // click on a labeled peak could only ever mean "corner of a polygon" (#118).
  // Drawing is now something you enter and leave: while it is on, clicks build
  // the ring and the handles are live; while it is off, the ring is drawn but
  // has no handles to catch a pan, and clicks belong to the basemap features
  // sitting under them (#119).
  drawing: boolean
  // The panel's "Specify by Click" section is hovered: light every feature a
  // click could add, so a destination method with no control in the panel
  // still has somewhere to point. Mirrors the ring the search box gets.
  pointedPois: boolean
  polygon: GeoPolygon | null // initial ring (e.g. restored from the URL)
  // Custom CSV destinations restored from the URL, parsed once at mount. Like
  // a restored polygon they suppress geolocation and are framed on load, so a
  // shared list link opens on the list, not on the visitor's hometown.
  restoredCustomPoints: { latitude: number; longitude: number }[]
  onPolygonChange: (polygon: GeoPolygon | null) => void
  // The count alone: the ring's area is derived from the polygon in `App.tsx`,
  // so that a link's ring has one before this component has loaded (#429).
  onDrawUpdate: (count: number) => void
  results: DestinationResult[]
  sortBy: SortBy
  // What a popup's Windy links carry, matching the results table's cells: the
  // model every number came from, and the report's own hourly grid, which is
  // what turns a row's series into the HOUR behind a floor or a ceiling.
  modelId: string | null
  times: number[]
  // The results table's own resolved columns (#370). A marker popup shows what
  // the table shows, in the table's order, so it reads this list rather than
  // holding a second one: the point-sample collapse, the ranked family, the
  // Columns picker and the reader's column order all arrive with it — as does
  // the wind datum the header names (#361), baked into the labels upstream.
  popupColumns: readonly ColDef[]
  // The model name a row falls back to while one model answered every row.
  modelFallbackLabel: string | null
  // Fire-proximity warnings keyed by geoKey(lat,lon), mirroring the results
  // table — a clicked point's popup surfaces the same ⚠️ when one applies.
  fireWarnings: Map<string, FireWarning>
  showWildfires: boolean
  // The two overlays #121 adds. Radar is raster tiles fetched straight from
  // IEM; smoke is one national GeoJSON from the pod. Both are live map layers
  // rather than analysis inputs, so neither ever touches `commitNeeded`.
  showRadar: boolean
  showSmoke: boolean
  // The NOHRSC snow analysis (#446), rendered per tile by NOAA and fetched
  // straight from the browser like the radar. An observation layer like the
  // three above it, and no more a knob than they are.
  showSnow: boolean
  // Which radar frame is on screen, as an index into `radarOffsets()`. Driven
  // by the timeline; ignored entirely while the layer is off.
  radarIndex: number
  // The forecast field's lattice and its sampled cells (#246), or null/empty
  // while the layer is off. Coloured here rather than upstream, off the same
  // `sortBy`/`playbackIndex` pair the markers read, so the field and the marker
  // standing on it can never be showing different hours. `gridCells` grows as
  // the fetch fills in, so this re-renders several times per analysis.
  gridSpec: GridSpec | null
  gridCells: GridCell[]
  // Which of the two drawings the samples get. A display choice over data
  // already held, so switching costs one re-render and nothing upstream.
  gridStyle: GridStyle
  // The forecast hour the markers are colored for, or null to color them by the
  // window aggregate the ranking used. An index into `times`, which is the
  // report's own hourly grid — so a marker under the playhead and the chart's
  // playhead line are reading the same column of the same array.
  playbackIndex: number | null
  // Custom destinations — pasted CSV rows and searched places alike — not (or
  // not yet) in the displayed analysis: awaiting the next Analyze, or ranked
  // below the cutoff. Drawn as neutral blue dots so a point the user named
  // never vanishes. Analyzed ones arrive inside `results`.
  pending: PendingDestination[]
  // Every place the session has registered by name or by clicking the basemap.
  // The POI popup reads it to know whether the feature under the cursor is
  // already a destination, so clicking a peak twice offers the way back out
  // rather than adding it again.
  searchedPlaces: Place[]
  onAddPoi: (place: Place) => void
  onRemovePoi: (latitude: number, longitude: number) => void
  // How much of the container's bottom edge the results sheet stands on, which
  // every framing move below has to leave empty (#249). On a phone the map
  // keeps the whole column and the sheet is over it, so a fit measured into the
  // container alone puts its subject under the sheet; 0 on desktop, where the
  // results are docked beside the map and nothing is covered. It is the sheet's
  // RESTING lift, so a drag never re-frames the camera under the reader's hand.
  cameraPadBottomPx: number
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

const MapView = forwardRef<MapViewHandle, Props>(
  (
    {
      drawing,
      pointedPois,
      polygon,
      restoredCustomPoints,
      onPolygonChange,
      onDrawUpdate,
      results,
      sortBy,
      modelId,
      times,
      popupColumns,
      modelFallbackLabel,
      fireWarnings,
      showWildfires,
      showRadar,
      showSmoke,
      showSnow,
      radarIndex,
      gridSpec,
      gridCells,
      gridStyle,
      playbackIndex,
      pending,
      searchedPlaces,
      onAddPoi,
      onRemovePoi,
      cameraPadBottomPx,
    },
    ref,
  ) => {
    // The same predicate the results sheet uses, so the map's bottom chrome and
    // the thing it is standing clear of change shape at one width.
    const isDesktop = useIsDesktop()
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const loadedRef = useRef(false)
    const ptsRef = useRef<[number, number][]>([])
    // The ring a `?poly=` link opened with. A ref rather than a mount-time
    // snapshot because the load handler frames, hydrates and counts it long
    // after mount — behind the welcome modal MapLibre can fire `load` late —
    // and Clear may land first. `cancelDrawing` empties this, so the two paths
    // read one value and a cleared ring cannot come back (#453).
    const restoredPolygonRef = useRef(polygon)
    const pendingResultsRef = useRef<DestinationResult[]>([])
    const pendingSortByRef = useRef<SortBy>('precip_total_in')
    const pendingPlaybackRef = useRef<number | null>(null)
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
    // The drawn ring's layers, handles and drags, mounted on load. The ring's
    // points stay in `ptsRef`, because they exist before the map does.
    const drawRingRef = useRef<DrawRing | null>(null)
    // The single popup opened by focusResult (table-rank click), tracked so
    // repeated clicks replace it instead of stacking popups.
    const resultPopupRef = useRef<maplibregl.Popup | null>(null)
    // The overlays the load handler mounts. Each owns its sources, layers,
    // popups and fetches, and the toggle effects below only hand them props.
    const overlaysRef = useRef<{
      grid: ForecastGridOverlay
      smoke: SmokeOverlay
      wildfires: WildfireOverlay
      snow: SnowOverlay
      radar: RadarOverlay
    } | null>(null)
    // The props the handlers registered once on map load read at event time:
    // draw mode, the rows and Windy inputs behind a result popup, the fire
    // warnings, the POI inputs, and the sheet's share of the bottom edge for
    // the framing calls inside the mount effect. The rows ride here rather than
    // on the features because a Windy link needs the whole HOURLY SERIES behind
    // a cell, which is not something to encode into a GeoJSON property. The
    // imperative handle re-runs every render and reads the props directly.
    const inputs: MapInputs = {
      drawing,
      results,
      modelId,
      times,
      modelFallbackLabel,
      popupColumns,
      fireWarnings,
      searchedPlaces,
      onAddPoi,
      onRemovePoi,
      cameraPadBottomPx,
    }
    const [controller] = useState(() => createMapController(inputs))
    // Declared before every other effect so it runs first in a commit, and any
    // effect after it that reaches a handler sees this render's values. It runs
    // on every render rather than on a dependency list: the component is
    // memoized, so a render is already a prop change, and the write is one
    // object.
    useEffect(() => {
      controller.update(inputs)
    })

    // The single open basemap-POI popup, so a second click replaces it.
    const poiPopupRef = useRef<maplibregl.Popup | null>(null)
    // Every popup currently on the map, pinned ones included. `closeOnClick`
    // and the single refs above cannot reach a pinned popup by design — that
    // is what pinning means — so an unmodified click needs its own way to
    // clear the board. Without this, once you shift-clicked anything the only
    // way back to a clean map was closing each card by hand.
    const openPopupsRef = useRef<maplibregl.Popup[]>([])

    // Called before every popup that is not itself pinned.
    function closeAllPopups() {
      for (const popup of openPopupsRef.current) popup.remove()
      openPopupsRef.current = []
      resultPopupRef.current = null
      poiPopupRef.current = null
    }

    function trackPopup(popup: maplibregl.Popup) {
      openPopupsRef.current.push(popup)
      // MapLibre fires this for its own close button and for closeOnClick, so
      // the list drains itself rather than growing for the session.
      popup.on('close', () => {
        openPopupsRef.current = openPopupsRef.current.filter((p) => p !== popup)
      })
    }
    // Flipped once the load handler has added every source/layer. A ref wouldn't
    // re-run the wildfire effect, so this is state — it lets a restored `fires=1`
    // link turn the overlay on as soon as the map is ready.
    const [mapReady, setMapReady] = useState(false)

    // The cursor the map falls back to with nothing interactive under the
    // pointer. A crosshair means the next click places a point, so it belongs
    // to draw mode alone; outside it the default hand says the map is
    // something you move rather than something you mark.
    function restCursor() {
      const map = mapRef.current
      if (map) map.getCanvas().style.cursor = controller.inputs.drawing ? 'crosshair' : ''
    }

    useImperativeHandle(ref, () => ({
      // Bring the drawn ring back into view. Editing a polygon you cannot see
      // is the one gesture the draw/idle split made possible: you finish, pan
      // away to read the results, and then press Edit Polygon with the shape
      // off screen. Only ever pulls the camera *to* the user's own polygon,
      // and does nothing when there is no ring to frame.
      //
      // Two bounds on the move, both there to keep it from reading as a yank.
      // A ring already on screen is left alone entirely: the camera the user
      // parked at answers the question better than any recomputed one, and a
      // jolt that bought nothing is the most jarring kind. And the move never
      // tightens — `maxZoom` at the current zoom still lets a fit pull back for
      // a ring too big to show, while a pan to one merely off screen holds the
      // scale the user was reading at. The zoom change is the disorienting
      // part, not the pan.
      framePolygon() {
        const map = mapRef.current
        const pts = ptsRef.current
        if (!map || !loadedRef.current || pts.length < 3) return
        const canvas = map.getCanvas()
        const framed = pointsWithinView(
          pts.map((p) => map.project(p)),
          canvas.clientWidth,
          // The canvas the reader can see, which on a phone stops at the
          // sheet's top edge: a vertex behind the sheet is off screen as far as
          // this question is concerned, or the move that would reveal it is
          // skipped.
          canvas.clientHeight - cameraPadBottomPx,
          FIT_PADDING_PX,
        )
        if (framed) return
        const bounds = pts.reduce(
          (b, p) => b.extend(p),
          new maplibregl.LngLatBounds(pts[0], pts[0]),
        )
        cameraCommittedRef.current = true
        map.fitBounds(bounds, {
          padding: framePadding(FIT_PADDING_PX, cameraPadBottomPx),
          duration: 600,
          maxZoom: map.getZoom(),
        })
      },
      // Snapshot the current ring as a GeoPolygon. The points stay editable —
      // the user iterates by dragging vertices and clicking Analyze again.
      finishDrawing() {
        const geo = ringPolygon(ptsRef.current)
        if (geo) onPolygonChange(geo)
        return geo
      },
      cancelDrawing() {
        restoredPolygonRef.current = null
        ptsRef.current = []
        drawRingRef.current?.closePopup()
        onDrawUpdate(0)
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
        map.fitBounds(boundsAround(place, SEARCH_VIEW_MILES), {
          padding: framePadding(40, cameraPadBottomPx),
          duration: 1500,
        })
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
        map.fitBounds(bounds, {
          padding: framePadding(FIT_PADDING_PX, cameraPadBottomPx),
          duration: 1500,
        })
      },
      // Center on a result (clicked from its rank in the table) and open the
      // same popup a marker click gives. Rank is the analyzed order the markers
      // are labeled with, so the popup matches the marker it lands on.
      focusPoint(at: { latitude: number; longitude: number }) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        cameraCommittedRef.current = true
        map.flyTo({
          center: [at.longitude, at.latitude],
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
          // The offset `focusResult` explains below: a padding handed to flyTo
          // is interpolated onto the transform and stays there.
          offset: [0, -cameraPadBottomPx / 2],
        })
        closeAllPopups()
      },
      focusResult(result: DestinationResult) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        cameraCommittedRef.current = true
        const center: [number, number] = [result.longitude, result.latitude]
        map.flyTo({
          center,
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
          // The one framing call that centres rather than fits, so it clears
          // the sheet with `offset` instead of `padding`: a padding handed to
          // `flyTo` is interpolated onto the transform and STAYS there, and the
          // next `fitBounds` would then count it a second time on top of its
          // own. Half the sheet's height puts the result in the middle of the
          // map the reader can see.
          offset: [0, -cameraPadBottomPx / 2],
        })
        closeAllPopups()
        resultPopupRef.current = new maplibregl.Popup(popupOptions(map))
          .setLngLat(center)
          .setHTML(
            resultPopupHtml({
              rank: results.indexOf(result) + 1,
              row: result,
              columns: popupColumns,
              warning: fireWarnings.get(geoKey(result.latitude, result.longitude)) ?? null,
              // A per-model row names its own model; a single-model report has
              // one for every row. Same rule as the table's cells.
              modelId: (result as ModelRow).modelId ?? modelId,
              times: result.series_times ?? times,
              modelFallbackLabel,
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
        // The library adds its own attribution unless told not to, and the
        // only way to decide `compact` is to construct the control. The effect
        // below does, at the app's own breakpoint rather than the library's
        // 640px one.
        attributionControl: false,
      })
      mapRef.current = map
      // Shift is the pinning modifier for popups (`isPinning` in map/basemap.ts), and
      // MapLibre spends shift on box zoom by default — it starts a drag-zoom on
      // shift+mousedown and swallows the click that would have opened one. Box
      // zoom has no affordance and no discoverability; the scroll wheel, the
      // +/- buttons and a pinch all do the same job, so the modifier is better
      // spent on something the panel actually tells you about.
      map.boxZoom.disable()
      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      // MapLibre's own geolocate button, not a hand-rolled control: it wears
      // the same chrome as the zoom and compass buttons above it, and its
      // permission/error/busy states come with the library instead of being
      // re-implemented badly. Nothing asks for location until it is pressed.
      map.addControl(
        new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
        'top-right',
      )
      // A corner each, which is what lets both sit in the one band the map's
      // bottom chrome reserves (`TRANSPORT_GAP_PX` in `utils/resultsSheet.ts`)
      // rather than stacking into two. The scale takes the left, under the
      // legend stack; the attribution takes the right, where the library puts
      // it by default and where the OpenStreetMap guideline expects it. They
      // shared the right corner before, the scale floating above the licence
      // line, which made the pair as tall as both together.
      map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

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
        if (bounds) {
          map.fitBounds(bounds, {
            padding: framePadding(FIT_PADDING_PX, controller.inputs.cameraPadBottomPx),
            duration: 1500,
          })
        }
      })
      resizeObserver.observe(containerRef.current)

      // A polygon or custom CSV list restored from the URL takes precedence
      // over any default framing — don't scroll the user away from the area
      // their link points at. The default camera is [ -120.5, 47.5 ], zoom 7,
      // which the geolocation control can refine to the user's location on demand.
      map.on('load', () => {
        loadedRef.current = true
        // One opening frame for everything the session starts with: a restored
        // polygon ring, restored CSV destinations, and any list pasted while
        // the map was still loading — their union, so a link carrying both a
        // polygon and a CSV shows the whole analysis area. Geolocation is only
        // the fallback when none of these exist.
        const corners: [number, number][] = []
        if (restoredPolygonRef.current) {
          const ring = restoredPolygonRef.current.coordinates[0] ?? []
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
          const pad = framePadding(60, controller.inputs.cameraPadBottomPx)
          const camera = map.cameraForBounds(bounds, { padding: pad })
          if (camera?.zoom !== undefined) {
            map.jumpTo({ center: camera.center, zoom: camera.zoom - 1 })
          } else {
            map.fitBounds(bounds, { padding: pad, duration: 0 })
          }
        }

        enhanceBasemap(map)

        // A restored polygon hydrates the same points array the draw handlers
        // edit, so a shared link is adjustable the moment Edit polygon is
        // pressed. It arrives with drawing off: a link opens on a finished
        // area, not mid-gesture.
        if (restoredPolygonRef.current) {
          ptsRef.current = ringToPts(restoredPolygonRef.current)
          onDrawUpdate(ptsRef.current.length)
        }
        restCursor()

        // ── Overlays ───────────────────────────────────────────────────
        // Mounted in the order their layers stack, lowest first: the forecast
        // grid is the ground everything else is read against, then smoke,
        // then the fire perimeters, and the drawing UI and result markers go
        // on above all three below. The radar loop and the snow field are
        // created when they are switched on, beneath the first smoke fill, so
        // the chain comes out grid, snow, radar, smoke, fire, draw, results.
        overlaysRef.current = {
          grid: mountForecastGrid(map),
          smoke: mountSmoke(map, { controller, restCursor, closeAllPopups, trackPopup }),
          wildfires: mountWildfires(map, { restCursor }),
          snow: mountSnow(map),
          radar: mountRadar(map),
        }

        // ── Drawn ring ─────────────────────────────────────────────────
        // Above the overlays and below the results, so a marker is never under
        // the outline of the area it was found in.
        const drawRing = mountDrawRing(map, {
          ring: ptsRef,
          controller,
          restCursor,
          onPolygonChange,
          onDrawUpdate,
        })
        drawRingRef.current = drawRing

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
        // Wind arrows, shown only while playback is scrubbing a wind ranking.
        // On the same source as the circles, so a scrub sets one lot of GeoJSON
        // and the arrow can never be pointing at an hour the colour is not.
        // `filter: ['has','bearing']` is what makes a row with no direction —
        // the SSE fallback never fetches it — draw nothing rather than draw
        // north. (The icon itself is registered with the forecast-grid layers
        // above, which are now the first to name it.)
        map.addLayer({
          id: 'results-wind',
          type: 'symbol',
          source: 'results',
          filter: ['has', 'bearing'],
          layout: {
            'icon-image': WIND_ARROW_IMAGE,
            'icon-rotate': ['get', 'bearing'],
            // Rotate with the map, not with the screen: this is a compass
            // bearing, so it has to keep pointing at the same piece of ground
            // when the map is rotated.
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            visibility: 'none',
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
        // a neutral bluebird-forecast-blue dot so the point never vanishes, no forecast
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

        // ── Results & searched destinations: popup + cursor ────────────
        // Both layers share one handler — a searched destination opens the same
        // forecast popup as a ranked result (its feature just carries an empty
        // rank, so the popup title drops the "#N").
        const openResultPopup = (e: maplibregl.MapLayerMouseEvent) => {
          const f = e.features?.[0]
          if (!f?.properties) return
          const p = f.properties
          // Anchor the popup at the rendered geometry, but take the exact
          // coordinates from properties for the readout and the geoKey lookup —
          // a clicked feature's geometry is snapped to the tile grid, so it won't
          // reliably match the warning map keyed on exact coordinates.
          const anchor = (f.geometry as Point).coordinates as [number, number]
          const lon = p.lon as number
          const lat = p.lat as number
          // Track this popup in the same ref focusResult uses so only one result
          // popup is ever open. Marker→marker already dismisses via the map's
          // closeOnClick, but a table-name click (focusResult) fires no map click,
          // so without a shared ref the marker popup would linger beside it.
          // The row behind this marker, for the popup's Windy links. Matched on
          // the exact coordinates the feature carries for the fire lookup above
          // rather than on an index, so a source that has re-rendered since the
          // ref last updated cannot pair a popup with the wrong row.
          const live = controller.inputs
          const row = controller.resultAt(lat, lon)
          const pinned = isPinning(e)
          if (!pinned) closeAllPopups()
          // Never closeOnClick: it is fixed at construction, so an
          // already-open popup could not be told to survive the click that
          // pins a second one — the first shift-click always lost the card it
          // was meant to keep. Dismissal is ours now (closeAllPopups).
          const resultPopup = new maplibregl.Popup({
            ...popupOptions(map),
            closeOnClick: false,
          })
          if (!pinned) resultPopupRef.current = resultPopup
          trackPopup(resultPopup)
          resultPopup
            .setLngLat(anchor)
            .setHTML(
              resultPopupHtml({
                rank: p.rank,
                // The matched row is the popup's subject. The feature's own
                // properties are the fallback for the case the match cannot
                // happen — they carry no aggregates, so those columns draw the
                // dash a missing value draws anywhere else rather than a
                // number nobody fetched.
                row: row ?? featureRow(p, lat, lon),
                columns: live.popupColumns,
                warning: controller.fireWarningAt(lat, lon),
                modelId: row ? ((row as ModelRow).modelId ?? live.modelId) : live.modelId,
                times: row?.series_times ?? live.times,
                modelFallbackLabel: live.modelFallbackLabel,
              }),
            )
            .addTo(map)
        }
        const showPointer = () => {
          map.getCanvas().style.cursor = 'pointer'
        }
        const showCrosshair = () => {
          restCursor()
        }
        for (const layer of ['results-circles']) {
          map.on('click', layer, openResultPopup)
          map.on('mouseenter', layer, showPointer)
          map.on('mouseleave', layer, showCrosshair)
        }

        // ── Basemap POIs: click a labeled peak or lake to add it ────────
        // The map already draws these features from the OpenMapTiles source,
        // so the click costs no lookup — the name and elevation are in the
        // feature's own properties. Adding one registers it exactly as a
        // search by name does, which is why this needs no pipeline of its
        // own: it lands in the same list, the same URL param, and the same
        // `custom_destinations` on the next Analyze.
        function openPoiPopup(poi: BasemapPoi, pinned: boolean) {
          if (!pinned) closeAllPopups()
          const popup = new maplibregl.Popup({ ...popupOptions(map), closeOnClick: false })
            .setLngLat([poi.lon, poi.lat])
            .addTo(map)
          if (!pinned) poiPopupRef.current = popup
          trackPopup(popup)

          // Which registered place this POI is, or null. Held in the closure
          // rather than re-read from the controller after each click: that
          // only catches up on React's next render, and the button has to
          // flip on the click that caused it.
          let registered = controller.inputs.searchedPlaces.find((p) => samePoi(poi, p)) ?? null

          function render() {
            popup.setHTML(poiPopupHtml(poi, registered !== null))
            // setHTML replaces the content element's children, so the button is
            // a new node every time and its listener has to be re-armed. The
            // timeout lets MapLibre attach the markup first, matching the
            // vertex popup above.
            setTimeout(() => {
              popup
                .getElement()
                ?.querySelector<HTMLButtonElement>(`[${POI_ACTION_ATTR}]`)
                ?.addEventListener('click', () => {
                  if (registered) {
                    controller.inputs.onRemovePoi(registered.lat, registered.lon)
                    registered = null
                  } else {
                    const place = poiToPlace(poi)
                    controller.inputs.onAddPoi(place)
                    registered = place
                  }
                  render()
                })
            }, 0)
          }
          render()
        }

        for (const layer of POI_LAYERS) {
          map.on('click', layer, (e) => {
            // While drawing, these features are scenery: the click belongs to
            // the ring. They are deliberately absent from the blocked list
            // below for the same reason, so a polygon corner can land on a
            // peak label.
            if (controller.inputs.drawing) return
            // A basemap peak that has since been analyzed has a result marker
            // sitting on top of it, and both layers answer the same click —
            // which stacked two popups on one summit. The marker wins: it is
            // the newer, more specific thing, and its popup carries the
            // forecast this one could only offer to fetch. A fire perimeter
            // wins for the same reason, having already opened a tab.
            const claimed = map.queryRenderedFeatures(e.point, {
              layers: ['results-circles', 'wildfire-fill'],
            })
            if (claimed.length > 0) return
            const f = e.features?.[0]
            if (!f?.properties) return
            // A peak labels its own summit. A lake's label geometry is a tile
            // artifact — a point for a compact one, a line for a long one — so
            // it is resolved against the water itself; the click point is the
            // fallback, and it is on the lake because that is what was clicked.
            const clicked: [number, number] = [e.lngLat.lng, e.lngLat.lat]
            const anchor =
              (LAKE_LAYERS as readonly string[]).includes(layer)
                ? lakeAnchor(map, e.point, clicked)
                : f.geometry.type === 'Point'
                  ? ((f.geometry as Point).coordinates as [number, number])
                  : clicked
            const poi = poiFromFeature(layer, f.properties, anchor)
            if (poi) openPoiPopup(poi, isPinning(e))
          })
          map.on('mouseenter', layer, () => {
            if (!controller.inputs.drawing) showPointer()
          })
          map.on('mouseleave', layer, showCrosshair)
        }

        // ── General click → whatever is under it ───────────────────────
        // Every layer a click can land on, asked in one query, because the rule
        // that decides between them (`utils/mapClick.ts`) reads the whole set
        // rather than a series of answers. The draw handles are in the list so
        // that grabbing one cannot also drop a vertex; they are hidden outside
        // draw mode and MapLibre does not query a hidden layer, which is what
        // keeps a click outside that mode from being a vertex at all (#119).
        const clickLayers = [
          ...POI_LAYERS,
          'results-circles',
          ...SMOKE_CLICK_ORDER,
          WILDFIRE_FILL_LAYER,
          'draw-vertices',
          'draw-midpoints',
        ]

        map.on('click', (e) => {
          const under = map.queryRenderedFeatures(e.point, {
            layers: clickLayers.filter((id) => map.getLayer(id)),
          })
          const hitLayers = new Set(under.map((f) => f.layer.id))
          const hits: MapClickHits = {
            drawing: controller.inputs.drawing,
            pinning: isPinning(e),
            fire: hitLayers.has(WILDFIRE_FILL_LAYER),
            result: hitLayers.has('results-circles'),
            poi: POI_LAYERS.some((id) => hitLayers.has(id)),
            vertex: hitLayers.has('draw-vertices') || hitLayers.has('draw-midpoints'),
            smoke: SMOKE_CLICK_ORDER.filter((id) => hitLayers.has(id)),
          }

          if (dismissesPopups(hits)) closeAllPopups()

          const action = resolveMapClick(hits)
          if (action.kind === 'open-fire') {
            window.open(fireLinkAt(map, e.lngLat), '_blank', 'noopener,noreferrer')
            return
          }
          if (action.kind === 'add-vertex') {
            drawRing.addPoint([e.lngLat.lng, e.lngLat.lat])
            return
          }
          if (action.kind === 'open-smoke') {
            const plume = under.find((f) => f.layer.id === action.layer)
            if (plume?.properties) {
              overlaysRef.current?.smoke.openPopup(
                plume.properties as SmokeProps,
                e.lngLat,
                hits.pinning,
              )
            }
          }
        })

        if (pendingResultsRef.current.length > 0) {
          updateResults(
            map,
            pendingResultsRef.current,
            pendingSortByRef.current,
            pendingPlaybackRef.current,
          )
          pendingResultsRef.current = []
        }
        if (pendingSearchRef.current) {
          map.fitBounds(boundsAround(pendingSearchRef.current, SEARCH_VIEW_MILES), {
            padding: framePadding(40, controller.inputs.cameraPadBottomPx),
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
        drawRingRef.current = null
        poiPopupRef.current = null
        resizeObserver.disconnect()
        if (refitTimerRef.current) clearTimeout(refitTimerRef.current)
        overlaysRef.current?.wildfires.dispose()
        overlaysRef.current?.smoke.dispose()
        overlaysRef.current?.radar.dispose()
        overlaysRef.current = null
        map.remove()
        mapRef.current = null
      }
      // Kept: the map is built once and torn down once. Listing the props the
      // setup closes over would remove and rebuild the map whenever a handler
      // identity changed, losing the camera and every layer with it.
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // The attribution, collapsed behind the library's own (i) on a phone and
    // spelled out at a desk. Both are what the OpenStreetMap attribution
    // guideline allows, and which one a width gets is the sheet's own
    // breakpoint rather than the library's 640px: between the two the map is
    // wide enough for the line but the layout is the phone's, where the band
    // this sits in is the one the results sheet and the forecast player leave.
    //
    // Re-added rather than updated, because `compact` is read once when the
    // control is constructed.
    useEffect(() => {
      const map = mapRef.current
      if (!map) return
      // The library's own defaults, with only `compact` decided here: its
      // option object also carries the MapLibre credit, and constructing one
      // with a bare `{compact}` would drop that credit rather than restate it.
      const { options } = new maplibregl.AttributionControl()
      const control = new maplibregl.AttributionControl({ ...options, compact: !isDesktop })
      map.addControl(control, 'bottom-right')
      // The library adds a compact attribution OPEN and folds it on the first
      // drag (maplibre-gl 6.8, `_updateCompact` and `_updateCompactMinimize`
      // in attribution_control.ts), so until the reader moved the map the
      // whole licence line ran across the band the (i) exists to keep small.
      // Fold it on add. This is the library's own folded state: the class is
      // the one its toggle removes, and `open` stays set as its toggle leaves
      // it, so the (i) opens and closes it exactly as before.
      map.getContainer()
        .querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')
        ?.classList.remove('maplibregl-compact-show')
      return () => {
        if (mapRef.current === map) map.removeControl(control)
      }
    }, [isDesktop])

    // Markers, and the hour they are colored for. `playbackIndex` joins the
    // deps because a scrub is a re-render of the same rows at a different hour:
    // it sets the same source the re-rank path does, which at 1,500 points and
    // two frames a second is cheap, and which is why nothing here reaches for
    // feature-state (the arrows could not read it anyway — see resultFeatures).
    useEffect(() => {
      if (!mapRef.current || !loadedRef.current) {
        pendingResultsRef.current = results
        pendingSortByRef.current = sortBy
        pendingPlaybackRef.current = playbackIndex
        return
      }
      pendingResultsRef.current = []
      updateResults(mapRef.current, results, sortBy, playbackIndex)
    }, [results, sortBy, playbackIndex])

    // The forecast field and its arrows, on the same contract as the markers
    // above: one redraw per scrub tick, from series the browser already holds.
    useEffect(() => {
      if (!mapReady) return
      overlaysRef.current?.grid.update({
        spec: gridSpec,
        cells: gridCells,
        style: gridStyle,
        sortBy,
        playbackIndex,
      })
    }, [gridSpec, gridCells, gridStyle, sortBy, playbackIndex, mapReady])

    // Arrows exist only where they mean something: a wind ranking, being
    // scrubbed. On any other metric they would be a second variable nobody
    // asked about, drawn over the one they did. Both arrow layers answer to
    // this one condition, so the cells and the markers can never disagree
    // about whether wind has a direction worth drawing.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return
      const showing = playbackIndex !== null && sortBy === 'wind_avg_mph'
      for (const id of ['results-wind', 'forecast-grid-wind']) {
        map.setLayoutProperty(id, 'visibility', showing ? 'visible' : 'none')
      }
    }, [playbackIndex, sortBy, mapReady])

    // Light every clickable basemap feature while the panel points at them.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return
      for (const id of POI_LAYERS) {
        const glow = `${id}-glow`
        if (map.getLayer(glow)) {
          map.setLayoutProperty(glow, 'visibility', pointedPois ? 'visible' : 'none')
        }
      }
    }, [pointedPois, mapReady])

    // Draw mode: show or hide the editing handles, and move the cursor with
    // them. Leaving draw mode also drops any open vertex-delete popup, which
    // offers an edit the map no longer accepts.
    useEffect(() => {
      const map = mapRef.current
      // `restCursor`'s rule, read off the prop this effect runs for.
      if (map) map.getCanvas().style.cursor = drawing ? 'crosshair' : ''
      if (mapReady) drawRingRef.current?.setDrawing(drawing)
    }, [drawing, mapReady])

    // Neutral blue dot per custom destination not yet in the displayed analysis.
    useEffect(() => {
      const map = mapRef.current
      if (!map || !mapReady) return
      setSource(map, 'pending-destinations', pendingFC(pending))
    }, [pending, mapReady])

    // The overlay toggles. Each depends on mapReady so a restored link turns
    // its overlay on the moment the load handler has mounted it. Snow is
    // handed its prop before the radar so that, when a link turns both on at
    // once, the field goes in first and the loop lands above it.
    useEffect(() => {
      if (mapReady) overlaysRef.current?.wildfires.update({ show: showWildfires })
    }, [showWildfires, mapReady])

    useEffect(() => {
      if (mapReady) overlaysRef.current?.smoke.update({ show: showSmoke })
    }, [showSmoke, mapReady])

    useEffect(() => {
      if (mapReady) overlaysRef.current?.snow.update({ show: showSnow })
    }, [showSnow, mapReady])

    useEffect(() => {
      if (mapReady) overlaysRef.current?.radar.update({ show: showRadar, index: radarIndex })
    }, [showRadar, radarIndex, mapReady])

    return <div ref={containerRef} className="absolute inset-0" />
  },
)

MapView.displayName = 'MapView'

// Memoized because App.tsx re-renders on any of its 50-odd pieces of state, and
// most of them cannot change what this component draws. Measured 2026-09-14 on
// a 946-destination analysis: toggling a map overlay, which touches neither the
// ranking nor the rows, cost 311 to 392 ms of synchronous React work, because
// the table and the chart both re-rendered for it. Every function prop this
// takes is wrapped in `useCallback` at the call site or in its hook; a fresh
// identity there puts the whole cost straight back (#337, finding 8).
export default memo(MapView)
