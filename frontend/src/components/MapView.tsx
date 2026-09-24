import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
// Namespace import: maplibre-gl v6 is ESM-only and no longer has a default export
import * as maplibregl from 'maplibre-gl'
// v6 resolves its web worker with a runtime-computed `new URL(...)` that Vite
// can't statically bundle, so production builds 404 the worker and silently
// render no tiles. Bundle the worker as its own entry and point maplibre at it.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
// All maplibre CSS enters through map.css, which wraps the vendor stylesheet
// in layer(base) — see the comment there before "simplifying" this to a direct
// vendor import. Importing it here rather than in index.css is what keeps map
// styling out of the text-page entries.
import '../map.css'
import { GeoPolygon, DestinationResult, SortBy } from '../types'
import { ColDef } from '../utils/tableColumns'
import { FireWarning } from '../utils/fireProximity'
import { Place, boundsAround, boundsForPoints } from '../utils/geocode'
import { POI_LAYERS, poiFromFeature } from '../utils/basemapPoi'
import { framePadding, pointsWithinView } from '../utils/mapFraming'
import { type CameraView, initialCamera } from '../utils/mapView'
import type { PendingDestination } from '../utils/customList'
// The plain-data half of this component, which is where anything testable
// belongs: Vitest has no DOM, so a helper defined here cannot be reached at all
// (#383). The `map-view-wiring` check fails a new one that lands in this file.
import { ringPolygon, ringToPts } from '../utils/drawGeometry'
import { useIsDesktop } from '../hooks/useIsDesktop'
import { createMapController, type MapInputs } from '../map/controller'
import { STYLE } from '../map/basemap'
import { addAttribution, addControls } from '../map/controls'
import { mountFeatures, type MapFeatures } from '../map/features'
import { createPopupBoard } from '../map/popups'
import { mapIdle } from '../map/idle'
import type { GridCell, GridSpec, GridStyle } from '../utils/forecastGrid'

export interface MapViewHandle {
  framePolygon: () => void
  finishDrawing: () => GeoPolygon | null
  // Replace the ring outright: null empties it (Clear), a polygon puts back
  // the one draw mode started with (Cancel, #478).
  restoreRing: (ring: GeoPolygon | null) => void
  flyToPlace: (place: Place) => void
  fitToPoints: (points: { latitude: number; longitude: number }[]) => void
  focusResult: (result: DestinationResult) => void
  // The same camera move for a destination with no forecast yet, and nothing
  // else: no popup, because the one `focusResult` opens is a forecast card and
  // this destination has no forecast. Clicking the dot still says what is
  // known about it (TJ, 2026-09-14).
  focusPoint: (at: { latitude: number; longitude: number }) => void
  // What the tutorial (#536) needs to act a map step out on its demo copy of
  // the app: where a place sits on screen, a camera move, a wait for the map to
  // settle, and where a basemap label can be clicked. Null or a no-op before
  // the map loads.
  project: (lng: number, lat: number) => { x: number; y: number } | null
  flyTo: (lng: number, lat: number, zoom: number) => void
  whenIdle: () => Promise<void>
  poiAt: (name: string, lng: number, lat: number) => { x: number; y: number } | null
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
  // Every point destination restored from the URL (CSV rows and searched
  // places), built once at mount. Like a restored polygon they are framed on
  // load, so a shared link opens on what it carries, not on the default view.
  restoredPoints: { latitude: number; longitude: number }[]
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
  // The camera a `?view=` link opened on, or null. Read once, when the map is
  // built: it wins over the opening fit to the ring, the list and the pins,
  // because it is where the person who shared the link was looking.
  restoredView: CameraView | null
  // Where each settled camera goes (`map/camera.ts`). Stable, and it writes the
  // link without rendering anything, so a pan costs no React work.
  onCameraMove: (view: CameraView, readerMove: boolean) => void
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
      restoredPoints,
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
      restoredView,
      onCameraMove,
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
    // and Clear may land first. `restoreRing` writes this, so the two paths
    // read one value and a cleared ring cannot come back (#453), while a
    // canceled one does.
    const restoredPolygonRef = useRef(polygon)
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
    // Every feature on the map, mounted on load (`map/features.ts`). Each owns
    // its sources, layers, handlers and popups, and the effects below only
    // hand them props. The ring's points stay in `ptsRef`, because they exist
    // before the map does.
    const featuresRef = useRef<MapFeatures | null>(null)
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
      onCameraMove,
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

    // Every popup on the map, pinned ones included, so an unmodified click
    // can clear them all (`map/popups.ts`).
    const [popups] = useState(createPopupBoard)
    // Flipped once the load handler has added every source/layer. A ref wouldn't
    // re-run the wildfire effect, so this is state — it lets a restored `fires=1`
    // link turn the overlay on as soon as the map is ready.
    const [mapReady, setMapReady] = useState(false)

    // Called by the load handler and nowhere else, so it reads the restored
    // ring as a Clear or a Cancel has left it.
    function frameOpening(map: maplibregl.Map) {
      // One opening frame for everything the session starts with: a restored
      // polygon ring, the restored CSV rows and searched places, and any list
      // pasted while the map was still loading — their union, so a link
      // carrying a polygon, a CSV and pins shows the whole analysis area.
      // When none of these exist, the default camera stands.
      //
      // A link's own camera wins over all of it but a list pasted while the map
      // was loading: that paste is the reader's own act, where the rest is the
      // app framing what the link carried.
      const corners: [number, number][] = []
      if (restoredPolygonRef.current && !restoredView) {
        const ring = restoredPolygonRef.current.coordinates[0] ?? []
        if (ring.length >= 3) for (const [lng, lat] of ring) corners.push([lng, lat])
      }
      const pastedEarly = pendingFitPointsRef.current ?? []
      pendingFitPointsRef.current = null
      const pointBounds = boundsForPoints(
        restoredView ? pastedEarly : [...restoredPoints, ...pastedEarly],
        SEARCH_VIEW_MILES,
      )
      if (pointBounds) corners.push(...pointBounds)
      if (corners.length > 0) {
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
      // Every edit is committed as it happens, so there is no pending ring to
      // drop: undoing one means writing the old ring back through the same
      // three places an edit reaches (the points, the drawn source, App).
      restoreRing(ring) {
        restoredPolygonRef.current = ring
        ptsRef.current = ring ? ringToPts(ring) : []
        featuresRef.current?.drawRing.closePopup()
        onDrawUpdate(ptsRef.current.length)
        onPolygonChange(ring)
        // Null before `load` and after unmount, where the ring is not on the
        // map yet and the load handler hydrates it from `restoredPolygonRef`.
        featuresRef.current?.drawRing.redraw()
      },
      // Frame a searched place. Only the camera move — the place renders
      // declaratively as a pending dot until the next Analyze ranks it.
      flyToPlace(place: Place) {
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
      focusPoint(at: { latitude: number; longitude: number }) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        map.flyTo({
          center: [at.longitude, at.latitude],
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
          // The offset `focusResult` explains below: a padding handed to flyTo
          // is interpolated onto the transform and stays there.
          offset: [0, -cameraPadBottomPx / 2],
        })
        popups.closeAll()
      },
      // Center on a result (clicked from its rank in the table) and open the
      // same popup a marker click gives.
      focusResult(result: DestinationResult) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        map.flyTo({
          center: [result.longitude, result.latitude],
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
        featuresRef.current?.results.openPopup(result)
      },
      project(lng: number, lat: number) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return null
        const at = map.project([lng, lat])
        const box = map.getCanvas().getBoundingClientRect()
        return { x: box.left + at.x, y: box.top + at.y }
      },
      flyTo(lng: number, lat: number, zoom: number) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return
        popups.closeAll()
        map.flyTo({ center: [lng, lat], zoom, duration: 1500, offset: [0, -cameraPadBottomPx / 2] })
      },
      whenIdle() {
        const map = mapRef.current
        return map ? mapIdle(map, loadedRef.current) : Promise.resolve()
      },
      // A label's hit box is decided by placement at run time, so the point
      // under its anchor is not always on it. Walks outward from the anchor
      // until a rendered query answers with the label.
      poiAt(name: string, lng: number, lat: number) {
        const map = mapRef.current
        if (!map || !loadedRef.current) return null
        const layers = POI_LAYERS.filter((id) => map.getLayer(id))
        const anchor = map.project([lng, lat])
        const box = map.getCanvas().getBoundingClientRect()
        for (let r = 0; r <= 24; r += 4) {
          for (let a = 0; a < (r === 0 ? 1 : 8); a++) {
            const x = anchor.x + r * Math.cos((a * Math.PI) / 4)
            const y = anchor.y + r * Math.sin((a * Math.PI) / 4)
            const hit = map.queryRenderedFeatures([x, y], { layers })
            const named = hit.some(
              (f) => poiFromFeature(f.layer.id, f.properties ?? {}, [lng, lat])?.name === name,
            )
            if (named) return { x: box.left + x, y: box.top + y }
          }
        }
        return null
      },
    }))

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return

      const opening = initialCamera(restoredView)
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [opening.lng, opening.lat],
        zoom: opening.zoom,
        // The library adds its own attribution unless told not to, and the
        // only way to decide `compact` is to construct the control. The effect
        // below does, at the app's own breakpoint rather than the library's
        // 640px one.
        attributionControl: false,
      })
      mapRef.current = map
      addControls(map)

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

      // A polygon, custom CSV list or searched places restored from the URL
      // take precedence over the default framing, and a link's own camera over
      // both (`initialCamera`). The default camera is `DEFAULT_CAMERA`, which
      // the geolocation control can refine to the user's location on demand.
      map.on('load', () => {
        loadedRef.current = true
        frameOpening(map)

        // A restored polygon hydrates the same points array the draw handlers
        // edit, so a shared link is adjustable the moment Edit polygon is
        // pressed. It arrives with drawing off: a link opens on a finished
        // area, not mid-gesture.
        if (restoredPolygonRef.current) {
          ptsRef.current = ringToPts(restoredPolygonRef.current)
          onDrawUpdate(ptsRef.current.length)
        }
        featuresRef.current = mountFeatures(map, {
          controller,
          popups,
          ring: ptsRef,
          onPolygonChange,
          onDrawUpdate,
        })

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
        resizeObserver.disconnect()
        if (refitTimerRef.current) clearTimeout(refitTimerRef.current)
        featuresRef.current?.wildfires.dispose()
        featuresRef.current?.smoke.dispose()
        featuresRef.current?.radar.dispose()
        featuresRef.current = null
        map.remove()
        mapRef.current = null
      }
      // Kept: the map is built once and torn down once. Listing the props the
      // setup closes over would remove and rebuild the map whenever a handler
      // identity changed, losing the camera and every layer with it.
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // The attribution at the sheet's own breakpoint rather than the library's
    // 640px: between the two the map is wide enough for the line but the
    // layout is the phone's, where the band it sits in is the one the results
    // sheet and the forecast player leave. Re-added rather than updated,
    // because `compact` is read once when the control is constructed.
    useEffect(() => {
      const map = mapRef.current
      if (!map) return
      const control = addAttribution(map, !isDesktop)
      return () => {
        if (mapRef.current === map) map.removeControl(control)
      }
    }, [isDesktop])

    // Markers, and the hour they are colored for. `playbackIndex` joins the
    // deps because a scrub is a re-render of the same rows at a different hour:
    // it sets the same source the re-rank path does, which at 1,500 points and
    // two frames a second is cheap, and which is why nothing here reaches for
    // feature-state (the arrows could not read it anyway — see resultFeatures).
    // Rows that arrive before the map loads are drawn when `mapReady` flips.
    useEffect(() => {
      if (mapReady) featuresRef.current?.results.update({ results, sortBy, playbackIndex })
    }, [results, sortBy, playbackIndex, mapReady])

    // The forecast field and its arrows, on the same contract as the markers
    // above: one redraw per scrub tick, from series the browser already holds.
    // The grid's arrows show on the rule the markers' arrows follow
    // (`windArrowsShowing`), so the two cannot disagree.
    useEffect(() => {
      if (!mapReady) return
      featuresRef.current?.grid.update({
        spec: gridSpec,
        cells: gridCells,
        style: gridStyle,
        sortBy,
        playbackIndex,
      })
    }, [gridSpec, gridCells, gridStyle, sortBy, playbackIndex, mapReady])

    // Light every clickable basemap feature while the panel points at them.
    useEffect(() => {
      if (mapReady) featuresRef.current?.pois.setPointed(pointedPois)
    }, [pointedPois, mapReady])

    // Draw mode: show or hide the editing handles, and move the cursor with
    // them. Leaving draw mode also drops any open vertex-delete popup, which
    // offers an edit the map no longer accepts.
    useEffect(() => {
      const map = mapRef.current
      // The rest cursor's rule in `map/features.ts`, read off the prop.
      if (map) map.getCanvas().style.cursor = drawing ? 'crosshair' : ''
      if (mapReady) featuresRef.current?.drawRing.setDrawing(drawing)
    }, [drawing, mapReady])

    // Neutral blue dot per custom destination not yet in the displayed analysis.
    useEffect(() => {
      if (mapReady) featuresRef.current?.results.setPending(pending)
    }, [pending, mapReady])

    // The overlay toggles. Each depends on mapReady so a restored link turns
    // its overlay on the moment the load handler has mounted it. Snow is
    // handed its prop before the radar so that, when a link turns both on at
    // once, the field goes in first and the loop lands above it.
    useEffect(() => {
      if (mapReady) featuresRef.current?.wildfires.update({ show: showWildfires })
    }, [showWildfires, mapReady])

    useEffect(() => {
      if (mapReady) featuresRef.current?.smoke.update({ show: showSmoke })
    }, [showSmoke, mapReady])

    useEffect(() => {
      if (mapReady) featuresRef.current?.snow.update({ show: showSnow })
    }, [showSnow, mapReady])

    useEffect(() => {
      if (mapReady) featuresRef.current?.radar.update({ show: showRadar, index: radarIndex })
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
