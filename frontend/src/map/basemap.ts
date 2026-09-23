/**
 * The map's module-level helpers: the basemap patch, the canvas images, and the
 * few calls that read or drive a map without needing the component around it.
 *
 * Out of `MapView.tsx` so the component holds wiring and nothing else, and so
 * the parts that can run without WebGL can be tested. MapLibre is imported for
 * its types only, which is what lets a node test load this file: nothing here
 * constructs a map, it is handed one.
 *
 * Layer insertion order is load-bearing, and `enhanceBasemap` owns the part of
 * it that sits under the style's own labels. `basemap.test.ts` pins that order.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FilterSpecification, SymbolLayerSpecification } from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection } from 'geojson'
import { DestinationResult, SortBy } from '../types'
import { LAKE_CLASS } from '../utils/basemapPoi'
import { polygonsOf } from '../utils/drawGeometry'
import { widestPole } from '../utils/polylabel'
import { popupWidth } from '../utils/popupChrome'
import { resultsFeatureCollection } from '../utils/resultFeatures'

// OpenFreeMap's Liberty style. `coldLoad.test.ts` reads this line to check the
// entry document warms the same host.
export const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

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
export function poiLabelLayout(icon: string): SymbolLayerSpecification['layout'] {
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
export const POI_GLOW_IMAGE = 'ofm-poi-glow'
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

/**
 * The wind arrow drawn beside a result marker during playback (#121).
 *
 * Generated on a canvas for the same reason the POI glow is: the basemap sprite
 * carries no SDF icons, so nothing shipped with the style can be tinted or
 * reshaped into this, and an asset pipeline for one triangle is not worth
 * having.
 *
 * The geometry is an arrow whose tail sits at the image's centre and whose tip
 * reaches the top edge, so rotating the icon swings it around the marker rather
 * than spinning it in place. It clears the 10px marker circle with room to
 * spare, which is what keeps it off the rank digit inside.
 *
 * White with a dark outline rather than a single colour, because it lands on
 * every hue the metric ramp produces — green through red — and neither a white
 * nor a dark arrow reads on all of them alone.
 */
export const WIND_ARROW_IMAGE = 'result-wind-arrow'
const WIND_ARROW_PX = 44

export function makeArrowImage(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = WIND_ARROW_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const mid = WIND_ARROW_PX / 2
  ctx.beginPath()
  ctx.moveTo(mid, 2) // tip
  ctx.lineTo(mid - 5, 12)
  ctx.lineTo(mid - 1.5, 12)
  ctx.lineTo(mid - 1.5, mid - 2) // tail, stopping short of the marker
  ctx.lineTo(mid + 1.5, mid - 2)
  ctx.lineTo(mid + 1.5, 12)
  ctx.lineTo(mid + 5, 12)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.strokeStyle = 'rgba(15,23,42,0.85)'
  ctx.lineWidth = 1.5
  ctx.fill()
  ctx.stroke()
  return ctx.getImageData(0, 0, WIND_ARROW_PX, WIND_ARROW_PX)
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
export function lakeAnchor(
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

export const emptyFC = { type: 'FeatureCollection', features: [] }

export function setSource(map: maplibregl.Map, id: string, data: object) {
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
export function glowTwin(layer: maplibregl.SymbolLayerSpecification): maplibregl.SymbolLayerSpecification {
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

export function enhanceBasemap(map: maplibregl.Map) {
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
export function isPinning(e: { originalEvent?: MouseEvent | { shiftKey?: boolean } }): boolean {
  return Boolean((e.originalEvent as { shiftKey?: boolean } | undefined)?.shiftKey)
}

/** The width option a popup opening on this map should take. */
export function popupOptions(map: maplibregl.Map) {
  return { maxWidth: popupWidth(map.getCanvas().clientWidth) }
}

export function updateResults(
  map: maplibregl.Map,
  results: DestinationResult[],
  sortBy: SortBy,
  hourIndex: number | null,
) {
  setSource(map, 'results', resultsFeatureCollection(results, sortBy, true, hourIndex))
}
