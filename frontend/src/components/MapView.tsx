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
import type { FeatureCollection, Point, Position } from 'geojson'
import type { MapGeoJSONFeature, SymbolLayerSpecification } from 'maplibre-gl'
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
import { pointsWithinView } from '../utils/mapFraming'
import type { PendingDestination } from '../utils/customList'
import { addVertex } from '../utils/polygonEdit'
import {
  BasemapPoi,
  LAKE_CLASS,
  LAKE_LAYERS,
  POI_LAYERS,
  poiFromFeature,
  poiToPlace,
  samePoi,
} from '../utils/basemapPoi'
import { POI_ACTION_ATTR, poiPopupHtml } from '../utils/poiPopup'
import { Ring, widestPole } from '../utils/polylabel'
import { popupWidth } from '../utils/popupChrome'
import {
  COARSE_TOLERANCE_DEG,
  fetchWildfires,
  fireIdentity,
  wildfirePopupHtml,
  nifcFireUrl,
  type BBox,
  type WildfireProps,
} from '../utils/wildfires'

export interface MapViewHandle {
  framePolygon: () => void
  finishDrawing: () => GeoPolygon | null
  cancelDrawing: () => void
  flyToPlace: (place: Place) => void
  fitToPoints: (points: { latitude: number; longitude: number }[]) => void
  focusResult: (result: DestinationResult) => void
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
  // Every place the session has registered by name or by clicking the basemap.
  // The POI popup reads it to know whether the feature under the cursor is
  // already a destination, so clicking a peak twice offers the way back out
  // rather than adding it again.
  searchedPlaces: Place[]
  onAddPoi: (place: Place) => void
  onRemovePoi: (latitude: number, longitude: number) => void
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

// How long the wildfire popup survives the cursor leaving its perimeter, so
// the cursor can cross the gap and land on the NIFC link inside it. The popup
// opens flush against the hover point, so the gap is a few pixels and this is
// mostly slack for a hand that overshoots. Long enough to be reachable without
// hurrying, short enough that a popup left behind by a cursor moving on feels
// dismissed rather than stuck.
const FIRE_POPUP_GRACE_MS = 400

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

/**
 * The zoom the clickable basemap destinations start at.
 *
 * Not a coverage promise, because it cannot be: OpenMapTiles decides per
 * feature which zoom a label survives to, and it is far from uniform. Measured
 * on one tile column in the Alpine Lakes: Kachess and Cle Elum label from z10,
 * the alpine lakes not until z14, and z12–13 carry no `water_name` layer at
 * all. So this is a floor beneath the data rather than a lever on it, and
 * raising it to where any one lake appears would hide the lakes that appear
 * sooner.
 */
const POI_MINZOOM = 9

/**
 * The label treatment every clickable basemap destination wears.
 *
 * Composed by both `ofm-peaks` and `ofm-lakes` rather than spelled twice: a
 * lake and a peak are the same kind of thing to this app, one click away from
 * being the same kind of row, so they get one look. Peaks add an elevation
 * line and a prominence sort key on top of this; lakes add nothing.
 *
 * `icon-allow-overlap` keeps every marker on screen even where labels collide,
 * and `text-optional` then drops only the text, so a crowded ridge still shows
 * you where its summits are.
 */
function poiLabelLayout(icon: string): SymbolLayerSpecification['layout'] {
  return {
    'icon-image': icon,
    'icon-allow-overlap': true,
    'text-optional': true,
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'text-anchor': 'top',
    'text-offset': [0, 0.7],
    'text-max-width': 8,
  }
}

const POI_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#5c4530',
  'text-halo-color': '#f8f4ef',
  'text-halo-width': 1.4,
}

// The style's one water fill. Read for lake geometry on a click, not drawn by
// us, so a style that renamed it would cost the pole rather than the feature —
// see lakeAnchor's fallback.
const WATER_FILL_LAYER = 'water'

// The halo drawn under every clickable feature while the panel's "Specify by
// Click" section is hovered — the map's answer to the ring that section's
// neighbour puts around the search box.
//
// Generated rather than shipped, because the basemap sprite carries no SDF
// icons at all (checked: zero of them), so `icon-color` and `icon-halo-color`
// cannot tint `mountain_11` or `water_11`, and there is nothing in it shaped
// like a glow. A radial gradient on a canvas is a few lines, needs no asset
// pipeline, and lets the accent live in one place.
const POI_GLOW_IMAGE = 'ofm-poi-glow'
const POI_GLOW_PX = 48

function makeGlowImage(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = POI_GLOW_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const r = POI_GLOW_PX / 2
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r)
  // Opaque enough at the core to read over a dark lake, gone by the rim so it
  // reads as a glow rather than a disc with an edge.
  gradient.addColorStop(0, 'rgba(56, 189, 248, 0.85)')
  gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.35)')
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, POI_GLOW_PX, POI_GLOW_PX)
  return ctx.getImageData(0, 0, POI_GLOW_PX, POI_GLOW_PX)
}

// A rendered feature's polygons, each as its own ring list (outer first, holes
// after) so `widestPole` can pole them separately. Anything that is not an
// area contributes nothing.
function polygonsOf(features: MapGeoJSONFeature[]): Ring[][] {
  const out: Ring[][] = []
  for (const f of features) {
    const g = f.geometry
    const toRings = (poly: Position[][]) => poly.map((r) => r.map((p) => [p[0], p[1]] as [number, number]))
    if (g.type === 'Polygon') out.push(toRings(g.coordinates))
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) out.push(toRings(poly))
  }
  return out
}

/**
 * Where a clicked lake becomes a coordinate.
 *
 * A peak is a point and answers for itself. A lake does not: OpenMapTiles
 * labels a compact lake at a point and a long one along a line, so the label
 * geometry is either an arbitrary anchor or no single place at all. Both
 * resolve to the lake's pole of inaccessibility instead — the interior point
 * furthest from any shore, which is where you would point if asked for the
 * middle of the water, and which a centroid gets wrong on any bent lake.
 *
 * Only what is currently drawn is considered, and a lake wider than the
 * viewport arrives as pieces, so this centers on the part you can see. That is
 * both the cheap answer and the one a visitor means; for a forecast it makes
 * no difference at all, since a weather grid cell is kilometers across.
 */
function lakeAnchor(
  map: maplibregl.Map,
  point: maplibregl.Point,
  fallback: [number, number],
): [number, number] {
  if (!map.getLayer(WATER_FILL_LAYER)) return fallback
  const hit = map.queryRenderedFeatures(point, { layers: [WATER_FILL_LAYER] })[0]
  if (!hit) return fallback
  // `water` carries an id, so every drawn piece of one lake can be collected
  // and poled together rather than centering on whichever tile was clicked.
  const id = hit.properties?.id
  const pieces =
    id == null
      ? [hit]
      : map.queryRenderedFeatures({
          layers: [WATER_FILL_LAYER],
          filter: ['==', ['get', 'id'], id],
        })
  return widestPole(polygonsOf(pieces)) ?? fallback
}

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
/**
 * The hidden halo layer belonging to a clickable label.
 *
 * Built from the label's own spec rather than written out three times, so a
 * POI layer cannot gain a filter, a floor or a placement that its glow does
 * not: the two would then light different features, which is worse than no
 * glow at all. It carries no text — the glow is a marker, and repeating the
 * name under the real one would just look like a rendering fault.
 *
 * `icon-ignore-placement` keeps it out of collision entirely. A halo that
 * displaced labels would make hovering the panel *remove* the names it is
 * trying to point at.
 */
function glowTwin(layer: maplibregl.SymbolLayerSpecification): maplibregl.SymbolLayerSpecification {
  const placement = layer.layout?.['symbol-placement']
  return {
    id: `${layer.id}-glow`,
    type: 'symbol',
    source: layer.source,
    'source-layer': layer['source-layer'],
    minzoom: layer.minzoom,
    // Spread rather than assigned: the peaks layer matches everything in its
    // source-layer and so carries no filter, and MapLibre rejects an explicit
    // `filter: undefined` rather than treating it as absent.
    ...(layer.filter ? { filter: layer.filter } : {}),
    layout: {
      'icon-image': POI_GLOW_IMAGE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-rotation-alignment': 'viewport',
      ...(placement ? { 'symbol-placement': placement } : {}),
      visibility: 'none',
    },
  }
}

function enhanceBasemap(map: maplibregl.Map) {
  // Slot our additions just beneath the style's first text layer so labels
  // (including the ones we add) stay on top of lines and fills.
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id

  // Registered before any layer names it; MapLibre draws nothing for an
  // unknown icon and only warns.
  const glow = makeGlowImage()
  if (glow && !map.hasImage(POI_GLOW_IMAGE)) map.addImage(POI_GLOW_IMAGE, glow)

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
  // Shared by both lake layers, which differ only in the geometry they match
  // and how a label is placed on it.
  const lakeLabel: SymbolLayerSpecification['layout'] = {
    ...poiLabelLayout('water_11'),
    'text-field': ['get', 'name'],
  }

  // Every clickable destination the basemap offers, declared rather than added
  // one call at a time, so each can be given a matching glow below without the
  // two lists drifting.
  const poiLayers: SymbolLayerSpecification[] = [
    {
      id: 'ofm-peaks',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'mountain_peak',
      minzoom: POI_MINZOOM,
      layout: {
        ...poiLabelLayout('mountain_11'),
        'text-field': [
          'case',
          ['has', 'ele_ft'],
          ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele_ft']], ' ft'],
          ['get', 'name'],
        ],
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 10],
      },
      paint: POI_LABEL_PAINT,
    },
    // Lakes: our own layer, wearing the peaks' treatment — same icon slot, same
  // type, same halo, same floor — so the two kinds of destination read as one
  // family rather than as a mountain and a piece of the basemap. The only
  // difference is the missing elevation line, and that is a data fact rather
  // than a style choice: `water_name` carries exactly two non-name fields,
  // `class` and `intermittent`, so there is no lake elevation to print.
  //
  // Line geometries are deliberately included. OpenMapTiles gives a compact
  // lake a point to label and a long one a line to bend text along, so a
  // point-only filter would have dropped exactly the lakes people recognize:
  // Lake Washington is a line. `symbol-placement` defaults to `point`, which
  // puts one upright label at the geometry's center, so both kinds get the
  // same label instead of a curved one and an upright one.
    {
      id: 'ofm-lakes',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      minzoom: POI_MINZOOM,
      filter: [
        'all',
        ['==', ['get', 'class'], LAKE_CLASS],
        ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      ],
      layout: lakeLabel,
      paint: POI_LABEL_PAINT,
    },
    // The long lakes, which arrive as a line to bend text along rather than a
  // point to anchor it to — Lake Washington is one, and around Seattle every
  // lake label is. A point-placed symbol draws nothing at all on a line
  // geometry (measured), so they need `line-center`, which puts one symbol at
  // the middle of the line.
  //
  // Three overrides then make a line-placed label look like a peak, and all
  // three were measured rather than assumed:
  //
  // - The rotation alignments. A line-placed label follows the line's angle by
  //   default, so the icon would tilt and the name run diagonally down the
  //   lake. Pinning both to the viewport gives the upright icon-over-name a
  //   peak gets, which is the whole reason for drawing these ourselves rather
  //   than leaving the style's curved italic label in place.
  // - The anchor. Line placement refuses a `top` anchor outright — not a
  //   fallback, no text at all, just the icon — so it has to be `center`.
  // - The offset, which then has to be restated for that anchor. `top` puts
  //   the text's upper edge 0.7em below the point; `center` puts its middle
  //   there, and the text is one line tall, so the same gap is 0.7 + 0.5 =
  //   1.2em. Identical spacing to a peak, arrived at from the other side.
    {
      id: 'ofm-lakes-line',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      minzoom: POI_MINZOOM,
      filter: [
        'all',
        ['==', ['get', 'class'], LAKE_CLASS],
        ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
      ],
      layout: {
        ...lakeLabel,
        'symbol-placement': 'line-center',
        'text-rotation-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'text-anchor': 'center',
        'text-offset': [0, 1.2],
      },
      paint: POI_LABEL_PAINT,
    },
  ]

  // Each label goes on with its halo underneath it: the glow is added first so
  // it lands below, and both use the same `before` so the pair stays together
  // beneath the style's own symbols.
  for (const layer of poiLayers) {
    map.addLayer(glowTwin(layer), firstSymbolId)
    map.addLayer(layer, firstSymbolId)
  }

  // The style keeps the water we do NOT draw — oceans, bays, straits, which
  // orient a coastal polygon — but loses `lake` from both of its water label
  // layers, so nothing can label a lake a second time. Relying on collision to
  // hide one of a duplicate pair would work today only because our layers are
  // inserted ahead of the style's symbols, which is insertion order doing a
  // job no one stated.
  for (const id of ['water_name_point_label', 'water_name_line_label']) {
    if (!map.getLayer(id)) continue
    // Composed onto whatever the style already filters on rather than
    // replacing it, so a style update that narrows that layer is not silently
    // undone here.
    const existing = map.getFilter(id) as FilterSpecification | undefined
    const notOurs: FilterSpecification = ['!=', ['get', 'class'], LAKE_CLASS]
    map.setFilter(id, existing ? (['all', existing, notOurs] as FilterSpecification) : notOurs)
  }
}

/**
 * Whether a click should keep the popups already open.
 *
 * One popup at a time is the right default — you are usually looking at one
 * destination — but comparing two is a real thing to want, and the map's own
 * `closeOnClick` plus a single ref made that impossible. Shift is the pinning
 * modifier here for the same reason it is in a file list: it means "and this
 * one too" everywhere else the user has met it.
 *
 * Popups opened while pinning stop being tracked in the single-popup ref, so
 * they survive until their own close button. That is deliberate: something the
 * user deliberately kept should not vanish because they clicked elsewhere.
 */
function isPinning(e: { originalEvent?: MouseEvent | { shiftKey?: boolean } }): boolean {
  return Boolean((e.originalEvent as { shiftKey?: boolean } | undefined)?.shiftKey)
}

/** The width option a popup opening on this map should take. */
function popupOptions(map: maplibregl.Map) {
  return { maxWidth: popupWidth(map.getCanvas().clientWidth) }
}

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
      fireWarnings,
      showWildfires,
      pending,
      searchedPlaces,
      onAddPoi,
      onRemovePoi,
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
    // Which fire the open popup describes, so a mousemove within that same fire
    // leaves it anchored where it is; and the pending close that gives the
    // cursor time to travel from the perimeter onto the popup.
    const hoveredFireRef = useRef<string | null>(null)
    const fireCloseTimerRef = useRef<number | null>(null)
    // The single popup opened by focusResult (table-rank click), tracked so
    // repeated clicks replace it instead of stacking popups.
    const resultPopupRef = useRef<maplibregl.Popup | null>(null)
    const fireAbortRef = useRef<AbortController | null>(null)
    // Latest fire warnings for the marker-click handler, which is registered once
    // in the load effect and would otherwise close over an empty map. focusResult
    // reads the live prop directly (its imperative handle re-runs every render).
    const fireWarningsRef = useRef(fireWarnings)
    // The same once-registered-handler problem for draw mode and the POI
    // popup: the click handlers below are installed on map load and would
    // otherwise close over the first render's values forever.
    const drawingRef = useRef(drawing)
    const searchedPlacesRef = useRef(searchedPlaces)
    const onAddPoiRef = useRef(onAddPoi)
    const onRemovePoiRef = useRef(onRemovePoi)
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
      if (map) map.getCanvas().style.cursor = drawingRef.current ? 'crosshair' : ''
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
          canvas.clientHeight,
          FIT_PADDING_PX,
        )
        if (framed) return
        const bounds = pts.reduce(
          (b, p) => b.extend(p),
          new maplibregl.LngLatBounds(pts[0], pts[0]),
        )
        cameraCommittedRef.current = true
        map.fitBounds(bounds, { padding: FIT_PADDING_PX, duration: 600, maxZoom: map.getZoom() })
      },
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
        closeAllPopups()
        resultPopupRef.current = new maplibregl.Popup(popupOptions(map))
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
      // Shift is the pinning modifier for popups (isPinning below), and
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
      // over any default framing — don't scroll the user away from the area
      // their link points at. The default camera is [ -120.5, 47.5 ], zoom 7,
      // which the geolocation control can refine to the user's location on demand.
      const restoredPolygon = polygon

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
        }

        enhanceBasemap(map)

        // A restored polygon hydrates the same points array the draw handlers
        // edit, so a shared link is adjustable the moment Edit polygon is
        // pressed. It arrives with drawing off: a link opens on a finished
        // area, not mid-gesture.
        if (restoredPolygon) {
          ptsRef.current = ringToPts(restoredPolygon)
          onDrawUpdate(ptsRef.current.length, bboxAreaKm2(ptsRef.current))
        }
        restCursor()

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

        // Hover (desktop) surfaces the fire's stats. The popup carries a link
        // to NIFC's map, so it has to be reachable, and two things used to stop
        // that: it re-anchored on every mousemove, so moving toward it moved it
        // (it opens above the cursor, and the cursor comes up from below); and
        // leaving the perimeter removed it synchronously, which is exactly what
        // reaching for it does. So it re-anchors only when the cursor crosses
        // into a *different* fire — still tracking overlapping perimeters, the
        // behavior the per-move update existed for — and a leave schedules the
        // close instead of doing it, which a hover over the popup cancels.
        function closeFirePopup() {
          fireCloseTimerRef.current = null
          hoveredFireRef.current = null
          firePopupRef.current?.remove()
          firePopupRef.current = null
        }
        function cancelFireClose() {
          if (fireCloseTimerRef.current === null) return
          clearTimeout(fireCloseTimerRef.current)
          fireCloseTimerRef.current = null
        }
        function scheduleFireClose() {
          cancelFireClose()
          fireCloseTimerRef.current = window.setTimeout(closeFirePopup, FIRE_POPUP_GRACE_MS)
        }
        function showFirePopup(e: maplibregl.MapLayerMouseEvent) {
          const props = e.features?.[0]?.properties
          if (!props) return
          const key = fireIdentity(props as WildfireProps)
          // Same fire, already open: leave it exactly where it is so it can be
          // moved onto. A pending close means the cursor re-entered the
          // perimeter without ever reaching the popup — call that a stay.
          if (firePopupRef.current && key === hoveredFireRef.current) {
            cancelFireClose()
            return
          }
          cancelFireClose()
          hoveredFireRef.current = key
          const html = wildfirePopupHtml(props as WildfireProps, fireLink(e))
          if (firePopupRef.current) {
            firePopupRef.current.setLngLat(e.lngLat).setHTML(html)
          } else {
            firePopupRef.current = new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
              .setLngLat(e.lngLat)
              .setHTML(html)
              .addTo(map)
          }
          // MapLibre leaves the popup container pointer-events:none and its
          // content auto, so the content element is the one that can be
          // hovered. setHTML replaces that element's children, not the element,
          // and addEventListener dedupes an identical listener — so re-arming
          // on every open is a no-op after the first.
          const content = firePopupRef.current
            .getElement()
            .querySelector('.maplibregl-popup-content')
          content?.addEventListener('mouseenter', cancelFireClose)
          content?.addEventListener('mouseleave', scheduleFireClose)
        }
        map.on('mouseenter', 'wildfire-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          showFirePopup(e)
        })
        map.on('mousemove', 'wildfire-fill', showFirePopup)
        map.on('mouseleave', 'wildfire-fill', () => {
          restCursor()
          scheduleFireClose()
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
        // Midpoints render below vertices so vertices are always on top.
        //
        // Both handle layers are hidden outside draw mode, and hiding them is
        // what makes the mode real rather than cosmetic: MapLibre resolves
        // layer-scoped events through queryRenderedFeatures, which skips
        // invisible layers, so a hidden handle fires no mousedown and cannot be
        // dragged. That is the accidental-vertex-move half of #118 — a 6 px hit
        // target beside a finger reaching for the map — closed at the source
        // instead of guarded at each of the four handlers.
        const handleVisibility = { visibility: drawingRef.current ? 'visible' : 'none' } as const
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
            restCursor()
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
          if (draggingVertexRef.current === null) restCursor()
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
          if (draggingVertexRef.current === null) restCursor()
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
          // rather than re-read from searchedPlacesRef after each click: that
          // ref only catches up on React's next render, and the button has to
          // flip on the click that caused it.
          let registered = searchedPlacesRef.current.find((p) => samePoi(poi, p)) ?? null

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
                    onRemovePoiRef.current(registered.lat, registered.lon)
                    registered = null
                  } else {
                    const place = poiToPlace(poi)
                    onAddPoiRef.current(place)
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
            if (drawingRef.current) return
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
            if (!drawingRef.current) showPointer()
          })
          map.on('mouseleave', layer, showCrosshair)
        }

        // ── General click → add new polygon point ──────────────────────
        // Draw mode only. Outside it a click is a pan, a POI, or a marker —
        // never a new vertex, which is what frees the gesture for #119.
        map.on('click', (e) => {
          // Clicking the map itself dismisses every popup, the same way
          // clicking another destination does. Skipped while pinning, and
          // skipped when the click landed on something that opens a popup of
          // its own — those handlers do their own clearing, and this would
          // otherwise close the card they just opened.
          if (!isPinning(e)) {
            const onPopupLayer = map.queryRenderedFeatures(e.point, {
              layers: [...POI_LAYERS, 'results-circles'].filter((id) => map.getLayer(id)),
            })
            if (onPopupLayer.length === 0) closeAllPopups()
          }
          if (!drawingRef.current) return
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
          ptsRef.current = addVertex(ptsRef.current, pt)
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
        poiPopupRef.current = null
        resizeObserver.disconnect()
        if (refitTimerRef.current) clearTimeout(refitTimerRef.current)
        if (fireCloseTimerRef.current !== null) clearTimeout(fireCloseTimerRef.current)
        firePopupRef.current = null
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

    // Same contract for the POI handler's inputs, which are likewise read by
    // listeners registered once on map load.
    useEffect(() => {
      searchedPlacesRef.current = searchedPlaces
      onAddPoiRef.current = onAddPoi
      onRemovePoiRef.current = onRemovePoi
    }, [searchedPlaces, onAddPoi, onRemovePoi])

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
      drawingRef.current = drawing
      restCursor()
      const map = mapRef.current
      if (!map || !mapReady) return
      for (const id of ['draw-vertices', 'draw-midpoints']) {
        map.setLayoutProperty(id, 'visibility', drawing ? 'visible' : 'none')
      }
      if (!drawing) {
        vertexPopupRef.current?.remove()
        vertexPopupRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawing, mapReady])

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
      const band = peakElevationFilter(minElevationFt, maxElevationFt)
      // The halo follows the band too, or hovering the panel would light
      // summits the band has already taken off the map.
      for (const id of ['ofm-peaks', 'ofm-peaks-glow']) {
        if (map.getLayer(id)) map.setFilter(id, band)
      }
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
        // Turning the overlay off outranks a pending grace close: cancel it, or
        // the timer fires later against a popup that is already gone.
        if (fireCloseTimerRef.current !== null) {
          clearTimeout(fireCloseTimerRef.current)
          fireCloseTimerRef.current = null
        }
        hoveredFireRef.current = null
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
