/**
 * Dismissal for the footer notices (#253). Every message under the Analyze
 * button is dismissable (TJ, 2026-08-22), and each dismisses alone — the
 * boxes group by severity, never by dismissal.
 *
 * The identity a dismissal is keyed to differs by class, and the choice is
 * what keeps dismissal from being annoying or dangerous:
 *
 * - Event notices (the run error, the refusal) key on their MESSAGE,
 *   because each new message is a new fact the reader has not seen.
 * - Derived warnings (commit cues, Analyze blockers, the fire line, the AQI
 *   line) key on their CONDITION (`blocker:polygon`, `cue:window-changed`),
 *   not their text — the polygon blocker counts down as you draw, and keyed
 *   by text it would resurface on every click.
 *
 * The safety property is that a dismissal can never swallow a fresh notice,
 * and the annoyance property is that nothing resurfaces because the user
 * merely touched the UI. Both come from one rule: a dismissal lives exactly
 * as long as its key is continuously active, and is pruned the moment the
 * key goes inactive. Panning, sorting and knob twiddling change no key, so
 * they resurface nothing; a condition that clears and later re-triggers
 * shows again; `useAnalyze` nulls both event states before every fetch, so
 * an identical error from the next Analyze shows again.
 */

import type { AnalyzeBlocker } from './analyzeGate'
import type { CommitReason } from './present'

export type EventNoticeKind = 'error' | 'refusal'

/**
 * The three footer boxes, one per severity, and what each hue answers
 * (TJ, 2026-08-22):
 *
 * - `error`: the app cannot or will not do what was asked — a failed run, an
 *   oversized polygon, an over-cap refusal, a data supplier that is
 *   unreachable.
 * - `warn`: the work stands but is degraded or stale — a report that needs a
 *   new analysis, a column that came back empty.
 * - `info`: nothing is wrong; the request is not finished yet.
 */
export type NoticeSeverity = 'error' | 'warn' | 'info'

/** One message bound for a footer box: identity, text, and which box. */
export interface FooterMessage {
  key: string
  text: string
  severity: NoticeSeverity
  /**
   * A failed run that "Try again" can re-run. The error box shows its retry
   * button only when one of these is present: a state problem alone (an
   * oversized polygon) cannot be retried into working.
   */
  retry?: boolean
}

/**
 * Which box each Analyze blocker speaks from. Not one box for all six: an
 * oversized polygon rejects finished work where every other blocker reports
 * an input that is not finished yet, and coloring them all amber flattened
 * that difference (TJ, 2026-08-22). A drawing mid-stroke is one of the
 * unfinished inputs, not a warning: nothing is wrong, the request is not
 * complete.
 */
export const BLOCKER_SEVERITY: Record<AnalyzeBlocker, NoticeSeverity> = {
  area: 'error',
  window: 'info',
  dates: 'info',
  destinations: 'info',
  polygon: 'info',
  types: 'info',
}

/**
 * Which box each commit cue speaks from. Three of the four report a held
 * report gone stale — every number came from a window, model or band the
 * panel no longer names — which is warn's definition. `destination-added` is
 * the odd one out (TJ, 2026-08-22): the held rows are still right, the new
 * destination is simply not analyzed yet, which is info's definition — the
 * request is not finished.
 */
export const CUE_SEVERITY: Record<CommitReason, NoticeSeverity> = {
  'model-changed': 'warn',
  'window-changed': 'warn',
  'elevation-widened': 'warn',
  'destination-added': 'info',
}

/**
 * Assemble the footer's boxes: at most three, always in error, warning, info
 * order — the fixed order is what keeps a late-arriving error from appearing
 * below the info line it outranks. Within a box, messages keep the caller's
 * order. An empty box is not rendered, so this returns only the boxes that
 * have something to say.
 */
export function noticeBoxes(
  messages: readonly FooterMessage[],
): { severity: NoticeSeverity; messages: FooterMessage[] }[] {
  return (['error', 'warn', 'info'] as const)
    .map((severity) => ({
      severity,
      messages: messages.filter((m) => m.severity === severity),
    }))
    .filter((box) => box.messages.length > 0)
}

/** The identity of one event notice: what was said, and which box said it. */
export function noticeKey(kind: EventNoticeKind, message: string): string {
  return `${kind}:${message}`
}

/**
 * Drop every dismissal whose notice is no longer active. Returns the input
 * array unchanged (same reference) when nothing was pruned, so state setters
 * can skip a no-op update.
 */
export function pruneDismissals(
  dismissed: readonly string[],
  activeKeys: readonly (string | null)[],
): readonly string[] {
  const kept = dismissed.filter((key) => activeKeys.includes(key))
  return kept.length === dismissed.length ? dismissed : kept
}

/** Whether this notice's box should stay hidden. */
export function isDismissed(key: string, dismissed: readonly string[]): boolean {
  return dismissed.includes(key)
}
