import type { AnalyzeRequest } from '../types'
import type { AnalyzedView } from '../hooks/analyzeTypes'
import type { SelectionKind } from './calendar'
import { constraintsFromRequest, namesOnRequestMetric } from './clientAnalyze'
import { windowSource, type WindowLimits } from './forecastWindow'
import { geoKey } from './points'
import type { DiscoveryKeys } from './present'

// What a committed report records about the question it answered. Pure, and
// apart from the hook that commits it, so every field of the snapshot the
// panel compares against is testable off a request.

/** What a run records that its request cannot say. */
export interface RecordedFacts {
  // The discovery identity the run answers for. The weather-only refresh
  // re-fetches a polygon report through the custom path, so its request
  // carries no polygon and the caller passes the panel's keys instead.
  discovery: DiscoveryKeys
  compareModels: readonly string[]
  // The grid date discovery reported, or null when it reported none.
  snowAnalysisDate: string | null
}

// Whether an analysis fetches the cloud column (#117): only when its ranking
// or one of its bounds names a cloud metric. Read off the request, so the
// fetch and the snapshot that records it cannot disagree.
export function requestsCloud(request: AnalyzeRequest): boolean {
  return namesOnRequestMetric(request.sort_by ?? 'precip_total_in', constraintsFromRequest(request))
}

/**
 * The snapshot of one report. `nowMs` classifies the window: the archive
 * boundary moves with the clock, so it is classified once, at commit.
 */
export function analyzedView(
  request: AnalyzeRequest,
  kind: SelectionKind,
  facts: RecordedFacts,
  nowMs: number,
  windowLimits: WindowLimits,
): AnalyzedView {
  const startMs = Date.parse(request.start_datetime)
  const endMs = Date.parse(request.end_datetime)
  return {
    sortBy: request.sort_by ?? 'precip_total_in',
    sortDesc: request.sort_desc ?? false,
    limit: request.limit,
    constraints: constraintsFromRequest(request),
    kind,
    window: { startMs, endMs },
    windowSource: windowSource(startMs, endMs, nowMs, windowLimits),
    customKeys: new Set((request.custom_destinations ?? []).map((d) => geoKey(d.latitude, d.longitude))),
    forecastModel: request.forecast_model,
    polygonKey: facts.discovery.polygonKey,
    typesKey: facts.discovery.typesKey,
    compareModels: facts.compareModels,
    snowAnalysisDate: facts.snowAnalysisDate,
    cloudFetched: requestsCloud(request),
  }
}
