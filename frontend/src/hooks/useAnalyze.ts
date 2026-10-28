import { useRef, useState } from 'react'
import { geoKey } from '../utils/points'
import type { AnalyzeRequest, DiscoveredDestination } from '../types'
import { RETRIEVING_MESSAGE, SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { FALLBACK_WINDOW_LIMITS, type WindowLimits } from '../utils/forecastWindow'
import { MAX_ANALYZE_DESTINATIONS } from '../utils/clientAnalyze'
import { analyzedView, type RecordedFacts } from '../utils/analysisSnapshot'
import { type Discovered, runAnalysisPipeline } from '../utils/analysisPipeline'
import { placeRows } from '../utils/clientAnalyze'
import { answered } from '../utils/elevationLookup'
import type { AnalyzedView } from './analyzeTypes'
import type { HeldForecasts } from '../utils/forecastReuse'
import { AQI_LIMIT_DAYS, SelectionKind } from '../utils/calendar/calendar'
import { discoveryKeys } from '../utils/present'
import type { ForecastModelOption } from './useCapabilities'
import { useAnalysisRun } from './useAnalysisRun'
import { useAnalysisReport } from './useAnalysisReport'
import type { AnalyzeOptions } from './analyzeTypes'

// The types live in analyzeTypes.ts. They are re-exported here because the
// panel imports them by the hook's name.
export type { AnalyzeOptions, AnalyzedView, Progress, Refusal, RunError } from './analyzeTypes'

// The field a polygon run found, with the discovery inputs that found it.
interface FoundField {
  found: Discovered
  key: string
}

// What a polygon request asks discovery, as one string: the ring, the kinds
// with the unnamed-peaks toggle, and the reader's list by coordinate, which
// rides in the same call. Null for a request with no polygon, which
// discovers nothing.
function foundKey(request: AnalyzeRequest): string | null {
  if (!request.polygon) return null
  const { polygonKey, typesKey } = discoveryKeys(request.polygon, request.destination_types, request.include_unnamed_peaks)
  const custom = (request.custom_destinations ?? []).map((d) => geoKey(d.latitude, d.longitude)).sort()
  return JSON.stringify([polygonKey, typesKey, custom])
}

// One Analyze click, end to end, composed from three parts: the run in flight
// (useAnalysisRun), the report it commits (useAnalysisReport), and the
// pipeline that does the work (analysisPipeline.ts). What stays here is what
// spans runs: the forecasts the next one may reuse, the snapshot of the run
// that failed, which the Analyze button's word is read against, and the field
// a polygon run found, until a report holds it.
export function useAnalyze(
  maxDestinations: number = MAX_ANALYZE_DESTINATIONS,
  models: readonly ForecastModelOption[] = [],
  windowLimits: WindowLimits = FALLBACK_WINDOW_LIMITS,
  aqiForecastDays: number = AQI_LIMIT_DAYS,
) {
  const run = useAnalysisRun(models)
  const report = useAnalysisReport()
  // The snapshot of the run that last failed (#736): what the panel is
  // compared against to decide whether the Analyze button still reads `Try
  // again` (`retryStands`). Set when a run does not finish, which is a cancel
  // too, where it is harmless since no error stands; cleared when a run
  // starts or on a reset. Not the committed report's snapshot: a failure puts
  // that report back untouched (#560), so it describes the report on screen
  // and not the request that failed.
  const [failedView, setFailedView] = useState<AnalyzedView | null>(null)
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
  // The field the current or last polygon run found, while no report holds it
  // (#782). It shows as pending rows from the moment discovery answers, and a
  // failure keeps it, so the reader still sees what the ring holds and Try
  // again asks for the forecasts alone. A commit, a cancel, the next run and
  // a reset drop it: the first puts the field in the report, and the rest end
  // the run it belonged to. The ref is what the next run reads; the state is
  // what renders.
  const foundRef = useRef<FoundField | null>(null)
  const [pendingField, setPendingField] = useState<DiscoveredDestination[] | null>(null)
  function holdFound(next: FoundField | null) {
    foundRef.current = next
    setPendingField(next?.found.candidates ?? null)
  }

  // The paste-time lookup's answer landed on the committed report (#673):
  // rows the pod placed after the run had read what was known.
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

  // Clear the current ranked results without fetching. Used by a pins-only
  // Analyze so a stale ranking (e.g. from a since-deleted polygon) doesn't
  // linger in the table and on the map above the refetched pins.
  function reset() {
    runSeqRef.current += 1
    report.clear()
    run.clearEvents()
    setFailedView(null)
    heldForecastsRef.current = null
    holdFound(null)
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
    setFailedView(null)
    const runSeq = ++runSeqRef.current
    // A failed run's field stands in for discovery when this request would
    // ask the pod the same question; any other request discovers afresh.
    const key = foundKey(request)
    const held = foundRef.current
    const found = key !== null && held?.key === key ? held.found : null
    holdFound(null)
    // Derived off the request unless the caller says otherwise: the weather-
    // only refresh re-fetches a polygon report through the custom path, so its
    // request carries no polygon.
    const facts: RecordedFacts = {
      discovery:
        discovery ?? discoveryKeys(request.polygon ?? null, request.destination_types, request.include_unnamed_peaks),
      compareModels,
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
          found,
          onDiscovered: (field) => {
            run.announce(field.candidates.length)
            report.publishCandidates(field.candidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })))
            // A run with no polygon has no field to hold: its rows are the
            // reader's list, already pending as inputs.
            if (key !== null) holdFound({ found: field, key })
          },
          onPartial: (data, fieldSoFar) => report.commitArriving(data, fieldSoFar, view()),
          onProgress: run.onProgress,
          onTail: run.onTail,
          onPace: run.onPace,
        })
        heldForecastsRef.current = out.held
        report.commit(out.response, out.field, view(), out.pending)
        holdFound(null)
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
      {
        onFailure: (kind) => {
          report.discard()
          setFailedView(view())
          // A cancel changes nothing, so the field goes with the run (#560).
          // A failure keeps it on screen beside the report it put back.
          if (kind === 'cancel') holdFound(null)
        },
        onSettled: report.settle,
      },
    )
  }

  return {
    analyze,
    cancel: run.cancel,
    dismissEvent: run.dismissEvent,
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
    // The run `error` describes, for the button's word (#736).
    failedView,
    refusal: run.refusal,
    // Moves each time a run ends in an error or a refusal (#803), which opens
    // the message list where the reader can see it.
    failureSeq: run.failureSeq,
    response: report.response,
    universe: report.universe,
    // The committed rows still waiting on their elevation (#673).
    pendingHeights: report.pendingHeights,
    // The field the polygon run found that no report holds yet (#782), or
    // null: drawn as pending rows beside the reader's own.
    pendingField,
    statusMessage: run.statusMessage,
    progress: run.progress,
    paceRemainingS: run.paceRemainingS,
  }
}

export type Analysis = ReturnType<typeof useAnalyze>
