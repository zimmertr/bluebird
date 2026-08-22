/**
 * Dismissal for the footer's event notices (#253).
 *
 * The panel footer draws two kinds of box. Derived warnings — the commit
 * cues, the Analyze blockers, the fire lines — state facts that are still
 * true, so they cannot be dismissed. Event notices — the error box and the
 * refusal box — report something that already happened, and once read they
 * only occupy space.
 *
 * The safety property is that a dismissal can never swallow a fresh message.
 * Two rules deliver it, and both fall out of one shape: the identity of a
 * dismissal is the message it dismissed, and `useAnalyze` clears both notice
 * states before every fetch, so content always moves key → null → key. A
 * different message has a different key and shows through a stale dismissal;
 * an identical message from the next Analyze passes through the null, which
 * spends the dismissal.
 */

/**
 * The identity of the visible event notice, or null when there is none.
 * Refusal wins, matching the render precedence: the error box only renders
 * when there is no refusal.
 */
export function eventNoticeKey(
  error: string | null,
  refusalMessage: string | null,
): string | null {
  if (refusalMessage !== null) return `refusal:${refusalMessage}`
  if (error !== null) return `error:${error}`
  return null
}

/**
 * What a standing dismissal becomes when the notice key changes. The moment
 * there is nothing to show is the moment every dismissal is spent: that is
 * the analyze-start clear, so the notice the run produces shows even when it
 * reads exactly like the one the reader dismissed.
 */
export function rearmDismissal(
  dismissedKey: string | null,
  currentKey: string | null,
): string | null {
  return currentKey === null ? null : dismissedKey
}

/** Whether the event notice should render: there is one, and it is not the one dismissed. */
export function eventNoticeVisible(
  currentKey: string | null,
  dismissedKey: string | null,
): boolean {
  return currentKey !== null && currentKey !== dismissedKey
}
