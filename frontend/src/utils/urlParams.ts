// Every query parameter a share link carries, as one table: the key, how the
// state writes it, and how a link's value reads back. Apart from `urlState.ts`
// so that the parameter set is something a reader can scan top to bottom, and
// so that a new parameter is one row rather than an edit in two long functions
// that must agree with each other. `urlState.ts` keeps what is not about any
// one parameter: whether a state deserves a URL at all, and the two loops.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { DiscoveryType, GeoPolygon, SortBy } from '../types'
import {
  DEFAULT_FAMILY_KEY,
  FAMILY_KEYS,
  type MetricFamily,
  RANKED_FAMILIES,
  RANKING_KEYS,
  aggregateToken,
  familyOf,
  isSnapshotFamily,
} from '../metrics'
import { type Constraints, NO_CONSTRAINTS } from './constraints'
import { GRID_REACH_DEFAULT_FRAC, isGridStyle } from './forecastGrid'
import { type ForecastSelection, isDayKey, isTimeOfDay, orderDays } from './calendar'
import type { Place } from './geocode'
import type { ShareableState } from './urlState'

/**
 * One query parameter.
 *
 * `encode` answers the value to write, or null to leave the key out. `decode`
 * runs only when the link carries the key, and folds its value into the state
 * being built; it may read what an EARLIER row decoded, which is why the table's
 * order is a contract for reading as well as for writing. The window's keys
 * have no `decode`: they are written here but read together by
 * `decodeSelection`.
 *
 * `escaped` marks a row that does its own escaping: `encode` answers query text
 * the writer copies as it is, and `decode` is handed the raw query text rather
 * than the percent-decoded value. Every other row deals in plain text and the
 * writer escapes it with `escapeQueryText`.
 */
export interface ParamCodec {
  key: string
  escaped?: true
  encode?: (state: ShareableState) => string | null
  decode?: (raw: string, out: Partial<ShareableState>) => void
}

// Control defaults: they must mirror the initial useState values in the hooks
// that hold the panel's state (`useRankingKnobs`). The two rows below write
// only off them, and `urlState.ts` re-exports both under the names the panel
// already imports.
//
// The ranking opens on the FIRST row of the Metrics table, so the selected
// radio is the one a reader's eye lands on rather than one four rows down
// (TJ, 2026-09-14). The table is alphabetical, which is what puts AQI there.
export const DEFAULT_SORT: SortBy = 'aqi_avg'
// Exported because the panel now shows it as a PLACEHOLDER rather than a
// value, so three files needed the same number and two of them were spelling
// it themselves.
export const DEFAULT_LIMIT = 200

// What a query value may carry as itself: the unreserved characters, plus the
// four delimiters the readable fields are built from (`type=peak,lake`,
// `poly=lng,lat;lng,lat`, `h1=06:00`, an OSM id's `node/123`). RFC 3986 allows
// all of them in a query, and a browser keeps them as written, so the address
// bar shows the link this module wrote. `URLSearchParams` would encode all
// four, which is why the writer does not use it.
const QUERY_SAFE = /%(2C|3B|3A|2F)/g
const QUERY_SAFE_CHARS: Record<string, string> = { '2C': ',', '3B': ';', '3A': ':', '2F': '/' }
// encodeURIComponent leaves these raw. A browser encodes `'` in a query itself,
// which would leave the address bar different from what was written, and the
// brackets end a link early in some chat and Markdown renderers.
const QUERY_UNSAFE_MARKS = /[!'()*]/g
// encodeURIComponent throws on half a surrogate pair. URLSearchParams writes
// U+FFFD for one, and so does this.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Escape plain text for a query value: a space as `+`, the readable delimiters
 * as themselves, and everything else percent-encoded once. `&`, `=`, `#`, `%`
 * and a literal `+` are always encoded, so the value cannot end early or read
 * back as something else.
 */
export function escapeQueryText(text: string): string {
  return encodeURIComponent(text.replace(LONE_SURROGATE, '\uFFFD'))
    .replace(QUERY_UNSAFE_MARKS, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+')
    .replace(QUERY_SAFE, (_, hex: string) => QUERY_SAFE_CHARS[hex])
}

/**
 * Read a query value back to plain text: `+` as a space, then one layer of
 * percent-decoding. Null for a malformed escape, so the caller drops the value
 * rather than throwing.
 */
export function unescapeQueryText(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    return null
  }
}

const DISCOVERY_TYPES: DiscoveryType[] = ['peak', 'trailhead', 'lake']

// The shape of an Open-Meteo model id, which `model` and `compare` both check.
// Membership is the caller's to judge, since only it holds the published list.
const MODEL_ID = /^[a-z0-9_]+$/

const POLY_PRECISION = 5 // ~1 m; keeps the URL short without visible drift

function round(n: number): number {
  const f = 10 ** POLY_PRECISION
  return Math.round(n * f) / f
}

/** Whether the state holds a ring worth writing: three corners at least. */
export function hasPolygon(state: ShareableState): boolean {
  return state.polygon !== null && (state.polygon.coordinates[0]?.length ?? 0) >= 3
}

/** Whether the state holds a pasted CSV worth writing. */
export function hasCustomCsv(state: ShareableState): boolean {
  return state.customCsv.trim() !== ''
}

// Encode a polygon's ring as "lng,lat;lng,lat;..." matching GeoJSON [lng,lat]
// order. The closing vertex (equal to the first) is dropped and re-added on
// decode, so it never bloats the URL.
function encodePolygon(polygon: GeoPolygon): string {
  const ring = polygon.coordinates[0] ?? []
  const pts = ring.slice()
  if (pts.length > 1) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) pts.pop()
  }
  return pts.map(([lng, lat]) => `${round(lng)},${round(lat)}`).join(';')
}

function decodePolygon(raw: string): GeoPolygon | null {
  const pts: number[][] = []
  for (const pair of raw.split(';')) {
    const [lngStr, latStr] = pair.split(',')
    const lng = Number(lngStr)
    const lat = Number(latStr)
    if (
      lngStr === undefined ||
      latStr === undefined ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat)
    ) {
      return null
    }
    pts.push([lng, lat])
  }
  if (pts.length < 3) return null
  return { type: 'Polygon', coordinates: [[...pts, pts[0]]] }
}

// Escape one pin field. On top of the value escape, a field encodes the two
// delimiters the list is built from, so a label holding `,` or `;` cannot split
// a pin. That is still the ONE layer of encoding: `East+Tiger+Mountain` and
// `node/349018340` read in the address bar as they are.
function escapePinField(field: string): string {
  return escapeQueryText(field).replace(/,/g, '%2C').replace(/;/g, '%3B')
}

// Encode pinned places as "lon,lat,kind,elev,osmId,label" per pin, ';'-joined,
// as query text (the row is `escaped`). Coords are rounded like the polygon
// ring to keep the URL short. Missing elevation/osmId encode as empty.
function encodePins(places: Place[]): string {
  return places
    .map((p) => {
      const fields = [
        String(round(p.lon)),
        String(round(p.lat)),
        p.kind,
        p.elevationFt === undefined ? '' : String(p.elevationFt),
        p.osmId ?? '',
        p.label,
      ]
      return fields.map(escapePinField).join(',')
    })
    .join(';')
}

// Parse the pins param back into Places. It reads the RAW query text: the
// delimiters are split first, while a label's own `,` and `;` are still
// escaped, and each field is then decoded once. Tolerant like the rest of
// decodeState: an entry without a finite lon/lat, or with a malformed escape,
// is skipped rather than failing the whole list. A link from before the pins
// encoded once carries its delimiters escaped, reads as one field, and is
// skipped the same way. `description`/`bbox` aren't persisted — a restored pin
// doesn't need the disambiguation line or the fly-to extent — so they come
// back empty/absent.
function decodePins(raw: string): Place[] {
  const out: Place[] = []
  for (const entry of raw.split(';')) {
    const parts = entry.split(',').map(unescapeQueryText)
    if (parts.length < 6 || parts.some((f) => f === null)) continue
    const [lonStr, latStr, kind, elevStr, osmId, label] = parts as string[]
    const lon = Number(lonStr)
    const lat = Number(latStr)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    const elev = Number(elevStr)
    out.push({
      label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      description: '',
      kind,
      lat,
      lon,
      ...(elevStr !== '' && Number.isFinite(elev) ? { elevationFt: elev } : {}),
      ...(osmId ? { osmId } : {}),
    })
  }
  return out
}

// A flag that is on or absent: written as `1` while on, and read as on only
// from `1`, so a hand-typed `true` or `0` leaves the default in place.
function flag(
  key: string,
  field: 'sortDesc' | 'showWildfires' | 'showRadar' | 'showSmoke' | 'showSnow' | 'includeUnnamedPeaks',
): ParamCodec {
  return {
    key,
    encode: (state) => (state[field] ? '1' : null),
    decode: (raw, out) => {
      if (raw === '1') out[field] = true
    },
  }
}

// An aggregate dropdown (#291): one param per metric family, valued by the
// aggregate token its keys already spell (`wind=max`), written only off the
// default so a link stays as short as what was changed. The active family is
// skipped on write: `sort` already carries its whole key, and a second spelling
// of the same fact is a chance for the two to disagree. On read `sort` wins
// over its own family's param for the same reason, and because `sort` is the
// one that names the ranking on screen; the two can only disagree in a
// hand-edited link. That is why `sort` sits above these rows.
function aggregateRow(family: MetricFamily): ParamCodec {
  return {
    key: family,
    encode: (state) => {
      if (family === familyOf(state.sortBy)) return null
      const token = aggregateToken(state.rowKeys[family])
      return token !== null && state.rowKeys[family] !== DEFAULT_FAMILY_KEY[family] ? token : null
    },
    decode: (raw, out) => {
      const key = FAMILY_KEYS[family].find((k) => aggregateToken(k) === raw)
      if (key === undefined || key === DEFAULT_FAMILY_KEY[family]) return
      // No `sort` means the default ranking, since `sort` is written only off
      // it, so the default's family is the active one then.
      const sortBy = out.sortBy ?? DEFAULT_SORT
      const active = familyOf(sortBy) === family
      out.rowKeys = { ...(out.rowKeys ?? DEFAULT_FAMILY_KEY), [family]: active ? sortBy : key }
    },
  }
}

// A forecast bound. The param name reads as the control's label, not as the
// result field it compares: `maxaqi` is the AQI ceiling, and which aggregate it
// reads is the app's answer, not something a link should have to encode. The
// state carries `constraints` only once a bound survived, so a link carrying
// none leaves it undefined and App keeps its own default rather than being
// handed an all-null object that means the same thing.
function bound(key: string, field: keyof Constraints): ParamCodec {
  return {
    key,
    encode: (state) => {
      const value = state.constraints[field]
      return value !== null ? String(value) : null
    },
    decode: (raw, out) => {
      const n = Number(raw)
      if (Number.isFinite(n)) out.constraints = { ...(out.constraints ?? NO_CONSTRAINTS), [field]: n }
    },
  }
}

/**
 * Every parameter, in the order a link writes them. The order is part of the
 * link's text, so moving a row changes every link shared after the move.
 */
export const URL_PARAMS: readonly ParamCodec[] = [
  // `type=peak,lake`, comma-joined and left unencoded: the param stays
  // something you can read and edit in the address bar, which is the
  // convention every readable field here follows. Unknown names are dropped
  // rather than failing the whole link: an old `type=custom` link, or a type a
  // future deployment stopped publishing, restores as "no types checked" and
  // the rest of the link still works.
  {
    key: 'type',
    encode: (state) => (state.destinationTypes.length > 0 ? state.destinationTypes.join(',') : null),
    decode: (raw, out) => {
      const types = raw
        .split(',')
        .map((t) => t.trim())
        .filter((t): t is DiscoveryType => DISCOVERY_TYPES.includes(t as DiscoveryType))
      if (types.length > 0) out.destinationTypes = [...new Set(types)]
    },
  },
  // Written only off the default, so a link carries what the reader changed and
  // an absent key reads as the default. No legacy sort map: the aggregate keys
  // it used to fold into their metric's representative one (`wind_max_mph` to
  // `wind_avg_mph`) are first-class RANKING_KEYS since #291, so an old link
  // restores as exactly the ranking it named. The active family's dropdown
  // rides this param too, so a key off its family's default is also a row
  // choice a reload must keep.
  {
    key: 'sort',
    encode: (state) => (state.sortBy !== DEFAULT_SORT ? state.sortBy : null),
    decode: (raw, out) => {
      if (!(RANKING_KEYS as readonly string[]).includes(raw)) return
      const sortBy = raw as SortBy
      out.sortBy = sortBy
      const family = familyOf(sortBy)
      if (sortBy !== DEFAULT_FAMILY_KEY[family]) {
        out.rowKeys = { ...DEFAULT_FAMILY_KEY, [family]: sortBy }
      }
    },
  },
  flag('desc', 'sortDesc'),
  // A snapshot family has one key and no dropdown, so there is no choice to
  // carry and no param to write (#449).
  ...RANKED_FAMILIES.filter((family) => !isSnapshotFamily(family)).map(aggregateRow),
  // Shape only, no ceiling: a link asking for more rows than this deployment
  // allows gets clamped down by the caller, never discarded. Dropping it here
  // is what made a shared `limit=500` open silently at the default instead of
  // at the maximum (issue #191), and the 200 that used to live here was a copy
  // of a cap that moved in #181. Written only off the default, like `sort`.
  {
    key: 'limit',
    encode: (state) => (state.limit !== DEFAULT_LIMIT ? String(state.limit) : null),
    decode: (raw, out) => {
      const n = Number(raw)
      if (Number.isInteger(n) && n >= 1) out.limit = n
    },
  },
  // Always written once the link exists at all, for the same reason `mode` is:
  // the model is part of what the numbers mean, so a link that left it to the
  // reader's default would show something other than what was shared the moment
  // that default moved. The id is Open-Meteo's own (`ecmwf_ifs025`,
  // `gfs_hrrr`), which keeps the param as hand-editable as the rest.
  //
  // Read for shape only, no membership check: the accepted set is the
  // deployment's, from /api/capabilities, and this module has no access to it.
  // A link naming a model this deployment does not offer is settled by the
  // caller, which has the list. Absent is the interesting case and it means one
  // thing: every link shared before the picker existed was computed under
  // Open-Meteo's `best_match` blend, and inherits the current default instead,
  // which is a release note rather than a migration.
  {
    key: 'model',
    encode: (state) => state.forecastModel,
    decode: (raw, out) => {
      if (raw && MODEL_ID.test(raw)) out.forecastModel = raw
    },
  },
  // Written only when something is selected, so an ordinary link carries
  // nothing for a chart nobody is comparing on. Comma-joined ids in the
  // published order, which is the order the picker's chips read, so the param
  // is as hand-editable as `model` beside it.
  //
  // Read with the shape `model` accepts and deduplicated, so a hand-edited link
  // cannot smuggle a second copy of one model onto the chart. Membership is the
  // caller's to judge, exactly as it is for `model`, so an id this deployment
  // does not publish survives here and is simply never drawn. An empty result
  // leaves the field undefined rather than handing back an empty array, so App
  // keeps its own default.
  {
    key: 'compare',
    encode: (state) => (state.compareModels.length > 0 ? state.compareModels.join(',') : null),
    decode: (raw, out) => {
      const ids = raw.split(',').filter((id) => MODEL_ID.test(id))
      const unique = ids.filter((id, i) => ids.indexOf(id) === i)
      if (unique.length > 0) out.compareModels = unique
    },
  },
  // The window's five keys are read together by `decodeSelection`, because
  // what `h1` means depends on `mode` and `d1`.
  //
  // `mode` is always written, even at its default. Links used to leave it out
  // for the then-default window mode and let the reader infer it; that made
  // every shared link hostage to the app's current default. Spelling it out
  // costs one param and makes the link self-describing, which is also why it
  // survives the calendar even though `d1` alone would imply a day selection: a
  // reader should not have to know that.
  { key: 'mode', encode: (state) => state.selection.kind },
  // A dateless Dates arm writes mode=days alone: the link reopens on the empty
  // calendar rather than inventing a day the user never picked.
  {
    key: 'd1',
    encode: ({ selection }) => (selection.kind === 'days' ? selection.startDate : null),
  },
  // Omitted for a single day, so the common link stays as short as the shape
  // it describes.
  {
    key: 'd2',
    encode: ({ selection }) =>
      selection.kind === 'days' && selection.endDate !== null && selection.endDate !== selection.startDate
        ? selection.endDate
        : null,
  },
  // Written whenever the narrow-hours control is open, defaults included: the
  // pair is the control's state, not only its effect, and a link that dropped
  // 00:00/23:59 would reopen with the disclosure closed.
  {
    key: 'h1',
    encode: ({ selection }) => (selection.kind === 'days' && selection.hours ? selection.hours.start : null),
  },
  {
    key: 'h2',
    encode: ({ selection }) => (selection.kind === 'days' && selection.hours ? selection.hours.end : null),
  },
  // The forecast bounds, spelled out rather than abbreviated the way
  // `minel`/`maxel` were: sixteen terse keys would be sixteen guesses in the
  // address bar, and readability is what the URL convention buys (#210).
  // `minel` and `maxel` have no row, so they are deliberately not read. They
  // carried the elevation band the panel dropped in #341, so an old link still
  // parses and simply analyzes the whole range, the reading every other
  // retired parameter gets.
  bound('minprecip', 'minPrecipTotalIn'),
  bound('maxprecip', 'maxPrecipTotalIn'),
  bound('mintemp', 'minTempF'),
  bound('maxtemp', 'maxTempF'),
  bound('minwind', 'minWindMph'),
  bound('maxwind', 'maxWindMph'),
  bound('minfreeze', 'minFreezeFt'),
  bound('maxfreeze', 'maxFreezeFt'),
  bound('minsnow', 'minSnowDepthIn'),
  bound('maxsnow', 'maxSnowDepthIn'),
  bound('minaqi', 'minAqi'),
  bound('maxaqi', 'maxAqi'),
  bound('mincloudbase', 'minCloudBaseFt'),
  bound('maxcloudbase', 'maxCloudBaseFt'),
  bound('mincloudcover', 'minCloudCoverPct'),
  bound('maxcloudcover', 'maxCloudCoverPct'),
  {
    key: 'poly',
    encode: (state) => (hasPolygon(state) && state.polygon ? encodePolygon(state.polygon) : null),
    decode: (raw, out) => {
      if (!raw) return
      const decoded = decodePolygon(raw)
      if (decoded) out.polygon = decoded
    },
  },
  // A 100-row CSV is ~13 KB raw; compressing keeps the shared link ~1-2 KB (and
  // off Firefox's address-bar / ingress limits). Only this field is opaque:
  // every other param stays plain text and hand-editable. decompress returns
  // null on a garbled value, which is dropped.
  //
  // Written as lz-string's own output, six bits a character from
  // `A-Za-z0-9+-`, all legal in a query. The `+` is the one an escape would
  // touch: escaped it costs two bytes more, and read back unescaped it arrives
  // as a space, which decompressFromEncodedURIComponent turns back into `+`
  // before it decodes. Read through the ordinary unescape, so a link written
  // with `%2B` opens the same.
  {
    key: 'customz',
    escaped: true,
    encode: (state) => (hasCustomCsv(state) ? compressToEncodedURIComponent(state.customCsv) : null),
    decode: (raw, out) => {
      const text = unescapeQueryText(raw)
      if (!text) return
      const decoded = decompressFromEncodedURIComponent(text)
      if (decoded) out.customCsv = decoded
    },
  },
  flag('fires', 'showWildfires'),
  flag('radar', 'showRadar'),
  flag('smoke', 'showSmoke'),
  flag('snow', 'showSnow'),
  // The value names the style rather than being a bare `1`, which keeps the
  // link hand-editable and self-describing: `grid=smooth` says what it will
  // draw. One param rather than two, because a layer that is off has no style
  // to carry and a link should not be able to say otherwise.
  {
    key: 'grid',
    encode: (state) => (state.showGrid ? state.gridStyle : null),
    decode: (raw, out) => {
      if (!isGridStyle(raw)) return
      out.showGrid = true
      out.gridStyle = raw
    },
  },
  // In percent of the bar, written only while the layer is on AND the value is
  // not the default. Read only beside a valid `grid` above, and clamped to the
  // bar rather than trusted: the param is hand-editable, and a position outside
  // it would draw a control that cannot show the value it is applying. An empty
  // value reads as 0, a legal position here.
  {
    key: 'reach',
    encode: (state) =>
      state.showGrid && state.gridReachFrac !== GRID_REACH_DEFAULT_FRAC
        ? String(Math.round(state.gridReachFrac * 100))
        : null,
    decode: (raw, out) => {
      if (out.gridStyle === undefined) return
      const reach = Number(raw)
      if (Number.isFinite(reach)) out.gridReachFrac = Math.min(100, Math.max(0, reach)) / 100
    },
  },
  // Written only once the reader has touched the switch, and then in both
  // directions: the default is the device's, so `player=0` says "off even at a
  // desktop width" as meaningfully as `player=1` says "on even on a phone". A
  // link that left the default out is the link that keeps meaning what it said
  // when the default moves. Both values are read, and anything else is left to
  // the device default: the param exists to carry a decision, so no value is
  // not a decision.
  {
    key: 'player',
    encode: (state) => (state.showPlayer === null ? null : state.showPlayer ? '1' : '0'),
    decode: (raw, out) => {
      if (raw === '1') out.showPlayer = true
      if (raw === '0') out.showPlayer = false
    },
  },
  flag('unnamed', 'includeUnnamedPeaks'),
  {
    key: 'pins',
    escaped: true,
    encode: (state) => (state.pins.length > 0 ? encodePins(state.pins) : null),
    decode: (raw, out) => {
      if (!raw) return
      const decoded = decodePins(raw)
      if (decoded.length > 0) out.pins = decoded
    },
  },
]

// Which params carry each field of the shared state. Typed against every key
// of `ShareableState`, so a new field fails the typecheck here until someone
// decides which param carries it: a field with no param is a session that a
// shared link silently drops, and nothing else would notice. Each list must be
// non-empty, or `[]` would satisfy the type while claiming nothing. The
// suite checks that each key named here is a row of the table.
export const FIELD_PARAMS = {
  polygon: ['poly'],
  destinationTypes: ['type'],
  includeUnnamedPeaks: ['unnamed'],
  // Read back together by `decodeSelection`.
  selection: ['mode', 'd1', 'd2', 'h1', 'h2'],
  forecastModel: ['model'],
  compareModels: ['compare'],
  sortBy: ['sort'],
  sortDesc: ['desc'],
  rowKeys: ['sort', ...RANKED_FAMILIES.filter((family) => !isSnapshotFamily(family))],
  constraints: [
    'minprecip', 'maxprecip', 'mintemp', 'maxtemp', 'minwind', 'maxwind',
    'minfreeze', 'maxfreeze', 'minsnow', 'maxsnow', 'minaqi', 'maxaqi',
    'mincloudbase', 'maxcloudbase', 'mincloudcover', 'maxcloudcover',
  ],
  limit: ['limit'],
  customCsv: ['customz'],
  showWildfires: ['fires'],
  showRadar: ['radar'],
  showSmoke: ['smoke'],
  showSnow: ['snow'],
  showGrid: ['grid'],
  // The style rides the toggle's own param rather than one of its own.
  gridStyle: ['grid'],
  showPlayer: ['player'],
  gridReachFrac: ['reach'],
  pins: ['pins'],
} satisfies Record<keyof ShareableState, readonly [string, ...string[]]>

/**
 * Read the forecast selection out of a query string: `mode=now`, or a day
 * selection from `d1`/`d2` with an optional `h1`/`h2` narrowing. A link that
 * carries neither shape restores no selection, and the panel keeps its own.
 */
export function decodeSelection(params: URLSearchParams): ForecastSelection | undefined {
  const mode = params.get('mode')
  if (mode === 'now') return { kind: 'now' }

  const d1 = params.get('d1')
  if (d1 && isDayKey(d1)) {
    const d2 = params.get('d2')
    const days = orderDays(d1, d2 && isDayKey(d2) ? d2 : d1)
    const h1 = params.get('h1')
    const h2 = params.get('h2')
    // Both or neither: one hour without the other describes no window, and
    // filling the missing end from a default would invent a span.
    const narrowed = h1 !== null && h2 !== null && isTimeOfDay(h1) && isTimeOfDay(h2)
    return { kind: 'days', ...days, ...(narrowed ? { hours: { start: h1, end: h2 } } : {}) }
  }

  // mode=days with no valid d1: the empty Dates arm, hours refinement kept.
  if (mode === 'days') {
    const h1 = params.get('h1')
    const h2 = params.get('h2')
    const narrowed = h1 !== null && h2 !== null && isTimeOfDay(h1) && isTimeOfDay(h2)
    return {
      kind: 'days',
      startDate: null,
      endDate: null,
      ...(narrowed ? { hours: { start: h1, end: h2 } } : {}),
    }
  }

  return undefined
}
