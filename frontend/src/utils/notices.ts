/**
 * Dismissal for the panel's messages (#253). Every message in the list the
 * Analyze button's badge opens is dismissable (TJ, 2026-08-22), and each
 * dismisses alone — the boxes group by severity, never by dismissal. The one
 * class that is not is a blocker (#786; record 0208): it is the field's own
 * state, standing inline beside the field until the reader supplies what it
 * asks, and a dismissed blocker would leave a greyed button with nothing to
 * say for itself.
 *
 * The identity a dismissal is keyed to differs by class, and the choice is
 * what keeps dismissal from being annoying or dangerous:
 *
 * - Event notices (the run error, the refusal) key on their MESSAGE,
 *   because each new message is a new fact the reader has not seen.
 * - Derived warnings (commit cues, Analyze blockers, the fire line, the AQI
 *   line) key on their CONDITION (`blocker:polygon`, `cue:window-changed`),
 *   not their text — the polygon blocker counts down as you draw, and keyed
 *   by text it would be a new line on every click.
 *
 * The two classes are dismissed differently too (#736). An event notice is
 * one run's outcome, held as state, so dismissing it clears that state
 * (`useAnalysisRun.dismissEvent`): the line goes, the Analyze button stops
 * reading `Try again`, and the next run sets the event afresh if it fails
 * the same way. A derived line has no state to clear, so its dismissal is a
 * ledger entry keyed on its condition.
 *
 * The safety property is that a dismissal can never swallow a fresh notice,
 * and the annoyance property is that nothing resurfaces because the user
 * merely touched the UI. Both come from one rule: a ledger entry lives
 * exactly as long as its key is continuously active, and is pruned the
 * moment the key goes inactive. Panning, sorting and knob twiddling change
 * no key, so they resurface nothing; a condition that clears and later
 * re-triggers shows again.
 */

import type { AnalyzeBlocker } from './analyzeGate'

export type EventNoticeKind = 'error' | 'refusal'

/**
 * The three severities, one box each in the list, and what each hue answers
 * (TJ, 2026-08-22):
 *
 * - `error`: the app cannot or will not do what was asked — a failed run, an
 *   oversized polygon, an over-cap refusal, a data supplier that is
 *   unreachable.
 * - `warn`: the report on screen no longer answers what the panel asks —
 *   every commit cue (a changed window, model, band, ring, type set, or an
 *   un-analyzed addition; all one severity, TJ 2026-08-22), and a column
 *   that came back empty.
 * - `info`: nothing is wrong; the request is not finished yet.
 */
export type NoticeSeverity = 'error' | 'warn' | 'info'

/**
 * The severities worst first: the order the list's boxes stand in, and the
 * order the badge on the Analyze button picks its colour by (record 0208), so
 * a late-arriving error can neither stand below the info line it outranks nor
 * leave the badge reading blue.
 */
export const SEVERITY_ORDER: readonly NoticeSeverity[] = ['error', 'warn', 'info']

/** One message bound for the list: identity, text, and which box. */
export interface FooterMessage {
  key: string
  text: string
  severity: NoticeSeverity
}

/**
 * The worst severity among the messages current, or null with none: what
 * colours the badge on the Analyze button, and the one summary the button
 * carries of a list it has not opened.
 */
export function worstSeverity(messages: readonly FooterMessage[]): NoticeSeverity | null {
  return SEVERITY_ORDER.find((severity) => messages.some((m) => m.severity === severity)) ?? null
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
  // Warn, not info: these two report a contradiction in settings the reader
  // has already made, where every info line above reports an input they have
  // yet to give. Nothing is unfinished — the models picked and the metric
  // ranked cannot both be had (TJ, 2026-09-14).
  'compare-aqi': 'warn',
  'compare-freeze': 'warn',
  destinations: 'info',
  polygon: 'info',
  types: 'info',
}


/**
 * Assemble the list's boxes: at most three, always in error, warning, info
 * order (`SEVERITY_ORDER`). Within a box, messages keep the caller's order.
 * An empty box is not rendered, so this returns only the boxes that have
 * something to say.
 */
export function noticeBoxes(
  messages: readonly FooterMessage[],
): { severity: NoticeSeverity; messages: FooterMessage[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    messages: messages.filter((m) => m.severity === severity),
  })).filter((box) => box.messages.length > 0)
}

/** The identity of one event notice: what was said, and which box said it. */
export function noticeKey(kind: EventNoticeKind, message: string): string {
  return `${kind}:${message}`
}

/**
 * Which event a key names, or null for a derived line's key. The list reads
 * it to decide how a dismissal lands: an event's clears its state, a derived
 * line's joins the ledger.
 */
export function eventKindOf(key: string): EventNoticeKind | null {
  if (key.startsWith('error:')) return 'error'
  if (key.startsWith('refusal:')) return 'refusal'
  return null
}

/** The key every blocker's line carries: its condition, as `panelMessages` spells it. */
export function blockerKey(blocker: AnalyzeBlocker): string {
  return `blocker:${blocker}`
}

/**
 * Which blocker a key names, or null for any other line. A blocker's line
 * stands inline beside its field as well as in the list (record 0208), and
 * is the one kind of line a dismissal passes over.
 */
export function blockerOf(key: string): AnalyzeBlocker | null {
  if (!key.startsWith('blocker:')) return null
  const blocker = key.slice('blocker:'.length)
  return blocker in BLOCKER_SEVERITY ? (blocker as AnalyzeBlocker) : null
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

/**
 * A list of names as English reads it: one alone, two joined by `and`, more by
 * commas with `and` before the last.
 *
 * Here rather than in `metrics.ts` because what it joins is model labels, which
 * are the server's strings rather than the metric vocabulary's. Here rather
 * than in the panel for the reason every derivation is: Vitest runs this repo
 * in the node environment, so a helper left inside a component is untestable by
 * construction.
 */
export function listPhrase(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
