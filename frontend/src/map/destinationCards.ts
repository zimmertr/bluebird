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
 * - **redrawn** where it stands whenever any of that changes: a ground read
 *   landing, the outlines arriving, a grid column a reader sized, or a new
 *   ranking. A redraw keeps the card's cap, its scroll and the reader's
 *   focus, since it answers something the reader did elsewhere;
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
  subjectPlace,
  subjectPoint,
  subjectType,
} from '../utils/destinationCard'
import type { Place } from '../utils/geocode'
import type { MapTarget } from '../utils/mapClick'
import type { ModelRow } from '../utils/model/modelCompare'
import { POPUP_BODY_ATTR, capPopupBody, compactGrid } from '../utils/popup/popupChrome'
import type { Point as ScreenPoint, Rect } from '../utils/popup/popupFit'
import { loadUsStates, usStatesNow } from '../utils/usStatesLoad'
import type { MapController } from './controller'
import type { GridHeads } from './gridHeads'
import type { GroundReadings } from './groundReadings'
import type { MapPopups } from './mapPopups'

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
  /** The kinds of thing it describes, for a spot whose sections are an overlay's. */
  owner?: readonly MapTarget[]
}

/** A card on the map, and the move its fit asked of the map. */
export interface OpenedCard {
  popup: Popup
  dx: number
  dy: number
  /** Replace what the card describes and redraw it where it stands: a spot's sections as they land. */
  update(subject: CardSubject): void
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
}

// What each kind of card is closed by, when a click elsewhere or an overlay
// switched off clears the board.
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
    }
    if (s.kind !== 'ranked') return shared
    const live = controller.inputs
    const row = s.row
    return {
      ...shared,
      columns: live.popupColumns,
      // Read from the row's own coordinates, which are the exact ones a
      // marker carries, so the warnings match on them.
      warning: controller.fireWarningAt(row.latitude, row.longitude),
      closure: controller.closureWarningAt(row.latitude, row.longitude),
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

  // setHTML replaces the card's children, so its button and its grid's heads
  // are new nodes after every write and are wired again each time.
  function arm(card: Card) {
    const el = card.popup.getElement()
    // Optional: a test's stub popup has no DOM.
    el?.querySelector?.<HTMLButtonElement>(`[${CARD_ACTION_ATTR}]`)?.addEventListener('click', () => act(card))
    if (card.subject.kind === 'ranked') gridHeads.arm(card.popup)
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
  // MapLibre moves focus into a popup whenever its content is set.
  function write(card: Card, keepFocus = true) {
    if (!cards.includes(card)) return
    const html = htmlOf(card)
    if (html === card.html) return
    const bodyOf = () => card.popup.getElement()?.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null
    const scrolled = bodyOf()?.scrollTop ?? 0
    const options = card.popup.options
    const focus = options?.focusAfterOpen
    if (keepFocus && options) options.focusAfterOpen = false
    card.popup.setHTML(html)
    if (keepFocus && options) options.focusAfterOpen = focus
    card.html = html
    arm(card)
    const body = bodyOf()
    if (body && card.capped !== null) capPopupBody(body, card.capped)
    if (body) body.scrollTop = scrolled
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

  function refresh() {
    for (const card of cards) {
      if (card.subject.kind === 'ranked') card.subject = rerank(card.subject.row)
      write(card)
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

  ground?.onRead(refresh)
  gridHeads.onResize(refresh)

  return {
    open(subject, at, { markerAt, avoid, pan = true, owner } = {}) {
      const card: Card = { popup: null as unknown as Popup, subject, html: '', capped: null, registered: registeredAs(subject) }
      card.html = htmlOf(card)
      const placed = popups.openCard(at, card.html, {
        owner: owner ?? (subject.kind === 'spot' ? undefined : OWNER[subject.kind]),
        result: true,
        markerAt,
        avoid,
        pan,
      })
      card.popup = placed.popup
      card.capped = placed.capped
      // The tutorial's marker step frames a ranked card (#536).
      if (subject.kind === 'ranked') placed.popup.getElement()?.setAttribute('data-tour', 'marker')
      cards.push(card)
      arm(card)
      placed.popup.on('close', () => {
        cards = cards.filter((c) => c !== card)
      })
      // The markers asked for the outlines when a crag came into view, so
      // this waits only on a card opened before they landed.
      if (subjectType(subject) === 'crag' && usStatesNow() === null) {
        void loadUsStates().then((states) => {
          if (states) write(card)
        })
      }
      return {
        popup: placed.popup,
        dx: placed.dx,
        dy: placed.dy,
        update(next) {
          card.subject = next
          write(card)
        },
      }
    },
    refresh,
    hasOpenRanked({ latitude, longitude }) {
      return cards.some(
        (c) => c.subject.kind === 'ranked' && c.subject.row.latitude === latitude && c.subject.row.longitude === longitude,
      )
    },
  }
}
