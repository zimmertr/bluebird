/**
 * The map's one layer order (the maintainer, 2026-11-03): every layer the app
 * adds has a slot in a ranked list, and goes in through `addLayerAt`, which
 * puts it under the first layer already on the map from a higher slot. So a
 * layer lands in its slot whenever it is added: the radar switched on last of
 * everything still goes under the smoke, and a layer added before its
 * neighbours lands right when they come. Inside a slot the layers stand in the
 * order their module adds them, each going in at the top of its slot, which
 * is what keeps a fill under its outline and a halo under its dot.
 *
 * The rule behind the order: every name sits above every raster, fill and
 * line, and the app's own markers and names stand over the basemap's, which
 * MapLibre places first in symbol collision because they are higher.
 *
 * The basemap's own layers are the ones no slot here names, and they are
 * sorted by where they stand in the style rather than by an id, since the
 * style is OpenFreeMap's: its last run of symbol layers is its labels, and
 * the rest is its ground, split where the satellite imagery goes in (record
 * 0250), so the photos cover the land and the water and stay under the
 * roads, rail, buildings and boundaries. A symbol among the ground (Liberty's
 * one-way arrows, between its roads and its bridges) is ground: sorting it
 * with the labels would put every overlay under the bridges drawn after it.
 * Record: docs/decisions/0268-one-map-layer-order.md
 */
import type * as maplibregl from 'maplibre-gl'
import { LAKE_LAYERS } from '../utils/basemapPoi'
import { LANDMARK_LAYERS } from '../utils/landmarks'
import { radarLayerId, radarOffsets } from '../utils/radar'
import { SMOKE_DENSITIES, smokeLayerId } from '../utils/smoke'
import { SNOW_LAYER_ID } from '../utils/snowDepth'

/**
 * The slots, bottom to top. `ground`, `roads` and `labels` are the
 * basemap's; every other slot is the app's.
 *
 * The relief, the slope and the contours are a slot each, because a switch
 * can turn them on in any order and each still goes over the one before. The
 * trails (`ofm-trails` and their casing, `basemap.ts`) stand over the ground
 * the terrain shades and under every overlay: a line the photos and the slope
 * bands must not cover, and no name. The labels are three slots: the contour
 * heights lowest, then the peaks and lakes `basemap.ts` adds, then the style's
 * own, which is the collision order they had before this module.
 */
export const SLOTS = [
  'ground',
  'imagery',
  'roads',
  'relief',
  'slope',
  'contours',
  'trails',
  'grid',
  'snow',
  'radar',
  'smoke',
  'closure-areas',
  'wildfires',
  'closure-trails',
  'grid-wind',
  'hotspots',
  'contour-labels',
  'poi-labels',
  'labels',
  'landmarks',
  'ring',
  'pending',
  'results',
] as const

export type Slot = (typeof SLOTS)[number]
type BasemapSlot = 'ground' | 'roads' | 'labels'
type AppSlot = Exclude<Slot, BasemapSlot>

// A clickable label and the glow `glowTwin` in `basemap.ts` puts under it.
const withGlows = (ids: readonly string[]) => ids.flatMap((id) => [`${id}-glow`, id])

/**
 * Every layer id the app adds, by slot. The ids whose home is a module under
 * `utils/` are imported; the rest are spelled here, because every module under
 * `map/` that adds a layer imports this one, and `terrain.ts` loads MapLibre
 * itself, which a module the overlays import must not. `layerOrder.test.ts`
 * holds this table to each module's exported ids, and `addLayerAt` refuses an
 * id it does not hold, so a spelling that drifts fails that module's tests.
 */
const APP_LAYERS: Readonly<Record<AppSlot, readonly string[]>> = {
  imagery: ['imagery-eox', 'imagery-usgs'],
  // The empty layer carrying Mapterhorn's credit draws nothing, and stands
  // with the ground it credits.
  relief: ['ground-credit', 'relief'],
  slope: ['slope'],
  contours: ['contours-casing', 'contours', 'contours-index'],
  trails: ['ofm-trails-casing', 'ofm-trails'],
  grid: ['forecast-grid-fill'],
  snow: [SNOW_LAYER_ID],
  radar: radarOffsets().map(radarLayerId),
  smoke: [...SMOKE_DENSITIES.map(smokeLayerId), 'smoke-outline'],
  'closure-areas': ['closure-area-fill', 'closure-area-outline'],
  wildfires: ['wildfire-fill', 'wildfire-outline'],
  'closure-trails': ['closure-trail-line', 'closure-trail-site'],
  'grid-wind': ['forecast-grid-wind'],
  hotspots: ['fire-activity-points'],
  'contour-labels': ['contours-label'],
  'poi-labels': withGlows(['ofm-peaks', ...LAKE_LAYERS]),
  landmarks: withGlows(LANDMARK_LAYERS),
  ring: ['draw-fill', 'draw-line', 'draw-midpoints', 'draw-vertices'],
  pending: ['pending-destinations-halo', 'pending-destinations-circles', 'pending-destinations-labels'],
  results: ['results-halo', 'results-circles', 'results-wind', 'results-rank', 'results-labels'],
}

const SLOT_OF: ReadonlyMap<string, AppSlot> = new Map(
  (Object.entries(APP_LAYERS) as [AppSlot, readonly string[]][]).flatMap(([slot, ids]) =>
    ids.map((id) => [id, slot] as const),
  ),
)

const RANK: ReadonlyMap<Slot, number> = new Map(SLOTS.map((slot, i) => [slot, i]))

/** The slot an app layer belongs to, or undefined for an id the table does not hold. */
export function slotOf(id: string): AppSlot | undefined {
  return SLOT_OF.get(id)
}

/** A layer in the stack, as far as this module reads it: the shape `map.getStyle()` lists. */
export interface StyleLayerRef {
  id: string
  type: string
  source?: unknown
  'source-layer'?: string
}

/** Liberty's two sources: its vector tiles and its Natural Earth relief. */
const BASEMAP_VECTOR = 'openmaptiles'
const BASEMAP_RELIEF = 'ne2_shaded'

/** The paint property that sets each kind of basemap ground layer's opacity. */
export type FadeProperty =
  | 'background-opacity'
  | 'raster-opacity'
  | 'fill-opacity'
  | 'fill-extrusion-opacity'
  | 'line-opacity'

/**
 * The opacity property of this basemap layer if it is ground the imagery
 * covers, or null where it is not.
 *
 * The ground is what a photo shows for itself: the background, the Natural
 * Earth relief, every vector fill but the road areas (land cover, land use,
 * parks, water, aeroways), the buildings in 2D and 3D, and the river lines.
 * What is not is everything a photo cannot say: roads, paths, rail,
 * boundaries, park outlines and every symbol. A layer on a source that is not
 * Liberty's (the app's overlays, the contours) is never ground.
 */
export function basemapGround(layer: StyleLayerRef): FadeProperty | null {
  if (layer.type === 'background') return 'background-opacity'
  if (layer.source === BASEMAP_RELIEF && layer.type === 'raster') return 'raster-opacity'
  if (layer.source !== BASEMAP_VECTOR) return null
  const sourceLayer = layer['source-layer']
  if (layer.type === 'fill' && sourceLayer !== 'transportation') return 'fill-opacity'
  if (layer.type === 'fill-extrusion') return 'fill-extrusion-opacity'
  if (layer.type === 'line' && sourceLayer === 'waterway') return 'line-opacity'
  return null
}

/**
 * The first layer the imagery must stay under: a road (anything on the
 * `transportation` source layer), a symbol, or a layer on a source that is
 * not the basemap's.
 */
function covers(layer: StyleLayerRef): boolean {
  if (layer.type === 'background') return false
  if (layer.type === 'symbol') return true
  if (layer.source !== BASEMAP_VECTOR && layer.source !== BASEMAP_RELIEF) return true
  return layer['source-layer'] === 'transportation'
}

/**
 * Where the imagery goes among these layers, as the index of the first one
 * over it: directly above the last ground layer under the first layer it must
 * stay under. In Liberty that is over `aeroway_fill` and under
 * `aeroway_runway`, the park outlines and the river lines among the ground
 * going under it with the fills they stand between. Liberty draws its
 * buildings over its roads, so they stand over the photos and fade with them
 * instead (`groundAbove` in `overlays/imagery.ts`).
 */
export function imageryIndex(layers: readonly StyleLayerRef[]): number {
  const end = layers.findIndex(covers)
  const under = end < 0 ? layers : layers.slice(0, end)
  let last = -1
  under.forEach((layer, i) => {
    if (basemapGround(layer) !== null) last = i
  })
  return last + 1
}

/** The slot of every layer in the stack, in the stack's order. */
export function slotsOf(layers: readonly StyleLayerRef[]): Slot[] {
  const basemap = layers.filter((layer) => !SLOT_OF.has(layer.id))
  let lastUnderLabels = -1
  basemap.forEach((layer, i) => {
    if (layer.type !== 'symbol') lastUnderLabels = i
  })
  const split = imageryIndex(basemap)
  const basemapSlot = new Map<string, BasemapSlot>(
    basemap.map((layer, i) => [layer.id, i > lastUnderLabels ? 'labels' : i < split ? 'ground' : 'roads']),
  )
  return layers.map((layer) => SLOT_OF.get(layer.id) ?? basemapSlot.get(layer.id)!)
}

/**
 * The layer a layer in `slot` goes beneath: the first in the stack from any
 * higher slot, or undefined for the top of the stack.
 */
export function beneathFor(layers: readonly StyleLayerRef[], slot: Slot): string | undefined {
  const rank = RANK.get(slot)!
  const at = slotsOf(layers).findIndex((other) => RANK.get(other)! > rank)
  return at < 0 ? undefined : layers[at].id
}

/**
 * The map's stack as it stands. Read layer by layer rather than through
 * `getStyle()`, which serializes the whole style, sources and paint included,
 * and the load adds some forty layers through here.
 */
function stackOf(map: maplibregl.Map): StyleLayerRef[] {
  return map.getLayersOrder().map((id) => {
    const layer = map.getLayer(id)
    return { id, type: layer?.type ?? '', source: layer?.source, 'source-layer': layer?.sourceLayer }
  })
}

/**
 * Add an app layer in its slot. An id the table does not hold throws in
 * development, so a new layer cannot go on unranked; in production it goes on
 * top, where every layer went before this module, rather than leave a map
 * without it.
 */
export function addLayerAt(map: maplibregl.Map, spec: maplibregl.LayerSpecification): void {
  const slot = SLOT_OF.get(spec.id)
  if (slot === undefined) {
    if (import.meta.env.DEV) throw new Error(`Map layer ${spec.id} has no slot in map/layerOrder.ts`)
    map.addLayer(spec)
    return
  }
  map.addLayer(spec, beneathFor(stackOf(map), slot))
}
