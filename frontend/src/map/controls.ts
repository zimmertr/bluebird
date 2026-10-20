/**
 * The map's controls: the zoom pair and the compass, the geolocate button, the
 * scale, and the attribution, and the one MapLibre default this app turns off.
 *
 * A desk has zoom buttons and a phone does not (record 0174). A pinch zooms on
 * a phone (#696), where the map's top is the rows'. At a desk they zoom by a
 * click, which a mouse without a wheel needs, and the map's right edge has the
 * room (TJ, 2026-10-20). The library draws the pair in the compass's group,
 * and `map.css` hides the pair in a phone's slot. At a desk the
 * group stands in the library's top-right corner with the locate button under
 * it: zoom in, zoom out, the compass and locate, in the library's own order.
 * On a phone `MapView` moves the compass and the locate button into the slots
 * at the right of the map's two rows (`placeControl`).
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
import { DISABLED, MAP_CREDIT, MAP_ROUND_BUTTON } from '../styles'

/** The two controls `MapView` stands in the rows' slots. */
export interface MapControls {
  locate: GeolocateControl
  /** The zoom pair and the compass, which the library builds as one navigation control. */
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
  const nav = new NavigationControl({ showZoom: true })
  map.addControl(nav, 'top-right')
  dressButtons(nav._container)
  idleCompassWhileNorthUp(map, nav._container)
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
  // A popup keeps clear of the stack at a desk the way it keeps clear of the
  // rows (`data-map-overlay`, read by `mapPopups.ts`). On a phone the corner
  // is empty, since both controls stand in the rows.
  map.getContainer().querySelector('.maplibregl-ctrl-top-right')?.setAttribute('data-map-overlay', '')
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
 * The class `map.css` hides a phone's compass under, set on the compass button
 * itself while the map is north-up and flat (#687). On the button rather than
 * on the map's container, because on a phone the button stands outside the
 * container, in the chip row (record 0147). Exported so the test names the
 * same class the stylesheet does.
 */
export const COMPASS_IDLE_CLASS = 'compass-idle'

/**
 * Idles the compass while pressing it would do nothing. MapLibre's compass
 * resets the bearing and the pitch, so at bearing 0 and pitch 0 it is a button
 * with no effect, and it wakes the moment a rotate or a tilt gives it one.
 * Idle, it is disabled at both widths and greyed at a desk (`DISABLED`), where
 * it keeps its place in the stack so the stack keeps one shape (record 0174).
 * On a phone `map.css` hides it under `COMPASS_IDLE_CLASS`, so the chip row's
 * end stays the map's. A compass that idles under the keyboard, as a press on
 * it does, hands the keyboard to the map rather than dropping it on the page.
 * The library has no option for any of this; the markup is the library's.
 */
export function idleCompassWhileNorthUp(map: maplibregl.Map, container: HTMLElement | undefined): void {
  const compass = container?.querySelector<HTMLButtonElement>('.maplibregl-ctrl-compass')
  if (!compass) return
  dress(compass, DISABLED)
  const sync = () => {
    const idle = map.getBearing() === 0 && map.getPitch() === 0
    if (idle && compass.ownerDocument?.activeElement === compass) map.getCanvas().focus()
    compass.classList.toggle(COMPASS_IDLE_CLASS, idle)
    compass.disabled = idle
  }
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
