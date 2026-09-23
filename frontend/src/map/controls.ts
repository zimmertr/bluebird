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
  map.addControl(new ScaleControl(), 'bottom-left')
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
  const control = new AttributionControl({ ...options, compact })
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
