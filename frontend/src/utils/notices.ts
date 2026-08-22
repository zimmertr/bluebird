/**
 * Dismissal for the footer's event notices (#253).
 *
 * The panel footer draws two kinds of box. Derived warnings — the commit
 * cues, the Analyze blockers, the fire lines — state facts that are still
 * true, so they cannot be dismissed. Event notices — the error box and the
 * refusal box — report something that already happened, and once read they
 * only occupy space.
 *
 * Dismissal is tracked per notice, keyed by kind and message, so each box
 * dismisses itself alone. Today the two event notices are also mutually
 * exclusive by construction — one analysis produces one outcome, and the
 * error box renders only when there is no refusal — but nothing here relies
 * on that, so a third event notice would inherit individual dismissal
 * without a new decision.
 *
 * The safety property is that a dismissal can never swallow a fresh message.
 * A dismissal lives exactly as long as the notice it dismissed: when that
 * notice's key stops being active it is pruned. `useAnalyze` clears both
 * notice states before every fetch, so a re-run always passes through a
 * no-keys moment — which is why an identical message from the next Analyze
 * shows again — and a different message was never dismissed in the first
 * place.
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
