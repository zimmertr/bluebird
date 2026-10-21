/**
 * The map's controls: the compass, the geolocate button, the zoom pair, the
 * scale, and the attribution, and the one MapLibre default this app turns off.
 *
 * A desk stands them in the map's bottom-right corner (`MapCorner`, record
 * 0174), as Google Maps does: the compass, the locate button and the zoom pair
 * in a column over the credit line, which carries the scale at its end. A
 * phone stands the compass and the locate button at the right of the map's
 * two rows (`MapRows`), and its credit line, the (i) with the scale at its
 * end, in the bottom-left corner. It shows no zoom pair, since a pinch zooms
 * there (#696): the pair waits in the library's top-right corner, which
 * `map.css` hides it in. `MapView` moves each control into its slot
 * (`placeControl`).
 *
 * Every button wears the app's map button (`MAP_ROUND_BUTTON`, record 0147),
 * the zoom pair the same chrome joined (`MAP_ZOOM_PAIR`), and the credit line
 * the app's floating box (`MAP_CREDIT`): the markup is the library's, so the
 * roles are handed to it here, where it is made.
 */
import {
  AttributionControl,
  GeolocateControl,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { DISABLED, MAP_CREDIT, MAP_ROUND_BUTTON, MAP_ZOOM_PAIR } from '../styles'

/** The controls `MapView` stands in slots: a phone's rows and a desk's corner. */
export interface MapControls {
  compass: NavigationControl
  locate: GeolocateControl
  /** The zoom pair, which only a desk's corner stands. */
  zoom: NavigationControl
  scale: ScaleControl
}

/**
 * A map corner (`MapCorner`): a slot for each control it stands. Both widths
 * have the credit line; only a desk's corner has the column of buttons over
 * it, so `buttons` is null on a phone, whose compass and locate button stand
 * in its rows. That is also how the map tells a corner built for the other
 * width, in the one render after the width changes and before the corner
 * does (`MapView`).
 */
export interface CornerSlots {
  /** In the credit line, for the attribution. */
  credit: HTMLElement
  /** At the credit line's end, for the scale. */
  scale: HTMLElement
  /** A desk's column over the line, top to bottom; null on a phone. */
  buttons: { compass: HTMLElement; locate: HTMLElement; zoom: HTMLElement } | null
}

/** A library corner, where a control stands while no slot holds it. */
type Corner = 'top-right' | 'bottom-left' | 'bottom-right'

/** Hands a role to markup the library made, one class at a time. */
function dress(element: Element | null | undefined, role: string): void {
  element?.classList.add(...role.split(/\s+/).filter(Boolean))
}

/** Every button a control drew, in the app's map button. */
function dressButtons(container: HTMLElement | undefined): void {
  container?.querySelectorAll('button').forEach((button) => dress(button, MAP_ROUND_BUTTON))
}

/**
 * The zoom pair joined (`MAP_ZOOM_PAIR`), each half greyed while the library
 * disables it at either end of the zoom, as the idle compass is.
 */
function dressZoomPair(container: HTMLElement | undefined): void {
  dress(container?.querySelector('.maplibregl-ctrl-zoom-in'), `${MAP_ZOOM_PAIR.in} ${DISABLED}`)
  dress(container?.querySelector('.maplibregl-ctrl-zoom-out'), `${MAP_ZOOM_PAIR.out} ${DISABLED}`)
}

export function addControls(map: maplibregl.Map): MapControls {
  // Shift is the pinning modifier for popups (`isPinning` in map/popups.ts), and
  // MapLibre spends shift on box zoom by default — it starts a drag-zoom on
  // shift+mousedown and swallows the click that would have opened one. Box
  // zoom has no affordance and no discoverability; the scroll wheel, the
  // a trackpad's pinch and a finger's all do the same job, so the modifier is better
  // spent on something the panel actually tells you about.
  map.boxZoom.disable()
  // The compass and the zoom pair as two controls rather than the library's
  // one group, so each stands in a slot of its own: a phone shows the compass
  // alone, and a desk's column has the locate button between the two.
  const compass = new NavigationControl({ showZoom: false })
  map.addControl(compass, 'top-right')
  dressButtons(compass._container)
  idleCompassWhileNorthUp(map, compass._container)
  // MapLibre's own geolocate button, not a hand-rolled control: it wears
  // the same chrome as the compass, and its
  // permission/error/busy states come with the library instead of being
  // re-implemented badly. Nothing asks for location until it is pressed.
  const locate = new GeolocateControl({ positionOptions: { enableHighAccuracy: true } })
  map.addControl(locate, 'top-right')
  dressButtons(locate._container)
  const zoom = new NavigationControl({ showCompass: false })
  map.addControl(zoom, 'top-right')
  dressZoomPair(zoom._container)
  // The scale's library corner is the bottom left, where it waits until a
  // corner's credit line stands it at its end (`MapCorner`): a desk's in the
  // bottom-right corner, a phone's in the bottom left.
  const scale = new ScaleControl({ maxWidth: SCALE_MAX_WIDTH_PX })
  map.addControl(scale, 'bottom-left')
  return { compass, locate, zoom, scale }
}

/**
 * Stands a control in `slot`, or back in its library corner when there is
 * none: the moment before a phone's rows or a map's corner mount, after they
 * go, and a phone's zoom pair, which has no slot. The control's own element
 * is moved rather than a second one built, so its states and its permission
 * prompt stay the library's; the library keeps its handle on the element
 * wherever it stands, and removes it from wherever it is when the map goes.
 * Back in its corner it takes the place it was added in: the compass first in
 * the top right (`first`), and every other control after what is there.
 */
export function placeControl(
  map: maplibregl.Map,
  control: { _container?: HTMLElement },
  slot: HTMLElement | null,
  { first = false, corner = 'top-right' }: { first?: boolean; corner?: Corner } = {},
): void {
  const element = control._container
  if (!element) return
  const home = slot ?? map.getContainer().querySelector(`.maplibregl-ctrl-${corner}`)
  if (!home || element.parentElement === home) return
  if (first && !slot) home.prepend(element)
  else home.appendChild(element)
}

/**
 * The widest the scale bar draws, the library's own default stated here
 * because the credit line keeps it in a box this wide at both widths
 * (`MAP_CORNER.scale`), so the credits keep their place while the bar grows
 * and shrinks with the zoom (record 0174). `styles.test.ts` holds the box and
 * `map.css`'s arithmetic to this number.
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
 * The class the library sets on its compact attribution while the credits
 * are open, and takes off when the (i) or a drag folds them. A phone's credit
 * line reads it to report whether its credits are open (`MapCorner`), since
 * the Analyze button stands over an open line (record 0174), and `map.css`
 * lays the opened line out under it. Exported so the component names the
 * class the stylesheet does.
 */
export const CREDITS_OPEN_CLASS = 'maplibregl-compact-show'

/**
 * Idles the compass while pressing it would do nothing. MapLibre's compass
 * resets the bearing and the pitch, so at bearing 0 and pitch 0 it is a button
 * with no effect, and it wakes the moment a rotate or a tilt gives it one.
 * Idle, it is disabled at both widths and greyed at a desk (`DISABLED`),
 * where it keeps its place in the corner's column so the column keeps one
 * shape (record 0174). On a phone `map.css` hides it under
 * `COMPASS_IDLE_CLASS`, so the chip row's end stays the map's. A compass that idles under the keyboard, as a press on
 * it does, hands the keyboard to the map rather than dropping it on the page.
 * The library has no option for any of this; the markup is the library's.
 */
function idleCompassWhileNorthUp(map: maplibregl.Map, container: HTMLElement | undefined): void {
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
  // A compact credit waits at the bottom left, a full one at the bottom
  // right, each the side its width's corner stands on, until `MapView` moves
  // it into that corner's credit line (`MapCorner`, record 0174).
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
