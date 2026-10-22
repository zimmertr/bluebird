/**
 * The analysis on the map: the ranked markers, their wind arrows, rank digits
 * and labels, the pending dots for destinations not yet ranked, and the
 * forecast popup a marker or a table row opens.
 *
 * The layers are added once, when the map loads, above the drawn ring, so a
 * marker is never under the outline of the area it was found in. The pending
 * dots go on last, above the markers.
 */
import type { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection, Point } from 'geojson'
import type { DestinationResult, SortBy } from '../types'
import type { PendingDestination } from '../utils/customList'
import { featureRow, pendingFC } from '../utils/mapFeatures'
import type { ModelRow } from '../utils/modelCompare'
import { RESULT_ACTION_ATTR, resultPopupHtml } from '../utils/resultPopup'
import { resultsFeatureCollection, windArrowsShowing } from '../utils/resultFeatures'
import { usStatesNow } from '../utils/usStatesLoad'
import { emptyFC, setSource } from './basemap'
import type { MapController } from './controller'
import type { MapPopups, MapTargetHit } from './mapPopups'
import {
  MARKER_LABEL_LAYOUT,
  MARKER_LABEL_PAINT,
  MARKER_PAINT,
  PENDING_COLOR,
  RANK_LAYOUT,
  RANK_PAINT,
  WIND_ARROW_FILL,
  WIND_ARROW_OUTLINE,
} from './mapStyles'
import type { Point as ScreenPoint, Rect } from '../utils/popupFit'
import { POPUP_BODY_ATTR, capPopupBody, compactGrid } from '../utils/popupChrome'

/** The marker circles, which a click anywhere on the map asks about by name. */
export const RESULT_MARKER_LAYER = 'results-circles'

/**
 * The wind arrow drawn beside a result marker during playback (#121).
 *
 * Generated on a canvas for the same reason the POI glow is: the basemap sprite
 * carries no SDF icons, so nothing shipped with the style can be tinted or
 * reshaped into this, and an asset pipeline for one triangle is not worth
 * having.
 *
 * The geometry is an arrow whose tail sits at the image's centre and whose tip
 * reaches the top edge, so rotating the icon swings it around the marker rather
 * than spinning it in place. It clears the 10px marker circle with room to
 * spare, which is what keeps it off the rank digit inside.
 *
 * White with a dark outline rather than a single colour, because it lands on
 * every hue the metric ramp produces — green through red — and neither a white
 * nor a dark arrow reads on all of them alone.
 */
export const WIND_ARROW_IMAGE = 'result-wind-arrow'
const WIND_ARROW_PX = 44

export function makeArrowImage(): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = WIND_ARROW_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const mid = WIND_ARROW_PX / 2
  ctx.beginPath()
  ctx.moveTo(mid, 2) // tip
  ctx.lineTo(mid - 5, 12)
  ctx.lineTo(mid - 1.5, 12)
  ctx.lineTo(mid - 1.5, mid - 2) // tail, stopping short of the marker
  ctx.lineTo(mid + 1.5, mid - 2)
  ctx.lineTo(mid + 1.5, 12)
  ctx.lineTo(mid + 5, 12)
  ctx.closePath()
  ctx.fillStyle = WIND_ARROW_FILL
  ctx.strokeStyle = WIND_ARROW_OUTLINE
  ctx.lineWidth = 1.5
  ctx.fill()
  ctx.stroke()
  return ctx.getImageData(0, 0, WIND_ARROW_PX, WIND_ARROW_PX)
}

/** Set the markers to these rows, coloured for this ranking and this hour. */
function updateResults(
  map: maplibregl.Map,
  results: DestinationResult[],
  sortBy: SortBy,
  hourIndex: number | null,
) {
  setSource(map, 'results', resultsFeatureCollection(results, sortBy, true, hourIndex))
}

interface ResultsDrawing {
  results: DestinationResult[]
  sortBy: SortBy
  // The hour the markers are coloured for, or null for the window aggregate.
  playbackIndex: number | null
}

export interface ResultsLayer {
  /** Draw these rows. A playback tick is one of these, so it must stay cheap. */
  update(next: ResultsDrawing): void
  /** Draw a dot for each custom destination not in the displayed analysis. */
  setPending(pending: PendingDestination[]): void
  /**
   * Open the forecast popup on a row, for a click on its rank in the table.
   * The camera move is the component's; this is only the popup.
   */
  /**
   * Open a result's popup and say how far the map must move for it to show
   * as much of itself as it can (`popupFit.ts`). `markerAt` is where the
   * marker WILL stand, in the map container's pixels, for a caller that is
   * about to fly it there; without it the marker's present position is
   * read. `avoid` is what else stands over the map, as viewport rects, on
   * top of the button column the layer finds for itself. The answer is the
   * move for the caller to make, because a table click folds it into a
   * flight and a marker click pans by it.
   */
  openPopup(result: DestinationResult, options?: { markerAt?: ScreenPoint; avoid?: readonly Rect[] }): PopupPlacement
  /**
   * Redraw every open result card from the inputs as they stand: its rank,
   * the number it marks as ranked, and the columns it shows. The component
   * calls it when the ranking, the displayed rows or the columns change, and
   * never on a playback tick, which changes none of a card's numbers.
   */
  refreshPopups(): void
  /**
   * Whether a result card stands open on this destination. A row's centring
   * asks it before it places the card again for a resized canvas (#714;
   * `map/centring.ts`): a card the reader or a new report has closed since
   * stays closed. By the place rather than by any open card, because a click
   * on another marker opens its card without stopping the flight.
   */
  hasOpenCard(at: { latitude: number; longitude: number }): boolean
}

/** How far the marker, and its popup with it, should move across the screen. */
interface PopupPlacement {
  dx: number
  dy: number
}


export function mountResultsLayer(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: MapPopups
  },
): ResultsLayer {
  const { controller, popups } = deps

  map.addSource('results', { type: 'geojson', data: emptyFC as FeatureCollection })

  map.addLayer({
    id: RESULT_MARKER_LAYER,
    type: 'circle',
    source: 'results',
    paint: { ...MARKER_PAINT, 'circle-color': ['get', 'color'] },
  })
  // Wind arrows, shown only while playback is scrubbing a wind ranking.
  // On the same source as the circles, so a scrub sets one lot of GeoJSON
  // and the arrow can never be pointing at an hour the colour is not.
  // `filter: ['has','bearing']` is what makes a row with no direction —
  // the SSE fallback never fetches it — draw nothing rather than draw
  // north. (The icon itself is registered by the forecast grid overlay,
  // which is mounted first and so is the first to name it.)
  map.addLayer({
    id: 'results-wind',
    type: 'symbol',
    source: 'results',
    filter: ['has', 'bearing'],
    layout: {
      'icon-image': WIND_ARROW_IMAGE,
      'icon-rotate': ['get', 'bearing'],
      // Rotate with the map, not with the screen: this is a compass
      // bearing, so it has to keep pointing at the same piece of ground
      // when the map is rotated.
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      visibility: 'none',
    },
  })
  map.addLayer({
    id: 'results-rank',
    type: 'symbol',
    source: 'results',
    layout: { 'text-field': ['get', 'rank'], ...RANK_LAYOUT },
    paint: RANK_PAINT,
  })
  map.addLayer({
    id: 'results-labels',
    type: 'symbol',
    source: 'results',
    layout: { 'text-field': ['get', 'name'], ...MARKER_LABEL_LAYOUT },
    paint: MARKER_LABEL_PAINT,
  })

  // ── Pending destinations ───────────────────────────────────────
  // A pasted CSV row or searched place not yet in the displayed analysis, or
  // a destination a ring's search found whose forecast has not landed (#782):
  // a neutral dot (`PENDING_COLOR`) so the point never vanishes, no forecast
  // popup yet. Not a click target, on purpose — a pending
  // dot must never swallow a polygon click while you draw around a
  // just-added spot; it starts blocking (opening a popup) once it ranks in.
  map.addSource('pending-destinations', {
    type: 'geojson',
    data: emptyFC as FeatureCollection,
  })
  map.addLayer({
    id: 'pending-destinations-circles',
    type: 'circle',
    source: 'pending-destinations',
    paint: { ...MARKER_PAINT, 'circle-color': PENDING_COLOR },
  })
  map.addLayer({
    id: 'pending-destinations-labels',
    type: 'symbol',
    source: 'pending-destinations',
    layout: { 'text-field': ['get', 'name'], ...MARKER_LABEL_LAYOUT },
    paint: MARKER_LABEL_PAINT,
  })

  const openResultPopup = ({ feature: f }: MapTargetHit) => {
    if (!f.properties) return false
    const p = f.properties
    // Anchor the popup at the rendered geometry, but take the exact
    // coordinates from properties for the readout and the geoKey lookup —
    // a clicked feature's geometry is snapped to the tile grid, so it won't
    // reliably match the warning map keyed on exact coordinates.
    const anchor = (f.geometry as Point).coordinates as [number, number]
    const lon = p.lon as number
    const lat = p.lat as number
    // The row behind this marker, for the popup's Windy links. Matched on
    // the exact coordinates the feature carries for the fire lookup above
    // rather than on an index, so a source that has re-rendered since the
    // ref last updated cannot pair a popup with the wrong row.
    const row = controller.resultAt(lat, lon)
    // The matched row is the popup's subject. The feature's own properties
    // are the fallback for the case the match cannot happen — they carry no
    // aggregates, so those columns draw the dash a missing value draws
    // anywhere else rather than a number nobody fetched.
    // The card pans the map to fit it, as every card does (`openCard`).
    openFitted(anchor, row ?? featureRow(p, lat, lon), p.rank, { pan: true })
  }

  // A card's markup from the inputs as they stand. One function for the first
  // open and every redraw, so a redrawn card cannot differ from a fresh one.
  // Read from the row's own coordinates, which are the exact ones a marker
  // carries, so the warnings match on them.
  const cardHtml = (row: DestinationResult, rank: number | string) => {
    const live = controller.inputs
    return resultPopupHtml({
      rank,
      row,
      columns: live.popupColumns,
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
      mapZoom: map.getZoom(),
      removable: true,
      // The table's crag rows asked for them, so by the time a crag's card
      // opens they are held, and a redraw picks them up if not.
      usStates: usStatesNow(),
    })
  }

  // The card's remove does what the row's × does and takes the card with it,
  // since the row it describes leaves the report. Re-armed after every write
  // of the markup, which replaces the button. Reads the card's row at the
  // press, so a card a new ranking moved onto another row removes that row.
  const armRemove = (card: { popup: Popup; row: DestinationResult }) => {
    card.popup
      .getElement()
      ?.querySelector<HTMLButtonElement>(`[${RESULT_ACTION_ATTR}="remove"]`)
      ?.addEventListener('click', () => {
        controller.inputs.onRemoveResult(card.row)
        card.popup.remove()
      })
  }

  // The result cards standing on the map, with what redraws each: the row it
  // was opened on, the markup it shows, and the height its body was capped
  // to, which a redraw must keep because new markup arrives uncapped.
  type OpenCard = { popup: Popup; row: DestinationResult; html: string; capped: number | null }
  let cards: OpenCard[] = []

  // Open a result's card through `openCard`, which fits, caps and places it
  // the way it does every card on the map; this adds what only a result card
  // has: the tutorial's mark, the remove button and a place among the cards
  // `refreshPopups` redraws.
  const openFitted = (
    at: [number, number],
    subject: DestinationResult,
    rank: number | string,
    { markerAt, avoid, pan = false }: { markerAt?: ScreenPoint; avoid?: readonly Rect[]; pan?: boolean },
  ): PopupPlacement => {
    const html = cardHtml(subject, rank)
    const { popup, dx, dy, capped } = popups.openCard(at, html, { owner: 'result', result: true, markerAt, avoid, pan })
    // The tutorial's marker step frames this popup (#536).
    popup.getElement()?.setAttribute('data-tour', 'marker')
    const card: OpenCard = { popup, row: subject, html, capped }
    armRemove(card)
    cards.push(card)
    popup.on('close', () => {
      cards = cards.filter((c) => c !== card)
    })
    return { dx, dy }
  }

  popups.register({ target: 'result', layers: [RESULT_MARKER_LAYER], open: openResultPopup })

  let arrows = false
  return {
    update({ results, sortBy, playbackIndex }) {
      updateResults(map, results, sortBy, playbackIndex)
      // Set only when it changes, because a scrub calls this twice a second.
      const showing = windArrowsShowing(sortBy, playbackIndex)
      if (showing !== arrows) {
        map.setLayoutProperty('results-wind', 'visibility', showing ? 'visible' : 'none')
        arrows = showing
      }
    },
    setPending(pending) {
      setSource(map, 'pending-destinations', pendingFC(pending))
    },
    openPopup(result, options = {}) {
      popups.closeAll()
      // Rank is the analyzed order the markers are labelled with, so the popup
      // matches the marker it lands on. A table row is a copy stamped with
      // that rank (#579), so it is not among the map's rows and the stamp is
      // the answer; a row handed over without one is looked up.
      const stamped = (result as { rank?: number }).rank
      return openFitted(
        [result.longitude, result.latitude],
        result,
        stamped ?? controller.inputs.results.indexOf(result) + 1,
        options,
      )
    },
    // A card follows the report the way the table does (TJ, 2026-10-08):
    // a new ranking moves its mark and its rank, and a column the reader
    // hides leaves it. Each card finds its row again in the displayed rows:
    // the same row where it is still there, else the row at its coordinates
    // from the same model, since a comparison stands one row per model on
    // each destination and a card must not swap models. A row the new presentation
    // no longer displays keeps the numbers it was opened on and loses its
    // rank, the way a searched destination's card has none, rather than
    // closing under the reader.
    hasOpenCard({ latitude, longitude }) {
      return cards.some((card) => card.row.latitude === latitude && card.row.longitude === longitude)
    },
    refreshPopups() {
      for (const card of cards) {
        const shown = controller.inputs.results
        const model = (card.row as ModelRow).modelId
        const row = shown.includes(card.row)
          ? card.row
          : (shown.find(
              (r) =>
                r.latitude === card.row.latitude &&
                r.longitude === card.row.longitude &&
                (r as ModelRow).modelId === model,
            ) ?? null)
        const html = cardHtml(row ?? card.row, row ? shown.indexOf(row) + 1 : '')
        if (html === card.html) continue
        const old = card.popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
        const scrolled = old?.scrollTop ?? 0
        // MapLibre moves focus into a popup whenever its content is set. A
        // redraw answers a change made in the panel, so focus stays there.
        const focus = card.popup.options.focusAfterOpen
        card.popup.options.focusAfterOpen = false
        card.popup.setHTML(html)
        card.popup.options.focusAfterOpen = focus
        card.html = html
        if (row) card.row = row
        armRemove(card)
        const body = card.popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`)
        if (body && card.capped !== null) capPopupBody(body, card.capped)
        if (body) body.scrollTop = scrolled
      }
    },
  }
}
