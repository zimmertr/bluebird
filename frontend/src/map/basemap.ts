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
import type { ExpressionSpecification, FilterSpecification, SymbolLayerSpecification } from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection } from 'geojson'
import { LAKE_CLASS, PLACE_CLASSES, PLACE_LAYERS } from '../utils/basemapPoi'
import { polygonsOf } from '../utils/drawGeometry'
import { widestPole } from '../utils/polylabel'

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
 * The label treatment every clickable destination marker wears.
 *
 * Composed by the peaks, the lakes and the trailhead and crag markers
 * (`map/landmarks.ts`) rather than spelled for each: they are the same kind
 * of thing to this app, one click away from being the same kind of row, so
 * they get one look. Peaks add an elevation line and a prominence sort key on
 * top of this; the others add their name alone.
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

export const POI_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#5c4530',
  'text-halo-color': '#f8f4ef',
  'text-halo-width': 1.4,
}

// The disc a clickable settlement wears from POI_MINZOOM (see townMarker).
const TOWN_ICON = 'town_hall_11'

// The style's own settlement dot, which every Liberty settlement layer that
// draws an icon draws below zoom 9 (read 2026-10-15). Spelled because the
// style's `icon-image` is a zoom step and cannot be nested in townMarker's.
const STYLE_DOT = 'circle_11_black'

// The style's one water fill. Read for lake geometry on a click, not drawn by
// us, so a style that renamed it would cost the pole rather than the feature —
// see lakeAnchor's fallback.
const WATER_FILL_LAYER = 'water'

// The `poi` class the tiles give every climbing point, a crag and a single
// route alike, since they drop OSM's `climbing=` subtype. Filtered off the
// style's own labels so routes stay hidden, the maintainer's choice on
// 2026-10-16 (#734).
const STYLE_CLIMBING_CLASS = 'climbing'

// The halo drawn under every clickable feature while the panel's Map search
// group is hovered, beside the ring that group puts around the search box.
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

// The climbing icon (#715): a rock face with a climber cut out of it, which
// the maintainer picked on 2026-10-15 from nine drawn in the sprite's own disc.
// The sprite has no climbing glyph, so climbing wore the generic stroked
// circle until then. Drawn here like the glow rather than shipped as a file,
// at the sprite's @2x size so it stands at the same 17px as `mountain_11`.
// The crag markers wear it (`map/landmarks.ts`, #734).
export const CLIMBING_IMAGE = 'ofm-climbing-icon'
const CLIMBING_ICON_PX = 34

// The trailhead icon (#734): a roofed signboard on two legs, the kiosk a
// trailhead stands at, which the maintainer picked on 2026-10-16. The sprite
// has no trailhead glyph either, so it is drawn like the climber, in the same
// disc at the same size.
export const TRAILHEAD_IMAGE = 'ofm-trailhead-icon'

// The sprite's disc icons, read off `mountain_11` and `water_11` at @2x on
// 2026-10-15: a white disc, a grey ring a pixel wide, and the brown the lake
// and town glyphs are filled with. The climber is cut out in the disc's white.
const SPRITE_DISC = '#ffffff'
const SPRITE_RING = '#bbbbbb'
const SPRITE_GLYPH = '#725a50'

// On the 34-unit grid, scaled to 0.8 about the centre, which is the share of
// the disc the sprite's own glyphs take.
const CLIMBING_ROCK = 'M7,28 L7.6,14 L10.6,7.8 L16.8,5.6 L23.2,6.8 L26.8,11.6 L27,28 Z'
const CLIMBER_LIMBS =
  'M17,12.6 L15.8,19.4 M16.8,14 L21.6,10.2 M16.8,14 L12.4,16.6 M15.8,19.4 L21,21.4 L21.6,25.6 M15.8,19.4 L12.6,23.4 L12.6,27'

function makeClimbingImage(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CLIMBING_ICON_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const c = CLIMBING_ICON_PX / 2
  ctx.beginPath()
  ctx.arc(c, c, c - 0.5, 0, Math.PI * 2)
  ctx.fillStyle = SPRITE_DISC
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = SPRITE_RING
  ctx.stroke()

  ctx.translate(c, c)
  ctx.scale(0.8, 0.8)
  ctx.translate(-c, -c)
  ctx.fillStyle = SPRITE_GLYPH
  ctx.fill(new Path2D(CLIMBING_ROCK))

  // The climber sits low enough that its head clears the rock's top edge.
  ctx.translate(-0.5, 2.2)
  ctx.fillStyle = SPRITE_DISC
  ctx.beginPath()
  ctx.arc(17.5, 9.4, 2.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = SPRITE_DISC
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(CLIMBER_LIMBS))
  return ctx.getImageData(0, 0, CLIMBING_ICON_PX, CLIMBING_ICON_PX)
}

function makeTrailheadImage(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CLIMBING_ICON_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const c = CLIMBING_ICON_PX / 2
  ctx.beginPath()
  ctx.arc(c, c, c - 0.5, 0, Math.PI * 2)
  ctx.fillStyle = SPRITE_DISC
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = SPRITE_RING
  ctx.stroke()

  // The climber's grid and scale, so the two glyphs fill their discs alike.
  ctx.translate(c, c)
  ctx.scale(0.8, 0.8)
  ctx.translate(-c, -c)
  ctx.fillStyle = SPRITE_GLYPH
  ctx.beginPath()
  ctx.moveTo(6, 11)
  ctx.lineTo(17, 5)
  ctx.lineTo(28, 11)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(8, 11, 18, 10)
  ctx.strokeStyle = SPRITE_GLYPH
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(11, 21)
  ctx.lineTo(11, 30)
  ctx.moveTo(23, 21)
  ctx.lineTo(23, 30)
  ctx.stroke()
  return ctx.getImageData(0, 0, CLIMBING_ICON_PX, CLIMBING_ICON_PX)
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
    // Spread rather than assigned: a label with no filter must give its twin
    // none, and MapLibre rejects an explicit `filter: undefined` rather than
    // treating it as absent.
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

/**
 * The disc a clickable settlement wears from `POI_MINZOOM` up (#710).
 *
 * The style draws a small dot under a town only below zoom 10 (below 9 for a
 * city) and then the name alone, so a clickable town had nothing marking it
 * the way a peak's disc does (the maintainer, 2026-10-15, on Issaquah). From
 * zoom 9 the place wears the sprite's `town_hall_11` on its point with the
 * name under it, anchored like a peak, in the style's own font, size and
 * colour, so a bigger place still reads bigger. `town_hall_11` is the one
 * settlement glyph in the sprite's disc family; the style also uses it for
 * real town hall buildings from zoom 15, which the maintainer accepted. On
 * `label_other` only a hamlet gets the disc, never a suburb or an island.
 *
 * MapLibre takes `zoom` only as the input of a top-level `step` or
 * `interpolate`, so the style's own value cannot be nested inside this step:
 * each property is the whole step, with the style's value below 9. The icon
 * size, the anchor and the offset are plain values in the style and are read
 * off the layer; its icon is itself a zoom step, so its value below 9 is
 * spelled, `STYLE_DOT`. A layer whose other three are not plain values is
 * left as the style draws it, and so is one with no point to anchor to.
 */
export function townMarker(
  layer: maplibregl.SymbolLayerSpecification,
): Record<'icon-image' | 'icon-size' | 'text-anchor' | 'text-offset', ExpressionSpecification> | null {
  const own = layer.layout ?? {}
  const size = own['icon-size'] ?? 1
  const anchor = own['text-anchor'] ?? 'center'
  const offset = own['text-offset'] ?? [0, 0]
  const plainOffset = Array.isArray(offset) && offset.length === 2 && offset.every((n) => typeof n === 'number')
  if (typeof size !== 'number' || typeof anchor !== 'string' || !plainOffset) return null
  if (own['symbol-placement'] !== undefined && own['symbol-placement'] !== 'point') return null
  const styleIcon = own['icon-image']
  const icon = styleIcon === undefined ? '' : typeof styleIcon === 'string' ? styleIcon : STYLE_DOT
  const peak = poiLabelLayout(TOWN_ICON)!
  // A hamlet on `label_other` gets the disc and its other places keep the
  // style's own look at every zoom.
  const settled = (disc: unknown, mine: unknown) =>
    layer.id === 'label_other' ? ['match', ['get', 'class'], 'hamlet', disc, mine] : disc
  const step = (mine: unknown, disc: unknown) =>
    ['step', ['zoom'], mine, POI_MINZOOM, settled(disc, mine)] as ExpressionSpecification
  return {
    'icon-image': step(icon, TOWN_ICON),
    'icon-size': step(size, 1),
    'text-anchor': step(anchor, peak['text-anchor']),
    'text-offset': step(['literal', offset], ['literal', peak['text-offset']]),
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
  // The trailhead and crag markers' icons, registered here for the layers
  // `map/landmarks.ts` adds next. With no 2D canvas neither is registered,
  // and those layers wear the sprite's stroked circle instead.
  const climbingIcon = makeClimbingImage()
  if (climbingIcon && !map.hasImage(CLIMBING_IMAGE)) {
    map.addImage(CLIMBING_IMAGE, climbingIcon, { pixelRatio: 2 })
  }
  const trailheadIcon = makeTrailheadImage()
  if (trailheadIcon && !map.hasImage(TRAILHEAD_IMAGE)) {
    map.addImage(TRAILHEAD_IMAGE, trailheadIcon, { pixelRatio: 2 })
  }

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

  // Every clickable destination layer of our own, declared rather than added
  // one call at a time, so each can be given a matching glow below without the
  // two lists drifting. The style's place labels are clickable too, and get
  // their glow further down.
  const poiLayers: SymbolLayerSpecification[] = [
    {
      id: 'ofm-peaks',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'mountain_peak',
      minzoom: POI_MINZOOM,
      // Only what a click can add: a feature needs a name, or an elevation to
      // be called `Peak 2562`. The layer also carries cliffs and ridges as
      // lines, and most cliffs have neither, so without this they drew as
      // peaks that did nothing when clicked: 25 of the 35 features in the two
      // tiles over Index, 14/2658/5707 and 14/2659/5707 (2026-10-16).
      filter: ['any', ['has', 'name'], ['has', 'ele_ft']],
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

  // The style's own place labels (#710) are clicked where the style draws
  // them, so each gets a halo directly beneath it and, from POI_MINZOOM, a
  // disc on its point (`townMarker`), but no label of ours. An id this style
  // does not carry is skipped. The halo lights only the classes a click
  // takes, which matters on `label_other`: it labels hamlets, and also
  // suburbs, neighbourhoods and islands the click refuses.
  const styleLayers = map.getStyle().layers ?? []
  for (const id of PLACE_LAYERS) {
    const spec = styleLayers.find((l) => l.id === id)
    if (spec?.type !== 'symbol' || !map.getLayer(id)) continue
    const settlements: FilterSpecification = ['match', ['get', 'class'], [...PLACE_CLASSES], true, false]
    const filter = spec.filter
      ? (['all', spec.filter, settlements] as FilterSpecification)
      : settlements
    map.addLayer({ ...glowTwin(spec), filter }, id)
    const marker = townMarker(spec)
    if (marker) {
      for (const key of Object.keys(marker) as (keyof typeof marker)[]) map.setLayoutProperty(id, key, marker[key])
    }
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

  // The style's own `poi` labels lose climbing, which would otherwise label
  // every route from z15 with no icon: the maintainer keeps routes off the
  // map, and the crags are the landmark markers' (`map/landmarks.ts`, #734).
  for (const id of ['poi_r1', 'poi_r7', 'poi_r20']) {
    if (!map.getLayer(id)) continue
    const existing = map.getFilter(id) as FilterSpecification | undefined
    const notOurs: FilterSpecification = ['!=', ['get', 'class'], STYLE_CLIMBING_CLASS]
    map.setFilter(id, existing ? (['all', existing, notOurs] as FilterSpecification) : notOurs)
  }
}
