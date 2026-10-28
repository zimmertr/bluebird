/**
 * Every popup on the map, and the one click that opens one (TJ, 2026-10-08).
 *
 * A thing on the map that describes itself in a popup is a target: a ranked
 * marker, a clickable basemap label, a ring handle, a fire perimeter, a closure,
 * a smoke plume. Each registers here with the layers it draws on and how it
 * opens, and this module does the rest the same way for all of them: a click
 * opens the popup of the highest-ranked target under it (the rank is
 * `utils/mapClick.ts`), a click without shift clears the board first, the
 * cursor over a target says it can be clicked, and every popup is made here
 * with the same options and put on the board. Every card is `openCard`, which
 * fits it to the free map, caps a body too tall to stand whole, picks the
 * side of its point it shows more of, and pans the map to it, for a fire, a
 * closure or a plume exactly as for a destination (#738); the one popup that
 * is not a card, the ring's remove-point button, is `openBare`. A popup never opens on
 * a hover: one opened under the cursor covers the destinations inside a fire
 * or a closure, and a touch screen has no hover to open it.
 *
 * A picture rather than a shape, the rain radar or the snow depth (#737), is
 * a point target instead (`registerPoint`): it has no feature for a click to
 * find, so it says whether it painted at the point from the copy of its tile
 * the app keeps (`utils/heldTiles.ts`), once no shape there has answered.
 * That answers the cursor on every move, a pointer over painted pixels as over
 * a fire, and opens the card at once with every picture painted there on it
 * (`utils/pointReadout.ts`); a value still on its way, the snow's from NOAA,
 * fills its row when it lands. The next click drops a reading that has not
 * opened its card yet, and closing a card drops what it was still waiting
 * for.
 *
 * So a new layer with something to say registers a target and inherits all of
 * this. The linter's `map-popups-owned` check fails a `new Popup`, a DOM
 * marker, or a click, hover, touch or pointer listener anywhere else under the
 * map, and `map-drag-owned` keeps a drag's start to the ring's handles, which
 * is how this stays the one place, the way `styles.ts` is for the app's looks.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { mapCursor, pointTargetsToAsk, rankedTargets, type MapTarget } from '../utils/mapClick'
import { POPUP_BODY_ATTR, POPUP_CARD_CLASS, capPopupBody } from '../utils/popup/popupChrome'
import { POPUP_FACE } from '../styles'
import { pointCardHtml, type PointReading, type PointSection } from '../utils/pointReadout'
import { POPUP_PAN_MS, capHeight, placePopup, type Point, type PopupSide, type Rect } from '../utils/popup/popupFit'
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
   * Whether a feature drawn on one of the target's layers is one it opens for.
   * For a layer that also draws things the target refuses: the style's
   * `label_other` labels suburbs and islands beside the hamlets a click takes
   * (#710). A refused feature is not under the cursor at all, so it shows no
   * pointer and the click passes to whatever lies beneath it. Every feature
   * by default.
   */
  accepts?: (feature: maplibregl.MapGeoJSONFeature) => boolean
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

/** Where a point target is asked about: the clicked coordinate, and the map's zoom. */
interface MapPoint {
  lng: number
  lat: number
  zoom: number
}

/** A picture on the map that answers a click by what it painted at the point (#737). */
export interface MapPointTarget {
  target: MapTarget
  /** Whether the layer is on, so a layer switched off is never asked. */
  shown(): boolean
  /**
   * Whether the layer painted at this point, read from the tile the map drew:
   * at once where that tile is ready to read, and once it is otherwise. Asked
   * on every pointer move, so it asks nothing of anyone.
   */
  paints(at: MapPoint): boolean | Promise<boolean>
  /**
   * The layer's reading at this point, or null where it painted nothing. A
   * rejection is a failed reading. `signal` aborts when the next click makes
   * the card stale before it opens, or when the card closes.
   */
  read(at: MapPoint, signal: AbortSignal): Promise<PointReading | null>
  /**
   * The layer's section for a card already open, read again because what the
   * layer shows under it changed: the radar's frame during playback (#748).
   * It never closes the card, so a point the layer no longer paints answers
   * with what it shows there rather than null. A layer whose picture does not
   * change under an open card leaves it out.
   */
  refresh?(at: MapPoint, signal: AbortSignal): Promise<PointSection>
}

/** What a card may set for itself; everything else is the same for every card. */
interface MapCardOptions {
  /**
   * The kind of thing it describes, so an overlay switched off can take it
   * down; every kind, for a card that describes more than one.
   */
  owner?: MapTarget | readonly MapTarget[]
  /** A ranked destination's card, which takes its own width rule. */
  result?: boolean
  /**
   * Where the card's point WILL stand, in the map container's pixels, for a
   * caller about to fly it there; the point's present position otherwise.
   */
  markerAt?: Point
  /** What else stands over the map, as viewport rects, beyond the `data-map-overlay` surfaces found here. */
  avoid?: readonly Rect[]
  /**
   * Whether the map pans by the fit's move, which it does by default. False
   * hands the move back to a caller that folds it into a flight of its own,
   * as a table row's centring does.
   */
  pan?: boolean
}

/** A card on the map, and the move its fit asked of the map. */
interface PlacedCard {
  popup: Popup
  /** How far the card's point, and the card with it, moves across the screen. */
  dx: number
  dy: number
  /** The height its body was capped to, which a redraw must keep, or null. */
  capped: number | null
}

export interface MapPopups {
  register(target: MapPopupTarget): void
  /** Register a picture that is asked about a point rather than found under it. */
  registerPoint(target: MapPointTarget): void
  /**
   * A point target's picture changed without the reader doing anything, as
   * the radar's does when the player moves to another frame (#748): every
   * open card it is on reads its section again where the card stands, and the
   * cursor is decided again where the mouse rests, since no move will come.
   */
  refreshPoint(target: MapTarget): void
  /**
   * Open a card on the board, placed where it shows the most of itself
   * (#738): every card the map opens, a destination's, a fire's, a closure's
   * or a plume's, is fitted, capped and panned the same way here, rather than
   * one kind of card being placed and the rest opening wherever they were
   * clicked. Never closeOnClick: that is fixed when a popup is made, so an
   * open popup could not be told to survive the shift-click that pins a
   * second one. Dismissal is the board's.
   */
  openCard(at: maplibregl.LngLatLike, html: string, options?: MapCardOptions): PlacedCard
  /**
   * Open a popup that is one bare button rather than a card, like the ring's
   * remove-point: no card frame, no close button, and no fit, since it is
   * smaller than the handle it stands on.
   */
  openBare(
    at: maplibregl.LngLatLike,
    html: string,
    options: { owner?: MapTarget; offset?: maplibregl.Offset },
  ): Popup
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
  const points: MapPointTarget[] = []
  // The point reading whose card has not opened yet, which the next click
  // makes stale.
  let reading: AbortController | null = null
  // The latest pointer move, so a cursor answer that needed a tile decoded
  // is dropped once the pointer has moved on.
  let moveSeq = 0
  // Where the mouse rests over the map, so the cursor can be decided again
  // when a picture changes under it without a move (#748); null once it has
  // left the map.
  let resting: { point: maplibregl.Point; dragging: boolean } | null = null
  // Every point card open, with what it was read from, so a picture that
  // changes under one can redraw its own section where the card stands
  // (#748). `seq` counts each target's refreshes, so a slow answer cannot
  // paint over a newer frame's.
  type OpenPoint = {
    lngLat: maplibregl.LngLat
    kinds: MapTarget[]
    sections: PointSection[]
    placed: PlacedCard
    signal: AbortSignal
    seq: Map<MapTarget, number>
  }
  const openPoints = new Set<OpenPoint>()

  // A map scrolled past the antimeridian reports a longitude outside
  // -180..180, which no tile and no source knows.
  const pointOf = (lngLat: maplibregl.LngLat): MapPoint => ({
    lng: (((lngLat.lng + 180) % 360) + 360) % 360 - 180,
    lat: lngLat.lat,
    zoom: map.getZoom(),
  })
  const pointsOn = () => {
    const live = points.filter((p) => p.shown()).map((p) => p.target)
    return pointTargetsToAsk(controller.inputs.drawing, live).map((kind) => points.find((p) => p.target === kind)!)
  }

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
    ).filter((f) => targets.find((t) => t.layers.includes(f.layer.id))?.accepts?.(f) ?? true)
    const hit = new Set(features.map((f) => f.layer.id))
    const under = targets.filter((t) => t.layers.some((id) => hit.has(id))).map((t) => t.target)
    return { under, features }
  }

  map.on('click', (e) => {
    reading?.abort()
    reading = null
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
    else void readPoint(e.lngLat)
  })

  // Every picture that is on, asked together. Each reads its own held tile,
  // so the card opens as fast as a fire's, with every picture painted here on
  // it in rank order; a reading that failed is left off and warned about. A
  // value one of them is still asking for fills its section when it lands,
  // for as long as the card is open: closing it aborts the ask.
  async function readPoint(lngLat: maplibregl.LngLat) {
    const asked = pointsOn()
    if (asked.length === 0) return
    const ac = new AbortController()
    reading = ac
    const at = pointOf(lngLat)
    const answers = await Promise.all(
      asked.map((p) =>
        p.read(at, ac.signal).catch((err: unknown) => {
          if (!ac.signal.aborted) console.warn(`The ${p.target} reading failed`, err)
          return null
        }),
      ),
    )
    if (ac.signal.aborted) return
    reading = null
    const found = asked.flatMap((p, i) => (answers[i] ? [{ kind: p.target, reading: answers[i] }] : []))
    if (found.length === 0) {
      ac.abort()
      return
    }
    const sections = found.map((f) => f.reading.section)
    const kinds = found.map((f) => f.kind)
    const placed = api.openCard(lngLat, pointCardHtml(sections), { owner: kinds })
    const open: OpenPoint = { lngLat, kinds, sections, placed, signal: ac.signal, seq: new Map() }
    openPoints.add(open)
    placed.popup.on('close', () => {
      ac.abort()
      openPoints.delete(open)
    })
    found.forEach(({ reading: { later } }, i) => {
      later
        ?.then((section) => {
          if (ac.signal.aborted) return
          sections[i] = section
          redraw(placed, pointCardHtml(sections))
        })
        .catch(() => {})
    })
  }

  // A card's content replaced where it stands. Its body keeps the cap it
  // opened with, so a card that had to scroll still scrolls rather than
  // growing past the free map.
  function redraw(placed: PlacedCard, html: string) {
    placed.popup.setHTML(html)
    const body = placed.popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
    if (body && placed.capped !== null) capPopupBody(body, placed.capped)
  }

  // The cursor follows the same rule as the click, read on every move over
  // the map rather than on each layer's enter and leave: two overlapping
  // layers each reset the cursor on leaving, so one could clear the pointer
  // the other still owed.
  //
  // A move with a button held is the map being dragged: the cursor is left to
  // MapLibre's grabbing hand, which a pointer over a plume or a fire would
  // otherwise cover, and nothing is asked of the map on every frame of a pan.
  //
  // Over no shape, the pictures are asked whether they painted here, which
  // reads the copy of their tile and asks nothing of anyone. A tile not yet
  // ready to read answers a moment later, and only if the pointer has not
  // moved on since.
  map.on('mousemove', (e) => {
    const dragging = Boolean((e.originalEvent as MouseEvent | undefined)?.buttons)
    resting = { point: e.point, dragging }
    decideCursor(e.point, e.lngLat, dragging)
  })
  map.on('mouseout', () => {
    resting = null
  })

  function decideCursor(point: maplibregl.Point, lngLat: maplibregl.LngLat, dragging: boolean) {
    const seq = ++moveSeq
    if (targets.some((t) => t.holdsCursor?.())) return
    const canvas = map.getCanvas()
    if (dragging) {
      canvas.style.cursor = ''
      return
    }
    const cursor = mapCursor(controller.inputs.drawing, targetsAt(point).under)
    canvas.style.cursor = cursor
    if (cursor !== '') return
    const live = pointsOn()
    if (live.length === 0) return
    const at = pointOf(lngLat)
    const answers = live.map((p) => p.paints(at))
    if (answers.includes(true)) {
      canvas.style.cursor = 'pointer'
      return
    }
    const pending = answers.filter((a): a is Promise<boolean> => a instanceof Promise)
    if (pending.length === 0) return
    void Promise.all(pending.map((a) => a.catch(() => false))).then((painted) => {
      if (seq === moveSeq && painted.includes(true)) canvas.style.cursor = 'pointer'
    })
  }

  // Every popup, card or bare, is made here and put on the board.
  const make = (
    at: maplibregl.LngLatLike,
    html: string,
    owner: MapTarget | readonly MapTarget[] | undefined,
    options: maplibregl.PopupOptions,
  ) => {
    const popup = new Popup({ ...options, closeOnClick: false }).setLngLat(at).setHTML(html).addTo(map)
    // The app's card on the box the library built (record 0222).
    popup.getElement()?.querySelector('.maplibregl-popup-content')?.classList.add(...POPUP_FACE.split(' '))
    board.track(popup, owner)
    return popup
  }

  // What stands over the map inside the part of it a card can be seen in,
  // in the container's pixels: every surface that names itself
  // `data-map-overlay` (the button column at the top left, the legend box
  // under it) plus whatever the caller names. Found through the container's
  // document rather than handed in, because a card a click opens has no
  // caller to hand it anything.
  const obstacles = (avoid: readonly Rect[]): Rect[] => {
    const container = map.getContainer()
    const box = container.getBoundingClientRect()
    const overlays = [...(container.ownerDocument?.querySelectorAll('[data-map-overlay]') ?? [])]
    return [...overlays.map((el) => el.getBoundingClientRect()), ...avoid].map((r) => ({
      left: r.left - box.left,
      top: r.top - box.top,
      right: r.right - box.left,
      bottom: r.bottom - box.top,
    }))
  }

  const api: MapPopups = {
    register(target) {
      targets.push(target)
    },
    registerPoint(target) {
      points.push(target)
    },
    refreshPoint(kind) {
      if (resting && !resting.dragging) {
        const { x, y } = resting.point
        decideCursor(resting.point, map.unproject([x, y]), false)
      }
      const target = points.find((p) => p.target === kind)
      if (!target?.refresh) return
      for (const open of openPoints) {
        const i = open.kinds.indexOf(kind)
        if (i < 0 || open.signal.aborted) continue
        const seq = (open.seq.get(kind) ?? 0) + 1
        open.seq.set(kind, seq)
        target
          .refresh(pointOf(open.lngLat), open.signal)
          .then((section) => {
            if (open.signal.aborted || open.seq.get(kind) !== seq) return
            open.sections[i] = section
            redraw(open.placed, pointCardHtml(open.sections))
          })
          .catch((err: unknown) => {
            if (!open.signal.aborted) console.warn(`The ${kind} reading failed`, err)
          })
      }
    },
    openCard(at, html, { owner, result = false, markerAt, avoid = [], pan = true } = {}) {
      // Built hanging below its point, measured, and rebuilt above it only
      // when the fit says so, all before a frame is drawn, because MapLibre
      // fixes a popup's side at construction and this is the one moment its
      // size is known. A card too tall to stand whole in the free map area
      // has its body capped first and scrolls (`capHeight`, TJ 2026-10-08),
      // so the fit then places the card the reader will actually see.
      const build = (anchor: PopupSide) =>
        make(at, html, owner, { ...popupOptions(map, { result }), anchor, className: POPUP_CARD_CLASS })
      let popup = build('top')
      const measure = () => {
        const el = popup.getElement()
        return { width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 }
      }
      let size = measure()
      const canvas = map.getCanvas()
      // The part of the map a card can be seen in: above the results sheet.
      const region = {
        left: 0,
        top: 0,
        right: canvas.clientWidth,
        bottom: canvas.clientHeight - controller.inputs.cameraPadBottomPx,
      }
      const point = markerAt ?? map.project(at)
      const standing = obstacles(avoid)
      // The body's height under the cap: whatever the card must lose comes
      // off the body alone, so the title and the band under it stay in view.
      const cap = capHeight(point, size, region, standing)
      const bodyOf = () => popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null
      const first = cap === null ? null : bodyOf()
      const capped = cap === null || first === null ? null : first.offsetHeight - (size.height - cap)
      const applyCap = () => {
        const body = capped === null ? null : bodyOf()
        if (body) capPopupBody(body, capped!)
      }
      applyCap()
      if (capped !== null) size = measure()
      const placed = placePopup(point, size, region, standing)
      if (placed.anchor !== 'top') {
        popup.remove()
        popup = build('bottom')
        applyCap()
      }
      // The map comes to the card rather than the card unfurling wherever its
      // point rested (TJ, 2026-09-29): a pan of what the fit asked for, with
      // the point riding along under the tip. `panBy` moves the camera, so
      // its sign is the point's move reversed.
      if (pan && (placed.dx !== 0 || placed.dy !== 0)) {
        map.panBy([-placed.dx || 0, -placed.dy || 0], { duration: POPUP_PAN_MS })
      }
      return { popup, dx: placed.dx, dy: placed.dy, capped }
    },
    openBare(at, html, { owner, offset }) {
      return make(at, html, owner, { ...popupOptions(map), closeButton: false, ...(offset !== undefined && { offset }) })
    },
    closeAll(owner) {
      board.closeAll(owner)
    },
  }
  return api
}
