/**
 * Every popup on the map, and the one click that opens one (TJ, 2026-10-08).
 *
 * A thing on the map that describes itself in a popup is a target: a ranked
 * marker, a clickable basemap label, a ring handle, a fire perimeter, a closure,
 * a smoke plume, a satellite fire detection. Each registers here with the layers it draws on and how it
 * opens, and this module does the rest the same way for all of them: a click
 * opens the popup of the highest-ranked target under it (the rank is
 * `utils/mapClick.ts`), a click without shift clears the board first, the
 * cursor over a target says it can be clicked, and every popup is made here
 * with the same options and put on the board. Every card is `openCard`, which
 * fits it to the free map, caps a body too tall to stand whole, picks the
 * side of its point it shows more of, and pans the map to it (#738); the one
 * popup that is not a card, the ring's remove-point button, is `openBare`. A
 * popup never opens on a hover: one opened under the cursor covers the
 * destinations inside a fire or a closure, and a touch screen has no hover
 * to open it.
 *
 * A click on bare map opens the card of the spot itself (#832, TJ
 * 2026-11-03): its coordinates, the ground under it, and a button that adds it
 * as a destination, on the same left click every marker and label answers, so
 * a reader finds it where they already click. While a card is open, a click
 * on bare map only closes it, so dismissing a card does not open another;
 * shift opens the spot's card beside the rest, as it does any card. The card
 * is `destinationCards.ts`'s, registered here with `registerSpot`, and a
 * hazard's shape opens the same card at the click (`openSpot`), since what
 * the shape says is a section of it.
 *
 * A layer with something to say at a point is a point target
 * (`registerPoint`): the rain radar and the snow depth (#737), which say
 * whether they painted there from the copy of their tile the app keeps
 * (`utils/heldTiles.ts`), and the five hazard layers (#832), which answer
 * from the features they hold (`utils/hazardSections.ts`). A picture's
 * answer is also the cursor's on every move, a pointer over painted pixels as
 * over a fire. Every card asks every point target that is on for its section
 * at the card's point (`readPoint`, `pointKinds`), and hears through
 * `onPointChange` when one's picture or features changed under it, so a
 * fire that lands after a pan joins the open cards and a layer switched off
 * leaves them; the card itself is `destinationCards.ts`'s.
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
import { POPUP_BODY_ATTR, POPUP_CARD_CLASS, capPopupBody, cardWidthRange, uncapPopupBody } from '../utils/popup/popupChrome'
import { POPUP_FACE } from '../styles'
import { clamp } from '../utils/numbers'
import type { MapPoint, PointAnswer } from '../utils/pointReadout'
import {
  FIT_MARGIN_PX,
  POPUP_PAN_MS,
  bodyBounds,
  figureOf,
  grownBodyCap,
  openingBodyCap,
  placePopup,
  type BodyBounds,
  type Point,
  type PopupSide,
  type Rect,
} from '../utils/popup/popupFit'
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

export type { MapPoint } from '../utils/pointReadout'

/** A layer on the map that answers a card by what it has at the card's point (#737, #832). */
export interface MapPointTarget {
  target: MapTarget
  /** Whether the layer is on, so a layer switched off is never asked. */
  shown(): boolean
  /**
   * Whether the layer painted at this point, read from the tile the map drew:
   * at once where that tile is ready to read, and once it is otherwise. Asked
   * on every pointer move, so it asks nothing of anyone. A hazard layer
   * answers false: its shapes are its own targets, and a pointer ten miles
   * from a fire is not over anything.
   */
  paints(at: MapPoint): boolean | Promise<boolean>
  /**
   * The layer's reading at this point, or null where it has nothing there:
   * at once wherever the layer holds what it needs, which is what puts its
   * section in the card's first paint (#832). A throw or a rejection is a
   * failed reading. `signal` aborts when the card closes.
   */
  read(at: MapPoint, signal: AbortSignal): PointAnswer
  /**
   * The layer's section for a card that already carries one, read again
   * because what the layer shows under it changed: the radar's frame during
   * playback (#748), whose answer at a point it no longer paints is what it
   * shows there rather than null, or the snow's tiles arriving, whose answer
   * is the reading the card already has rather than NOAA asked again. A layer
   * whose answer is the same question twice leaves it out and is read again
   * instead, as is every layer for a card that carries none of its section.
   */
  refresh?(at: MapPoint, signal: AbortSignal): PointAnswer
}

/** What a card may set for itself; everything else is the same for every card. */
interface MapCardOptions {
  /**
   * The kind of thing it describes, so an overlay switched off can take it
   * down; every kind, for a card that describes more than one.
   */
  owner?: MapTarget | readonly MapTarget[]
  /**
   * The ranked card's cap as the card's ceiling (`resultPopupWidth`), which
   * every place's card takes: the popup shrinks to its widest line under it
   * (TJ, 2026-11-04), so only a ranked card's grid reaches it.
   */
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
  /**
   * The size a reader dragged a card to (TJ, 2026-11-03), which this card
   * opens at: its width, held to the map's range, and its body's height,
   * which stands in for the ceiling under the floor and ceiling of this map.
   * The fit still places, caps and pans the card as it does any card.
   */
  size?: CardSize | null
}

/**
 * A card's width and its body's height, as a reader's drag on its handle
 * leaves them; no height where the reader has only sized a card with no body.
 */
export interface CardSize {
  width: number
  body: number | null
}

/** A card on the map, and the move its fit asked of the map. */
interface PlacedCard {
  popup: Popup
  /** How far the card's point, and the card with it, moves across the screen. */
  dx: number
  dy: number
  /** The height its body was capped to, which a redraw must keep, or null. */
  capped: number | null
  /** The card's box as the fit measured it, which tells a later redraw whether the card changed size. */
  size: { width: number; height: number }
}

export interface MapPopups {
  register(target: MapPopupTarget): void
  /** Register a layer that is asked about a point rather than found under it. */
  registerPoint(target: MapPointTarget): void
  /** What a click on bare map opens (#832): the spot's card, at the click. */
  registerSpot(open: (at: maplibregl.LngLat) => void): void
  /**
   * Open the spot's card here, as a click on bare map does: for a shape
   * target whose thing is a section of that card, a fire's perimeter or a
   * hotspot's star (#832).
   */
  openSpot(at: maplibregl.LngLatLike): void
  /** The point targets that are on, in rank order: what every card asks about its point. */
  pointKinds(): MapTarget[]
  /**
   * One layer's reading at a point, or null where it is off or has nothing
   * there: at once where the layer can answer at once (`PointAnswer`).
   * `again` is for a card that already carries the layer's section, which a
   * picture that changes answers through its `refresh`. A failed reading
   * throws or rejects; `signal` is the card's, which aborts when it closes.
   */
  readPoint(kind: MapTarget, at: maplibregl.LngLatLike, signal: AbortSignal, again?: boolean): PointAnswer
  /** Hear of a point target whose picture or features changed (`refreshPoint`), to read every open card again. */
  onPointChange(listen: (kind: MapTarget) => void): void
  /**
   * A point target's picture changed without the reader doing anything, as
   * the radar's does when the player moves to another frame (#748), or its
   * features did, as a fire layer's do when a fetch lands or the layer goes
   * off (#832): every open card reads that layer again where the card stands,
   * and the cursor is decided again where the mouse rests, since no move will
   * come.
   */
  refreshPoint(target: MapTarget): void
  /**
   * The height to cap a card's body at where it stands, for a card that grew
   * after it opened, as one does when a layer's section lands on it (#832):
   * null where the card still stands whole in the free map. What fits, under
   * the ceiling or the reader's `roof` and never under the floor
   * (`grownBodyCap`, TJ 2026-11-03); where the floor runs past the map's
   * edge the map pans by what it runs past, as the fit pans a card that does
   * not fit, and otherwise the card is not moved, since it was placed where
   * the reader saw it open.
   */
  bodyCap(popup: Popup, roof?: number | null): number | null
  /**
   * The bounds a reader's drag sizes a card between on the map as it is now
   * (TJ, 2026-11-03): its width (`cardWidthRange`) and its body's floor and
   * ceiling (`bodyBounds` of the visible map).
   */
  cardBounds(): { width: { min: number; max: number }; body: BodyBounds }
  /**
   * Set a card's width, held to `cardBounds`, and say what it took. MapLibre
   * stands a card on its point by a share of its own width, so the tip stays
   * on the point as it changes; `setMaxWidth` runs the library's update.
   */
  sizeCard(popup: Popup, width: number): number
  /**
   * Fit an open card again, as `openCard` fits a new one: its body measured
   * uncapped and capped between the floor and the ceiling (or under the
   * reader's `roof`), its side the one the fit picks, and the map panned by
   * the fit's move. For a table row's card that changed size around its
   * flight (TJ, 2026-11-04), so a card that grew stands whole rather than
   * hanging off an edge or keeping a cap measured on the shorter card. Where
   * its point stands now, once the flight has landed; or, given `markerAt`
   * and no `pan`, where the flight in the air will set it down, the move
   * handed back for the caller to steer the flight by. Says the body's cap,
   * the move, and the card's box as fitted.
   */
  refit(
    popup: Popup,
    options?: { roof?: number | null; avoid?: readonly Rect[]; markerAt?: Point; pan?: boolean },
  ): { capped: number | null; dx: number; dy: number; size: { width: number; height: number } } | null
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
  const pointListeners: ((kind: MapTarget) => void)[] = []
  // The latest pointer move, so a cursor answer that needed a tile decoded
  // is dropped once the pointer has moved on.
  let moveSeq = 0
  // Where the mouse rests over the map, so the cursor can be decided again
  // when a picture changes under it without a move (#748); null once it has
  // left the map.
  let resting: { point: maplibregl.Point; dragging: boolean } | null = null

  // A coordinate however a caller spells it.
  const lngLatOf = (at: maplibregl.LngLatLike): { lng: number; lat: number } =>
    Array.isArray(at) ? { lng: at[0], lat: at[1] } : 'lon' in at ? { lng: at.lon, lat: at.lat } : at
  // A map scrolled past the antimeridian reports a longitude outside
  // -180..180, which no tile and no source knows. One inside it is kept as
  // given: the wrap's arithmetic moves the last digits of a longitude it
  // does not need to move.
  const wrap = (lng: number) => (lng < -180 || lng > 180 ? (((lng + 180) % 360) + 360) % 360 - 180 : lng)
  const pointOf = (lngLat: { lng: number; lat: number }): MapPoint => ({
    lng: wrap(lngLat.lng),
    lat: lngLat.lat,
    zoom: map.getZoom(),
  })
  const pointsOn = () => {
    const live = points.filter((p) => p.shown()).map((p) => p.target)
    return pointTargetsToAsk(live).map((kind) => points.find((p) => p.target === kind)!)
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

  let spotOpener: ((at: maplibregl.LngLat) => void) | null = null

  map.on('click', (e) => {
    const { under, features } = targetsAt(e.point)
    const closed = isPinning(e) ? 0 : board.closeAll()
    const drawing = controller.inputs.drawing
    const ranked = rankedTargets(drawing, under)
    const open = () => {
      for (const kind of ranked) {
        const target = targets.find((t) => t.target === kind)!
        const feature = target.layers
          .map((id) => features.find((f) => f.layer.id === id))
          .find((f) => f !== undefined)
        if (feature && target.open({ feature, lngLat: e.lngLat, point: e.point }) !== false) return
      }
      if (drawing) deps.addPoint([e.lngLat.lng, e.lngLat.lat])
      // A click that closed a card has done what the reader meant by it.
      else if (closed === 0) api.openSpot(e.lngLat)
    }
    // A click that opens a card, on a marker, a dot, a label, a hazard or
    // bare map, lowers a phone's results sheet first, as a table row's press
    // does, and the card opens once it is down, fitted to the map it leaves
    // (TJ, 2026-11-04). A ring being drawn opens nothing but its handles'
    // buttons, and a click that only closed a card opens nothing at all.
    if (!drawing && (ranked.length > 0 || closed === 0)) controller.inputs.lowerSheetFirst(open)
    else open()
  })

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
  // moved on since. Never while the ring is drawn, where a click on scenery
  // places a corner.
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
    const drawing = controller.inputs.drawing
    const cursor = mapCursor(drawing, targetsAt(point).under)
    canvas.style.cursor = cursor
    if (cursor !== '' || drawing) return
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

  // The part of the map a card can be seen in: above the results sheet. Its
  // height is what a card's body floor and ceiling are shares of.
  const regionNow = (): Rect => {
    const canvas = map.getCanvas()
    return { left: 0, top: 0, right: canvas.clientWidth, bottom: canvas.clientHeight - controller.inputs.cameraPadBottomPx }
  }

  // The card's box, which MapLibre sizes to its content up to the popup's
  // max width: an explicit width on it and the same max width on the popup
  // make the card that wide whatever its content.
  const sizeTo = (popup: Popup, width: number): number => {
    const { min, max } = cardWidthRange(map.getCanvas().clientWidth)
    const px = Math.round(clamp(width, min, max))
    const content = popup.getElement()?.querySelector?.<HTMLElement>('.maplibregl-popup-content')
    if (content) content.style.width = `${px}px`
    popup.setMaxWidth(`${px}px`)
    return px
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
    registerSpot(open) {
      spotOpener = open
    },
    openSpot(at) {
      // Wrapped, so the spot's title, its link and the destination it adds
      // carry a longitude a tile or a share link knows.
      const { lng, lat } = pointOf(lngLatOf(at))
      spotOpener?.({ lng, lat } as maplibregl.LngLat)
    },
    pointKinds() {
      return pointsOn().map((p) => p.target)
    },
    readPoint(kind, at, signal, again = false) {
      const target = points.find((p) => p.target === kind)
      if (!target?.shown()) return null
      const point = pointOf(lngLatOf(at))
      return again && target.refresh ? target.refresh(point, signal) : target.read(point, signal)
    },
    onPointChange(listen) {
      pointListeners.push(listen)
    },
    refreshPoint(kind) {
      if (resting && !resting.dragging) {
        const { x, y } = resting.point
        decideCursor(resting.point, map.unproject([x, y]), false)
      }
      for (const listen of pointListeners) listen(kind)
    },
    bodyCap(popup, roof = null) {
      const el = popup.getElement()
      const body = el?.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
      // Optional: a test's stub popup has no place on the map.
      const at = popup.getLngLat?.()
      if (!el || !body || !at) return null
      // The card as it stands: on the side it opened on, over the point it
      // opened at, against the free map as it is now. What hangs past the
      // edge, and the breath the fit keeps from it, comes off the body.
      const anchor: PopupSide = popup.options?.anchor === 'bottom' ? 'bottom' : 'top'
      const region = regionNow()
      const figure = figureOf(map.project(at), { width: el.offsetWidth, height: el.offsetHeight }, anchor)
      const over = anchor === 'top' ? figure.bottom - region.bottom : region.top - figure.top
      const { cap, pan } = grownBodyCap(body.offsetHeight, over + FIT_MARGIN_PX, region, roof)
      // The floor ran past the edge: the map brings it in, the point moving
      // up for a card hanging below it and down for one standing above.
      if (pan > 0) map.panBy([0, anchor === 'top' ? pan : -pan], { duration: POPUP_PAN_MS })
      return cap
    },
    cardBounds() {
      return { width: cardWidthRange(map.getCanvas().clientWidth), body: bodyBounds(regionNow()) }
    },
    sizeCard: sizeTo,
    refit(popup, { roof = null, avoid = [], markerAt, pan = true } = {}) {
      const el = popup.getElement()
      // Optional: a test's stub popup has no place on the map.
      const at = popup.getLngLat?.()
      if (!el || !at) return null
      const body = el.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null
      if (body) uncapPopupBody(body)
      const region = regionNow()
      const point = markerAt ?? map.project(at)
      const standing = obstacles(avoid)
      const measure = () => ({ width: el.offsetWidth, height: el.offsetHeight })
      const capped = body ? openingBodyCap(point, measure(), body.offsetHeight, region, standing, roof) : null
      if (body && capped !== null) capPopupBody(body, capped)
      const size = measure()
      const placed = placePopup(point, size, region, standing)
      // MapLibre reads a popup's side on every update, so the card turns in
      // place and keeps its listeners and its place on the board, where a
      // new card would be a second one for the reader to lose.
      if (popup.options && popup.options.anchor !== placed.anchor) {
        popup.options.anchor = placed.anchor
        popup.setLngLat(at)
      }
      if (pan && (placed.dx !== 0 || placed.dy !== 0)) {
        map.panBy([-placed.dx || 0, -placed.dy || 0], { duration: POPUP_PAN_MS })
      }
      return { capped, dx: placed.dx, dy: placed.dy, size }
    },
    openCard(at, html, { owner, result = false, markerAt, avoid = [], pan = true, size = null } = {}) {
      // Built hanging below its point, measured, and rebuilt above it only
      // when the fit says so, all before a frame is drawn, because MapLibre
      // fixes a popup's side at construction and this is the one moment its
      // size is known. A card too tall to stand whole in the free map area
      // has its body capped first and scrolls (`capHeight`, TJ 2026-10-08),
      // so the fit then places the card the reader will actually see; the
      // cap keeps the body between a floor and a ceiling of the visible map
      // (`openingBodyCap`, TJ 2026-11-03). A card a reader sized opens at
      // that width before it is measured, so the fit measures the card the
      // reader will see.
      const build = (anchor: PopupSide) => {
        const made = make(at, html, owner, { ...popupOptions(map, { result }), anchor, className: POPUP_CARD_CLASS })
        if (size) sizeTo(made, size.width)
        return made
      }
      let popup = build('top')
      const measure = () => {
        const el = popup.getElement()
        return { width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 }
      }
      let card = measure()
      const region = regionNow()
      const point = markerAt ?? map.project(at)
      const standing = obstacles(avoid)
      // The body's height under the cap: whatever the card must lose comes
      // off the body alone, so the title and the band under it stay in view.
      const bodyOf = () => popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null
      const first = bodyOf()
      const capped = first === null ? null : openingBodyCap(point, card, first.offsetHeight, region, standing, size?.body ?? null)
      const applyCap = () => {
        const body = capped === null ? null : bodyOf()
        if (body) capPopupBody(body, capped!)
      }
      applyCap()
      if (capped !== null) card = measure()
      const placed = placePopup(point, card, region, standing)
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
      return { popup, dx: placed.dx, dy: placed.dy, capped, size: card }
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
