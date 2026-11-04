/**
 * The one card every place on the map opens (#832, TJ 2026-11-03): a ranked
 * marker, a pending dot, a clicked label, and a click on bare map. They used
 * to be four builders in three files, each with its own header, its own
 * button attribute and its own idea of what a place is; one subject type and
 * one builder means the four say a place the same way and offer the same way
 * in and out.
 *
 * What differs between them is what is known, not how it is drawn:
 *
 * - a **ranked** row has a forecast, so it carries the grid (#370) in a
 *   section of its own, and its remove does what the table's × does (#696);
 * - a **pending** destination has no forecast yet, so no such section, and
 *   its remove is the same × (TJ, 2026-11-03);
 * - a **label** is a feature the map draws, which `Add to analysis` registers
 *   the way a search by name does (#119, #712);
 * - a **spot** is a coordinate no label names: the pair is its title and the
 *   ground its facts, since a click on bare map is how the layers are asked
 *   about a point (#737).
 *
 * Every header is the result card's band: the name and its link out, then the
 * coordinates alone, then the type, the elevation and the slope (TJ,
 * 2026-10-31). A spot has no name, kind or recorded height, so its title is
 * the pair and its facts are the tile's height and the slope.
 *
 * Under the band, every card is the same stack of sections (TJ, 2026-11-03):
 * one for each layer that is on and has something at the point, in the rank
 * the map reads them in (`mapClick.ts`), and last the forecast on a ranked
 * card, because the hazards are what a reader weighs the forecast against.
 * Each section is its name, its rows and its fine print, and each folds on
 * its chevron: before an analysis every section stands open, and on a ranked
 * card only the forecast does, the hazards folded to their names, since the
 * grid is what the marker was clicked for. A fold the reader makes holds on
 * every card for the session (`map/destinationCards.ts` keeps the choices).
 * The sections used to be the overlays' own cards, one per shape, so a click
 * on a hotspot said nothing about the rain under it; now a hotspot over snow
 * in a closed area under rain is one card of four sections.
 */
import type { DestinationResult, SortBy } from '../types'
import { type BasemapPoi, FEET_PER_METER, poiToPlace } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import type { PendingDestination } from './customList'
import { destinationLinkLabel, destinationUrl } from './destinationUrl'
import { type Place, placeType } from './geocode'
import type { ModelRow } from './model/modelCompare'
import { roundTo } from './numbers'
import type { PointSection } from './pointReadout'
import { coordinateLabel } from './points'
import { type GroundState, slopeFact } from './popup/groundFact'
import {
  bodyLines,
  bodySection,
  cardSection,
  escapeHtml,
  factValue,
  factsLine,
  factsRow,
  metaBand,
  metricGrid,
  pendingValue,
  popupAction,
  popupButton,
  popupCard,
  updatedAt,
  updatedLine,
  warningLine,
  widestName,
} from './popup/popupChrome'
import { elevationFact, popupGrid, popupGroups, popupIdentity } from './popup/popupRows'
import { pendingLinkRow } from './results/resultsCells'
import { type ColDef, TYPE_COL } from './tableColumns'
import type { UsStates } from './usStates'

/** What a card describes. */
export type CardSubject =
  | { kind: 'ranked'; row: DestinationResult; rank: number | string }
  | { kind: 'pending'; pending: PendingDestination }
  | { kind: 'label'; poi: BasemapPoi }
  | { kind: 'spot'; lat: number; lon: number }

/**
 * The attribute the map finds a card's one button by, with the action in its
 * value, so the handler reads the intent off the element rather than
 * inferring it from which selector matched.
 */
export const CARD_ACTION_ATTR = 'data-card-action'
export type CardAction = 'add' | 'remove'

/** What the map knows when it draws a card, every part optional. */
export interface CardView {
  /** The map's zoom, which the coordinates' CalTopo link carries (#712). */
  mapZoom?: number
  /** The state outlines a crag's search names its state by, when held. */
  usStates?: UsStates | null
  /** The ground under the point, as far as its read has got (#832). */
  ground?: GroundState
  /** Whether a label or a spot is already a destination, which turns its add into a remove. */
  added?: boolean
  /** Whether a ranked card offers its remove (#696); a card built with no map has none. */
  removable?: boolean
  /** The results table's columns, which a ranked card's grid follows (#370). */
  columns?: readonly ColDef[]
  /**
   * What the layers say at the point (#832), in the rank the map reads them
   * in; a card built with no map has none.
   */
  sections?: readonly PointSection[]
  /** Each section the reader folded or opened by hand, by its key, which overrides the default. */
  folds?: ReadonlyMap<string, boolean>
  /** When the report was analyzed, which the forecast section's fine print says. */
  analyzedAtMs?: number | null
  /** The model the numbers came from and the report's hours, for the Windy links. */
  modelId?: string | null
  times?: readonly number[]
  /** The model a row falls back to while one model answered every row. */
  modelFallbackLabel?: string | null
  /** The key the report ranks by, whose number the grid marks. */
  rankedBy?: SortBy | null
  /** Whether the window is one hour, which the ranked family's colours read. */
  pointSample?: boolean
  /** The grid's narrow insets, for a map too narrow for the widest grid (`compactGrid`). */
  compact?: boolean
  /** Each grid column's width a reader dragged (TJ 2026-10-30). */
  widths?: Readonly<Record<string, number>>
}

// Five decimals, about a metre, the precision a spot's title shows. A spot is
// rounded before it becomes a destination so the row, its share link and the
// card all carry the coordinate the reader saw.
const round5 = (v: number) => roundTo(v, 5)

/** A clicked spot as the destination `Add to analysis` registers. */
export function spotPlace(lat: number, lon: number): Place {
  const at = { lat: round5(lat), lon: round5(lon) }
  // The kind a pasted coordinate gets in the search box, so the two ways of
  // naming a bare point make one kind of destination.
  return { label: coordinateLabel(at.lat, at.lon), description: '', kind: 'coordinates', ...at }
}

/** The point a card stands on. */
export function subjectPoint(s: CardSubject): { lat: number; lon: number } {
  switch (s.kind) {
    case 'ranked':
      return { lat: s.row.latitude, lon: s.row.longitude }
    case 'pending':
      return { lat: s.pending.latitude, lon: s.pending.longitude }
    case 'label':
      return { lat: s.poi.lat, lon: s.poi.lon }
    case 'spot':
      return { lat: round5(s.lat), lon: round5(s.lon) }
  }
}

/** What `Add to analysis` registers for a label or a spot; a ranked or pending row is in already. */
export function subjectPlace(s: CardSubject): Place | null {
  if (s.kind === 'label') return poiToPlace(s.poi)
  if (s.kind === 'spot') return spotPlace(s.lat, s.lon)
  return null
}

/** The row type a subject is, or will be once it ranks; a spot has none until it is added. */
export function subjectType(s: CardSubject): string | null {
  switch (s.kind) {
    case 'ranked':
      return s.row.type
    case 'pending':
      // A found row's kind is its row type already, and a searched place's
      // is `placeType`'s. A pasted coordinate has none, so it is `custom`.
      return placeType(s.pending.kind ?? '')
    case 'label':
      // So OSM's `volcano` reads `Peak`.
      return placeType(s.poi.kind)
    case 'spot':
      return null
  }
}

/** The card's one button: a row in the analysis offers its way out, a place outside it its way in. */
export function cardAction(s: CardSubject, view: CardView): CardAction | null {
  if (s.kind === 'ranked') return view.removable ? 'remove' : null
  if (s.kind === 'pending') return 'remove'
  return view.added ? 'remove' : 'add'
}

/** The type in the word the Type column uses for it, or null where a reader would have no word for it. */
function typeWord(rowType: string): string | null {
  return rowType === 'custom' ? null : String(TYPE_COL.format!(rowType))
}

/** Whether a destination is named by its own coordinates: a pasted pair, or a spot the map added. */
function spotNamed(name: string, lat: number, lon: number): boolean {
  return name === coordinateLabel(lat, lon)
}

/**
 * The name, its link out, and the facts under it, for every subject but a
 * spot. `modelOnBand` keeps a comparison row's model line on the band only
 * while no forecast section names the model under it, so a card never says
 * the model twice.
 */
function placeHeader(s: Exclude<CardSubject, { kind: 'spot' }>, view: CardView, modelOnBand = true) {
  const states = view.usStates ?? null
  const ground = slopeFact(view.ground)
  const facts = (type: string | null, elevationFt: number | null | undefined, lat: number, lon: number) =>
    factsRow(type, elevationFt != null ? elevationFact(elevationFt) : null, lat, lon, caltopoUrl(lat, lon, view.mapZoom), ground)
  // A destination named by its coordinates would say the pair twice, as its
  // name and as its first fact (TJ, 2026-11-03). Its header is the spot's:
  // the pair as the title, opening CalTopo, and the facts under it without
  // the pair.
  const spotLink = (lat: number, lon: number) => ({ href: caltopoUrl(lat, lon, view.mapZoom), label: 'Open in CalTopo' })
  const spotFacts = (type: string | null, elevation: string | null) =>
    factsLine([type ? escapeHtml(type) : '', elevation ? factValue(escapeHtml(elevation)) : '', ground])
  switch (s.kind) {
    case 'ranked': {
      const r = s.row
      // The model a comparison names takes a line of its own above the facts,
      // because a model's name can be as long as the rest of the line.
      const identity = popupIdentity(r, view.columns ?? [], view.modelFallbackLabel)
      const elevation = identity.elevation
      const spot = spotNamed(r.name, r.latitude, r.longitude)
      return {
        title: `${s.rank ? `#${escapeHtml(String(s.rank))} ` : ''}${escapeHtml(r.name)}`,
        link: spot
          ? spotLink(r.latitude, r.longitude)
          : {
              href: destinationUrl(
                { name: r.name, type: r.type, latitude: r.latitude, longitude: r.longitude, osm_id: r.osm_id ?? null },
                states,
              ),
              label: destinationLinkLabel(r.type),
            },
        meta: metaBand([
          modelOnBand && identity.model ? `<div>${escapeHtml(identity.model)}</div>` : '',
          spot
            ? spotFacts(identity.type, elevation)
            : factsRow(identity.type, elevation, r.latitude, r.longitude, caltopoUrl(r.latitude, r.longitude, view.mapZoom), ground),
        ]),
      }
    }
    case 'pending': {
      // The word the Type column will use once the destination ranks.
      const p = s.pending
      const link = pendingLinkRow(p)
      const type = typeWord(subjectType(s)!)
      if (spotNamed(p.name, p.latitude, p.longitude)) {
        return {
          title: escapeHtml(p.name),
          link: spotLink(p.latitude, p.longitude),
          meta: metaBand([spotFacts(type, p.elevation_ft != null ? elevationFact(p.elevation_ft) : null)]),
        }
      }
      return {
        title: escapeHtml(p.name),
        link: { href: destinationUrl(link, states), label: destinationLinkLabel(link.type) },
        meta: metaBand([facts(type, p.elevation_ft, p.latitude, p.longitude)]),
      }
    }
    case 'label': {
      // The kind in the word the Type column will use for the place once it is
      // analyzed. A trailhead or crag marker brings its OSM id, so it links to
      // that object (#734). The name is OSM's, so it is third-party text on
      // its way to setHTML.
      const p = s.poi
      const type = subjectType(s)!
      const href = destinationUrl({ name: p.name, type, latitude: p.lat, longitude: p.lon, osm_id: p.osmId ?? null }, states)
      return {
        title: escapeHtml(p.name),
        link: { href, label: destinationLinkLabel(type) },
        meta: metaBand([facts(typeWord(type), p.elevationFt, p.lat, p.lon)]),
      }
    }
  }
}

/** The key the forecast section's fold is kept under, beside the layers' targets. */
export const FORECAST_SECTION = 'forecast'

/** What the forecast section is named without a model to name: an archive report's, whose numbers no model produced. */
const FORECAST_HEADING = 'Forecast'

/**
 * Whether a section shows its body: the reader's own choice for that section
 * where they made one, and otherwise open on every card but the ranked one,
 * where only the forecast is (TJ, 2026-11-03).
 */
export function sectionOpen(s: CardSubject, key: string, folds?: ReadonlyMap<string, boolean>): boolean {
  const chosen = folds?.get(key)
  if (chosen !== undefined) return chosen
  return s.kind !== 'ranked' || key === FORECAST_SECTION
}

/**
 * A ranked row's measurements as one grid, a row per family and a column per
 * aggregate (TJ, 2026-10-08), every value from the COLUMNS the table is
 * showing rather than a list spelled here (#370; `popupRows.ts` owns the
 * derivation), or '' with no column to show.
 */
function rankedGrid(row: DestinationResult, view: CardView): string {
  const grid = popupGrid(
    popupGroups(row, view.columns ?? [], {
      modelId: view.modelId,
      times: view.times,
      rankedBy: view.rankedBy,
      pointSample: view.pointSample,
    }),
  )
  return grid.rows.length ? metricGrid(grid, { compact: view.compact, widths: view.widths }) : ''
}

/**
 * A ranked row's forecast as the card's last section: `Forecast: GFS
 * Seamless`, the model the numbers came from (a comparison row's own, or the
 * one model that answered every row), the grid, and when the report was
 * analyzed in the fine print, `Analyzed: Nov 3, 2026, 1:36 PM` (TJ,
 * 2026-11-03). Nothing with no column to show.
 */
function forecastSection(s: Extract<CardSubject, { kind: 'ranked' }>, view: CardView): string | null {
  const grid = rankedGrid(s.row, view)
  if (!grid) return null
  const model = (s.row as ModelRow).modelLabel ?? view.modelFallbackLabel ?? null
  const analyzed = updatedAt(view.analyzedAtMs)
  return cardSection({
    key: FORECAST_SECTION,
    heading: escapeHtml(model ? `${FORECAST_HEADING}: ${model}` : FORECAST_HEADING),
    label: FORECAST_HEADING,
    open: sectionOpen(s, FORECAST_SECTION, view.folds),
    body: grid + (analyzed ? bodyLines([updatedLine(escapeHtml(analyzed), ANALYZED)]) : ''),
  })
}

/** What the forecast section's fine print calls the report's time. */
const ANALYZED = 'Analyzed'

/**
 * A spot's ground: the tile's height in feet, then the slope, since a bare
 * point has no height of its own recorded.
 */
function spotGround(ground: GroundState | undefined): string {
  if (!ground || ground.kind === 'none') return ''
  if (ground.kind === 'pending') return factsLine([pendingValue()])
  const feet = Math.round(ground.reading.elevationM * FEET_PER_METER)
  return factsLine([factValue(escapeHtml(elevationFact(feet))), slopeFact(ground)])
}

/**
 * What the layers say at the point (#737, #832), each a section opening on
 * the layer's name and its reading, `Rain radar: Moderate precipitation`, so
 * a reader knows which layer said it (TJ, 2026-11-03), the order's type in
 * the warning amber under a closure's name, its values under that, and where
 * and when it was measured in the fine print at its foot: `NEXRAD radar: 10
 * min ago` (layout C1). A reading's name that changes while the card is
 * open, the radar's during playback, stands at the width of its widest so
 * the card does not jump (#752).
 */
function layerSection(s: CardSubject, section: PointSection, view: CardView): string {
  const name = section.titles ? widestName(section.title, section.titles) : section.title
  return cardSection({
    key: section.kind,
    heading: `${section.layer}: ${name}`,
    label: section.layer,
    link: section.link,
    open: sectionOpen(s, section.kind, view.folds),
    body: bodyLines([
      section.warn === undefined ? null : warningLine(section.warn, null),
      ...section.rows,
      section.when === undefined ? null : updatedLine(section.when, section.source),
    ]),
  })
}

/**
 * The card for a subject as the map sees it now. A spot's title is the pair,
 * and its link-out glyph opens CalTopo there (`Open in CalTopo`), since the
 * title already says what the facts' pair would (TJ, 2026-10-30). Under the
 * band, the layers' sections in the map's rank and then the forecast's, each
 * ruled off from the one above it.
 */
export function destinationPopupHtml(s: CardSubject, view: CardView = {}): string {
  const action = cardAction(s, view)
  const button =
    action === 'remove'
      ? popupButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove from analysis')
      : action === 'add'
        ? popupButton(`${CARD_ACTION_ATTR}="add"`, 'Add to analysis')
        : ''
  const at = subjectPoint(s)
  const forecast = s.kind === 'ranked' ? forecastSection(s, view) : null
  const header =
    s.kind === 'spot'
      ? {
          title: escapeHtml(coordinateLabel(at.lat, at.lon)),
          link: { href: caltopoUrl(at.lat, at.lon, view.mapZoom), label: 'Open in CalTopo' },
          meta: metaBand([spotGround(view.ground)]),
        }
      : placeHeader(s, view, forecast === null)
  const sections = [...(view.sections ?? []).map((section) => layerSection(s, section, view)), forecast].filter(
    (part): part is string => part !== null,
  )
  const body = sections.map((inner, i) => (i === 0 ? inner : bodySection(inner))).join('')
  // A card with something under its band rules its button off in a foot of
  // its own (#696), or it reads as one more row; a card with nothing else
  // stands the button alone and centred in the body, under the band's edge,
  // where a foot's rule would draw a second line under the first (record 0139).
  const lone = !body
  return popupCard({
    ...header,
    body: lone && button ? popupAction(button) : body,
    action: lone ? '' : button,
  })
}
