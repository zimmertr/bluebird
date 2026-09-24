import type { AnalyzeRequest, AnalyzeResponse, DestinationResult } from '../types'
import type { AnalyzedView } from '../hooks/analyzeTypes'
import { analyzedView } from './analysisSnapshot'
import { addDays, dayKey } from './calendarDates'
import type { ForecastSelection } from './calendarSelection'
import type { WindowLimits } from './forecastWindow'
import { discoveryKeys } from './present'

// The tutorial's demo analysis (#536): a real report, recorded once by
// `tools/tour-demo/capture.ts`, and moved forward in time when a reader opens
// the tutorial so its window is always an upcoming one. Pure, so the move is
// testable off a fixed clock.

const DAY_MS = 86_400_000

/** What the capture script records. JSON, so it holds no Set and no Date. */
export interface DemoCapture {
  capturedAt: string
  request: AnalyzeRequest
  response: AnalyzeResponse
  universe: DestinationResult[]
  snowAnalysisDate: string | null
}

/**
 * Everything the app shows in place of the reader's own report while the
 * tutorial runs. The reader's state is never written; this is read instead.
 */
export interface TourScene {
  response: AnalyzeResponse
  universe: DestinationResult[]
  analyzed: AnalyzedView
  selection: ForecastSelection
  times: number[]
}

/**
 * Whole days to add so the window's first hour is the next one after `nowMs`.
 *
 * Whole days rather than "tomorrow at the same wall-clock hour", because the
 * sun keeps UTC time: a 24-hour step keeps every hour at the same height of
 * the sun at the peaks, and a daylight saving change between the capture and
 * the reading only relabels the local hour by one.
 */
export function dayShift(startMs: number, nowMs: number): number {
  return Math.floor((nowMs - startMs) / DAY_MS) + 1
}

function shiftIso(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString()
}

/** The local-day selection the panel would hold for this window. */
function selectionFor(startMs: number, endMs: number): ForecastSelection {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return {
    kind: 'days',
    startDate: dayKey(start),
    endDate: dayKey(end),
    hours: { start: hhmm(start), end: hhmm(end) },
  }
}

export function buildScene(capture: DemoCapture, nowMs: number, windowLimits: WindowLimits): TourScene {
  const days = dayShift(Date.parse(capture.request.start_datetime), nowMs)
  const ms = days * DAY_MS
  const move = (t: number) => t + ms

  const request: AnalyzeRequest = {
    ...capture.request,
    start_datetime: shiftIso(capture.request.start_datetime, ms),
    end_datetime: shiftIso(capture.request.end_datetime, ms),
  }
  const universe = capture.universe.map((row) =>
    row.series_times ? { ...row, series_times: row.series_times.map(move) } : row,
  )
  const times = (capture.response.times ?? []).map(move)
  const snowAnalysisDate = capture.snowAnalysisDate && addDays(capture.snowAnalysisDate, days)
  // The first `limit` rows are the universe's own objects, as they are in a
  // report the pipeline commits, so a lookup by identity finds them in both.
  const response: AnalyzeResponse = {
    ...capture.response,
    results: universe.slice(0, request.limit),
    times,
    snow_analysis_date: snowAnalysisDate,
  }
  const analyzed: AnalyzedView = {
    ...analyzedView(
      request,
      'days',
      {
        discovery: discoveryKeys(request.polygon ?? null, request.destination_types, request.include_unnamed_peaks),
        compareModels: [],
        snowAnalysisDate,
      },
      nowMs,
      windowLimits,
    ),
    // The capture fetched the cloud column whatever it ranked by, so every
    // ranking a reader holds has numbers to show.
    cloudFetched: true,
  }
  const startMs = Date.parse(request.start_datetime)
  const endMs = Date.parse(request.end_datetime)
  return { response, universe, analyzed, selection: selectionFor(startMs, endMs), times }
}
