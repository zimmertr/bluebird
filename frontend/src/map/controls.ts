/**
 * The map's controls: the compass, the geolocate button, the scale, and the
 * attribution, and the one MapLibre default this app turns off.
 *
 * No zoom buttons, at either width: a phone dropped them first because a pinch
 * zooms (#696), and a desk followed (#714, record 0172), where the wheel and a
 * trackpad's pinch do the same and a reader meets one map at both widths. The
 * compass stays, shown only while the map is turned or tilted. The locate
 * button and the compass leave the library's corner for the slots at the right
 * of the map's two rows: `MapView` moves the controls `addControls` returns
 * there (`placeControl`).
 *
 * Every button wears the app's map button (`MAP_ROUND_BUTTON`, record 0147)
 * and the credit line the app's floating box (`MAP_CREDIT`): the markup is the
 * library's, so the roles are handed to it here, where it is made.
 */
import {
  AttributionControl,
  GeolocateControl,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { MAP_CREDIT, MAP_ROUND_BUTTON } from '../styles'

/** The two controls `MapView` stands in the rows' slots. */
export interface MapControls {
  locate: GeolocateControl
  /** The compass, which the library builds as a navigation control with its zoom pair turned off. */
  nav: NavigationControl
}

/** Hands a role to markup the library made, one class at a time. */
function dress(element: Element | null | undefined, role: string): void {
  element?.classList.add(...role.split(/\s+/).filter(Boolean))
}

/** Every button a control drew, in the app's map button. */
function dressButtons(container: HTMLElement | undefined): void {
  container?.querySelectorAll('button').forEach((button) => dress(button, MAP_ROUND_BUTTON))
}

export function addControls(map: maplibregl.Map): MapControls {
  // Shift is the pinning modifier for popups (`isPinning` in map/popups.ts), and
  // MapLibre spends shift on box zoom by default — it starts a drag-zoom on
  // shift+mousedown and swallows the click that would have opened one. Box
  // zoom has no affordance and no discoverability; the scroll wheel, the
  // a trackpad's pinch and a finger's all do the same job, so the modifier is better
  // spent on something the panel actually tells you about.
  map.boxZoom.disable()
  const nav = new NavigationControl({ showZoom: false })
  map.addControl(nav, 'top-right')
  dressButtons(nav._container)
  hideCompassWhileNorthUp(map, nav._container)
  // MapLibre's own geolocate button, not a hand-rolled control: it wears
  // the same chrome as the compass, and its
  // permission/error/busy states come with the library instead of being
  // re-implemented badly. Nothing asks for location until it is pressed.
  const locate = new GeolocateControl({ positionOptions: { enableHighAccuracy: true } })
  map.addControl(locate, 'top-right')
  dressButtons(locate._container)
  // A corner each, which is what lets both sit in the one band the map's
  // bottom chrome reserves (`TRANSPORT_GAP_PX` in `utils/resultsSheet.ts`)
  // rather than stacking into two. The scale takes the left; the attribution
  // takes the right, where the library puts
  // it by default and where the OpenStreetMap guideline expects it. They
  // shared the right corner before, the scale floating above the licence
  // line, which made the pair as tall as both together.
  map.addControl(new ScaleControl({ maxWidth: SCALE_MAX_WIDTH_PX }), 'bottom-left')
  return { locate, nav }
}

/**
 * Stands a control in `slot`, or back in the library's top-right corner when
 * there is none (the moment before the rows mount, or after they go). The
 * control's own element is moved rather than a second button built, so its
 * states and its permission prompt stay the library's; the library keeps its
 * handle on the element wherever it stands, and removes it from wherever it
 * is when the map goes. Back in the corner it takes the place `addControls`
 * gave it: the compass first, the locate button after it (`first`).
 */
export function placeControl(
  map: maplibregl.Map,
  control: GeolocateControl | NavigationControl,
  slot: HTMLElement | null,
  first = false,
): void {
  const element = control._container
  if (!element) return
  const home = slot ?? map.getContainer().querySelector('.maplibregl-ctrl-top-right')
  if (!home || element.parentElement === home) return
  if (first && !slot) home.prepend(element)
  else home.appendChild(element)
}

/**
 * The widest the scale bar draws, the library's own default stated here
 * because `map.css` keeps the attribution clear of it at that width: a phone's
 * opened credit line wraps at the scale's edge rather than covering it (#687).
 * `styles.test.ts` holds the stylesheet's arithmetic to this number.
 */
export const SCALE_MAX_WIDTH_PX = 100

/**
 * The class `map.css` hides the compass under, set on the compass button
 * itself while the map is north-up and flat (#687). On the button rather than
 * on the map's container, because on a phone the button stands outside the
 * container, in the chip row (record 0147). Exported so the test names the
 * same class the stylesheet does.
 */
export const COMPASS_IDLE_CLASS = 'compass-idle'

/**
 * Hides the compass while pressing it would do nothing. MapLibre's compass
 * resets the bearing and the pitch, so at bearing 0 and pitch 0 it is a button
 * with no effect standing in the corner, and it shows again the moment a
 * rotate or a tilt gives it one. The library has no option for this, so the
 * button carries a class and `map.css` does the hiding: the markup is the
 * library's, and a stylesheet is the one place that reaches it.
 */
export function hideCompassWhileNorthUp(map: maplibregl.Map, container: HTMLElement | undefined): void {
  const compass = container?.querySelector('.maplibregl-ctrl-compass')
  if (!compass) return
  const sync = () => compass.classList.toggle(COMPASS_IDLE_CLASS, map.getBearing() === 0 && map.getPitch() === 0)
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
  // A compact credit stands beside the scale at the bottom left on a phone
  // (#696), so the right of the map's foot is map (`map.css`).
  map.addControl(control, compact ? 'bottom-left' : 'bottom-right')
  // The app's chrome (record 0147): the line on the floating box, its (i) a
  // round dark button. `map.css` takes the box off a folded line.
  dress(control._container, MAP_CREDIT.card)
  dress(control._compactButton, MAP_CREDIT.button)
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
