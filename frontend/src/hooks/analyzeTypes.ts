// The shapes `useAnalyze` hands its callers: the progress of a run, a refusal,
// the snapshot a report was analyzed under, and the options a run records.
// Apart from the hook so a component or a pure module can name them without
// reading the hook that produces them.

import type { WindowSource } from '../utils/forecastWindow'
import type { SelectionKind } from '../utils/calendar'
import type { AnalyzedSnapshot } from '../utils/present'

export type Progress = {
  processed: number
  total: number
  percent: number
}

// An over-limit refusal, normalized from whichever path produced it (the
// server's structured 400 or the client-only paths' AnalysisRefusalError).
// Drives the warn box instead of the error box, with no retry action: a
// deterministic refusal retried verbatim can only repeat itself, and the
// message already names the remedies in prose. The server's structured
// remedy fields stay on the API for direct callers; the SPA renders none of
// them (removed with #253's PR at TJ's request, 2026-08-22).
export type Refusal = {
  message: string
}

// The data snapshot behind the current response: the window it sampled, and
// the presentation knobs it was requested with.
//
// The knobs are recorded so the live ones can be compared against them, which
// is how `utils/present.ts` decides whether the display can be re-derived from
// the held field or genuinely needs another Analyze (#188). Sort and limit
// are re-derived live, so this copy of them is history rather than the
// display source.
// Composes PresentationKnobs rather than restating them, so the recorded set
// and the compared set cannot drift apart.
export type AnalyzedView = AnalyzedSnapshot & {
  // Which arm of the forecast selection this was: the current hour, or chosen
  // days. A data knob — unlike sort and limit it is never re-derived, so it
  // always reads from here — and it decides only wording, since 'now' is the one
  // shape whose caption says when it was taken rather than what was asked for.
  kind: SelectionKind
  // The window as requested, epoch ms. Everything the display used to read off a
  // mode name is derived from this instead: whether the analysis was a point
  // sample (`isPointSample`, which counts hourly stamps rather than trusting a
  // label), and the range the results header states. Recorded off the request
  // like `customKeys` below, so it is path-independent.
  window: { startMs: number; endMs: number }
  // Which Open-Meteo endpoint answered this report. Classified ONCE, here,
  // beside the window it was classified from — the same discipline the routes
  // follow on the server — because the boundary is relative to `now`: a report
  // re-classified later could change endpoints while it sits on screen. The
  // forecast grid reads it to decide whether it may sample at all, since an
  // archive report has no model pitch to sample at (#123).
  windowSource: WindowSource
  // The custom destinations this analysis covered — searched places and pasted
  // CSV rows, by geoKey. Recorded off the request rather than read back off the
  // results, which are cut to `limit` and so cannot answer "was this analyzed?"
  // for a field bigger than the cut (#205).
  customKeys: ReadonlySet<string>
  // The model that produced every number in the field. A data knob like the
  // window, and recorded for the same reason: the panel's model can move
  // afterwards, and when it does the held rows are not stale so much as
  // answers to a different question.
  forecastModel: string
  // The discovery inputs behind the field, as `discoveryKeys` spells them:
  // which ring was searched, and for which kinds. Recorded so the panel can
  // ask whether the drawn polygon and checked types are still the ones this
  // report's discovery ran with. Derived off the request by default; the
  // weather-only refresh path carries no polygon in its request and passes
  // the panel's keys explicitly instead.
  polygonKey: string
  typesKey: string
  // The extra models the chart's comparison was bought for (#232). Recorded for
  // the same reason as `forecastModel`: the panel's ticks can move afterwards,
  // and a model ticked since is one the browser holds no forecasts for. Ticking
  // therefore cues a commit and unticking applies at once: the held field can
  // always answer a smaller question and never a larger one.
  compareModels: readonly string[]
  // Which day's snow analysis the field's `snow_depth_in` values came from,
  // and null while the pod holds no grid (#449). Recorded here rather than
  // read back off a row, because it is a fact about the whole report: the
  // results header states it in place of the window caption while snow ranks,
  // and a report of rows that all fall outside the grid still has a date.
  snowAnalysisDate: string | null
}

/**
 * What an analysis needs recording about it that its request cannot say.
 *
 * An object rather than two more positional arguments: both fields are
 * optional and both are strings-or-arrays, so a caller that swapped them would
 * type-check.
 */
export interface AnalyzeOptions {
  /**
   * The discovery identity this run answers for, when the request cannot say
   * it: the weather-only refresh re-fetches a polygon report through the custom
   * path, so its request carries no polygon.
   */
  discovery?: { polygonKey: string; typesKey: string }
  /** The extra models the chart's comparison is buying forecasts for (#232). */
  compareModels?: readonly string[]
}
