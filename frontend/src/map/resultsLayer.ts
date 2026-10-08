/**
 * The analysis on the map: the ranked markers, their wind arrows, rank digits
 * and labels, the pending dots for destinations not yet ranked, and the
 * forecast popup a marker or a table row opens.
 *
 * The layers are added once, when the map loads, above the drawn ring, so a
 * marker is never under the outline of the area it was found in. The pending
 * dots go on last, above the markers.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { FeatureCollection, Point } from 'geojson'
import type { DestinationResult, SortBy } from '../types'
import type { PendingDestination } from '../utils/customList'
import { featureRow, pendingFC } from '../utils/mapFeatures'
import type { ModelRow } from '../utils/modelCompare'
import { resultPopupHtml } from '../utils/resultPopup'
import { resultsFeatureCollection, windArrowsShowing } from '../utils/resultFeatures'
import { emptyFC, setSource } from './basemap'
import type { MapController } from './controller'
import { isPinning, popupOptions, type PopupBoard } from './popups'
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
import { capHeight, placePopup, type Point as ScreenPoint, type Rect } from '../utils/popupFit'
import { POPUP_BODY_ATTR, RESULT_POPUP_CLASS, capPopupBody } from '../utils/popupChrome'

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
export function updateResults(
  map: maplibregl.Map,
  results: DestinationResult[],
  sortBy: SortBy,
  hourIndex: number | null,
) {
  setSource(map, 'results', resultsFeatureCollection(results, sortBy, true, hourIndex))
}

export interface ResultsDrawing {
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
}

/** How far the marker, and its popup with it, should move across the screen. */
export interface PopupPlacement {
  dx: number
  dy: number
}

/** How long a marker click's pan takes: short, because the reader is waiting on the card it opens. */
export const POPUP_PAN_MS = 300

export function mountResultsLayer(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: PopupBoard
    restCursor: () => void
  },
): ResultsLayer {
  const { controller, popups, restCursor } = deps

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

  // ── Pending custom destinations ────────────────────────────────
  // A pasted CSV row or searched place not yet in the displayed analysis:
  // a neutral dot (`PENDING_COLOR`) so the point never vanishes, no forecast
  // popup yet. Absent from the blocked-click list on purpose — a pending
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

  const openResultPopup = (e: maplibregl.MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f?.properties) return
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
    const live = controller.inputs
    const row = controller.resultAt(lat, lon)
    const pinned = isPinning(e)
    if (!pinned) popups.closeAll()
    const { dx, dy } = openFitted(
      anchor,
      resultPopupHtml({
        rank: p.rank,
        // The matched row is the popup's subject. The feature's own
        // properties are the fallback for the case the match cannot
        // happen — they carry no aggregates, so those columns draw the
        // dash a missing value draws anywhere else rather than a
        // number nobody fetched.
        row: row ?? featureRow(p, lat, lon),
        columns: live.popupColumns,
        warning: controller.fireWarningAt(lat, lon),
        closure: controller.closureWarningAt(lat, lon),
        modelId: row ? ((row as ModelRow).modelId ?? live.modelId) : live.modelId,
        times: row?.series_times ?? live.times,
        modelFallbackLabel: live.modelFallbackLabel,
      }),
      {},
    )
    // The map comes to the card rather than the card unfurling wherever the
    // marker rested (TJ, 2026-09-29): a pan of what the fit asked for, with
    // the marker riding along under its tip. `panBy` moves the camera, so
    // its sign is the marker's move reversed.
    if (dx !== 0 || dy !== 0) map.panBy([-dx || 0, -dy || 0], { duration: POPUP_PAN_MS })
  }

  // What stands over the map inside the part of it a card can be seen in,
  // in the container's pixels: every surface that names itself
  // `data-map-overlay` (the button column at the top left, the legend box
  // under it) plus whatever the caller names. Found through the container's
  // document rather than handed in, because the layer that opens popups on
  // a click has no caller to hand it anything.
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

  // Open a popup where it shows the most of itself. The card is built once
  // hanging below its marker, measured, and rebuilt above it only when the
  // fit says so, all before a frame is drawn, because MapLibre fixes a
  // popup's side at construction and this is the one moment its size is
  // known. A card too tall to stand whole in the free map area has its body
  // capped first and scrolls (`capHeight`, TJ 2026-10-08), so the fit then
  // places the card the reader will actually see. Never closeOnClick: it is fixed at construction too, so an
  // already-open popup could not be told to survive the click that pins a
  // second one — the first shift-click always lost the card it was meant to
  // keep. Dismissal is the board's (`map/popups.ts`).
  const openFitted = (
    at: [number, number],
    html: string,
    { markerAt, avoid = [] }: { markerAt?: ScreenPoint; avoid?: readonly Rect[] },
  ): PopupPlacement => {
    const build = (anchor: 'top' | 'bottom') =>
      new Popup({ ...popupOptions(map, { result: true }), closeOnClick: false, anchor, className: RESULT_POPUP_CLASS }).setLngLat(at).setHTML(html).addTo(map)
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
    const marker = markerAt ?? map.project(at)
    const standing = obstacles(avoid)
    // The body's height under the cap: whatever the card must lose comes off
    // the body alone, so the title and the band under it stay in view.
    const cap = capHeight(marker, size, region, standing)
    const bodyOf = () => popup.getElement()?.querySelector<HTMLElement>(`[${POPUP_BODY_ATTR}]`) ?? null
    const first = cap === null ? null : bodyOf()
    const capped = cap === null || first === null ? null : first.offsetHeight - (size.height - cap)
    const applyCap = () => {
      const body = capped === null ? null : bodyOf()
      if (body) capPopupBody(body, capped!)
    }
    applyCap()
    if (capped !== null) size = measure()
    const placed = placePopup(marker, size, region, standing)
    if (placed.anchor !== 'top') {
      popup.remove()
      popup = build('bottom')
      applyCap()
    }
    // The tutorial's marker step frames this popup (#536).
    popup.getElement()?.setAttribute('data-tour', 'marker')
    // On the board like every other popup, so the next table click or map
    // click takes it down rather than stacking a second one beside it.
    popups.track(popup)
    return { dx: placed.dx, dy: placed.dy }
  }

  map.on('click', RESULT_MARKER_LAYER, openResultPopup)
  map.on('mouseenter', RESULT_MARKER_LAYER, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', RESULT_MARKER_LAYER, restCursor)

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
      const live = controller.inputs
      popups.closeAll()
      // Rank is the analyzed order the markers are labelled with, so the popup
      // matches the marker it lands on.
      return openFitted(
        [result.longitude, result.latitude],
        resultPopupHtml({
          rank: live.results.indexOf(result) + 1,
          row: result,
          columns: live.popupColumns,
          warning: controller.fireWarningAt(result.latitude, result.longitude),
          closure: controller.closureWarningAt(result.latitude, result.longitude),
          // A per-model row names its own model; a single-model report has
          // one for every row. Same rule as the table's cells.
          modelId: (result as ModelRow).modelId ?? live.modelId,
          times: result.series_times ?? live.times,
          modelFallbackLabel: live.modelFallbackLabel,
        }),
        options,
      )
    },
  }
}
