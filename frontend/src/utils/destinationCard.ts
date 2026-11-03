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
 * - a **ranked** row has a forecast, so it carries the warnings and the grid
 *   (#370), and its remove does what the table's × does (#696);
 * - a **pending** destination has no forecast yet, so the header alone, and
 *   its remove is the same × (TJ, 2026-11-03);
 * - a **label** is a feature the map draws, which `Add to analysis` registers
 *   the way a search by name does (#119, #712);
 * - a **spot** is a coordinate no label names: the pair is its title, the
 *   ground its facts, and the rain radar and the snow depth painted there its
 *   body (#737), since a click on bare map is how both are asked.
 *
 * Every header is the result card's band: the name and its link out, then the
 * coordinates alone, then the type, the elevation and the slope (TJ,
 * 2026-10-31). A spot has no name, kind or recorded height, so its title is
 * the pair and its facts are the tile's height and the slope.
 */
import type { DestinationResult, SortBy } from '../types'
import { type BasemapPoi, FEET_PER_METER, poiToPlace } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import { type ClosureWarning, closurePopupText } from './closureProximity'
import type { PendingDestination } from './customList'
import { destinationLinkLabel, destinationUrl } from './destinationUrl'
import { type FireWarning, firePopupText } from './fireProximity'
import { type Place, placeType } from './geocode'
import { roundTo } from './numbers'
import type { PointSection } from './pointReadout'
import { coordinateLabel } from './points'
import { type GroundState, slopeFact } from './popup/groundFact'
import {
  bodyLines,
  bodySection,
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
  sectionHeading,
  updatedLine,
  warningLine,
  widestName,
} from './popup/popupChrome'
import { elevationFact, popupGrid, popupGroups, popupIdentity } from './popup/popupRows'
import { pendingLinkRow } from './results/resultsCells'
import { type ColDef, TYPE_COL } from './tableColumns'
import type { UsStates } from './usStates'
import { FIRE_LINK_ZOOM, nifcFireUrl } from './wildfires'

/** What a card describes. */
export type CardSubject =
  | { kind: 'ranked'; row: DestinationResult; rank: number | string }
  | { kind: 'pending'; pending: PendingDestination }
  | { kind: 'label'; poi: BasemapPoi }
  | { kind: 'spot'; lat: number; lon: number; sections: readonly PointSection[] }

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
  /** The nearest wildfire within the warn radius, and the closure the point stands in. */
  warning?: FireWarning | null
  closure?: ClosureWarning | null
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

/** The name, its link out, and the facts under it, for every subject but a spot. */
function placeHeader(s: Exclude<CardSubject, { kind: 'spot' }>, view: CardView) {
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
          identity.model ? `<div>${escapeHtml(identity.model)}</div>` : '',
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

/**
 * A ranked row's warnings: the nearest wildfire and the closure it stands in,
 * the two table columns the card does not mirror as rows, since each is a
 * safety flag rather than a measurement (TJ, 2026-09-14). Each whole line is
 * its link: NIFC's map for the fire, the order's page for a closure that has
 * one. The names inside are third-party text, so they are escaped.
 */
function rankedWarnings(view: CardView): string[] {
  const fire = view.warning
    ? warningLine(
        escapeHtml(firePopupText(view.warning)),
        nifcFireUrl(view.warning.longitude, view.warning.latitude, FIRE_LINK_ZOOM),
      )
    : ''
  const closure = view.closure ? warningLine(escapeHtml(closurePopupText(view.closure)), view.closure.url ?? null) : ''
  return [fire, closure].filter(Boolean)
}

/**
 * A ranked row's measurements as one grid, a row per family and a column per
 * aggregate (TJ, 2026-10-08), every value from the COLUMNS the table is
 * showing rather than a list spelled here (#370; `popupRows.ts` owns the
 * derivation).
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
 * What the pictures painted at a spot (#737), each a section opening on the
 * layer's name and its reading, `Rain radar: Moderate precipitation`, so a
 * reader knows which layer said it (TJ, 2026-11-03), its values under it,
 * and where and when it was measured in the fine print at its foot: `NEXRAD
 * radar: 10 min ago` (layout C1). A reading's name that changes while the
 * card is open, the radar's during playback, stands at the width of its
 * widest so the card does not jump (#752).
 */
function spotSections(sections: readonly PointSection[]): string {
  return sections
    .map((s, i) => {
      const name = s.titles ? widestName(s.title, s.titles) : s.title
      const inner = sectionHeading(`${s.layer}: ${name}`) + bodyLines([...s.rows, s.when === undefined ? null : updatedLine(s.when, s.source)])
      return i === 0 ? inner : bodySection(inner)
    })
    .join('')
}

/**
 * The card for a subject as the map sees it now. A spot's title is the pair,
 * and its link-out glyph opens CalTopo there (`Open in CalTopo`), since the
 * title already says what the facts' pair would (TJ, 2026-10-30).
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
  const header =
    s.kind === 'spot'
      ? {
          title: escapeHtml(coordinateLabel(at.lat, at.lon)),
          link: { href: caltopoUrl(at.lat, at.lon, view.mapZoom), label: 'Open in CalTopo' },
          meta: metaBand([spotGround(view.ground)]),
        }
      : placeHeader(s, view)
  const warnings = s.kind === 'ranked' ? rankedWarnings(view) : []
  const body = s.kind === 'ranked' ? rankedGrid(s.row, view) : s.kind === 'spot' ? spotSections(s.sections) : ''
  // A card with something under its band rules its button off in a foot of
  // its own (#696), or it reads as one more row; a card with nothing else
  // stands the button alone and centred in the body, under the band's edge,
  // where a foot's rule would draw a second line under the first (record 0139).
  const lone = !body && warnings.length === 0
  return popupCard({
    ...header,
    warnings,
    body: lone && button ? popupAction(button) : body,
    action: lone ? '' : button,
  })
}
