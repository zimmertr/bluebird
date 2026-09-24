import { useRef } from 'react'
import type { AnalyzeRequest } from '../types'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { FALLBACK_WINDOW_LIMITS, type WindowLimits } from '../utils/forecastWindow'
import { MAX_ANALYZE_DESTINATIONS } from '../utils/clientAnalyze'
import { analyzedView, type RecordedFacts } from '../utils/analysisSnapshot'
import { runAnalysisPipeline } from '../utils/analysisPipeline'
import type { HeldForecasts } from '../utils/forecastReuse'
import { AQI_LIMIT_DAYS, SelectionKind } from '../utils/calendar'
import { discoveryKeys } from '../utils/present'
import type { ForecastModelOption } from './useCapabilities'
import { useAnalysisRun } from './useAnalysisRun'
import { useAnalysisReport } from './useAnalysisReport'
import type { AnalyzeOptions } from './analyzeTypes'

// The types live in analyzeTypes.ts. They are re-exported here because the
// panel imports them by the hook's name.
export type { AnalyzeOptions, AnalyzedView, Progress, Refusal } from './analyzeTypes'

// One Analyze click, end to end, composed from three parts: the run in flight
// (useAnalysisRun), the report it commits (useAnalysisReport), and the
// pipeline that does the work (analysisPipeline.ts). What stays here is what
// spans runs: the forecasts the next one may reuse, and the request a retry
// repeats.
export function useAnalyze(
  maxDestinations: number = MAX_ANALYZE_DESTINATIONS,
  models: readonly ForecastModelOption[] = [],
  windowLimits: WindowLimits = FALLBACK_WINDOW_LIMITS,
  aqiForecastDays: number = AQI_LIMIT_DAYS,
) {
  const run = useAnalysisRun(models)
  const report = useAnalysisReport()
  const lastRequestRef = useRef<{ request: AnalyzeRequest; kind: SelectionKind; options: AnalyzeOptions } | null>(null)
  // The forecasts the last browser analysis fetched, kept so the next one only
  // pays for what it does not already have. It helps any re-analysis at the
  // same window and model (a pasted destination, a toggled unnamed-peaks, a
  // redrawn ring that still covers most of the old one), because reuse is
  // decided per destination rather than per reason, and re-buying a forecast
  // already on screen spends the visitor's Open-Meteo quota to learn nothing.
  // Set only once a run has finished and committed.
  const heldForecastsRef = useRef<HeldForecasts | null>(null)

  // Re-run the most recent request (the "Try again" button on transient
  // errors; a deterministic refusal gets no retry, because run verbatim it can
  // only repeat itself).
  function retry() {
    const last = lastRequestRef.current
    if (last) analyze(last.request, last.kind, last.options)
  }

  // Clear the current ranked results without fetching. Used by a pins-only
  // Analyze so a stale ranking (e.g. from a since-deleted polygon) doesn't
  // linger in the table and on the map above the refetched pins.
  function reset() {
    report.clear()
    run.clearEvents()
    lastRequestRef.current = null
    heldForecastsRef.current = null
  }

  // One explicit fetch per Analyze click: every candidate in the polygon is
  // analyzed (refusing loudly above the ceiling, truncating only on explicit
  // election) and the table shows exactly the ranked rows. Repeats may be
  // served from short-lived caches; nothing is refetched behind the user's
  // back. The previous report deliberately stays on screen until this one
  // commits, and a cancel or a failure leaves it standing.
  async function analyze(request: AnalyzeRequest, kind: SelectionKind = 'days', options: AnalyzeOptions = {}) {
    const { discovery, compareModels = [] } = options
    lastRequestRef.current = { request, kind, options }
    // Derived off the request unless the caller says otherwise: the weather-
    // only refresh re-fetches a polygon report through the custom path, so its
    // request carries no polygon. The snow date is this run's alone, so a
    // report whose discovery answers with none never captions itself with the
    // last one's.
    const facts: RecordedFacts = {
      discovery:
        discovery ?? discoveryKeys(request.polygon ?? null, request.destination_types, request.include_unnamed_peaks),
      compareModels,
      snowAnalysisDate: null,
    }
    const view = () => analyzedView(request, kind, facts, Date.now(), windowLimits)
    // Seed the first-phase label so nothing generic ("Starting…") flashes in
    // the click-to-first-event gap: a polygon run opens on discovery, a custom
    // or refresh run goes straight to retrieval (upgraded to the counted label
    // once the up-front progress lands).
    const seed = request.polygon ? SEARCHING_MESSAGE : 'Retrieving Forecasts…'
    // No server fallback (#240). An OpenMeteoUnreachable used to reroute the
    // whole analysis through POST /api/analyze/stream on the pod's shared
    // quota: a public quota-amplification surface no ordinary visitor ever
    // exercised (27 review seats, zero fallbacks). It now surfaces through the
    // run's failure mapping like every other provider failure.
    await run.run(
      seed,
      async (signal) => {
        const out = await runAnalysisPipeline(request, {
          signal,
          held: heldForecastsRef.current,
          maxDestinations,
          windowLimits,
          aqiForecastDays,
          onDiscovered: (found) => {
            facts.snowAnalysisDate = found.snowAnalysisDate
            run.announce(found.candidates.length)
            report.publishCandidates(found.candidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })))
          },
          onPartial: (data, fieldSoFar) => report.commitArriving(data, fieldSoFar, view()),
          onProgress: run.onProgress,
          onPace: run.onPace,
        })
        heldForecastsRef.current = out.held
        report.commit(out.response, out.field, view())
      },
      { onFailure: report.dropCandidates, onSettled: report.settle },
    )
  }

  return {
    analyze,
    cancel: run.cancel,
    retry,
    reset,
    analyzed: report.analyzed,
    analysisSeq: report.analysisSeq,
    fireField: report.fireField,
    fireSeq: report.fireSeq,
    loading: run.loading,
    // The rows on screen are a floor while this holds (#337).
    arriving: report.arriving,
    error: run.error,
    refusal: run.refusal,
    response: report.response,
    universe: report.universe,
    statusMessage: run.statusMessage,
    progress: run.progress,
    paceRemainingS: run.paceRemainingS,
  }
}

export type Analysis = ReturnType<typeof useAnalyze>
