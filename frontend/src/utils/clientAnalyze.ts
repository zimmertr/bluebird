// The browser-side analysis pipeline (#170): everything POST /api/analyze
// does after discovery, ported so the SPA can attach forecasts itself via
// openMeteo.ts. Each helper is a deliberate port of its counterpart in the
// backend's services/ranking.py (_aligned_aqi, _assemble, _sort_key,
// _cap_detail), or services/candidates.py for _custom_dicts — behavior
// changes happen there first and get mirrored here, with the align cases
// pinned by the shared weather_vectors.json.
//
// _merge_custom has no port here. Custom rows are now resolved server-side
// on the way in (issue #207), and the same trip returns them already merged
// with whatever discovery found, so a second union in the browser would only
// be a chance for the two to disagree.

import {
  AnalyzeRequest,
  AnalyzeResponse,
  CustomDestination,
  DestinationResult,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  DiscoveryType,
  GeoPolygon,
  HourlySeries,
} from '../types'
import { familyOf, isOnRequestFamily } from '../metrics'
import { AQI_TAIL_MESSAGE, ELEVATION_MESSAGE, tailMessage } from './analyzeOverlay'
import { namesHeightMetric, constraintsFromRequest } from './constraints'
import { postDestinations } from './apiFetch'
import { type Place, placeType } from './geocode'
import { geoKey } from './points'
import type { WindowLimits } from './forecastWindow'
import {
  AqiFetch,
  AqiResult,
  CloudResult,
  Coordinate,
  WeatherResult,
  fetchAqi,
  fetchCloud,
  fetchWeather,
  reduceCloud,
  reduceWeather,
  terrainFallbackFor,
} from './openMeteo'
import type { CloudSeries, HourlyPayload } from './openMeteoAggregate'
import { nullsLast } from './sortResults'

// The forecast bounds live in constraints.ts. They are re-exported here because
// present.ts, the panel and the URL codec read them by this module's name.
export {
  NO_CONSTRAINTS,
  constraintFields,
  constraintsFromRequest,
  filterConstraints,
  hasConstraints,
  namesOnRequestMetric,
  type Constraints,
} from './constraints'

// Mirror of MAX_ANALYZE_PEAKS in backend/app/limits.py — keep them in sync
// (the MAX_POLYGON_AREA_KM2 precedent). The server enforces it on
// /api/destinations and /api/analyze; this copy covers the analyses that
// never touch the server at all (custom CSV / pins refresh) and is the
// fallback when /api/capabilities has not answered yet.
export const MAX_ANALYZE_DESTINATIONS = 1_500

const NOUNS: Record<string, string> = {
  peak: 'peak',
  trailhead: 'trailhead',
  lake: 'lake',
  custom: 'destination',
}

export function analysisNoun(request: AnalyzeRequest): string {
  // Port of _noun: a specific noun only when the set holds exactly one
  // kind, because "1,842 peaks" beats "1,842 destinations"; anything mixed
  // merges rather than listing types, since a refusal is read for its
  // remedy and an inventory buries that.
  const kinds = new Set(request.destination_types)
  if (request.custom_destinations?.length || kinds.size !== 1) return 'destination'
  return NOUNS[[...kinds][0]] ?? 'destination'
}

// Port of _cap_detail: the over-cap refusal states what is wrong, and
// nothing else. It used to advise the remedies in play and quote the
// computed elevation floor; TJ removed both (2026-08-22, #253's PR), and the
// server's copy dropped them in the same change.
export function capDetail(
  count: number,
  noun: string,
  cap: number = MAX_ANALYZE_DESTINATIONS,
): string {
  return (
    `This search covers ${count.toLocaleString('en-US')} ${noun}s. The ` +
    `analysis limit is ${cap.toLocaleString('en-US')} destinations.`
  )
}

// Port of _truncate_top_elevation: the explicit opt-in cut. Unknown
// elevations are dropped first (they cannot claim to be among the highest);
// never called without the user's election.
export function truncateTopElevation<T extends { elevation_ft: number | null }>(
  destinations: readonly T[],
  cap: number,
): T[] {
  return destinations
    .filter((d) => d.elevation_ft != null)
    .sort((a, b) => (b.elevation_ft as number) - (a.elevation_ft as number))
    .slice(0, cap)
}

// Thrown for an over-limit set, by the client-only paths and by the server's
// structured 400 alike. The type is the signal: it routes the message to the
// refusal box rather than the error box, because a deterministic refusal
// retried verbatim can only repeat itself. The remedies ride in the message
// prose (`capDetail`); the server's structured remedy fields stay on the API
// for direct callers, and the SPA reads none of them.
export class AnalysisRefusalError extends Error {}

// Port of _custom_dicts: a caller row in the same shape discovery produces.
export function customRows(custom: readonly CustomDestination[]): DiscoveredDestination[] {
  return custom.map((c) => ({
    name: c.name,
    type: 'custom',
    latitude: c.latitude,
    longitude: c.longitude,
    elevation_ft: c.elevation_ft ?? null,
    osm_id: null,
  }))
}

/** What the custom-only path gets back: the rows, and the grid behind them. */
export interface ResolvedCustom {
  destinations: DiscoveredDestination[]
  snowAnalysisDate: string | null
}

// The custom-only analysis path's one server call, and what it asks for.
//
// Two things a coordinate pair cannot carry and only the pod can answer. What
// does OSM know about this point — which is the only way a pasted CSV row can
// learn its elevation (issue #207) — and how much snow is on the ground there
// today, from the grid the pod holds (#449).
//
// **Every list now makes the call**, where a list whose rows already knew
// their elevations used to skip it. The skip was right while elevation was the
// only question: a pins-only refresh had nothing to ask. It is wrong now, and
// the cost of keeping it would be that a pinned search reads N/A for snow
// while the same summit inside a drawn ring reads a number — one report
// disagreeing with itself about one destination.
//
// Deliberately a nicety rather than a dependency, exactly as before. The
// destination cap runs client-side already, so nothing here is load bearing,
// and every failure path returns the rows unresolved with no date. An abort is
// the exception: that is the user's own doing and has to propagate rather than
// masquerade as a resolved-nothing result.
export async function resolveCustomOnly(
  custom: readonly CustomDestination[],
  signal?: AbortSignal,
): Promise<ResolvedCustom> {
  const rows = customRows(custom)
  if (!rows.length) return { destinations: rows, snowAnalysisDate: null }
  const resolveRequest: DestinationsRequest = {
    destination_types: [],
    custom_destinations: [...custom],
  }
  try {
    const res = await postDestinations(resolveRequest, signal)
    if (!res.ok) return { destinations: rows, snowAnalysisDate: null }
    const body = (await res.json()) as DestinationsResponse
    // A short answer means the server dropped rows this path never asked it
    // to drop, so trust the list we already hold over a surprising one — and
    // take no date with it, since the rows it would describe are not the ones
    // being returned.
    return body.destinations?.length === rows.length
      ? { destinations: body.destinations, snowAnalysisDate: body.snow_analysis_date ?? null }
      : { destinations: rows, snowAnalysisDate: null }
  } catch (err) {
    if (signal?.aborted) throw err
    return { destinations: rows, snowAnalysisDate: null }
  }
}


// Port of _aligned_aqi: AQI values on the weather grid, null where absent
// (the AQI horizon is ~5 days against weather's ~16).
export function alignAqi(
  timesMs: readonly number[],
  aqiSeries: { times: number[]; aqi: (number | null)[] } | null,
): (number | null)[] {
  if (!aqiSeries) return timesMs.map(() => null)
  const lookup = new Map<number, number | null>()
  aqiSeries.times.forEach((t, i) => lookup.set(t, aqiSeries.aqi[i] ?? null))
  return timesMs.map((t) => lookup.get(t) ?? null)
}

// Port of _aligned_cloud: the cloud series onto the weather grid by stamp, or
// no arrays at all when the cloud column was never fetched for the row.
export function alignCloud(
  timesMs: readonly number[],
  cloudSeries: CloudSeries | null,
): (number | null)[] | null {
  if (!cloudSeries) return null
  const deck = new Map<number, number | null>()
  cloudSeries.times.forEach((t, i) => deck.set(t, cloudSeries.cloud_deck_ft[i] ?? null))
  return timesMs.map((t) => deck.get(t) ?? null)
}

/** A row's cloud aggregates and hourly arrays, or their absence. */
function cloudFields(
  cloud: CloudResult,
): Pick<DestinationResult, 'cloud_deck_min_ft' | 'cloud_deck_avg_ft' | 'cloud_deck_max_ft'> {
  return {
    cloud_deck_min_ft: cloud?.cloud_deck_min_ft ?? null,
    cloud_deck_avg_ft: cloud?.cloud_deck_avg_ft ?? null,
    cloud_deck_max_ft: cloud?.cloud_deck_max_ft ?? null,
  }
}

/**
 * The same row with its cloud answer laid over it, or with none.
 *
 * A held row can carry a cloud answer its new report did not ask for. Stripping
 * it keeps the rule that a report carries the cloud column exactly when its
 * snapshot says it does, so a ranking can never read half a column.
 */
export function withCloud(
  row: DestinationResult,
  cloud: CloudResult,
  times: readonly number[],
): DestinationResult {
  const next: DestinationResult = { ...row, ...cloudFields(cloud) }
  if (row.series) {
    const { cloud_deck_ft: _d, ...rest } = row.series
    const aligned = alignCloud(times, cloud?.series ?? null)
    next.series = aligned === null ? rest : { ...rest, cloud_deck_ft: aligned }
  }
  return next
}

/**
 * The same row with a fresh air-quality answer laid over it: the three
 * aggregates and the hourly column on the report's grid. For a held row whose
 * air quality failed the first time and was asked again (#580).
 */
export function withAqi(row: DestinationResult, aqi: AqiResult, times: readonly number[]): DestinationResult {
  return {
    ...row,
    aqi_avg: aqi?.aqi_avg ?? null,
    aqi_min: aqi?.aqi_min ?? null,
    aqi_max: aqi?.aqi_max ?? null,
    series: row.series ? { ...row.series, aqi: alignAqi(times, aqi?.series ?? null) } : row.series,
  }
}

// Port of _canonical_times: the shared hourly grid is identical across
// destinations for one window, so the first row carrying a series defines it.
export function canonicalTimes(wxList: readonly WeatherResult[]): number[] {
  for (const wx of wxList) {
    if (wx?.series) return wx.series.times
  }
  return []
}

// Port of _sort_key: nullable AQI keys sort after every real value in either
// direction, so a null never wins a ranking. Ties compare equal, and JS sort
// is spec-stable, matching Python's.
export function rankComparator(
  field: keyof DestinationResult,
  desc: boolean,
): (a: DestinationResult, b: DestinationResult) => number {
  return (a, b) => {
    const av = a[field] as number | null | undefined
    const bv = b[field] as number | null | undefined
    const aNull = av == null
    const bNull = bv == null
    if (aNull || bNull) return nullsLast(aNull, bNull)
    const ka = desc ? -av : av
    const kb = desc ? -bv : bv
    return ka < kb ? -1 : ka > kb ? 1 : 0
  }
}

// Port of _assemble: zip candidates with their weather + AQI, baking the
// hourly series (AQI aligned onto the weather grid) into each row. Rows
// whose weather came back null are dropped.
export function assemble(
  destinations: readonly DiscoveredDestination[],
  wxList: readonly WeatherResult[],
  aqiList: readonly AqiResult[],
  cloudList: readonly CloudResult[] | null = null,
): { results: DestinationResult[]; times: number[] } {
  const times = canonicalTimes(wxList)
  const results: DestinationResult[] = []
  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i]
    const wx = wxList[i]
    if (!wx) continue
    const aqi = aqiList[i] ?? null
    const cloud = cloudList?.[i] ?? null
    const { series: wxSeries, ...aggregates } = wx
    let series: HourlySeries | null = null
    if (wxSeries) {
      const aligned = alignCloud(wxSeries.times, cloud?.series ?? null)
      series = {
        precip_in: wxSeries.precip_in,
        temp_f: wxSeries.temp_f,
        wind_mph: wxSeries.wind_mph,
        freeze_ft: wxSeries.freeze_ft,
        aqi: alignAqi(wxSeries.times, aqi?.series ?? null),
        // Absent rather than a column of nulls when the cloud column was
        // never fetched, which is the server's shape too.
        ...(aligned !== null ? { cloud_deck_ft: aligned } : {}),
        // Present only on the browser path, which is the only one that asks
        // Open-Meteo for it. Spread rather than assigned so a row from a
        // response without it carries no key at all, rather than an explicit
        // undefined the map would have to distinguish from an empty array.
        ...(wxSeries.wind_dir_deg ? { wind_dir_deg: wxSeries.wind_dir_deg } : {}),
      }
    }
    results.push({
      name: dest.name,
      type: dest.type,
      latitude: dest.latitude,
      longitude: dest.longitude,
      elevation_ft: dest.elevation_ft,
      osm_id: dest.osm_id,
      ...aggregates,
      // Off the discovered row rather than out of the weather answer: the
      // snow grid is the pod's, read once per candidate when the candidate
      // list came back, where every aggregate above came from Open-Meteo.
      snow_depth_in: dest.snow_depth_in ?? null,
      aqi_avg: aqi?.aqi_avg ?? null,
      aqi_min: aqi?.aqi_min ?? null,
      aqi_max: aqi?.aqi_max ?? null,
      ...cloudFields(cloud),
      series,
    })
  }
  return { results, times }
}

/**
 * Waits out the fetches that trail the weather, naming each one while it is
 * the one still out (#579). Neither promise may reject: both callers catch.
 *
 * One macrotask passes before the first label, so a tail that answers in the
 * same tick as the weather never flashes a label. Air quality is named first and the cloud
 * column once air quality has answered, one label at a time and never back.
 */
export async function followTail(
  aqi: Promise<unknown> | null,
  cloud: Promise<unknown> | null,
  onTail: ((message: string) => void) | undefined,
): Promise<void> {
  const open = { aqi: aqi !== null, cloud: cloud !== null }
  void aqi?.then(() => (open.aqi = false))
  void cloud?.then(() => (open.cloud = false))
  // A fetch already answered clears its flag in the microtasks this await
  // lets run; only a tail still out waits the macrotask.
  await Promise.resolve()
  if (!open.aqi && !open.cloud) return
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  for (let label = tailMessage(open); label !== null; label = tailMessage(open)) {
    onTail?.(label)
    await (label === AQI_TAIL_MESSAGE ? aqi : cloud)
  }
}

export interface ClientAnalysisCallbacks {
  signal?: AbortSignal
  onStatus?: (message: string) => void
  onProgress?: (processed: number, total: number, message: string) => void
  // The tail label, once the weather has answered and air quality or the
  // cloud column is still out (`followTail`).
  onTail?: (message: string) => void
  // The pacer (or a minutely resume) is about to wait this many seconds.
  onPace?: (seconds: number) => void
  // Injectable for tests (horizon clamp inside fetchAqi).
  nowMs?: number
  // The live analysis cap from /api/capabilities; the compiled constant is
  // the fallback so a failed capabilities fetch never blocks analyzing.
  maxDestinations?: number
  // Where this deployment puts the archive boundary, from /api/capabilities,
  // on the same contract as `maxDestinations` above. Passed straight through to
  // the weather fetch, which is the only thing here that classifies a window.
  windowLimits?: WindowLimits
  // How far ahead air quality reaches, from /api/capabilities. The air-quality
  // fetch clamps to it, and the calendar dims by it, so both read one value.
  aqiForecastDays?: number
  // Forecasts the browser already holds, to be reused for any candidate that
  // appears in both. A re-analysis that readmits destinations this report never
  // fetched does not invalidate the ones already in hand, and re-fetching those
  // spends the visitor's Open-Meteo quota to learn what was already on screen.
  //
  // The CALLER owns the question of whether reuse is legal — identical window
  // and model, and recent enough — because it is the only layer that knows
  // when the held rows were fetched (`FORECAST_REUSE_MS` in forecastReuse.ts).
  // Passing rows from a different window here would silently mix two
  // forecasts into one report.
  //
  // `aqiFailed` names the held rows (by `geoKey`) whose air quality FAILED
  // rather than answered null. Those are asked again (#580): a failure is not
  // cached by the fetch, but reuse used to skip the fetch for held rows
  // altogether, so an outage stuck to them for the whole reuse window.
  reuse?: {
    rows: readonly DestinationResult[]
    times: readonly number[]
    aqiFailed?: ReadonlySet<string>
    // The raw columns behind held rows that still have no elevation, by
    // `geoKey`, so this run's lookup can reduce them at a height the last
    // one never learned (#673).
    columns?: ReadonlyMap<string, HeldColumns>
  } | null
  /**
   * The ranked field as it arrives, once per landed batch (#337, finding 2).
   *
   * A 1,500-destination analysis is 30 batches at 4 in flight, and the reader
   * used to see a percentage and no rows until the last one returned. Each
   * call carries every row forecast so far, ranked the way the finished report
   * will be, plus the hourly grid if one is known yet.
   *
   * Two things it is NOT. It is not the finished report: the rows reorder as
   * the field fills, and the count is a floor rather than a total. And it never
   * fires for an air-quality ranking, because air quality rides alongside the
   * weather fetch and resolves at the end, so a partial field ranked by it
   * would be ranked on nulls.
   */
  onPartial?: (rows: DestinationResult[], times: number[]) => void
  /**
   * Fetch the cloud column for the whole field (#117). The caller decides,
   * from the ranking and the bounds (`namesOnRequestMetric`), because this is
   * the one request an analysis makes only when asked. Held rows are covered
   * too: their weather is reused, but a report either carries the column for
   * every row or for none, and the per-location cache makes a row that already
   * has it cost nothing. Off, every row comes back without it.
   */
  cloud?: boolean
  /**
   * The same destinations, index for index, once a lookup still in flight has
   * said what it knows about them: elevation, OSM identity, snow depth (#643,
   * #673).
   *
   * A list of coordinates is enough to ask Open-Meteo, so the fetches start on
   * the rows as given and the report is assembled as soon as they land. The
   * raw column of every row whose elevation is still unknown is kept, and
   * when the lookup answers each such row is reduced again at the height it
   * returned (`late`), the same arithmetic the fetch ran: the numbers are what
   * waiting would have produced, without the wait. The report waits for the
   * lookup only where a row's provisional numbers would decide something: a
   * ranking or a bound on a metric read at the destination's height
   * (`namesHeightMetric`), or an over-cap list keeping its highest.
   *
   * A row that comes back at a different coordinate is ignored in favour of
   * the one sent. Must settle when `signal` aborts.
   */
  resolving?: Promise<readonly DiscoveredDestination[]>
}

/**
 * The raw Open-Meteo columns behind a row whose elevation is still unknown,
 * kept so the row can be reduced again once a lookup says where it stands
 * (#673). Dropped as soon as the row has an elevation: the forecast cache
 * holds reduced rows, so this is the only copy of the column there is.
 */
export interface HeldColumns {
  weather: HourlyPayload
  cloud?: HourlyPayload
}

/** What a lookup that answered after the report changes about it. */
export interface LatePatch {
  // The rows the lookup changed, each replacing the row at its coordinate.
  rows: DestinationResult[]
  // The columns still worth holding: those of rows that still have no
  // elevation, for a lookup a later run may make.
  columns: Map<string, HeldColumns>
}

export interface ClientAnalysis {
  // What the table shows: ranked and cut to `limit`, the wire shape the server
  // routes return.
  response: AnalyzeResponse
  // Every candidate that got a forecast, ranked by the same key, BEFORE the
  // cut. Weather is fetched for the whole field anyway (exact ranking demands
  // it), so this costs nothing to keep and is what makes a later window change
  // exact instead of a re-rank of whatever happened to be on screen (#177),
  // and what lets sort, limit and every forecast bound re-present the field
  // with no second Analyze (#188, `utils/present.ts`).
  //
  // Every row carries every metric, air quality included, so any of the four
  // rankings can be applied to the whole field later. The first `limit`
  // entries are the SAME objects as `response.results`, not copies; nothing
  // mutates a row after this returns.
  universe: DestinationResult[]
  // The rows of `universe`, by `geoKey`, whose air quality failed rather than
  // answered: what the next run's `reuse.aqiFailed` should be.
  aqiFailed: Set<string>
  // The raw columns behind every row whose elevation is unknown as the report
  // commits, by `geoKey` (#673): what the next run's `reuse.columns` should
  // be, and, while `late` is out, which rows are waiting on the lookup.
  columns: Map<string, HeldColumns>
  // What the lookup changes once it answers, when it was still out as the
  // report committed; null when nothing was out. Rejects only when the lookup
  // does, which is on abort.
  late: Promise<LatePatch> | null
}

/**
 * A row with the weather of another reduce of the same column (#673): the
 * aggregates and the hourly weather series replaced, everything else, air
 * quality and its alignment included, kept. The hours are the column's, so the
 * grid the air quality was aligned to is unchanged.
 */
export function withWeather(row: DestinationResult, wx: WeatherResult): DestinationResult {
  if (wx === null) return row
  const { series, ...aggregates } = wx
  const next: DestinationResult = { ...row, ...aggregates }
  if (row.series && series) {
    next.series = {
      ...row.series,
      precip_in: series.precip_in,
      temp_f: series.temp_f,
      wind_mph: series.wind_mph,
      freeze_ft: series.freeze_ft,
      ...(series.wind_dir_deg ? { wind_dir_deg: series.wind_dir_deg } : {}),
    }
  }
  return next
}

// Whether a lookup's answer about a destination differs from what was sent.
function sameIdentity(sent: DiscoveredDestination, resolved: DiscoveredDestination): boolean {
  return (
    sent.name === resolved.name &&
    sent.type === resolved.type &&
    sent.elevation_ft === resolved.elevation_ft &&
    sent.osm_id === resolved.osm_id &&
    (sent.snow_depth_in ?? null) === (resolved.snow_depth_in ?? null)
  )
}

// The rows a lookup returned, laid over the rows it was asked about. Position
// is the join, checked by coordinate: a row that came back somewhere else, or
// a list of another length, leaves the row as it was sent, since an answer
// about a different place is not this destination's.
function resolvedOver(
  sent: readonly DiscoveredDestination[],
  resolved: readonly DiscoveredDestination[],
): readonly DiscoveredDestination[] {
  if (resolved.length !== sent.length) return sent
  return sent.map((d, i) =>
    geoKey(resolved[i].latitude, resolved[i].longitude) === geoKey(d.latitude, d.longitude) ? resolved[i] : d,
  )
}

// The client-side counterpart of the analyze routes' fetch-and-rank half:
// candidates in, ranked AnalyzeResponse out. Throws AnalysisRefusalError for
// an over-limit set (with remedy fields), plain Error for conditions the
// server would refuse identically, and lets openMeteo.ts's typed errors
// (Unreachable / RateLimited / HttpError) propagate to the caller.
export async function runClientAnalysis(
  request: AnalyzeRequest,
  destinations: readonly DiscoveredDestination[],
  startMs: number,
  endMs: number,
  {
    signal,
    onProgress,
    onTail,
    onPartial,
    onPace,
    nowMs,
    maxDestinations,
    windowLimits,
    aqiForecastDays,
    reuse,
    cloud = false,
    resolving,
  }: ClientAnalysisCallbacks = {},
): Promise<ClientAnalysis> {
  // Marked handled up front: the two early exits below never read it, and an
  // abort that rejects it there would otherwise be reported as unhandled.
  resolving?.catch(() => {})
  if (destinations.length === 0) {
    return {
      response: { results: [], total_queried: 0, total_matched: 0 },
      universe: [],
      aqiFailed: new Set(),
      columns: new Map(),
      late: null,
    }
  }
  const cap = maxDestinations ?? MAX_ANALYZE_DESTINATIONS
  const noun = analysisNoun(request)
  let candidates = destinations
  let totalFound: number | null = null
  let truncated = false
  // Rows still being looked up, or null once nothing is out.
  let lookup = resolving ?? null
  if (candidates.length > cap) {
    if (request.top_by_elevation) {
      // Choosing the highest needs the elevations, so this one case waits for
      // the lookup the way every custom run used to.
      if (lookup) {
        onTail?.(ELEVATION_MESSAGE)
        candidates = resolvedOver(candidates, await lookup)
        lookup = null
      }
      totalFound = candidates.length
      candidates = truncateTopElevation(candidates, cap)
      truncated = true
    } else {
      throw new AnalysisRefusalError(capDetail(candidates.length, noun, cap))
    }
  }
  const sortBy = request.sort_by ?? 'precip_total_in'
  // A ranking or a bound on a number read at the destination's height is
  // decided by the lookup's answer, so the report waits for it (#673). Every
  // other ranking lands at once and takes the answer when it comes.
  const waitsForLookup = lookup !== null && namesHeightMetric(sortBy, constraintsFromRequest(request))

  // Split the field into what is already forecast and what still has to be
  // fetched. With no reusable rows this is the whole list and the analysis runs
  // exactly as it always has.
  //
  // A reused row keeps its forecast but takes its identity from the fresh
  // candidate: discovery may have learned an elevation since (a pasted
  // coordinate resolved against OSM), and the forecast is the expensive half,
  // not the name.
  const heldRows = new Map<string, DestinationResult>()
  for (const r of reuse?.rows ?? []) heldRows.set(geoKey(r.latitude, r.longitude), r)
  const reusedAt: number[] = []
  const reused: DestinationResult[] = []
  const unforecastAt: number[] = []
  const unforecast: DiscoveredDestination[] = []
  candidates.forEach((d, i) => {
    const hit = heldRows.get(geoKey(d.latitude, d.longitude))
    if (hit) {
      reusedAt.push(i)
      reused.push({
        ...hit,
        name: d.name,
        type: d.type,
        elevation_ft: d.elevation_ft,
        osm_id: d.osm_id,
      })
    } else {
      unforecastAt.push(i)
      unforecast.push(d)
    }
  })
  // The raw columns of the rows the lookup may still place, by candidate
  // index: this run's own fetches fill them in, and a held row brings the
  // column the last run kept for it.
  const columns = new Map<number, HeldColumns>()
  reusedAt.forEach((at, i) => {
    const held = reuse?.columns?.get(geoKey(reused[i].latitude, reused[i].longitude))
    if (held && reused[i].elevation_ft == null) columns.set(at, { ...held })
  })
  const keepColumn = (at: number, column: HourlyPayload, kind: keyof HeldColumns) => {
    if (candidates[at].elevation_ft != null || !lookup) return
    const entry = columns.get(at)
    if (kind === 'weather') columns.set(at, { ...entry, weather: column })
    else if (entry) entry.cloud = column
  }

  const coords: Coordinate[] = unforecast.map((d) => ({
    latitude: d.latitude,
    longitude: d.longitude,
    // The fetch adjusts wind and temperature to this height (issue #257).
    elevation_ft: d.elevation_ft,
    // Where OSM gave none (a pasted point it could not match, a clicked peak
    // with no `ele`), a peak is read at the terrain height the response
    // reports and a lake or trailhead at the surface (#545). The terrain
    // height is not written onto the row, so the Elevation column still says
    // only what OSM or the list said.
    terrainFallback: terrainFallbackFor(d.type),
  }))

  // Held rows whose air quality failed last time, asked again in the same
  // fetch as the new candidates' (one batch pipeline, one pacer). A held null
  // that was an ANSWER, or a window past the horizon, is not in the set, so it
  // is never re-bought.
  const heldAqiFailed = reuse?.aqiFailed
  const aqiRetry: number[] = []
  if (heldAqiFailed && heldAqiFailed.size > 0) {
    reused.forEach((r, i) => {
      if (heldAqiFailed.has(geoKey(r.latitude, r.longitude))) aqiRetry.push(i)
    })
  }
  const aqiCoords: Coordinate[] = [
    ...aqiRetry.map((i) => ({ latitude: reused[i].latitude, longitude: reused[i].longitude })),
    ...coords,
  ]

  // One controller spans every fetch this analysis makes: the first fatal
  // failure aborts the rest, so no in-flight or queued batch keeps spending
  // the visitor's quota after the outcome is already decided (the incident's
  // zombie batches, issue #180). Linked to the caller's signal so Cancel
  // still aborts everything.
  const internal = new AbortController()
  const onCallerAbort = () => internal.abort()
  if (signal?.aborted) internal.abort()
  signal?.addEventListener('abort', onCallerAbort, { once: true })
  // A cloud failure aborts the weather fetch through `internal`, which then
  // rejects with an AbortError. That error must not be what the caller sees,
  // since an AbortError reads as the reader's own cancel.
  let cloudFailure: unknown = null

  try {
    // The cloud column rides beside the weather over every candidate, reused
    // ones included, and only when asked (#117). Started first so its batches
    // overlap the weather's rather than trailing them; it spends the same
    // weather budget, so the pacer still sees one analysis's worth of spend.
    const cloudCoords: Coordinate[] = [
      ...reused.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        elevation_ft: r.elevation_ft,
        // The weather's rule, for the reason given there: the cloud deck walk
        // inserts the 2 m point at the same height the wind is read at.
        terrainFallback: terrainFallbackFor(r.type),
      })),
      ...coords,
    ]
    const cloudPending: Promise<CloudResult[] | null> = cloud
      ? fetchCloud(cloudCoords, startMs, endMs, {
          signal: internal.signal,
          onPace,
          model: request.forecast_model,
          nowMs,
          windowLimits,
          onColumn: (k, column) =>
            keepColumn(k < reused.length ? reusedAt[k] : unforecastAt[k - reused.length], column, 'cloud'),
        }).catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === 'AbortError')) cloudFailure = e
          internal.abort()
          return null
        })
      : Promise.resolve(null)

    // AQI rides ALONGSIDE weather for the whole field rather than trailing the
    // ranking for the displayed rows. Open-Meteo bills weighted calls per
    // SERVICE, and air quality has its own 600/min quota (openMeteo.ts), so
    // this spends a bucket the weather fetch cannot touch, and the two waits
    // overlap instead of stacking — measurably cheaper in wall clock than the
    // lazy version it replaces, whose tail batch was a second serialized pace.
    // It is also what lets an AQI ranking be a live presentation knob: sorting
    // the held field by air quality needs air quality for all of it (#188).
    //
    // The server path stays lazy (#181). There the budget is the pod's, shared
    // across visitors, so the same arithmetic comes out the other way.
    // Nothing new to forecast: every candidate came out of the held field, so
    // the analysis is a re-rank and costs no weather call at all. Air quality
    // is asked only for held rows whose fetch failed, and only then.
    const aqiPending: Promise<AqiFetch> | null =
      aqiCoords.length > 0
        ? fetchAqi(aqiCoords, startMs, endMs, {
            signal: internal.signal,
            // The same countdown the weather hands over. Air quality is awaited
            // before the ranking assembles, so its pacer's sleep is the analysis's
            // sleep and must read as scheduled, not hung (analyzeOverlay.ts).
            onPace,
            nowMs,
            aqiForecastDays,
          })
            // fetchAqi only ever throws AbortError, which is what a weather failure
            // (or Cancel) triggers below. Swallow it here so it cannot surface as an
            // unhandled rejection once the caller has already taken the real error.
            .catch(
              (): AqiFetch => ({
                results: new Array(aqiCoords.length).fill(null),
                failed: new Array(aqiCoords.length).fill(true),
              }),
            )
        : null
    let fetched: DestinationResult[] = []
    let fetchedAqiFailed: boolean[] = []
    let times: number[] = []
    if (coords.length > 0) {
      // Air quality resolves at the end, so a partial field carries none. That
      // is invisible for a weather ranking (the column fills in when the
      // analysis commits) and meaningless for an air-quality one, which would
      // be ranking nulls. So the announcements simply do not happen there.
      // The cloud column resolves at the end too, so the same holds for a
      // cloud ranking.
      // A report that waits for the lookup shows no partial field either: its
      // rows would be ranked on numbers the lookup is about to change.
      const rankFamily = familyOf(sortBy)
      const partialsWanted =
        onPartial != null && rankFamily !== 'aqi' && !isOnRequestFamily(rankFamily) && !waitsForLookup
      const wxList = await fetchWeather(coords, startMs, endMs, {
        signal: internal.signal,
        onPace,
        onPartial: partialsWanted
          ? (partial, settled) => {
              // Only the destinations with an answer. A `null` in `partial` is
              // "no forecast for this location", which the assembly keeps as a
              // row; a hole is a location still in flight and must not appear.
              const have: DiscoveredDestination[] = []
              const wx: WeatherResult[] = []
              for (let i = 0; i < unforecast.length; i++) {
                if (!settled[i]) continue
                have.push(unforecast[i])
                wx.push(partial[i])
              }
              const grown = assemble(have, wx, new Array(have.length).fill(null))
              const rows = [...reused, ...grown.results]
              rows.sort(rankComparator(sortBy, request.sort_desc ?? false))
              onPartial(rows, grown.times.length > 0 ? grown.times : [...(reuse?.times ?? [])])
            }
          : undefined,
        model: request.forecast_model,
        // The same clock the air-quality fetch above is given. `nowMs` is what
        // decides which Open-Meteo endpoint answers a window (`windowSource`:
        // older than the forecast endpoint's own data is the archive's), so
        // weather reading the real clock while air quality reads the caller's
        // put the two on different sides of that boundary. It was invisible
        // until a test's fixed window aged past the boundary and the weather
        // half silently moved to the archive endpoint (2026-09-14).
        nowMs,
        windowLimits,
        onColumn: (k, column) => keepColumn(unforecastAt[k], column, 'weather'),
        onProgress: (processed, total) =>
          onProgress?.(
            processed,
            total,
            // Byte-identical to the analyze route's progress copy, so the
            // app and a direct API caller read alike.
            `Retrieving forecasts: ${processed} of ${total} ${noun}s…`,
          ),
      })
      await followTail(aqiPending, cloud ? cloudPending : null, onTail)
      // Never null on this branch: the new candidates are in `aqiCoords`.
      const aqi = (await aqiPending) ?? { results: [], failed: [] }
      const cloudList = await cloudPending
      if (cloudFailure !== null) throw cloudFailure
      const aqiList = aqi.results.slice(aqiRetry.length)
      const assembled = assemble(
        unforecast,
        wxList,
        aqiList,
        cloudList && cloudList.slice(reused.length),
      )
      fetched = assembled.results
      times = assembled.times
      // `assemble` drops the rows with no weather, so the flags are carried
      // over by position among the candidates that kept a row.
      const failedBy = new Map<string, boolean>()
      unforecast.forEach((d, i) => failedBy.set(geoKey(d.latitude, d.longitude), aqi.failed[aqiRetry.length + i]))
      fetchedAqiFailed = fetched.map((r) => failedBy.get(geoKey(r.latitude, r.longitude)) === true)
    }

    // The hourly grid is a property of the window, not of a fetch, and reuse is
    // only ever legal within one window. So the held grid stands in when this
    // analysis fetched nothing, and the two are the same grid either way.
    if (times.length === 0) times = [...(reuse?.times ?? [])]

    // A re-rank that fetched no weather can still wait on the held rows' cloud,
    // and on their air quality where it failed last time.
    if (coords.length === 0 && (cloud || aqiPending !== null)) {
      await followTail(aqiPending, cloud ? cloudPending : null, onTail)
    }
    const heldCloud = await cloudPending
    if (cloudFailure !== null) throw cloudFailure
    const retried = aqiPending === null ? null : await aqiPending
    const retryAt = new Map(aqiRetry.map((i, k) => [i, k]))
    const aqiFailed = new Set<string>()
    const held = reused.map((r, i) => {
      const row = withCloud(r, heldCloud?.[i] ?? null, times)
      const k = retryAt.get(i)
      if (k === undefined || retried === null) return row
      if (retried.failed[k]) aqiFailed.add(geoKey(r.latitude, r.longitude))
      return withAqi(row, retried.results[k], times)
    })
    fetched.forEach((r, i) => {
      if (fetchedAqiFailed[i]) aqiFailed.add(geoKey(r.latitude, r.longitude))
    })
    const results = [...held, ...fetched]

    // What the lookup's answer changes about the report: each row it placed is
    // reduced again from its column at the height it returned, and each row
    // it only renamed or gave a depth takes that. The provisional rows are the
    // ones sent, so a row the lookup left as it was is untouched.
    const reduceOptions = { model: request.forecast_model, nowMs, windowLimits }
    const sent = candidates
    const applyLookup = (rows: readonly DiscoveredDestination[]): LatePatch => {
      const resolved = resolvedOver(sent, rows)
      const byKey = new Map(results.map((r) => [geoKey(r.latitude, r.longitude), r]))
      const patched: DestinationResult[] = []
      const remaining = new Map<string, HeldColumns>()
      sent.forEach((p, i) => {
        const r = resolved[i]
        const key = geoKey(p.latitude, p.longitude)
        const row = byKey.get(key)
        const held = columns.get(i)
        if (held && r.elevation_ft == null) remaining.set(key, held)
        if (!row || sameIdentity(p, r)) return
        let next: DestinationResult = {
          ...row,
          name: r.name,
          type: r.type,
          elevation_ft: r.elevation_ft,
          osm_id: r.osm_id,
          snow_depth_in: r.snow_depth_in ?? row.snow_depth_in ?? null,
        }
        if (held && r.elevation_ft !== p.elevation_ft) {
          const c: Coordinate = {
            latitude: r.latitude,
            longitude: r.longitude,
            elevation_ft: r.elevation_ft,
            terrainFallback: terrainFallbackFor(r.type),
          }
          next = withWeather(next, reduceWeather(held.weather, c, startMs, endMs, reduceOptions))
          if (held.cloud) next = withCloud(next, reduceCloud(held.cloud, c, startMs, endMs, reduceOptions), times)
        }
        patched.push(next)
      })
      return { rows: patched, columns: remaining }
    }
    const pendingColumns = new Map<string, HeldColumns>()
    columns.forEach((held, i) => pendingColumns.set(geoKey(sent[i].latitude, sent[i].longitude), held))

    let late: Promise<LatePatch> | null = null
    let columnsOut = pendingColumns
    if (lookup && waitsForLookup) {
      // Named while it is the one thing the run still waits on.
      onTail?.(ELEVATION_MESSAGE)
      const patch = applyLookup(await lookup)
      const swap = new Map(patch.rows.map((r) => [geoKey(r.latitude, r.longitude), r]))
      results.forEach((r, i) => {
        const next = swap.get(geoKey(r.latitude, r.longitude))
        if (next) results[i] = next
      })
      columnsOut = patch.columns
    } else if (lookup) {
      late = lookup.then(applyLookup)
      // Awaited by the caller, which may have stopped listening by the time
      // it settles; an abort must not surface here as unhandled.
      late.catch(() => {})
    }

    results.sort(rankComparator(sortBy, request.sort_desc ?? false))
    const top = results.slice(0, request.limit)

    return {
      response: {
        results: top,
        total_queried: candidates.length,
        // Nothing is filtered here. The browser holds the whole field and
        // applies the forecast bounds live in present.ts, which is what makes
        // them a knob rather than another Analyze; the two counts only differ
        // for direct callers of the server route, which sends trimmed rows.
        total_matched: candidates.length,
        times,
        total_found: totalFound,
        truncated,
      },
      universe: results,
      aqiFailed,
      columns: columnsOut,
      late,
    }
  } catch (e) {
    internal.abort()
    throw cloudFailure ?? e
  } finally {
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

// The destinations a refresh re-analyzes: the held universe, so a window
// change re-ranks the field the analysis actually saw rather than the handful
// the last cut left on screen (#177). The displayed-rows fallback survives
// only as null-tolerance: since #240 every committed report holds its field,
// so a refresh without one cannot happen.
//
// Removals have to be applied here explicitly. Echoing the displayed rows used
// to drop ×-removed destinations as a side effect of them already being gone
// from the display; the universe never saw the removal.
export function refreshEchoRows(
  universe: readonly DestinationResult[] | null,
  displayed: readonly DestinationResult[],
  removedKeys: ReadonlySet<string>,
): CustomDestination[] {
  return (universe ?? displayed)
    .filter((r) => !removedKeys.has(geoKey(r.latitude, r.longitude)))
    .map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      elevation_ft: r.elevation_ft ?? undefined,
    }))
}

/**
 * What each destination the browser already knows IS, by coordinate, for the
 * rows the server can only call "custom" (#545).
 *
 * `custom_destinations` carries no kind, so every searched or clicked place,
 * and every row a refresh echoes, comes back typed "custom". The type decides
 * the terrain-height fallback (`terrainFallbackFor`): a clicked lake read as
 * custom took the peak's side and was forecast in the free air above its own
 * shore. Two sources, in order: the held field, whose polygon rows were typed
 * by discovery, and the places, whose geocoded kind outranks it. A plain
 * record, so a retry replays the same answer.
 */
export function knownTypes(
  universe: readonly DestinationResult[] | null,
  places: readonly Place[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of universe ?? []) {
    if (r.type !== 'custom') out[geoKey(r.latitude, r.longitude)] = r.type
  }
  for (const p of places) {
    const type = placeType(p.kind)
    if (type !== 'custom') out[geoKey(p.lat, p.lon)] = type
  }
  return out
}

/**
 * The discovered field with each "custom" row given the type `knownTypes`
 * holds for its coordinate. Rows the discovery typed itself, and pasted points
 * nothing knows more about, pass through unchanged.
 */
export function withKnownTypes(
  candidates: readonly DiscoveredDestination[],
  known: Readonly<Record<string, string>>,
): DiscoveredDestination[] {
  return candidates.map((c) => {
    if (c.type !== 'custom') return c
    const type = known[geoKey(c.latitude, c.longitude)]
    return type ? { ...c, type } : c
  })
}

/**
 * The user-authored discovery inputs as a stable string. Everything that
 * changes which destinations are FOUND belongs here — the CSV as parsed rows
 * (a comment or whitespace edit doesn't needlessly bust the refresh) but NOT
 * the searched places, which are compared separately so removals stay
 * refresh-eligible.
 *
 * Nothing that only re-presents the held field belongs here. Ranking, the cap
 * and every bound are read off rows the browser already holds (#188), so none
 * of them reaches this function and none of them re-buys a discovery.
 */
export function discoveryBase(
  poly: GeoPolygon | null,
  csvRows: readonly CustomDestination[],
  types: readonly DiscoveryType[],
  includeUnnamedPeaks: boolean,
): string {
  return JSON.stringify({
    ring: poly?.coordinates[0] ?? null,
    // Sorted so checking peaks then lakes and lakes then peaks are the same
    // discovery, matching the order-independent cache key upstream.
    types: [...types].sort(),
    unnamed: includeUnnamedPeaks,
    csv: csvRows,
  })
}

/** What a committed polygon discovery recorded about the inputs behind it. */
export interface DiscoveryRecord {
  base: string
  searchedKeys: readonly string[]
}

/**
 * Whether this Analyze may skip Overpass and refetch only the weather of the
 * destinations already in hand.
 *
 * This is a spend boundary, not an optimization: a wrong answer either buys a
 * discovery nobody asked for, or re-ranks a stale field against a question it
 * no longer answers. Every condition earns its place.
 *
 * A SHRUNK searched list stays refresh-eligible — the departed rows are already
 * gone from the report the refresh echoes — where a NEW searched place does
 * not, because it has to compete against the whole candidate field, which the
 * echo is not. `base` covers everything else the user authored, so any change
 * to the ring, the kinds, the unnamed-peaks toggle or the pasted CSV falls
 * through to a fresh discovery.
 *
 * `hasResults` is the report on screen: with nothing displayed there is nothing
 * to echo. `prev` is null after a custom-only run, which deliberately forgets
 * the polygon behind it so a later identical polygon Analyze cannot mistake
 * those rows for that polygon's discovered set.
 */
export function isDiscoveryRefresh(
  prev: DiscoveryRecord | null,
  base: string,
  searchedKeys: readonly string[],
  hasResults: boolean,
): boolean {
  if (!hasResults || prev === null) return false
  if (prev.base !== base) return false
  return searchedKeys.every((k) => prev.searchedKeys.includes(k))
}
