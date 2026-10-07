import { useRef } from 'react'
import { geoKey } from '../utils/points'
import type { AnalyzeRequest, DiscoveredDestination } from '../types'
import { RETRIEVING_MESSAGE, SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { FALLBACK_WINDOW_LIMITS, type WindowLimits } from '../utils/forecastWindow'
import { MAX_ANALYZE_DESTINATIONS } from '../utils/clientAnalyze'
import { analyzedView, type RecordedFacts } from '../utils/analysisSnapshot'
import { runAnalysisPipeline } from '../utils/analysisPipeline'
import { placeRows } from '../utils/clientAnalyze'
import { answered } from '../utils/elevationLookup'
import type { AnalyzedView } from './analyzeTypes'
import type { HeldForecasts } from '../utils/forecastReuse'
import { AQI_LIMIT_DAYS, SelectionKind } from '../utils/calendar'
import { discoveryKeys } from '../utils/present'
import type { ForecastModelOption } from './useCapabilities'
import { useAnalysisRun } from './useAnalysisRun'
import { useAnalysisReport } from './useAnalysisReport'
import type { AnalyzeOptions } from './analyzeTypes'

// The types live in analyzeTypes.ts. They are re-exported here because the
// panel imports them by the hook's name.
export type { AnalyzeOptions, AnalyzedView, Progress, Refusal, RunError } from './analyzeTypes'

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
  // Set only once a run has finished and committed, so a run that does not
  // finish leaves the forecasts of the report it puts back (#560).
  const heldForecastsRef = useRef<HeldForecasts | null>(null)
  // Which run is current, so a lookup that answers after the next Analyze or
  // a reset lands on nothing (#673): the report it belonged to is gone.
  const runSeqRef = useRef(0)
  // The last run's snapshot builder, for an answer that lands after it.
  const viewRef = useRef<(() => AnalyzedView) | null>(null)

  // The paste-time lookup's answer landed on the committed report (#673):
  // rows the tiles or the pod placed after the run had read what was known.
  // Each row it placed is reduced again from the column the run kept for it,
  // and the held field takes the same rows.
  function placeHeld(resolved: readonly DiscoveredDestination[]) {
    const held = heldForecastsRef.current
    const view = viewRef.current
    if (!held || !view || !held.columns?.size) return
    const patch = placeRows(held.rows, held.columns, resolved, {
      startMs: held.startMs,
      endMs: held.endMs,
      times: held.times,
      model: held.model,
      nowMs: Date.now(),
      windowLimits,
    })
    if (!patch.rows.length) return
    report.patch(patch.rows, view())
    const swap = new Map(patch.rows.map((r) => [geoKey(r.latitude, r.longitude), r]))
    heldForecastsRef.current = {
      ...held,
      rows: held.rows.map((r) => swap.get(geoKey(r.latitude, r.longitude)) ?? r),
      columns: patch.columns,
    }
  }

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
    runSeqRef.current += 1
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
  // commits, and a cancel or a failure puts it back as it was, partial rows
  // and all discarded (#560). Resolves true only when the run committed, so
  // the click can keep its own bookkeeping off a run that changed nothing.
  async function analyze(
    request: AnalyzeRequest,
    kind: SelectionKind = 'days',
    options: AnalyzeOptions = {},
  ): Promise<boolean> {
    const { discovery, compareModels = [], onCommit, identity } = options
    lastRequestRef.current = { request, kind, options }
    const runSeq = ++runSeqRef.current
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
    viewRef.current = view
    // Seed the first-phase label so nothing generic ("Starting…") flashes in
    // the click-to-first-event gap: a polygon run opens on discovery, and a
    // custom or refresh run on the forecasts, which it asks for at once while
    // its elevation lookup runs beside them (#643). Either gives way to the
    // counted retrieval label once the field is announced.
    const seed = request.polygon ? SEARCHING_MESSAGE : RETRIEVING_MESSAGE
    // No server fallback (#240). An OpenMeteoUnreachable used to reroute the
    // whole analysis through POST /api/analyze/stream on the pod's shared
    // quota: a public quota-amplification surface no ordinary visitor ever
    // exercised (27 review seats, zero fallbacks). It now surfaces through the
    // run's failure mapping like every other provider failure.
    return run.run(
      seed,
      async (signal) => {
        const out = await runAnalysisPipeline(request, {
          signal,
          held: heldForecastsRef.current,
          maxDestinations,
          windowLimits,
          aqiForecastDays,
          knownTypes: options.knownTypes,
          identity,
          onDiscovered: (found) => {
            facts.snowAnalysisDate = found.snowAnalysisDate
            run.announce(found.candidates.length)
            report.publishCandidates(found.candidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })))
          },
          // A run with no polygon learns its snow date after it has announced
          // its field, and before the first row commits.
          onResolved: (found) => {
            facts.snowAnalysisDate = found.snowAnalysisDate
          },
          onPartial: (data, fieldSoFar) => report.commitArriving(data, fieldSoFar, view()),
          onProgress: run.onProgress,
          onTail: run.onTail,
          onPace: run.onPace,
        })
        heldForecastsRef.current = out.held
        report.commit(out.response, out.field, view(), out.pending)
        // In the same render as the commit, so the report never shows a
        // frame under the bookkeeping of the one before it, and inside the
        // run rather than after the click, so a retry's commit applies it too.
        onCommit?.()
        // The lookup may have placed a waiting row while the run was
        // fetching, after the run had read what was known: that answer
        // reached no report, so the commit takes it now (#673).
        if (out.pending.size && identity) {
          const known = identity.latest()
          const waiting = out.field.filter((r) => out.pending.has(geoKey(r.latitude, r.longitude)))
          const landed = answered(waiting, known)
          if (landed.length) placeHeld(landed)
        }
        // The lookup was still out when the report committed (#673): its
        // answer lands on the committed report, and on the held field a later
        // run would reuse, unless another run or a reset has replaced both.
        out.late?.then(
          (patch) => {
            if (runSeqRef.current !== runSeq) return
            facts.snowAnalysisDate = patch.snowAnalysisDate
            report.patch(patch.rows, view())
            const held = heldForecastsRef.current
            if (held) {
              const swap = new Map(patch.rows.map((r) => [geoKey(r.latitude, r.longitude), r]))
              heldForecastsRef.current = {
                ...held,
                rows: held.rows.map((r) => swap.get(geoKey(r.latitude, r.longitude)) ?? r),
                columns: patch.columns,
              }
            }
          },
          () => {
            if (runSeqRef.current === runSeq) report.settleHeights()
          },
        )
      },
      { onFailure: report.discard, onSettled: report.settle },
    )
  }

  return {
    analyze,
    cancel: run.cancel,
    retry,
    reset,
    placeHeld,
    analyzed: report.analyzed,
    analysisSeq: report.analysisSeq,
    // Moves when a run that showed partial rows is put back (#560).
    discardSeq: report.discardSeq,
    fireField: report.fireField,
    fireSeq: report.fireSeq,
    loading: run.loading,
    // The rows on screen are a floor while this holds (#337).
    arriving: report.arriving,
    error: run.error,
    refusal: run.refusal,
    response: report.response,
    universe: report.universe,
    // The committed rows still waiting on their elevation (#673).
    pendingHeights: report.pendingHeights,
    statusMessage: run.statusMessage,
    progress: run.progress,
    paceRemainingS: run.paceRemainingS,
  }
}

export type Analysis = ReturnType<typeof useAnalyze>
