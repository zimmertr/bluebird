// Serialize the full set of analysis inputs to/from the URL query string so a
// Bluebird Forecast session can be copied out of the address bar and reopened later.
// These functions are intentionally pure (no React, no DOM) so they're trivial
// to unit-test. App.tsx and `useRunOnOpen` read location once at mount, and
// `useUrlSync` writes it.
import { GeoPolygon, DiscoveryType, SortBy } from '../types'
import { DEFAULT_FAMILY_KEY, MetricFamily, RANKED_FAMILIES } from '../metrics'
import { Constraints, hasConstraints } from './constraints'
import { type GridStyle } from './forecastGrid'
import { ForecastSelection } from './calendar'
import { Place } from './geocode'
import {
  DEFAULT_LIMIT,
  DEFAULT_SORT,
  URL_PARAMS,
  decodeSelection,
  escapeQueryText,
  hasCustomCsv,
  hasPolygon,
  unescapeQueryText,
} from './urlParams'

// The two window classifiers read the calendar band and live beside it. They
// are re-exported here because the panel, App.tsx and this module's own suite
// import them by this name.
export { classifyAqiCoverage, classifyWindow } from './calendar'

// Fields that fully describe an analysis. Results are deliberately excluded —
// they're re-fetched fresh so a shared link never replays stale forecasts.
export interface ShareableState {
  polygon: GeoPolygon | null
  // A set, not a value: the polygon can look for several kinds at once, and
  // an empty set means it looks for nothing.
  destinationTypes: DiscoveryType[]
  includeUnnamedPeaks: boolean
  // What the analysis asks about: the current hour, or a day/day-range with an
  // optional narrowing to a span of hours (#166). One value where there used to
  // be four — a mode plus three parallel sets of timestamps, two of them always
  // dormant — which is most of why the panel section shrank.
  selection: ForecastSelection
  // Which weather model answered. Part of the shared state because it is part
  // of what the numbers mean: the same window over the same peaks gives
  // different answers under different models, so a link that dropped it would
  // reopen showing something other than what was shared.
  forecastModel: string
  // The extra models the chart draws beside the ranking one (#232), in the
  // published order. Part of the shared state for the same reason
  // `forecastModel` is: the comparison is half of what a shared chart says.
  // Only the extras — the ranking model is always on the chart and already has
  // its own param, and a second spelling of it could disagree.
  compareModels: string[]
  sortBy: SortBy
  sortDesc: boolean // false = lowest first (the historical behavior)
  // Which aggregate each metric's ranking-row dropdown holds (#291), active
  // row included — its entry always equals `sortBy`. Carried whole because the
  // three inactive rows are real state a reload must not lose, per TJ's call
  // (2026-08-22) that every row's choice persists in the URL.
  rowKeys: Record<MetricFamily, SortBy>
  // The forecast bounds, as one value rather than eight fields, because every
  // surface that touches them treats them as a set (present.ts filters by the
  // whole shape, the panel clears the whole shape).
  constraints: Constraints
  limit: number
  customCsv: string
  // The five live map overlays. Persisted so a shared link reproduces the
  // picture, and deliberately not part of the analysis request: an overlay is
  // drawn beside the ranking, never fed into it. That holds for the forecast
  // grid too, even though it is the one whose toggle costs upstream calls —
  // what it spends on is a picture, and the ranking never reads it.
  showWildfires: boolean
  showRadar: boolean
  showSmoke: boolean
  showSnow: boolean
  showGrid: boolean
  // Which of the grid's two drawings. Rides the SAME param as the toggle
  // (`grid=blocks`, `grid=smooth`) rather than taking a second one: it is one
  // control's state, and two params for it would let a link say the layer is
  // off while still carrying a style for it.
  gridStyle: GridStyle
  // Whether the forecast player is on the map, which is NOT the same shape as
  // the four overlays above: `null` means "whatever this device defaults to"
  // (on at a desktop width, off on a phone, where the bar costs a third of a
  // short map), and a boolean means the reader has decided. Only a decision is
  // written to the URL, and it is written either way round, so a link can carry
  // the player onto a phone or off a desktop.
  showPlayer: boolean | null
  // The grid's coverage slider position, in [0, 1] of the bar — the
  // kilometres derive from the model's pitch, so the POSITION is what a link
  // must carry to mean the same thing under any model. Its own param
  // (`reach=75`, in percent), written only while the layer is on AND the
  // value is not the default — a link stays as short as what it changed.
  gridReachFrac: number
  // Searched places pinned to the results table. Persisted so a refreshed or
  // shared link repopulates them (and refetches their forecasts). Only the
  // fields needed to recreate the pin and its identity link are stored.
  pins: Place[]
}

// Control defaults: they must mirror the initial useState values in the hooks
// that hold the panel's state (`useRankingKnobs`, `useDestinationInputs`). Used to
// decide whether the user has changed anything worth persisting to the URL.
// The ranking and the results cap live beside the rows that write them.
export { DEFAULT_LIMIT, DEFAULT_SORT }
// Nothing is checked by default. Discovery is the expensive input and the
// one that needs a polygon, so a fresh session asks for none of it until the
// user says otherwise.
const DEFAULT_TYPES: DiscoveryType[] = []

// Hold a row count inside what the running service will accept. The ceiling is
// a deployment's answer, not this module's: /api/capabilities publishes it and
// useCapabilities carries it, so decodeState below deliberately has no opinion
// about how large a limit is too large (issue #191). Named rather than spelled
// inline so the restore path, the knob, and the capabilities sync cannot drift
// into three different ideas of the same clamp.
export function clampLimit(value: number, maxLimit: number): number {
  return Math.max(1, Math.min(maxLimit, value))
}

/**
 * Build a query string ("?"-less) capturing the shareable state. Returns "" when
 * the user hasn't provided anything worth persisting, so the address bar stays
 * clean on a pristine load.
 *
 * A day selection is user intent and counts as such: someone had to click a day
 * to make one. That is the change the calendar brings to this gate, and it makes
 * it simpler rather than more complicated. The old window was two pre-filled
 * timestamps nobody had chosen, so a filled window could not be read as a
 * signal — treating it as one would have written dates into the address bar,
 * and rewritten them on every reload, before the user did anything at all. The
 * calendar's default is the When toggle's Current arm, which carries no dates
 * to write.
 */
// `defaultForecastModel` is passed in rather than named here because the
// default is the deployment's, published by /api/capabilities. Compiling a copy
// into this module would be the mirrored-constant problem issue #152 exists to
// stop, and it is only needed to answer one question: has the user moved off
// the default, and does this state therefore deserve a URL at all.
export function encodeState(state: ShareableState, defaultForecastModel: string): string {
  const hasConstraint = hasConstraints(state.constraints)
  const hasPins = state.pins.length > 0
  const nonDefaultControls =
    state.sortBy !== DEFAULT_SORT ||
    RANKED_FAMILIES.some((family) => state.rowKeys[family] !== DEFAULT_FAMILY_KEY[family]) ||
    state.sortDesc ||
    state.limit !== DEFAULT_LIMIT ||
    state.destinationTypes.length !== DEFAULT_TYPES.length ||
    state.includeUnnamedPeaks ||
    state.showWildfires ||
    state.showRadar ||
    state.showSmoke ||
    state.showSnow ||
    state.showGrid ||
    state.showPlayer !== null ||
    state.selection.kind !== 'now' ||
    state.forecastModel !== defaultForecastModel ||
    // Ticking a model onto the chart is a real edit, like choosing the model
    // beside it: the one thing that differs from a fresh session must not share
    // as a fresh session.
    state.compareModels.length > 0
  if (!hasPolygon(state) && !hasCustomCsv(state) && !hasConstraint && !hasPins && !nonDefaultControls)
    return ''

  // Written by hand rather than by URLSearchParams, which would encode the
  // `,` `;` `:` `/` the readable fields are built from (`escapeQueryText`).
  const parts: string[] = []
  for (const { key, escaped, encode } of URL_PARAMS) {
    const value = encode?.(state) ?? null
    if (value !== null) parts.push(`${key}=${escaped ? value : escapeQueryText(value)}`)
  }
  return parts.join('&')
}

// Each key's first value as raw query text, before any percent-decoding, for
// the rows that split their value on delimiters an escaped field may also hold
// (`escaped` in `ParamCodec`). First, because that is the value
// URLSearchParams.get answers for every other row.
function rawQueryValues(query: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    const key = unescapeQueryText(eq < 0 ? part : part.slice(0, eq))
    if (key !== null && !out.has(key)) out.set(key, eq < 0 ? '' : part.slice(eq + 1))
  }
  return out
}

// The one param a link may carry that is a request rather than state: open
// the link and run its analysis (#511). It lives outside ShareableState on
// purpose. That type is what `encodeState` writes, so a field there would be a
// field the writer had to remember to skip, and the rule is that the writer can
// never emit it: a reader who edits the panel and copies the address bar must
// not pass on a link that spends on open. It is also why `decodeState` does not
// return it: that function answers null for a link with nothing to restore, and
// `?analyze=1` alone is exactly that.
const AUTO_ANALYZE_PARAM = 'analyze'

/** Whether a link asks for its analysis to run on open. Only `analyze=1` does. */
export function decodeAutoAnalyze(search: string): boolean {
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      .get(AUTO_ANALYZE_PARAM) === '1'
  } catch {
    return false
  }
}

/**
 * Parse a location.search string back into a partial state. Tolerant by design:
 * unknown or malformed values are dropped rather than throwing, so a user
 * pasting a truncated or hand-edited link still gets whatever survived. Returns
 * null when nothing usable was found.
 */
export function decodeState(search: string): Partial<ShareableState> | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  let params: URLSearchParams
  try {
    params = new URLSearchParams(query)
  } catch {
    return null
  }
  const rawValues = rawQueryValues(query)

  const out: Partial<ShareableState> = {}
  for (const { key, escaped, decode } of URL_PARAMS) {
    const value = escaped ? rawValues.get(key) : params.get(key)
    if (value !== undefined && value !== null) decode?.(value, out)
  }
  const selection = decodeSelection(params)
  if (selection) out.selection = selection

  return Object.keys(out).length > 0 ? out : null
}
