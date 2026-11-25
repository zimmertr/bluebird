/**
 * The map's ground (record 0317): the relief leads, and Liberty's roads, towns
 * and water lie faint over it, in a look for each theme.
 *
 * The relief is two layers on one elevation source read straight from
 * Mapterhorn's tiles: a tint by height (`color-relief`), valleys darkest and
 * snow on the summits, and a hillshade over it. Both stand under every one of
 * Liberty's layers (the `tint` slot, `layerOrder.ts`), whose background goes
 * clear and whose land cover, land use and parks thin to a wash, so the
 * shape of the ground is what reads first and a road, a lake or a town name
 * is still there to find a place by. The source needs none of the contour
 * library's code, so the ground draws on the cold load without the chunk the
 * Layers rows load on their first switch (`terrain.ts`).
 *
 * The dark look reads like the ground before dawn: slate valleys, blue-grey
 * heights, pale snow, near-black water, and every label light on a dark
 * halo. The light look is the prototype's daylight one: green valleys to
 * pale summits, under Liberty's own ink. Each value is the prototype's
 * palette, `PAL` in the saved artifact (2026-11-17), spelled for MapLibre.
 *
 * Every colour and number here is this module's (`value-hex` and
 * `map-paint-named` list it as an owner).
 */
import type * as maplibregl from 'maplibre-gl'
import type { Theme } from '../utils/viewPrefs'
import { DEM_MAXZOOM, DEM_TILES } from '../utils/terrainSources'
import { addLayerAt, slotOf } from './layerOrder'

/** The ground's elevation source: Mapterhorn's tiles as they are served. */
export const GROUND_SOURCE = 'ground-dem'
/** The tint by height. */
export const GROUND_TINT_LAYER = 'ground-tint'
/** The hillshade over the tint. */
export const GROUND_SHADE_LAYER = 'ground-shade'

type Rgb = readonly [number, number, number]
const rgb = ([r, g, b]: Rgb, a = 1) => (a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`)

/**
 * Each theme's tint, as heights in metres and the colour at each. The water's
 * colour holds below sea level; the land runs from its low valleys to its
 * heights, and pales to snow over the band the prototype melts its snow line
 * across (1,700 to 2,100 m, softened there by slope and noise, which a ramp
 * cannot do, so the ramp spreads it from 1,800 to 2,300).
 */
export const GROUND_TINT: Readonly<Record<Theme, readonly (readonly [number, Rgb])[]>> = {
  dark: [
    [-1, [10, 30, 46]],
    [0, [22, 33, 41]],
    [700, [31, 42, 55]],
    [1500, [50, 61, 76]],
    [1800, [62, 74, 90]],
    [2300, [148, 168, 190]],
  ],
  light: [
    [-1, [176, 210, 236]],
    [0, [206, 221, 200]],
    [700, [231, 233, 222]],
    [1500, [224, 222, 216]],
    [1800, [232, 231, 227]],
    [2300, [253, 254, 255]],
  ],
}

/** The tint as a `color-relief-color` expression for one theme. */
export function tintColor(theme: Theme): maplibregl.ExpressionSpecification {
  return ['interpolate', ['linear'], ['elevation'], ...GROUND_TINT[theme].flatMap(([m, c]) => [m, rgb(c)])]
}

/**
 * Each theme's hillshade. The dark shadow is black at the prototype's shade
 * strength (0.62) and its light a faint cold blue, so a lit slope lifts
 * without whitening; the light shadow is the green-grey of its valleys at
 * the light strength (0.34), under a half-strength white.
 */
function shadePaint(theme: Theme): maplibregl.HillshadeLayerSpecification['paint'] {
  return theme === 'dark'
    ? {
        'hillshade-method': 'standard',
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': rgb([0, 0, 0], 0.62),
        'hillshade-highlight-color': rgb([170, 195, 220], 0.18),
        'hillshade-accent-color': rgb([0, 0, 0], 0.4),
      }
    : {
        'hillshade-method': 'standard',
        'hillshade-exaggeration': 0.4,
        'hillshade-shadow-color': rgb([70, 76, 64], 0.34),
        'hillshade-highlight-color': rgb([255, 255, 255], 0.5),
        'hillshade-accent-color': rgb([70, 76, 64], 0.34),
      }
}

/**
 * How faint each kind of Liberty's layer lies over the relief, as a share of
 * the opacity the style gave it, and the colours the dark look repaints. A
 * colour left out is Liberty's own.
 */
export const LIBERTY_LOOK = {
  dark: {
    fill: 0.12,
    road: 0.3,
    casing: 0,
    boundary: 0.3,
    // Liberty's dashed park edge is pale, and on the dark slate it read as
    // the brightest line on the map (2026-11-21).
    parkEdge: 0.1,
    water: rgb([10, 30, 46]),
    waterway: rgb([22, 53, 77]),
    roadInk: rgb([170, 195, 220]),
    building: rgb([38, 50, 63]),
    text: rgb([201, 212, 224]),
    halo: rgb([22, 33, 41]),
  },
  light: {
    fill: 0.35,
    road: 0.55,
    casing: 0.4,
    boundary: 0.5,
    parkEdge: 0.4,
    water: rgb([176, 210, 236]),
    waterway: null,
    roadInk: null,
    building: null,
    text: null,
    halo: null,
  },
} as const

/** A layer as this module reads it off the map. */
export interface GroundLayerRef {
  id: string
  type: string
  source?: unknown
  sourceLayer?: string
}

/** One paint value the ground sets on a layer, as a function of what the style gave it. */
type Setting = { property: string; value: (style: unknown) => unknown }

const BASEMAP_VECTOR = 'openmaptiles'
const BASEMAP_RELIEF = 'ne2_shaded'

/**
 * An opacity scaled to a share of the style's: a number times the share, the
 * share where the style left the default of 1, and the share flat for an
 * expression, which cannot be scaled without unpicking a zoom curve that must
 * stay at the top of the expression.
 */
export function scaled(style: unknown, share: number): number {
  return typeof style === 'number' ? style * share : share
}

/**
 * What the ground sets on one layer in one theme, or nothing for a layer it
 * leaves alone: the app's own layers (each has a slot) and every source but
 * Liberty's.
 */
export function settingsFor(layer: GroundLayerRef, theme: Theme): Setting[] {
  if (slotOf(layer.id) !== undefined) return []
  const look = LIBERTY_LOOK[theme]
  const fixed = (property: string, value: unknown): Setting => ({ property, value: () => value })
  const share = (property: string, s: number): Setting => ({ property, value: (style) => scaled(style, s) })
  const ink = (property: string, colour: string | null): Setting[] => (colour === null ? [] : [fixed(property, colour)])
  // The style's own background and Natural Earth shading are what the relief
  // replaces.
  if (layer.type === 'background') return [fixed('background-opacity', 0)]
  if (layer.source === BASEMAP_RELIEF) return [fixed('raster-opacity', 0)]
  if (layer.source !== BASEMAP_VECTOR) return []
  const sl = layer.sourceLayer
  if (layer.type === 'fill' && sl === 'water') return [fixed('fill-color', look.water)]
  if (layer.type === 'line' && sl === 'waterway') return ink('line-color', look.waterway)
  if (layer.type === 'fill' && (sl === 'landcover' || sl === 'landuse' || sl === 'park' || sl === 'aeroway')) {
    return [share('fill-opacity', look.fill)]
  }
  // Buildings fade with the imagery's own switch (`overlays/imagery.ts`), so
  // the ground repaints them and leaves their opacity to it.
  if (layer.type === 'fill' && sl === 'building') return ink('fill-color', look.building)
  if (layer.type === 'fill-extrusion') return ink('fill-extrusion-color', look.building)
  if (layer.type === 'line' && sl === 'transportation') {
    const casing = layer.id.includes('casing')
    return [share('line-opacity', casing ? look.casing : look.road), ...(casing ? [] : ink('line-color', look.roadInk))]
  }
  if (layer.type === 'line' && sl === 'boundary') return [share('line-opacity', look.boundary)]
  if (layer.type === 'line' && sl === 'park') return [share('line-opacity', look.parkEdge)]
  if (layer.type === 'symbol') return [...ink('text-color', look.text), ...ink('text-halo-color', look.halo)]
  return []
}

/**
 * The app's own labels the dark look repaints with the style's: the peaks and
 * lakes `basemap.ts` adds and the trailheads and crags `landmarks.ts` does,
 * whose brown on a white halo was drawn for Liberty's light ground.
 */
const APP_LABEL_SLOTS = new Set(['poi-labels', 'landmarks'])

export interface Ground {
  /** Paint the ground and Liberty's layers in this theme's look. */
  setTheme(theme: Theme): void
}

export function mountGround(map: maplibregl.Map, deps: { attribution: string }): Ground {
  let theme: Theme | null = null
  // Each property's value before the ground first set it, `undefined` where
  // the style left the default, so every theme computes from the style's own
  // rather than from the last theme's.
  const original = new Map<string, unknown>()

  map.addSource(GROUND_SOURCE, {
    type: 'raster-dem',
    tiles: [DEM_TILES],
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: DEM_MAXZOOM,
    attribution: deps.attribution,
  })

  function layers(): GroundLayerRef[] {
    return map.getLayersOrder().map((id) => {
      const layer = map.getLayer(id)
      return { id, type: layer?.type ?? '', source: layer?.source, sourceLayer: layer?.sourceLayer }
    })
  }

  function set(id: string, property: string, value: (style: unknown) => unknown) {
    const key = `${id}\u0000${property}`
    if (!original.has(key)) original.set(key, map.getPaintProperty(id, property as never))
    map.setPaintProperty(id, property as never, value(original.get(key)) as never)
  }

  function restore(id: string, property: string) {
    const key = `${id}\u0000${property}`
    if (original.has(key)) map.setPaintProperty(id, property as never, original.get(key) as never)
  }

  function paint(next: Theme) {
    const tint = tintColor(next)
    const shade = shadePaint(next) ?? {}
    if (!map.getLayer(GROUND_TINT_LAYER)) {
      addLayerAt(map, { id: GROUND_TINT_LAYER, type: 'color-relief', source: GROUND_SOURCE, paint: { 'color-relief-color': tint } })
      addLayerAt(map, { id: GROUND_SHADE_LAYER, type: 'hillshade', source: GROUND_SOURCE, paint: shade })
    } else {
      map.setPaintProperty(GROUND_TINT_LAYER, 'color-relief-color', tint)
      for (const [key, value] of Object.entries(shade)) map.setPaintProperty(GROUND_SHADE_LAYER, key as never, value as never)
    }
    for (const layer of layers()) {
      const slot = slotOf(layer.id)
      if (slot !== undefined && APP_LABEL_SLOTS.has(slot) && layer.type === 'symbol') {
        // Repainted in the dark look; Liberty's light ground takes the colours
        // they were drawn with.
        for (const [property, colour] of [
          ['text-color', LIBERTY_LOOK[next].text],
          ['text-halo-color', LIBERTY_LOOK[next].halo],
        ] as const) {
          if (colour === null) restore(layer.id, property)
          else set(layer.id, property, () => colour)
        }
        continue
      }
      const settings = settingsFor(layer, next)
      // A property the other theme set and this one leaves to the style goes
      // back to the style's own.
      for (const other of settingsFor(layer, next === 'dark' ? 'light' : 'dark')) {
        if (!settings.some((s) => s.property === other.property)) restore(layer.id, other.property)
      }
      for (const s of settings) set(layer.id, s.property, s.value)
    }
  }

  return {
    setTheme(next) {
      if (next === theme) return
      theme = next
      paint(next)
    },
  }
}
