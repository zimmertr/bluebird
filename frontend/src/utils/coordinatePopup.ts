import type { DestinationResult } from '../types'
import { FAMILY_KEYS } from '../metrics'
import { FEET_PER_METER } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import type { Place } from './geocode'
import { roundTo } from './numbers'
import type { PointForecast } from './pointForecast'
import { coordinateLabel } from './points'
import {
  bodyLines,
  colorSwatch,
  escapeHtml,
  factValue,
  factsLine,
  metaBand,
  metricGrid,
  pendingValue,
  popupButton,
  popupCard,
} from './popup/popupChrome'
import { type PopupGrid, elevationFact, popupGrid, popupGroups } from './popup/popupRows'
import { POI_ACTION_ATTR } from './poiPopup'
import { SLOPE_BANDS, bandOf, compassPoint, type GroundReading } from './slopeAngle'
import type { ColDef } from './tableColumns'
import { UNAVAILABLE } from './unavailableCell'

// The popup a right-click or a long press opens anywhere on the map (#832):
// a spot no label names, a col, a camp, a point on a ridge. A sibling of the
// clicked label's card (`poiPopup.ts`) rather than a case of it, because what
// it describes is a coordinate and not a feature: there is no name, no kind
// and no page to link to but the map itself.
//
// The coordinate pair is the title, and its link-out glyph opens CalTopo at
// the point rather than a facts line's pair doing so, since the title already
// says what the pair would (TJ, 2026-10-30). No copy button: CalTopo is where
// a reader takes a coordinate next.
//
// Under the title, the ground: its height, and its slope and aspect as one
// fact, `8,412 ft · [swatch] 38° NE` (TJ, 2026-10-30, layout 1 of the
// mockups). Under that, the spot's forecast, fetched as the card opens
// (option A) for the last analysis's window and model, in the grid a ranked
// marker's card draws.

// Five decimals, about a metre, the precision the title shows. The point is
// rounded before it becomes a destination so the row, its share link and the
// card all carry the coordinate the reader saw.
const round5 = (v: number) => roundTo(v, 5)

/** The point a press landed on, as the destination `Add to analysis` registers. */
export function coordinatePlace(lat: number, lon: number): Place {
  const at = { lat: round5(lat), lon: round5(lon) }
  // The kind a pasted coordinate gets in the search box, so the two ways of
  // naming a bare point make one kind of destination.
  return { label: coordinateLabel(at.lat, at.lon), description: '', kind: 'coordinates', ...at }
}

/** Whether a registered place is the point this card describes. */
export function isCoordinatePlace(place: Pick<Place, 'lat' | 'lon'>, point: Pick<Place, 'lat' | 'lon'>): boolean {
  return place.lat === point.lat && place.lon === point.lon
}

/** What the card knows of the ground: still reading, read, or nothing to say (no tile). */
export type GroundState = { kind: 'pending' } | { kind: 'read'; reading: GroundReading } | { kind: 'none' }

/**
 * What the card knows of the forecast: still fetching, fetched (null where
 * the model has no weather for the hours), or failed with the line to say.
 */
export type ForecastState =
  | { kind: 'pending' }
  | { kind: 'read'; forecast: PointForecast | null }
  | { kind: 'failed'; message: string }

/** What the card draws beside its point, every part optional. */
export interface CoordinateCardView {
  /** The map's zoom when the card is drawn, which the CalTopo link carries. */
  mapZoom?: number
  ground?: GroundState
  forecast?: ForecastState
  /** The results table's columns, which the grid's rows follow as a ranked card's do. */
  columns?: readonly ColDef[]
  /** The model the forecast is from, for the Windy links. */
  modelId?: string | null
  /** Whether the window is one hour, as the ranked card's grid reads it. */
  pointSample?: boolean
  compact?: boolean
  widths?: Readonly<Record<string, number>>
}

/**
 * The ground as the facts line says it: the height in feet, then the slope,
 * its band's swatch before it, and the way it faces. The angle is the whole
 * degree under it, so the number and the swatch agree at a band's edge,
 * where each band holds its lower edge: 26.9 reads 26° with no swatch and
 * 27.0 reads 27° in yellow. Below 27 the Slope angle layer paints nothing, so
 * there is no swatch, and ground with no fall at all names no direction.
 */
function groundLine(ground: GroundState): string {
  if (ground.kind === 'none') return ''
  if (ground.kind === 'pending') return factsLine([pendingValue()])
  const { elevationM, degrees, aspect } = ground.reading
  const angle = Math.floor(degrees)
  const band = bandOf(angle)
  const slope = `${band < 0 ? '' : colorSwatch(SLOPE_BANDS[band].color)}${factValue(`${angle}°`)}${
    aspect === null ? '' : ` ${compassPoint(aspect)}`
  }`
  return factsLine([factValue(escapeHtml(elevationFact(Math.round(elevationM * FEET_PER_METER)))), slope])
}

/** The row a card draws before its numbers are in: the point, and no value in any column. */
function blankRow(point: Pick<Place, 'lat' | 'lon'>): DestinationResult {
  return {
    name: coordinateLabel(point.lat, point.lon),
    type: 'custom',
    latitude: point.lat,
    longitude: point.lon,
    elevation_ft: null,
    osm_id: null,
  } as DestinationResult
}

/** Every number in a grid replaced with `text`, its link, mark and colour gone with it. */
function gridSaying(grid: PopupGrid, text: string, only?: string): PopupGrid {
  const blank = <C extends object>(c: C) => ({ ...c, text, href: null, ranked: false, tint: undefined })
  return {
    ...grid,
    rows: grid.rows.map((r) => {
      if (only !== undefined && r.label !== only) return r
      return r.kind === 'value' ? { ...r, cell: blank(r.cell) } : { ...r, cells: r.cells.map((c) => (c ? blank(c) : c)) }
    }),
  }
}

/**
 * The forecast's part of the card: a grid of bars while it is fetched, the
 * numbers once in, or the failure's one line. The grid is the ranked card's
 * (`popupGroups`, `popupGrid`, `metricGrid`) over the table's columns, with
 * nothing ranked, because the point stands in no ranking. Air quality that
 * failed alone reads N/A in its cells rather than a dash, since its numbers
 * exist and were not got, where a dash says the forecast has none.
 */
function forecastBody(point: Pick<Place, 'lat' | 'lon'>, view: CoordinateCardView): string {
  const { forecast, columns } = view
  if (!forecast || !columns) return ''
  if (forecast.kind === 'failed') return bodyLines([escapeHtml(forecast.message)])
  const read = forecast.kind === 'read' ? forecast.forecast : null
  const row = read?.row ?? blankRow(point)
  const context = { modelId: view.modelId, times: row.series_times, pointSample: view.pointSample }
  let grid = popupGrid(popupGroups(row, columns, context))
  if (forecast.kind === 'pending') grid = gridSaying(grid, pendingValue())
  else if (read?.aqiFailed) {
    const aqi = popupGroups(row, columns.filter((c) => (FAMILY_KEYS.aqi as readonly string[]).includes(c.key as string)), context)[0]
    if (aqi) grid = gridSaying(grid, UNAVAILABLE, aqi.label)
  }
  return metricGrid(grid, { compact: view.compact, widths: view.widths })
}

/**
 * @param point The rounded point, from `coordinatePlace`.
 * @param added Whether it is already a destination, which flips the button
 * from adding to removing, as on a clicked label's card.
 * @param view The ground and the forecast, as far as each has got.
 */
export function coordinatePopupHtml(
  point: Pick<Place, 'lat' | 'lon'>,
  added: boolean,
  view: CoordinateCardView = {},
): string {
  const button = added
    ? popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis')
    : popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis')
  return popupCard({
    title: escapeHtml(coordinateLabel(point.lat, point.lon)),
    link: { href: caltopoUrl(point.lat, point.lon, view.mapZoom), label: 'Open in CalTopo' },
    meta: metaBand([view.ground ? groundLine(view.ground) : '']),
    body: forecastBody(point, view),
    action: button,
  })
}
