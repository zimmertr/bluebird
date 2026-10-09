/**
 * Every popup on the map, and the one click that opens one (TJ, 2026-10-08).
 *
 * A thing on the map that describes itself in a popup is a target: a ranked
 * marker, a basemap peak or lake, a ring handle, a fire perimeter, a closure,
 * a smoke plume. Each registers here with the layers it draws on and how it
 * opens, and this module does the rest the same way for all of them: a click
 * opens the popup of the highest-ranked target under it (the rank is
 * `utils/mapClick.ts`), a click without shift clears the board first, the
 * cursor over a target says it can be clicked, and every popup is made by
 * `create` with the same options and put on the board. A popup never opens on
 * a hover: one opened under the cursor covers the destinations inside a fire
 * or a closure, and a touch screen has no hover to open it.
 *
 * So a new layer with something to say registers a target and inherits all of
 * this. The linter's `map-popups-owned` check fails a `new Popup`, a DOM
 * marker, or a click, hover, touch or pointer listener anywhere else under the
 * map, and `map-drag-owned` keeps a drag's start to the ring's handles, which
 * is how this stays the one place, the way `styles.ts` is for the app's looks.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { mapCursor, rankedTargets, type MapTarget } from '../utils/mapClick'
import type { MapController } from './controller'
import { isPinning, popupOptions, type PopupBoard } from './popups'

/** What a target is handed when a click lands on it. */
export interface MapTargetHit {
  /** The feature clicked, from the first of the target's layers that drew one there. */
  feature: maplibregl.MapGeoJSONFeature
  lngLat: maplibregl.LngLat
  point: maplibregl.Point
}

export interface MapPopupTarget {
  target: MapTarget
  /**
   * The layers the target draws on. Where two of them answer one click, the
   * earlier one's feature is the one handed to `open`: smoke lists its
   * densities heaviest first, so the densest plume is the one described.
   */
  layers: readonly string[]
  /**
   * How far from a drawn feature a click still lands on it, in screen pixels.
   * None by default: a fill or a marker is its own target. A hairline needs a
   * margin, or only a click exactly on it could open it.
   */
  slopPx?: number
  /**
   * Open the popup for this hit. False says the target has nothing to open
   * here after all (a label with no name, a feature with no properties), and
   * the click falls to the next target under it, or to the bare map.
   */
  open(hit: MapTargetHit): boolean | void
  /**
   * True while the target's own gesture owns the cursor, as a ring handle's
   * drag does, so a pointer move does not reset the cursor under the reader's
   * hand.
   */
  holdsCursor?: () => boolean
}

/** What a popup may set for itself; everything else is the same for every popup. */
export interface MapPopupOptions {
  /** The kind of thing it describes, so an overlay switched off can take it down. */
  owner?: MapTarget
  /** A ranked destination's card, which takes its own width rule. */
  result?: boolean
  anchor?: maplibregl.PositionAnchor
  className?: string
  offset?: maplibregl.Offset
  /** False for a popup that is itself one button, like the ring's remove-point. */
  closeButton?: boolean
}

export interface MapPopups {
  register(target: MapPopupTarget): void
  /**
   * Open a popup, on the board. Never closeOnClick: that is fixed when a popup
   * is made, so an open popup could not be told to survive the shift-click
   * that pins a second one. Dismissal is the board's.
   */
  create(at: maplibregl.LngLatLike, html: string, options?: MapPopupOptions): Popup
  /** Close every popup, or every one this kind of thing owns. */
  closeAll(owner?: MapTarget): void
}

export function mountMapPopups(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    board: PopupBoard
    /** Extend the ring: a click on bare map in draw mode. */
    addPoint: (pt: [number, number]) => void
  },
): MapPopups {
  const { controller, board } = deps
  const targets: MapPopupTarget[] = []

  // Every registered layer the map has drawn, asked together, because the
  // rank reads the whole set rather than a series of answers: one query for
  // the layers hit exactly and one per margin a target asks for. A hidden
  // layer is not queried, which is what keeps a ring handle out of a click
  // outside draw mode (#119).
  function targetsAt(point: maplibregl.Point) {
    const bySlop = new Map<number, string[]>()
    for (const t of targets) {
      const drawn = t.layers.filter((id) => map.getLayer(id))
      if (drawn.length > 0) bySlop.set(t.slopPx ?? 0, [...(bySlop.get(t.slopPx ?? 0) ?? []), ...drawn])
    }
    const features = [...bySlop].flatMap(([slop, layers]) =>
      map.queryRenderedFeatures(
        slop === 0
          ? point
          : [
              [point.x - slop, point.y - slop],
              [point.x + slop, point.y + slop],
            ],
        { layers },
      ),
    )
    const hit = new Set(features.map((f) => f.layer.id))
    const under = targets.filter((t) => t.layers.some((id) => hit.has(id))).map((t) => t.target)
    return { under, features }
  }

  map.on('click', (e) => {
    const { under, features } = targetsAt(e.point)
    if (!isPinning(e)) board.closeAll()
    const drawing = controller.inputs.drawing
    for (const kind of rankedTargets(drawing, under)) {
      const target = targets.find((t) => t.target === kind)!
      const feature = target.layers
        .map((id) => features.find((f) => f.layer.id === id))
        .find((f) => f !== undefined)
      if (feature && target.open({ feature, lngLat: e.lngLat, point: e.point }) !== false) return
    }
    if (drawing) deps.addPoint([e.lngLat.lng, e.lngLat.lat])
  })

  // The cursor follows the same rule as the click, read on every move over
  // the map rather than on each layer's enter and leave: two overlapping
  // layers each reset the cursor on leaving, so one could clear the pointer
  // the other still owed.
  //
  // A move with a button held is the map being dragged: the cursor is left to
  // MapLibre's grabbing hand, which a pointer over a plume or a fire would
  // otherwise cover, and nothing is asked of the map on every frame of a pan.
  map.on('mousemove', (e) => {
    if (targets.some((t) => t.holdsCursor?.())) return
    const canvas = map.getCanvas()
    if ((e.originalEvent as MouseEvent | undefined)?.buttons) {
      canvas.style.cursor = ''
      return
    }
    canvas.style.cursor = mapCursor(controller.inputs.drawing, targetsAt(e.point).under)
  })

  return {
    register(target) {
      targets.push(target)
    },
    create(at, html, { owner, result = false, anchor, className, offset, closeButton } = {}) {
      const popup = new Popup({
        ...popupOptions(map, { result }),
        closeOnClick: false,
        ...(anchor && { anchor }),
        ...(className && { className }),
        ...(offset !== undefined && { offset }),
        ...(closeButton !== undefined && { closeButton }),
      })
        .setLngLat(at)
        .setHTML(html)
        .addTo(map)
      board.track(popup, owner)
      return popup
    },
    closeAll(owner) {
      board.closeAll(owner)
    },
  }
}
