import type { RunReport, RunReportStage } from '../types'
import { isAbort } from './abort'
import { AnalysisRefusalError } from './clientAnalyze'
import { ApiUnreachable, apiFetch } from './apiFetch'
import {
  OpenMeteoBadBody,
  OpenMeteoHttpError,
  OpenMeteoModelCoverage,
  OpenMeteoRateLimited,
  OpenMeteoTimeout,
  OpenMeteoUnreachable,
} from './openMeteoErrors'

// What the browser tells the pod about each run and each map load (record
// 0339). An analysis runs here, against Open-Meteo, so this report is the only
// way the pod learns how often one succeeds and how long it takes. It names
// no place and no person: the route refuses any field it does not list.

export const REPORTS_URL = '/api/reports'

/**
 * Send one report and forget it. `sendBeacon` is what survives a closing tab,
 * which is exactly when an abandoned run has to be counted; `fetch` with
 * `keepalive` covers a browser without it. Nothing a report does may reach the
 * reader, so every failure is swallowed.
 */
export function sendReport(report: RunReport, nav: Navigator | undefined = globalThis.navigator): void {
  try {
    const body = JSON.stringify(report)
    if (nav?.sendBeacon?.(REPORTS_URL, new Blob([body], { type: 'application/json' }))) return
    void apiFetch(REPORTS_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // A report is never worth an error the reader sees.
  }
}

function isOpenMeteo(e: unknown): boolean {
  return (
    e instanceof OpenMeteoTimeout ||
    e instanceof OpenMeteoUnreachable ||
    e instanceof OpenMeteoRateLimited ||
    e instanceof OpenMeteoHttpError ||
    e instanceof OpenMeteoBadBody ||
    e instanceof OpenMeteoModelCoverage
  )
}

/** How a run that did not finish is reported: who failed it, and at what. */
export function failureFields(e: unknown, stage: RunReportStage): Pick<RunReport, 'outcome' | 'stage' | 'source'> {
  if (isAbort(e)) return { outcome: 'cancelled', stage, source: null }
  if (e instanceof AnalysisRefusalError) return { outcome: 'refused', stage, source: null }
  if (isOpenMeteo(e)) return { outcome: 'failed', stage: 'weather', source: 'open-meteo' }
  if (e instanceof ApiUnreachable || stage === 'discovery') return { outcome: 'failed', stage, source: 'pod' }
  return { outcome: 'failed', stage: 'other', source: 'other' }
}

export interface RunTracker {
  /** Discovery answered with this many destinations; the forecasts are next. */
  discovered(count: number): void
  /** The report committed, degraded when a column it should fill read N/A. */
  finished(destinations: number, degraded: RunReportStage | null): void
  /** The run ended without a report. */
  failed(e: unknown): void
}

/**
 * One run's report, sent once whichever way it ends, and as `abandoned` if
 * the page goes away first: a tab closed on a run that is taking too long is
 * the failure the targets most need to see.
 */
export function trackRun(
  start: { model: string; discovers: boolean },
  deps: {
    send?: (report: RunReport) => void
    now?: () => number
    target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
  } = {},
): RunTracker {
  const send = deps.send ?? sendReport
  const now = deps.now ?? (() => performance.now())
  const target = deps.target === undefined ? (typeof window === 'undefined' ? null : window) : deps.target
  const began = now()
  let stage: RunReportStage = start.discovers ? 'discovery' : 'weather'
  let destinations: number | null = null
  let sent = false
  const model = start.model
  function emit(fields: Pick<RunReport, 'outcome' | 'stage' | 'source'>) {
    if (sent) return
    sent = true
    target?.removeEventListener('pagehide', onHide)
    send({
      kind: 'analysis',
      ...fields,
      duration_ms: Math.max(0, Math.round(now() - began)),
      destinations,
      model,
    })
  }
  function onHide() {
    emit({ outcome: 'abandoned', stage, source: null })
  }
  target?.addEventListener('pagehide', onHide)
  return {
    discovered(count) {
      destinations = count
      stage = 'weather'
    },
    finished(count, degraded) {
      destinations = count
      emit(
        degraded
          ? { outcome: 'degraded', stage: degraded, source: 'open-meteo' }
          : { outcome: 'success', stage: null, source: null },
      )
    },
    failed(e) {
      emit(failureFields(e, stage))
    },
  }
}

/** The map's first style load, or its first failure, reported once. */
export function reportMapLoad(ok: boolean, durationMs: number, send: (report: RunReport) => void = sendReport): void {
  send({
    kind: 'map',
    outcome: ok ? 'success' : 'failed',
    stage: ok ? null : 'basemap',
    source: ok ? null : 'basemap',
    duration_ms: Math.max(0, Math.round(durationMs)),
    destinations: null,
    model: null,
  })
}
