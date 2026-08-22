/**
 * Dismissal for the footer notices (#253). Every notice under the Analyze
 * button is dismissable (TJ, 2026-08-22), and each dismisses alone.
 *
 * The identity a dismissal is keyed to differs by class, and the choice is
 * what keeps dismissal from being annoying or dangerous:
 *
 * - Event notices (the error box, the refusal box) key on their MESSAGE,
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

export type EventNoticeKind = 'error' | 'refusal'

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
