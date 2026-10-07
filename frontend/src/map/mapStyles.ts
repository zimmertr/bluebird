/**
 * The map's paint and camera decisions for the app's OWN objects (#365): the
 * result and pending markers, their labels, the drawn ring and its handles, and
 * how long each camera move takes. The design system in `styles.ts` cannot
 * reach any of these: they are MapLibre paint and layout values handed to the
 * GL renderer, not Tailwind utilities, so the hues are literals here and named
 * for the Tailwind step they match.
 *
 * What is NOT here, and why: each overlay's look stays in the pure module that
 * also formats its popup and feeds its legend swatch (`utils/wildfires.ts`,
 * `utils/smoke.ts`, `utils/closures.ts`, `utils/snowDepth.ts`), because the
 * picture and its key must read one constant, and that module is the one
 * place both can import. The basemap's label and trail colours stay in
 * `map/basemap.ts`: they match OpenFreeMap's terrain rather than the app's
 * palette. The linter's hex ban (`tools/eslint/eslint.config.js`) lists every
 * one of those owners; everything else under `src/` composes them.
 *
 * Two recipes used to be spelled twice. The result marker and the pending
 * destination dot carried the same radius, stroke and opacity in two layer
 * specs, and their labels the same size, offset, halo and colour in two more
 * (measured at `MapView.tsx` lines 1404 to 1496 on 2026-09-14, before #410
 * cut the layer out), so a change to one could miss the other. They are one
 * object each now, spread into both layers.
 */
import type { CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/** Tailwind `sky-400`, the app's accent: the ring being drawn and its handles. */
export const DRAW_COLOR = '#38bdf8'

/**
 * Tailwind `blue-500`: a pasted or searched destination the analysis has not
 * ranked yet. Not a metric colour, because nothing has been fetched for it,
 * and not the draw colour, because it is not part of the ring; a neutral
 * "Bluebird Forecast blue" that says the point exists.
 */
export const PENDING_COLOR = '#3b82f6'

/** The white stroke every marker and handle wears so it reads on any basemap. */
export const MARKER_STROKE = '#fff'

/**
 * A ranked result and a pending destination are one kind of dot, and the
 * colour is the only thing that differs between them.
 */
export const MARKER_PAINT: Omit<CircleLayerSpecification['paint'], 'circle-color'> = {
  'circle-radius': 10,
  'circle-stroke-width': 2,
  'circle-stroke-color': MARKER_STROKE,
  'circle-opacity': 0.9,
}

/** The rank digit drawn inside a result marker. */
export const RANK_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-size': 10,
  'text-font': ['Noto Sans Bold'],
}
export const RANK_PAINT: SymbolLayerSpecification['paint'] = { 'text-color': MARKER_STROKE }

/**
 * The name under a marker, ranked or pending. Tailwind `slate-50` on a
 * `slate-900` halo, so it reads over terrain and over the dot's own colour.
 */
export const MARKER_LABEL_LAYOUT: Omit<SymbolLayerSpecification['layout'], 'text-field'> = {
  'text-offset': [0, 1.6],
  'text-size': 11,
  'text-anchor': 'top',
  'text-font': ['Noto Sans Regular'],
}
export const MARKER_LABEL_PAINT: SymbolLayerSpecification['paint'] = {
  'text-color': '#f8fafc',
  'text-halo-color': '#0f172a',
  'text-halo-width': 1.5,
}

/**
 * The wind arrow's two inks, drawn on a canvas rather than through paint: white
 * with a slate-900 outline, because the arrow lands on every hue the metric
 * ramp produces and neither alone reads on all of them.
 */
export const WIND_ARROW_FILL = 'rgba(255,255,255,0.95)'
export const WIND_ARROW_OUTLINE = 'rgba(15,23,42,0.85)'

/** The drawn ring: a faint fill so the area reads as an area, and its edge. */
export const DRAW_FILL_OPACITY = 0.12
export const DRAW_LINE_WIDTH = 2

/**
 * The ring's two kinds of handle. A vertex is solid in the draw colour; a
 * midpoint, which only proposes a vertex, is hollow and a step smaller so the
 * two cannot be mistaken for each other under a finger.
 */
export const VERTEX_HANDLE_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': 6,
  'circle-color': DRAW_COLOR,
  'circle-stroke-color': MARKER_STROKE,
  'circle-stroke-width': 2,
}
export const MIDPOINT_HANDLE_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': 5,
  'circle-color': MARKER_STROKE,
  'circle-stroke-color': DRAW_COLOR,
  'circle-stroke-width': 2,
  'circle-opacity': 0.85,
}

/**
 * How long each kind of camera move takes, in milliseconds.
 *
 * `fit` frames a set of points or a searched place from wherever the map was,
 * which may be a continent away, so it is long enough to read as travel. `focus`
 * flies to one marker the reader just clicked, which is usually already in
 * view, so it is shorter. `reveal` nudges the camera to bring a ring's edge
 * back on screen mid-edit; it is the shortest, because the ring is mostly in
 * view and a long easing there reads as the map wandering off under the
 * reader's finger.
 */
export const CAMERA_MS = {
  fit: 1500,
  focus: 800,
  reveal: 600,
} as const

/**
 * Breathing room around a multi-point fit, in pixels. A searched place takes
 * less (`PLACE_PADDING_PX`), because its bounds already carry the miles of
 * margin `SEARCH_VIEW_MILES` adds around the hit.
 */
export const FIT_PADDING_PX = 60
export const PLACE_PADDING_PX = 40
