/**
 * Every card that describes a place on the map, opened, kept current and
 * answered in one place (#832, TJ 2026-11-03): a ranked marker's, a pending
 * dot's, a clicked label's and a clicked spot's. The markup is one builder's
 * (`utils/destinationCard.ts`); this is what a card needs a map for.
 *
 * Each card used to live in the module that found its click, so the ranked
 * card re-armed its grid after a redraw and the label's did not need to, the
 * pending card answered a remove one way and the label another, and the
 * ground's redraw was written three times. Here a card is a subject and a
 * popup, and every one of them is drawn, redrawn and answered the same way:
 *
 * - **drawn** with what the map knows now: the zoom, the ground under the
 *   point (`groundReadings.ts`), the state outlines a crag's search names its
 *   state by, and for a ranked row everything the table shows of it;
 * - **read** by every layer that is on, each for the section it has at the
 *   card's point (`mapPopups.readPoint`): the hazards within reach and the
 *   pictures painted there. Each is asked before the card is drawn, and
 *   every one that answers at once (a hazard always, a picture whose tile is
 *   decoded) is in the card's first paint, so the fit measures the whole
 *   card and no section pops in under the reader (TJ, 2026-11-03); only a
 *   value still on its way, the snow's numbers, lands later inside its
 *   section. Each is read again when a layer's picture or features change
 *   under it (`onPointChange`), so a fire that arrives after a pan joins the
 *   open cards and a layer switched off leaves them; closing the card aborts
 *   what it was still waiting for;
 * - **redrawn** where it stands whenever any of that changes: a ground read
 *   landing, the outlines arriving, a section landing, a grid column a
 *   reader sized, or a new ranking. A redraw keeps the card's cap, its
 *   scroll and the reader's focus, since it answers something the reader did
 *   elsewhere, and a card that grew past the free map is capped where it
 *   stands (`bodyCap`), or where the map's move leaves it when it grew in
 *   the air, as under the pan a card opens with; a table row's card is
 *   placed again and its flight steered instead (`steer`, `place`);
 * - **folded** by its chevrons: a fold the reader makes on one card's
 *   section holds for that section on every card until the page is reloaded
 *   (TJ, 2026-11-03), so a reader who shut the smoke on one marker is not
 *   shown it open on the next;
 * - **held** at the width it opened at (TJ, 2026-11-04): MapLibre centres a
 *   card on its point, so a card that widened when a value landed would
 *   move both its edges and its × under the reader. The card stands at the width
 *   the fit measured, which is its first paint's, and a line that lands
 *   wider is cut with its ellipsis or wraps;
 * - **sized** by the handle in its bottom-right corner, with a pointer or a
 *   finger (TJ, 2026-11-03): the drag sets the card's width and its body's
 *   height between the bounds the map gives (`cardBounds`): the height from
 *   a heading's worth to the free map's, shorter than its content to scroll
 *   or taller to leave the card's surface under it (TJ, 2026-11-04). The
 *   size holds for every card opened after it until the page is reloaded,
 *   by the folds' rule, the reader's choice following them. A card opened at
 *   that size is still fitted and panned as any card is, its body at the
 *   reader's height rather than under the app's cap;
 * - **answered** by its one button: a row in the analysis leaves it as the
 *   table's × does, and a place outside it joins it as a search by name does.
 *
 * The click that finds the subject stays with the layer that draws it
 * (`resultsLayer.ts`, `poiPopup.ts`) or the map's own (`mapPopups.ts` for a
 * spot), since only that layer knows how to read its feature.
 */
import type { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { DestinationResult } from '../types'
import { samePoi } from '../utils/basemapPoi'
import { pendingAsResult } from '../utils/customList'
import {
  CARD_ACTION_ATTR,
  type CardSubject,
  type CardView,
  destinationPopupHtml,
  sectionOpen,
  subjectPlace,
  subjectPoint,
  subjectType,
} from '../utils/destinationCard'
import type { Place } from '../utils/geocode'
import { MAP_TARGETS, type MapTarget } from '../utils/mapClick'
import type { ModelRow } from '../utils/model/modelCompare'
import type { PointAnswer, PointReading, PointSection } from '../utils/pointReadout'
import {
  CARD_FOLD_ATTR,
  CARD_RESIZE_ATTR,
  POPUP_BODY_ATTR,
  capPopupBody,
  compactGrid,
  fixPopupBody,
} from '../utils/popup/popupChrome'
import { clamp } from '../utils/numbers'
import type { Point as ScreenPoint, Rect } from '../utils/popup/popupFit'
import { loadUsStates, usStatesNow } from '../utils/usStatesLoad'
import type { MapController } from './controller'
import type { GridHeads } from './gridHeads'
import type { GroundReadings } from './groundReadings'
import type { CardSize, MapPopups } from './mapPopups'

/** Where a card opens, beyond its point. */
export interface CardOpenOptions {
  /**
   * Where the card's point WILL stand, in the map container's pixels, for a
   * caller about to fly it there, as a table row's centring is.
   */
  markerAt?: ScreenPoint
  /** What else stands over the map, as viewport rects. */
  avoid?: readonly Rect[]
  /** Whether the map pans by the fit's move; a caller folding it into a flight says no. */
  pan?: boolean
  /**
   * For a caller flying the card's point to `markerAt`: asked when the card
   * changes size while the flight is in the air, so the caller can place it
   * again (`place`) and steer the flight to where that fit puts it, and the
   * card lands whole rather than being moved after it has landed.
   */
  steer?: () => void
}

/** A card on the map, and the move its fit asked of the map. */
export interface OpenedCard {
  popup: Popup
  dx: number
  dy: number
}

export interface DestinationCards {
  /** Open a card on this subject, fitted, capped and placed as every card is (`openCard`). */
  open(subject: CardSubject, at: maplibregl.LngLatLike, options?: CardOpenOptions): OpenedCard
  /**
   * Redraw every open card from the inputs as they stand. A ranked card finds
   * its row again among the displayed rows, so a new ranking moves its rank
   * and the number it marks, and a column the reader hides leaves it.
   */
  refresh(): void
  /** Whether a ranked card stands open on this destination. */
  hasOpenRanked(at: { latitude: number; longitude: number }): boolean
  /**
   * Fit the card standing on this point ahead of a flight again, for where
   * the flight will now set its point down (`markerAt`), and say the move,
   * which the caller folds into the flight it sends again: a flight aimed
   * again after a resize (record 0202) or after the card changed size in the
   * air (`steer`). Undefined where no such card stands, as one the reader
   * closed since.
   */
  place(at: { latitude: number; longitude: number }, options: { markerAt: ScreenPoint; avoid?: readonly Rect[] }):
    | { dx: number; dy: number }
    | undefined
}

/** One open card, with what redraws it. */
interface Card {
  popup: Popup
  subject: CardSubject
  /** The markup it shows, so a redraw that changes nothing writes nothing. */
  html: string
  /** The height its body was capped to, which new markup arrives without. */
  capped: number | null
  /**
   * The destination a label or a spot is registered as, or null. Held on the
   * card rather than re-read from the controller after a press: the
   * controller catches up on React's next render, and the button flips on
   * this one.
   */
  registered: Place | null
  /** What each layer said at its point, by the layer's target. */
  sections: Map<MapTarget, PointSection>
  /** Aborts every reading for it when it closes. */
  reading: AbortController
  /** Each layer's latest ask, so a slower answer cannot paint over a newer one. */
  seq: Map<MapTarget, number>
  /** Whether its cap waits for the map's move to end (`capWhenStill`). */
  capping: boolean
  /**
   * Whether its body stands at a height the reader dragged to (`fixPopupBody`),
   * on this card or on one before it, rather than under a cap the app chose:
   * such a body is never capped again, since it holds what the reader asked.
   */
  fixed: boolean
  /**
   * Where a card opened ahead of a table row's flight stands in its one
   * re-fit (TJ, 2026-11-04): `flying` until the flight lands, `landed` from
   * then until the re-fit or the map's next move, and null for every other
   * card and once the re-fit is spent.
   */
  landing: 'flying' | 'landed' | null
  /**
   * Whether it changed size in the air with no flight steered to the new
   * fit, so it re-fits as it lands.
   */
  grew: boolean
  /** What else it was fitted around, which its re-fit is fitted around too. */
  avoid: readonly Rect[]
  /**
   * Its box as the fit last measured it. A redraw that leaves the box as it
   * was moves nothing: the ground's slope, which lands on every card a table
   * row opens, rewrites a line and keeps the height.
   */
  fitted: { width: number; height: number } | null
  /** The opener's `steer`, for a card whose flight can still be aimed again. */
  steer: (() => void) | null
  /** Counts its flights, so a landing heard from one the next replaced is not its own. */
  flights: number
}

// What each kind of card is closed by, when a click elsewhere or an overlay
// switched off clears the board. A spot's card has no owner: what it carries
// is the layers' sections, which leave it when their layer goes off.
const OWNER: Record<Exclude<CardSubject['kind'], 'spot'>, MapTarget> = {
  ranked: 'result',
  pending: 'pending',
  label: 'poi',
}

export function mountDestinationCards(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: MapPopups
    /** The heads of a ranked card's grid, which a reader drags and sizes. */
    gridHeads: GridHeads
    /** The ground under each card's point; with none, no card reads it. */
    ground?: GroundReadings
  },
): DestinationCards {
  const { controller, popups, gridHeads, ground } = deps
  let cards: Card[] = []
  // Each section the reader folded or opened by hand, by its key, for the
  // session: the default is the card's (`sectionOpen`) until they do.
  const folds = new Map<string, boolean>()
  // The size the reader last dragged a card to, for the session: every card
  // opened after it opens at it, as a fold holds for the next card.
  let chosen: CardSize | null = null

  function viewOf(card: Card): CardView {
    const { subject: s } = card
    const at = subjectPoint(s)
    const shared: CardView = {
      mapZoom: map.getZoom(),
      // A crag's search names its state once the outlines are held; a card
      // opened before they land is redrawn when they do (`open`).
      usStates: usStatesNow(),
      ground: ground?.at(at.lat, at.lon),
      added: card.registered !== null,
      // In the map's rank, whatever order the layers answered in.
      sections: MAP_TARGETS.filter((kind) => card.sections.has(kind)).map((kind) => card.sections.get(kind)!),
      folds,
      // Whether an analysis exists, which folds every section but the
      // forecast (`sectionOpen`), and the forecast's fine print.
      analyzedAtMs: controller.inputs.analyzedAtMs,
    }
    if (s.kind !== 'ranked') return shared
    const live = controller.inputs
    const row = s.row
    return {
      ...shared,
      columns: live.popupColumns,
      // A per-model row names its own model; a single-model report has one
      // for every row. Same rule as the table's cells.
      modelId: (row as ModelRow).modelId ?? live.modelId,
      times: row.series_times ?? live.times,
      modelFallbackLabel: live.modelFallbackLabel,
      rankedBy: live.sortBy,
      pointSample: live.pointSample,
      compact: compactGrid(map.getCanvas().clientWidth),
      widths: gridHeads.widths(),
      removable: true,
    }
  }

  const htmlOf = (card: Card) => destinationPopupHtml(card.subject, viewOf(card))
  const bodyOf = (card: Card) => card.popup.getElement()?.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null

  // setHTML replaces the card's children, so its button, its folds and its
  // grid's heads are new nodes after every write and are wired again each
  // time.
  function arm(card: Card) {
    const el = card.popup.getElement()
    // Optional: a test's stub popup has no DOM.
    el?.querySelector?.<HTMLButtonElement>(`[${CARD_ACTION_ATTR}]`)?.addEventListener('click', () => act(card))
    el?.querySelectorAll?.<HTMLButtonElement>(`[${CARD_FOLD_ATTR}]`).forEach((button) => {
      button.addEventListener('click', () => fold(card, button.getAttribute(CARD_FOLD_ATTR)!))
    })
    if (card.subject.kind === 'ranked') gridHeads.arm(card.popup)
    const handle = el?.querySelector?.<HTMLElement>(`[${CARD_RESIZE_ATTR}]`)
    handle?.addEventListener('pointerdown', (e) => resize(card, handle, e))
  }

  // A drag on the handle (TJ, 2026-11-03). MapLibre stands a card centred on
  // its point, so the card grows on both sides and its width takes twice the
  // pointer's travel, which keeps the handle under the pointer. The body
  // takes the travel down, held between the map's floor and ceiling and
  // capped as the drag goes, so it scrolls under its header where it is
  // shorter than what it holds. The handle captures the pointer, so every
  // move of a drag that leaves the card, or of a finger that leaves the
  // handle, comes to it until the button or the finger lifts.
  function resize(card: Card, handle: HTMLElement, e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    handle.setPointerCapture(e.pointerId)
    // The reader sizes the card now, so no re-fit undoes it.
    card.landing = null
    const el = card.popup.getElement()
    const width0 = el?.offsetWidth ?? 0
    const body0 = bodyOf(card)?.offsetHeight ?? 0
    // The body's range, read once: the card's header does not change under
    // the drag, and the free map's height is the map's as the drag starts.
    const range = popups.cardBounds(card.popup).body
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const width = popups.sizeCard(card.popup, width0 + 2 * (ev.clientX - x0))
      // A card with no body, a spot with no layer on, sizes its width alone
      // and leaves the height the reader chose on another card as it was.
      // The floor and the ceiling are the app's default and bound nothing
      // here (TJ, 2026-11-04): the body stands at the height asked for.
      const body = bodyOf(card)
      let height = chosen?.body ?? null
      if (body) {
        height = Math.round(clamp(body0 + ev.clientY - y0, range.min, range.max))
        card.capped = height
        card.fixed = true
        fixPopupBody(body, height)
      }
      chosen = { width, body: height }
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  // A chevron's press: the section folds or opens on every card, and the
  // chevron pressed keeps the reader's focus, in its new markup. The flip is
  // of what the card showed, the default included.
  function fold(card: Card, key: string) {
    folds.set(key, !sectionOpen(key, folds, controller.inputs.analyzedAtMs != null))
    for (const c of cards) write(c)
    card.popup.getElement()?.querySelector?.<HTMLButtonElement>(`[${CARD_FOLD_ATTR}="${key}"]`)?.focus?.()
  }

  // The button. Reads the card's subject at the press, so a ranked card a new
  // ranking moved onto another row removes that row.
  function act(card: Card) {
    const s = card.subject
    const inputs = controller.inputs
    switch (s.kind) {
      case 'ranked':
        // The row's ×, which takes the card with it, since the row leaves.
        inputs.onRemoveResult(s.row)
        card.popup.remove()
        return
      case 'pending':
        // The pending row's ×, whatever named it (TJ, 2026-11-03): a removal
        // the Removed list can restore, as a ranked row's is.
        inputs.onRemoveResult(pendingAsResult(s.pending))
        card.popup.remove()
        return
      default:
        if (card.registered) {
          inputs.onRemovePoi(card.registered.lat, card.registered.lon)
          card.registered = null
        } else {
          const place = subjectPlace(s)!
          inputs.onAddPoi(place)
          card.registered = place
        }
        // A press, so focus goes where MapLibre puts it in new markup.
        write(card, false)
    }
  }

  // The card's markup as it stands, where it changed. A redraw that answers
  // something other than a press on the card leaves focus where it is:
  // MapLibre moves focus into a popup whenever its content is set. `grown`
  // says what the map reads at the point landed, a layer's section or the
  // ground, which is what a table row's card re-fits for; a fold or a press
  // is the reader's and moves nothing.
  function write(card: Card, keepFocus = true, grown = false) {
    if (!cards.includes(card)) return
    const html = htmlOf(card)
    if (html === card.html) return
    const scrolled = bodyOf(card)?.scrollTop ?? 0
    const options = card.popup.options
    const focus = options?.focusAfterOpen
    if (keepFocus && options) options.focusAfterOpen = false
    card.popup.setHTML(html)
    if (keepFocus && options) options.focusAfterOpen = focus
    card.html = html
    arm(card)
    const body = bodyOf(card)
    // A card that grew past the free map, a value having landed in it, is
    // capped where it stands; one capped already keeps its cap. While the
    // map moves, the point is somewhere along the way, as it is under a
    // table row's flight, and a cap measured there is a keyhole or nothing.
    // A table row's card that changes size in its flight is placed again
    // and its flight steered to the new place, so it lands whole; one that
    // changes size after it lands is fitted again once (`land`). A redraw
    // that leaves its box as it was moves nothing.
    if (card.landing === 'flying') {
      if (grown && resized(card)) {
        card.grew = true
        card.steer?.()
      }
    } else if (card.landing === 'landed') {
      if (grown && resized(card)) refit(card)
    } else if (body && card.capped === null) {
      if (map.isMoving()) capWhenStill(card)
      else card.capped = popups.bodyCap(card.popup)
    }
    if (body && card.capped !== null) (card.fixed ? fixPopupBody : capPopupBody)(body, card.capped)
    if (body) body.scrollTop = scrolled
  }

  // Whether the card's box is not the one its fit measured.
  function resized(card: Card): boolean {
    const el = card.popup.getElement()
    if (!el || !card.fitted) return false
    return el.offsetWidth !== card.fitted.width || el.offsetHeight !== card.fitted.height
  }

  // A table row's card opens before its flight, and the layers that fetch
  // for the view the flight lands on (the hazards, the snow's tiles) answer
  // only once it has: their sections join the card after the fit placed it
  // (TJ, 2026-11-04). A section that joins in the air steers the flight
  // (`steer`); so the card fits again once, as it lands where it changed
  // size in the air with no flight steered for it, or at the first change
  // after, and the map's next move ends the wait, the card's place being the
  // reader's from then on.
  //
  // The landing is heard from the flight's own `moveend`, armed at its
  // `movestart`: a flight sent again starts by stopping the one in the air,
  // which ends that one with a `moveend` of its own.
  function land(card: Card) {
    card.landing = 'flying'
    const flight = ++card.flights
    const started = () => {
      map.off('movestart', started)
      if (card.flights === flight) map.on('moveend', landed)
    }
    const landed = () => {
      map.off('moveend', landed)
      if (!cards.includes(card) || card.flights !== flight || card.landing !== 'flying') return
      if (card.grew && resized(card)) {
        refit(card)
        return
      }
      card.landing = 'landed'
      const moved = () => {
        map.off('movestart', moved)
        if (card.landing === 'landed') card.landing = null
      }
      map.on('movestart', moved)
    }
    map.on('movestart', started)
  }

  // The one re-fit: the body measured afresh between the floor and the
  // ceiling, the side and the pan the fit asks for, as `openCard` does.
  function refit(card: Card) {
    card.landing = null
    card.capped = popups.refit(card.popup, { body: card.fixed ? card.capped : null, avoid: card.avoid })?.capped ?? null
  }

  // The cap a card that grew in the air takes where the move set it down.
  function capWhenStill(card: Card) {
    if (card.capping) return
    card.capping = true
    const still = () => {
      map.off('moveend', still)
      card.capping = false
      if (!cards.includes(card) || card.capped !== null) return
      card.capped = popups.bodyCap(card.popup)
      const body = bodyOf(card)
      if (body && card.capped !== null) capPopupBody(body, card.capped)
    }
    map.on('moveend', still)
  }

  // One layer's section for the card, asked where the card stands: landed
  // at once where the layer answers at once, else when it answers, and again
  // when a value it was still asking for lands (`later`). Taken off the card
  // where the layer has nothing there or is off. A layer's answer that
  // arrives after the card asked it again is dropped, and one that fails is
  // warned about and leaves the card as it was. Landing writes the card,
  // which a card not yet drawn skips: its first markup is drawn with
  // whatever landed (`open`).
  function read(card: Card, kind: MapTarget, again: boolean) {
    const seq = (card.seq.get(kind) ?? 0) + 1
    card.seq.set(kind, seq)
    const stale = () => card.reading.signal.aborted || card.seq.get(kind) !== seq
    const failed = (err: unknown) => {
      if (!card.reading.signal.aborted) console.warn(`The ${kind} reading failed`, err)
    }
    const land = (reading: PointReading | null) => {
      if (stale()) return
      if (reading === null) card.sections.delete(kind)
      else card.sections.set(kind, reading.section)
      write(card, true, true)
      reading?.later
        ?.then((section) => {
          if (stale()) return
          card.sections.set(kind, section)
          write(card, true, true)
        })
        .catch(() => {})
    }
    const at = subjectPoint(card.subject)
    let answer: PointAnswer
    try {
      answer = popups.readPoint(kind, { lng: at.lon, lat: at.lat }, card.reading.signal, again)
    } catch (err) {
      failed(err)
      return
    }
    if (answer instanceof Promise) answer.then(land).catch(failed)
    else land(answer)
  }

  // The displayed row a ranked card now stands for: the same row where it is
  // still shown, else the row at its coordinates from the same model, since a
  // comparison stands one row per model on each destination and a card must
  // not swap models. A row the presentation no longer shows keeps the numbers
  // it was opened on and loses its rank, rather than closing under the reader
  // (TJ, 2026-10-08).
  function rerank(row: DestinationResult): CardSubject {
    const shown = controller.inputs.results
    const model = (row as ModelRow).modelId
    const now = shown.includes(row)
      ? row
      : shown.find(
          (r) => r.latitude === row.latitude && r.longitude === row.longitude && (r as ModelRow).modelId === model,
        )
    return now ? { kind: 'ranked', row: now, rank: shown.indexOf(now) + 1 } : { kind: 'ranked', row, rank: '' }
  }

  function refresh(grown = false) {
    for (const card of cards) {
      if (card.subject.kind === 'ranked') card.subject = rerank(card.subject.row)
      write(card, true, grown)
    }
  }

  // Which destination a label or a spot already is, among those the reader
  // named. A label matches by name and distance, as a search's result does;
  // a spot by the coordinate it registers at.
  function registeredAs(s: CardSubject): Place | null {
    const named = controller.inputs.searchedPlaces
    if (s.kind === 'label') return named.find((p) => samePoi(s.poi, p)) ?? null
    if (s.kind === 'spot') {
      const at = subjectPoint(s)
      return named.find((p) => p.lat === at.lat && p.lon === at.lon) ?? null
    }
    return null
  }

  ground?.onRead(() => refresh(true))
  gridHeads.onResize(() => refresh())
  // A layer whose picture or features changed is read again by every card,
  // which takes its section off where it now has nothing or is off. Only a
  // card that carries the layer's section is asked through its `refresh`;
  // every other is asked as a card opening there would be, so a card open
  // while the radar comes on over a dry point says what one opened after it
  // does: nothing, rather than the no-echo line a frame change keeps on a
  // card that had an echo.
  popups.onPointChange((kind) => {
    for (const card of cards) read(card, kind, card.sections.has(kind))
  })

  return {
    open(subject, at, { markerAt, avoid, pan = true, steer } = {}) {
      const card: Card = {
        popup: null as unknown as Popup,
        subject,
        html: '',
        capped: null,
        registered: registeredAs(subject),
        sections: new Map(),
        reading: new AbortController(),
        seq: new Map(),
        capping: false,
        fixed: chosen?.body != null,
        landing: null,
        grew: false,
        avoid: avoid ?? [],
        fitted: null,
        steer: steer ?? null,
        flights: 0,
      }
      // Every layer that is on, asked for what it has here before the card
      // is drawn, so each that answers at once is in the markup the fit
      // measures and places, and on a table row's card, in the move the
      // flight folds in. One still decoding its tile lands a moment later.
      for (const kind of popups.pointKinds()) read(card, kind, false)
      card.html = htmlOf(card)
      const placed = popups.openCard(at, card.html, {
        owner: subject.kind === 'spot' ? undefined : OWNER[subject.kind],
        result: true,
        markerAt,
        avoid,
        pan,
        size: chosen,
      })
      card.popup = placed.popup
      card.capped = placed.capped
      // A card with no body has no height to hold, whatever the reader chose.
      card.fixed = card.fixed && placed.capped !== null
      card.fitted = placed.size
      // Held at the width the fit measured, its first paint's, so nothing
      // that lands later widens it and moves it on its point (TJ, 2026-11-04):
      // the snow's numbers, a section a layer answers a moment late, the
      // ground's slope. Not the reader's size: the next card opens at its own.
      // A card opened at the reader's width stands at it already.
      if (!chosen) popups.holdCard(placed.popup)
      // A point given for where the card WILL stand is a flight to come.
      if (markerAt) land(card)
      // The tutorial's marker step frames a ranked card (#536).
      if (subject.kind === 'ranked') placed.popup.getElement()?.setAttribute('data-tour', 'marker')
      cards.push(card)
      arm(card)
      placed.popup.on('close', () => {
        card.reading.abort()
        cards = cards.filter((c) => c !== card)
      })
      // The markers asked for the outlines when a crag came into view, so
      // this waits only on a card opened before they landed.
      if (subjectType(subject) === 'crag' && usStatesNow() === null) {
        void loadUsStates().then((states) => {
          if (states) write(card)
        })
      }
      return { popup: placed.popup, dx: placed.dx, dy: placed.dy }
    },
    refresh: () => refresh(),
    hasOpenRanked({ latitude, longitude }) {
      return cards.some(
        (c) => c.subject.kind === 'ranked' && c.subject.row.latitude === latitude && c.subject.row.longitude === longitude,
      )
    },
    place({ latitude, longitude }, { markerAt, avoid }) {
      const card = [...cards].reverse().find((c) => {
        const p = subjectPoint(c.subject)
        return c.landing === 'flying' && p.lat === latitude && p.lon === longitude
      })
      if (!card) return undefined
      // Drawn first for the map as it stands, as a card opening now would
      // be: a resize can change how the grid is laid out.
      write(card)
      if (avoid) card.avoid = avoid
      const fit = popups.refit(card.popup, {
        body: card.fixed ? card.capped : null,
        avoid: card.avoid,
        markerAt,
        pan: false,
      })
      if (!fit) return undefined
      card.capped = fit.capped
      card.fitted = fit.size
      card.grew = false
      // The flight it is about to ride.
      land(card)
      return { dx: fit.dx, dy: fit.dy }
    },
  }
}
