import { NOUN } from '../metrics'
import { FIRE_UNAVAILABLE_NOTE } from './fireProximity'
import type { CommitReason } from './present'
import type { AnalyzeBlocker } from './analyzeGate'
import { BLOCKER_SEVERITY, listPhrase, noticeKey, type FooterMessage } from './notices'
import { archiveSeamPhrase } from './calendar'
import type { WindowLimits, WindowSource } from './forecastWindow'

// Which messages the panel shows under the Analyze button, and in what order.
// A module of its own because that decision is pure data: the panel's state in,
// a list of lines out. `notices.ts` takes the list from here and owns what
// happens to it next (the boxes, the dismissal keys, the pruning); this file
// owns only which lines exist.

// Why a knob stopped applying live. Each case names the reason the
// controls went quiet, which is the thing this cue exists to not leave unsaid.
//
// One frame, three subjects (TJ, 2026-08-22): the sentence is spelled once so
// the cues cannot drift apart word by word, and a reword is one edit rather
// than three. The run errors are deliberately NOT this pattern — they are
// defined at their sources (the backend's SSE strings, the Open-Meteo
// client), and only share the "Try again later." tail as a convention.
const commitCue = (subject: string) => `A new ${subject} requires a new analysis.`
const COMMIT_CUE: Record<CommitReason, string> = {
  'window-changed': commitCue('forecast range'),
  'model-changed': commitCue('forecast model'),
  'polygon-changed': commitCue('search area'),
  'types-changed': commitCue('destination type'),
  'destination-added': commitCue('destination'),
}

// The AQI info line's dismissal key (#253): a condition, not a message, like
// every derived line's.
export const AQI_NOTE_KEY = 'aqi:none'

// What each Analyze blocker reads as. A function rather than a record because
// two of the four quote a number the panel holds, and the area cap in
// particular is published by /api/capabilities rather than written here.
//
// The destinations line names no method. It used to list all three ("Draw a
// search area, paste custom coordinates, or search for a place"), which is the
// panel's own table of contents read back to someone who is looking straight at
// it; what they are missing is a destination, not a menu.
function blockerText(
  blocker: AnalyzeBlocker,
  maxAreaKm2: number,
  pointsNeeded: number,
  freezeGaps: readonly string[],
): string {
  switch (blocker) {
    case 'area':
      return `The polygon is too large. The maximum supported size is ${maxAreaKm2.toLocaleString()} km².`
    case 'window':
      return 'Adjust the forecast window to continue.'
    case 'dates':
      return 'Select at least one date to analyze.'
    case 'destinations':
      return 'Provide at least one destination to analyze.'
    case 'polygon':
      return `Add at least ${pointsNeeded} more point${pointsNeeded !== 1 ? 's' : ''} to the polygon to continue.`
    case 'types':
      return 'Select at least one destination type for the polygon search.'
    case 'compare-aqi':
      // Two lines, and the exception that proves the one-line rule: the
      // reader needs both halves, that the data is one source and that the
      // comparison is therefore off, and neither half stands alone (TJ,
      // 2026-09-14). Measured at 69 characters against a 92-character
      // two-line budget.
      return `${NOUN.aqi} data is retrieved independently of the model and cannot be compared.`
    case 'compare-freeze':
      // Names the models rather than counting them, because a model is a
      // control in the panel: the reader can see the one the sentence is
      // about (TJ, 2026-09-14).
      return `${NOUN.freeze} data is not available for ${listPhrase(freezeGaps)}.`
    case 'compare-snow':
      // The air-quality line's twin, and for the same reason: one source
      // answers whatever model ranks the field, so there is nothing for a
      // second chip to draw (TJ, 2026-09-22).
      return `${NOUN.snow} is retrieved independently of the model and cannot be compared.`
  }
}

/** Everything the message list depends on, already derived by the panel. */
export interface PanelMessageInputs {
  loading: boolean
  error: string | null
  refusal: { message: string } | null
  // Every knob that has stopped applying live, in `commitNeeded`'s order.
  commitReasons: readonly CommitReason[]
  // The ranking model's name as the picker shows it.
  modelLabel: string
  modelClamped: boolean
  windowWarning: 'past' | 'future' | 'order' | null
  // The selected window in epoch ms, or null for a Dates arm with no day.
  window: { startMs: number; endMs: number } | null
  // Which endpoint answers that window, or null when there is none.
  source: WindowSource | null
  // How much of the window the air-quality forecast covers.
  aqiCoverage: 'full' | 'partial' | 'none'
  blockers: readonly AnalyzeBlocker[]
  pointsNeeded: number
  // The compared models with no freezing level, by name.
  freezeGaps: readonly string[]
  maxAreaKm2: number
  archiveDays: number
  aqiForecastDays: number
  windowLimits: WindowLimits
  // Whether a report is on screen at all.
  hasReport: boolean
  aqiAllNull: boolean
  wildfireCheckFailed: boolean
  now: Date
}

/**
 * Every message under the Analyze button, as one list feeding at most three
 * boxes — one per severity, in error, warning, info order (`noticeBoxes` in
 * `utils/notices.ts`). They used to box by SOURCE — the warnings in one
 * frame, the refusal and the error in frames of their own — which read as
 * kinds of problem when the difference was plumbing, not meaning (#245
 * review, then the severity split, TJ 2026-08-22). Within a severity the
 * order is what the reader can act on: why the last run failed, why the
 * report on screen is stale, why the button is disabled, then what a
 * delivered report is missing.
 *
 * Each line carries the key its dismissal lives under — the CONDITION for
 * derived lines, the MESSAGE for the two event notices — so the polygon
 * blocker counting down as you draw stays one dismissed thing (see
 * `utils/notices.ts`).
 */
export function panelMessages(p: PanelMessageInputs): FooterMessage[] {
  // The event keys: the run error and the refusal key on their MESSAGE,
  // because each new message is a new fact the reader has not seen.
  const refusalKey = p.refusal ? noticeKey('refusal', p.refusal.message) : null
  const errorKey = p.error ? noticeKey('error', p.error) : null
  // The AQI line qualifies the ANALYSIS rather than the view of it: every
  // displayed row has null AQI although the window is inside the horizon.
  const aqiNoteActive =
    p.hasReport &&
    !p.loading &&
    !p.error &&
    !p.refusal &&
    p.aqiAllNull &&
    p.aqiCoverage !== 'none'

  // Everything the Forecast section has to say, said below the button with
  // every other message (#123 review). These used to render inside that section
  // — one above the calendar, two beneath it — which put a warning about the
  // window a screen away from the warnings about everything else, and made the
  // panel's one notice block a half-truth. Their order here is the order they
  // had there: the model's clamp, then the window's own problem, then what the
  // window costs in air quality.
  //
  // Each keys on its CONDITION, like every other derived line: the seam notice
  // re-arms when a window stops crossing the boundary and crosses it again,
  // rather than on every recomputation of the same sentence.
  const windowMessages: FooterMessage[] = [
    // Why the model control is faded, for the one window it does not apply to
    // (TJ, 2026-09-14). It was a tooltip on the control, which put it out of
    // reach of every touch reader and sat it away from the one block that
    // explains this panel. Info rather than warn for the reason the seam line
    // below is: nothing is wrong and nothing is blocked. It leads the list
    // because it is a statement about the model, and the clamp under it is
    // the other one.
    ...(p.source === 'archive'
      ? [
          {
            key: 'window:archive-model',
            text: 'Archive data uses no forecast model.',
            severity: 'info' as const,
          },
        ]
      : []),
    ...(p.modelClamped
      ? [
          {
            key: 'window:clamped',
            text: `${p.modelLabel} shortened the window.`,
            severity: 'warn' as const,
          },
        ]
      : []),
    ...(p.windowWarning
      ? [
          {
            key: `window:${p.windowWarning}`,
            text:
              p.windowWarning === 'order'
                ? 'The narrowed hours end before they start.'
                : p.windowWarning === 'past'
                  ? `Forecast range starts before the ${p.archiveDays}-day limit.`
                  : `${p.modelLabel} does not reach that far.`,
            severity: 'warn' as const,
          },
        ]
      : []),
    // Where a window crossing the archive boundary changes source (#123). Info
    // rather than warn: nothing is wrong and nothing is blocked, but a report
    // whose early hours are a reanalysis and whose later ones are a model run
    // should say so rather than let the reader assume one dataset.
    ...(p.source === 'spanning' && p.window !== null
      ? [
          {
            key: 'window:spanning',
            text: archiveSeamPhrase(
              p.window.startMs,
              p.window.endMs,
              p.modelLabel,
              p.now,
              p.windowLimits,
            ),
            severity: 'info' as const,
          },
        ]
      : []),
    // One sentence for both the partial and the fully-past-horizon case. They
    // used to be two, each spelling out which columns would be empty and
    // reassuring the reader that weather was unaffected — but the calendar
    // already dims the days past the horizon, so the only thing left to say is
    // where that edge is.
    ...(!p.windowWarning && p.aqiCoverage !== 'full'
      ? [
          {
            key: 'window:aqi-horizon',
            text: `${NOUN.aqi} forecasts only extend ${p.aqiForecastDays} days.`,
            severity: 'info' as const,
          },
        ]
      : []),
  ]

  return [
    // One run's outcome. `retry` is what summons the box's Try again button.
    ...(p.error && errorKey && !p.refusal
      ? [{ key: errorKey, text: p.error, severity: 'error' as const, retry: true }]
      : []),
    // Every stale-report reason at once (TJ, 2026-08-22): a user who changed
    // the window and the model is owed both sentences, in `commitNeeded`'s
    // fixed order, each dismissable alone. One severity for the whole cue
    // family: the report no longer answers what the panel asks, which is
    // warn's definition.
    ...(!p.loading
      ? p.commitReasons.map((reason) => ({
          key: `cue:${reason}`,
          text: COMMIT_CUE[reason],
          severity: 'warn' as const,
        }))
      : []),
    ...windowMessages,
    ...p.blockers.map((blocker) => ({
      key: `blocker:${blocker}`,
      text: blockerText(blocker, p.maxAreaKm2, p.pointsNeeded, p.freezeGaps),
      severity: BLOCKER_SEVERITY[blocker],
    })),
    // The same sentence the N/A cells' hover text shows, from one constant,
    // so the panel and the table cannot describe one failure two ways.
    ...(p.wildfireCheckFailed && !p.loading
      ? [
          {
            key: 'fire:unavailable',
            text: FIRE_UNAVAILABLE_NOTE,
            severity: 'error' as const,
          },
        ]
      : []),
    // The refusal is an error like the area cap: a finished request, refused
    // for its size (TJ, 2026-08-22). It carries no `retry` — retrying a
    // deterministic refusal verbatim re-buys the same map query for the same
    // answer — and it never coexists with the run error above.
    ...(p.refusal && refusalKey && !p.loading
      ? [{ key: refusalKey, text: p.refusal.message, severity: 'error' as const }]
      : []),
    ...(aqiNoteActive
      ? [
          {
            key: AQI_NOTE_KEY,
            text: `${NOUN.aqi} data is not available for this forecast window.`,
            severity: 'warn' as const,
          },
        ]
      : []),
  ]
}
