import type {
  AnalyzeRequest,
  CustomDestination,
  DestinationResult,
  DiscoveryType,
  GeoPolygon,
  SortBy,
} from '../types'
import type { AnalyzeOptions } from '../hooks/analyzeTypes'
import type { SelectionKind } from './calendarSelection'
import {
  type DiscoveryRecord,
  discoveryBase,
  isDiscoveryRefresh,
  refreshEchoRows,
} from './clientAnalyze'
import { type Constraints, constraintFields } from './constraints'
import { buildCustomList } from './customList'
import type { Place } from './geocode'
import { geoKey } from './points'
import { discoveryKeys } from './present'

// What one Analyze click asks for, decided without doing any of it. The hook
// that runs the plan (useAnalyzeCommand) owns the order of the side effects;
// every decision about which request goes out lives here, where the node
// project can test it.

/** Everything an Analyze reads, as it stands at the click. */
export interface AnalyzeInputs {
  /** The selection's arm, and the UTC instants it resolved to at the click. */
  kind: SelectionKind
  window: { start: string; end: string }
  /** The complete ring, or null when there is none (fewer than three points). */
  polygon: GeoPolygon | null
  destinationTypes: DiscoveryType[]
  includeUnnamedPeaks: boolean
  csvRows: CustomDestination[]
  places: Place[]
  /** The user-authored scope a removal is recorded under. */
  destinationScope: string
  forecastModel: string
  comparedModels: readonly string[]
  limit: number
  sortBy: SortBy
  sortDesc: boolean
  constraints: Constraints
  /** The held field, the rows on screen, and the ×-removed keys. */
  universe: DestinationResult[] | null
  results: DestinationResult[]
  removedKeys: ReadonlySet<string>
  /** Whether the report on screen has any rows to echo. */
  hasResults: boolean
  /** What the last polygon discovery recorded, or null. */
  previous: DiscoveryRecord | null
}

export type AnalyzeBranch = 'refresh' | 'discovery' | 'custom' | 'nothing'

/**
 * The discovery scope removals are kept under: the ring and the authored list.
 * Exported because a link that carries removals seeds `useRemovals` with the
 * scope of its own ring and list, so its first Analyze keeps them.
 */
export function removalScopeFor(polygon: GeoPolygon | null, destinationScope: string): string {
  return JSON.stringify({
    ring: polygon?.coordinates[0] ?? null,
    // The ring is this comparison's alone: it resolves only at the click, and
    // it never names a pending destination, which is what the shared scope
    // serves.
    authored: destinationScope,
  })
}

export interface AnalyzePlan {
  branch: AnalyzeBranch
  /** The discovery scope removals are kept under. */
  removalScope: string
  /** Whether this click ranks anything: false only with no ring and no custom list. */
  willRank: boolean
  /** The run to start, or null when there is nothing to rank. */
  run: { request: AnalyzeRequest; kind: SelectionKind; options: AnalyzeOptions } | null
  /**
   * What the discovery record becomes, and whether it is written before the
   * run or after it. Null leaves it as it is.
   */
  record: { when: 'before' | 'after'; value: DiscoveryRecord | null } | null
}

/**
 * The request one Analyze sends, and what it does to the state around it.
 *
 * Three branches. A polygon run whose discovery inputs are unchanged, with
 * results on screen, is a refresh: it skips Overpass and refetches only the
 * weather of the field in hand. Any other ring is a fresh discovery, with the
 * custom list riding along. No ring with a custom list is a custom-only run.
 */
export function planAnalysis(inputs: AnalyzeInputs): AnalyzePlan {
  const {
    kind,
    window,
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    csvRows,
    places,
    forecastModel,
    comparedModels,
    limit,
    sortBy,
    sortDesc,
  } = inputs
  // Every bound the request carries. They stay on it because it is the same
  // shape POST /api/analyze documents for direct callers, but the browser
  // holds the field and applies them live, so they go unused here. The
  // elevation band is the one the app no longer sends at all (#341); the API
  // still accepts it from a direct caller.
  const bounds = constraintFields(inputs.constraints)
  // The custom side of the analysis is the pasted CSV ∪ the searched places.
  // With a complete ring the backend unions discovery in too.
  const custom = buildCustomList(csvRows, places)
  const shared = {
    start_datetime: window.start,
    end_datetime: window.end,
    forecast_model: forecastModel,
    limit,
    sort_by: sortBy,
    sort_desc: sortDesc,
  }
  const options: AnalyzeOptions = { compareModels: comparedModels }

  // Removals reset only when the user changed a discovery input. Searched
  // places are deliberately absent, because their list shrinks on removal.
  //
  // A re-analysis extends the held field rather than rebuilding it, so the
  // rows a user struck out stay struck out. Losing them to anything short of
  // a genuine discovery change would be an unexplained edit of their work.
  const removalScope = removalScopeFor(polygon, inputs.destinationScope)

  // A SHRUNK searched list is refresh-compatible: the departed rows are
  // already gone from the report the refresh echoes. Any base change or NEW
  // searched place (which must compete against the full candidate field)
  // falls through to a fresh discovery.
  const base = discoveryBase(polygon, csvRows, destinationTypes, includeUnnamedPeaks)
  const searchedKeys = places.map((p) => geoKey(p.lat, p.lon))
  const record = { base, searchedKeys }
  // The polygon guard stays here rather than inside the predicate: a run with
  // no ring is not a polygon discovery at all, whatever the recorded inputs
  // say.
  const isRefresh =
    polygon !== null && isDiscoveryRefresh(inputs.previous, base, searchedKeys, inputs.hasResults)
  const willRank = polygon !== null || custom.length > 0

  if (isRefresh) {
    // Weather-only over the known destinations. They come back as type
    // "custom" with no osm_id; the presented report restores each row's real
    // identity by coordinate.
    //
    // The echo is the FULL analyzed field, not the displayed rows. A window
    // change lands here (discoveryBase deliberately omits the window), and
    // re-ranking only the last cut's survivors ranked 10 of 851 candidates:
    // fast, silent, and wrong (#177).
    //
    // The record is written before the run, so re-adding one of the places a
    // refresh dropped reads as an addition (a fresh run), not a refresh that
    // would skip it.
    return {
      branch: 'refresh',
      removalScope,
      willRank,
      run: {
        request: {
          destination_types: [],
          ...shared,
          custom_destinations: refreshEchoRows(inputs.universe, inputs.results, inputs.removedKeys),
          ...bounds,
        },
        kind,
        // The identity this refresh answers for is the polygon discovery it
        // echoes, not the custom-shaped request it rides on: derived from the
        // request, the snapshot would say "no ring searched" and the panel's
        // unchanged polygon would falsely cue as new.
        options: { ...options, discovery: discoveryKeys(polygon, destinationTypes, includeUnnamedPeaks) },
      },
      record: { when: 'before', value: record },
    }
  }
  if (polygon !== null) {
    // Discovery, with the custom list riding along so the backend ranks the
    // polygon ∪ CSV union as one report. Recorded once the run returns, so
    // the next compatible Analyze refreshes.
    return {
      branch: 'discovery',
      removalScope,
      willRank,
      run: {
        request: {
          polygon,
          destination_types: destinationTypes,
          include_unnamed_peaks: includeUnnamedPeaks,
          ...shared,
          ...(custom.length > 0 ? { custom_destinations: custom } : {}),
          ...bounds,
        },
        kind,
        options,
      },
      record: { when: 'after', value: record },
    }
  }
  if (custom.length > 0) {
    // Custom-only. Not a refreshable polygon discovery, so the record is
    // cleared: a later identical polygon Analyze must not mistake these rows
    // for that polygon's discovered set.
    return {
      branch: 'custom',
      removalScope,
      willRank,
      run: {
        request: { destination_types: [], ...shared, custom_destinations: custom, ...bounds },
        kind,
        options,
      },
      record: { when: 'before', value: null },
    }
  }
  return { branch: 'nothing', removalScope, willRank, run: null, record: null }
}
