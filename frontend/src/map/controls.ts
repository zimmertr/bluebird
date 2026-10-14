/**
 * The map's controls: the zoom and compass buttons, the geolocate button, the
 * scale, and the attribution, and the one MapLibre default this app turns off.
 */
import {
  AttributionControl,
  GeolocateControl,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'

export function addControls(map: maplibregl.Map): void {
  // Shift is the pinning modifier for popups (`isPinning` in map/popups.ts), and
  // MapLibre spends shift on box zoom by default — it starts a drag-zoom on
  // shift+mousedown and swallows the click that would have opened one. Box
  // zoom has no affordance and no discoverability; the scroll wheel, the
  // +/- buttons and a pinch all do the same job, so the modifier is better
  // spent on something the panel actually tells you about.
  map.boxZoom.disable()
  map.addControl(new NavigationControl(), 'top-right')
  hideCompassWhileNorthUp(map)
  // MapLibre's own geolocate button, not a hand-rolled control: it wears
  // the same chrome as the zoom and compass buttons above it, and its
  // permission/error/busy states come with the library instead of being
  // re-implemented badly. Nothing asks for location until it is pressed.
  map.addControl(
    new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
    'top-right',
  )
  // A corner each, which is what lets both sit in the one band the map's
  // bottom chrome reserves (`TRANSPORT_GAP_PX` in `utils/resultsSheet.ts`)
  // rather than stacking into two. The scale takes the left, under the
  // legend stack; the attribution takes the right, where the library puts
  // it by default and where the OpenStreetMap guideline expects it. They
  // shared the right corner before, the scale floating above the licence
  // line, which made the pair as tall as both together.
  map.addControl(new ScaleControl({ maxWidth: SCALE_MAX_WIDTH_PX }), 'bottom-left')
}

/**
 * The widest the scale bar draws, the library's own default stated here
 * because `map.css` keeps the attribution clear of it at that width: a phone's
 * opened credit line wraps at the scale's edge rather than covering it (#687).
 * `styles.test.ts` holds the stylesheet's arithmetic to this number.
 */
export const SCALE_MAX_WIDTH_PX = 100

/**
 * The class `map.css` hides the compass under, set on the map's container
 * while the map is north-up and flat (#687). Exported so the test names the
 * same class the stylesheet does.
 */
export const COMPASS_IDLE_CLASS = 'compass-idle'

/**
 * Hides the compass while pressing it would do nothing. MapLibre's compass
 * resets the bearing and the pitch, so at bearing 0 and pitch 0 it is a button
 * with no effect standing in the corner, and it shows again the moment a
 * rotate or a tilt gives it one. The library has no option for this, so the
 * container carries a class and `map.css` does the hiding: the markup is the
 * library's, and a stylesheet is the one place that reaches it.
 */
export function hideCompassWhileNorthUp(map: maplibregl.Map): void {
  const sync = () =>
    map
      .getContainer()
      .classList.toggle(COMPASS_IDLE_CLASS, map.getBearing() === 0 && map.getPitch() === 0)
  map.on('rotate', sync)
  map.on('pitch', sync)
  sync()
}

/**
 * The Open-Meteo credit, a standing member of the map's attribution line
 * (#687). CC BY 4.0 asks for it beside the data, and every forecast the app
 * draws (markers, the grid, the table and the chart) is Open-Meteo's, so it
 * stands on the one line the map always shows, with or without a report and
 * in every results mode. It stood in the results bar, and briefly in the
 * table's foot, where under a short table it read as a stray link and the
 * chart had no foot of its own to carry it (the maintainer, 2026-10-13, #709).
 * The bare host, because Open-Meteo's licence page gives its wording as an
 * example rather than as required.
 */
export const OPEN_METEO_ATTRIBUTION =
  '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>'

/**
 * The control's own credits with Open-Meteo's after them. The library takes a
 * string or a list and draws these before the sources' credits, so the line
 * reads MapLibre, then Open-Meteo, then the basemap's.
 */
export function withOpenMeteo(custom: string | string[] | undefined): string[] {
  return [...(custom === undefined ? [] : [custom].flat()), OPEN_METEO_ATTRIBUTION]
}

/**
 * The attribution, collapsed behind the library's own (i) on a phone and
 * spelled out at a desk. Both are what the OpenStreetMap attribution guideline
 * allows. Returns the control, so the caller can take it down when the width
 * changes: `compact` is read once, when the control is constructed.
 */
export function addAttribution(map: maplibregl.Map, compact: boolean): AttributionControl {
  // The library's own defaults, with only `compact` decided here: its
  // option object also carries the MapLibre credit, and constructing one
  // with a bare `{compact}` would drop that credit rather than restate it.
  const { options } = new AttributionControl()
  const control = new AttributionControl({
    ...options,
    compact,
    customAttribution: withOpenMeteo(options.customAttribution),
  })
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
  return control
}
