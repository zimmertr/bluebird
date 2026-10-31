/**
 * The card a right-click or a long press opens anywhere on the map (#832):
 * the ground under the spot, its forecast, and a button that adds the spot as
 * a destination or takes it back out.
 *
 * The gesture is `map/mapPopups.ts`'s, as every listener on the map is; this
 * module says what it opens. Adding the spot registers it the way a pasted
 * coordinate does, so it needs no pipeline of its own: the same list, the same
 * URL param, and the same `custom_destinations` on the next Analyze.
 *
 * The card opens at once and fills in as its two answers land: the ground
 * from the elevation the terrain rows read (`terrain.ts`, `slope.ts`), and the
 * forecast from Open-Meteo, fetched on open (option A, measured at about
 * 210 ms on 2026-10-30) for the window and model `MapInputs` names, which are
 * the last analysis's, else the panel's. The forecast does not wait for the
 * ground: its columns are reduced at the ground's height once both are in
 * (`utils/pointForecast.ts`). A card left open across a new analysis asks
 * again for the new window or model, as a ranked card follows its report.
 */
import type * as maplibregl from 'maplibre-gl'
import type { Popup } from 'maplibre-gl'
import { isAbort } from '../utils/abort'
import { FEET_PER_METER } from '../utils/basemapPoi'
import {
  type CoordinateCardView,
  type ForecastState,
  type GroundState,
  coordinatePlace,
  coordinatePopupHtml,
  isCoordinatePlace,
} from '../utils/coordinatePopup'
import { POI_ACTION_ATTR } from '../utils/poiPopup'
import { type PointWindow, pointFailure, pointForecast } from '../utils/pointForecast'
import { POPUP_BODY_ATTR, capPopupBody, compactGrid } from '../utils/popup/popupChrome'
import type { MapController } from './controller'
import { createGridHeads, type GridHeads } from './gridHeads'
import type { MapPopups } from './mapPopups'
import { groundReading } from './slope'
import type { TerrainLayers } from './terrain'

export interface CoordinatePopups {
  /**
   * Redraws every open card from the inputs as they stand, when `MapView` sees
   * the columns or the window change, and asks again where the window or the
   * model moved.
   */
  refresh(): void
}

/** One open card and what it has learned so far. */
interface Card {
  popup: Popup
  place: ReturnType<typeof coordinatePlace>
  added: boolean
  ground: GroundState
  forecast: ForecastState
  // The ground's height in feet, or null where none was read; the forecast
  // waits on it to read its wind and temperature there.
  heightFt: Promise<number | null>
  // The window and model the forecast was asked for.
  asked: string
  html: string
  capped: number | null
  // Ends the ground's read with the card; the forecast has its own, since a
  // new window ends the old ask while the card stays.
  life: AbortController
  ask: AbortController | null
  credited: boolean
}

export function mountCoordinatePopups(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: MapPopups
    // The elevation and its credit; with none, the card reads no ground.
    terrain?: Pick<TerrainLayers, 'demTiles' | 'credit'>
    // Shared with the ranked cards' grids; its own where none is given.
    gridHeads?: GridHeads
    forecast?: typeof pointForecast
  },
): CoordinatePopups {
  const { controller, popups, terrain } = deps
  const gridHeads = deps.gridHeads ?? createGridHeads(controller)
  const forecast = deps.forecast ?? pointForecast
  let cards: Card[] = []

  const windowNow = (): PointWindow => {
    const live = controller.inputs
    return {
      startMs: live.forecastStartMs,
      endMs: live.forecastEndMs,
      // Never null in the app, which always names a model; a test's inputs may not.
      model: live.modelId ?? '',
      windowLimits: live.windowLimits,
      aqiForecastDays: live.aqiForecastDays,
    }
  }
  const keyOf = (w: PointWindow) => `${w.startMs}/${w.endMs}/${w.model}`

  const viewOf = (card: Card): CoordinateCardView => {
    const live = controller.inputs
    return {
      mapZoom: map.getZoom(),
      ground: card.ground,
      forecast: card.forecast,
      columns: live.popupColumns,
      modelId: live.modelId,
      pointSample: live.pointSample,
      compact: compactGrid(map.getCanvas().clientWidth),
      widths: gridHeads.widths(),
    }
  }

  // setHTML makes the button and the grid's heads new nodes, so they are
  // armed again after every write, once MapLibre has attached the markup.
  function arm(card: Card) {
    setTimeout(() => {
      gridHeads.arm(card.popup)
      card.popup
        .getElement()
        ?.querySelector<HTMLButtonElement>(`[${POI_ACTION_ATTR}]`)
        ?.addEventListener('click', () => {
          if (card.added) controller.inputs.onRemovePoi(card.place.lat, card.place.lon)
          else controller.inputs.onAddPoi(card.place)
          card.added = !card.added
          draw(card)
        })
    }, 0)
  }

  // The card's markup as it stands, written only when it changed, keeping
  // the body's cap and scroll, and leaving focus where it is: a redraw
  // answers a fetch or the panel, not the reader's press on the card.
  function draw(card: Card) {
    if (!cards.includes(card)) return
    const html = coordinatePopupHtml(card.place, card.added, viewOf(card))
    if (html === card.html) return
    const old = card.popup.getElement()?.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
    const scrolled = old?.scrollTop ?? 0
    const focus = card.popup.options?.focusAfterOpen
    if (card.popup.options) card.popup.options.focusAfterOpen = false
    card.popup.setHTML(html)
    if (card.popup.options) card.popup.options.focusAfterOpen = focus
    card.html = html
    const body = card.popup.getElement()?.querySelector?.<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
    if (body && card.capped !== null) capPopupBody(body, card.capped)
    if (body) body.scrollTop = scrolled
    arm(card)
  }

  function release(card: Card) {
    if (!card.credited) return
    card.credited = false
    terrain?.credit(false)
  }

  // The ground under the card's spot, once per card: the window does not
  // change it.
  function readGround(card: Card): Promise<number | null> {
    if (!terrain) return Promise.resolve(null)
    // Mapterhorn's credit stands while its numbers are on screen, coming or come.
    card.credited = true
    terrain.credit(true)
    const read = terrain.demTiles().then((dem) => groundReading(dem, card.place.lat, card.place.lon, card.life))
    read.then(
      (reading) => {
        card.ground = reading ? { kind: 'read', reading } : { kind: 'none' }
        if (!reading) release(card)
        draw(card)
      },
      (err: unknown) => {
        if (card.life.signal.aborted) return
        // Open ocean has no tile at any zoom, and a failed fetch says nothing
        // about the ground: either way the card says nothing of it.
        if (!isAbort(err)) console.warn('Ground under the point failed to load', err)
        card.ground = { kind: 'none' }
        release(card)
        draw(card)
      },
    )
    return read.then(
      (reading) => (reading ? reading.elevationM * FEET_PER_METER : null),
      () => null,
    )
  }

  function askForecast(card: Card) {
    card.ask?.abort()
    const ask = new AbortController()
    card.ask = ask
    const w = windowNow()
    card.asked = keyOf(w)
    card.forecast = { kind: 'pending' }
    if (!w.model) {
      card.forecast = { kind: 'read', forecast: null }
      return
    }
    forecast({ lat: card.place.lat, lon: card.place.lon }, card.heightFt, w, ask.signal).then(
      (got) => {
        if (ask.signal.aborted) return
        card.forecast = { kind: 'read', forecast: got }
        draw(card)
      },
      (err: unknown) => {
        if (ask.signal.aborted || isAbort(err)) return
        card.forecast = { kind: 'failed', message: pointFailure(err, controller.inputs.modelFallbackLabel ?? w.model) }
        draw(card)
      },
    )
  }

  popups.registerContextMenu(({ lng, lat }) => {
    const place = coordinatePlace(lat, lng)
    const card: Card = {
      popup: null as unknown as Popup,
      place,
      // Held on the card rather than re-read from the controller after each
      // press, as the label's card does (`map/poiPopup.ts`): the controller
      // catches up on React's next render, and the button flips on this one.
      added: controller.inputs.searchedPlaces.some((p) => isCoordinatePlace(p, place)),
      ground: terrain ? { kind: 'pending' } : { kind: 'none' },
      forecast: { kind: 'pending' },
      heightFt: Promise.resolve(null),
      asked: '',
      html: '',
      capped: null,
      life: new AbortController(),
      ask: null,
      credited: false,
    }
    card.html = coordinatePopupHtml(place, card.added, viewOf(card))
    const { popup, capped } = popups.openCard([place.lon, place.lat], card.html, { result: true })
    card.popup = popup
    card.capped = capped
    cards.push(card)
    popup.on('close', () => {
      cards = cards.filter((c) => c !== card)
      card.life.abort()
      card.ask?.abort()
      release(card)
    })
    card.heightFt = readGround(card)
    askForecast(card)
    arm(card)
  })

  // A column resized on any card's grid redraws these too.
  gridHeads.onResize(() => {
    for (const card of cards) draw(card)
  })

  return {
    refresh() {
      const now = keyOf(windowNow())
      for (const card of cards) {
        if (card.asked !== now) askForecast(card)
        draw(card)
      }
    },
  }
}
