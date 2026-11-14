// The client pacer's countdown, in one module (#394).
//
// Three fetches draw on one weighted Open-Meteo budget — the ranked analysis,
// the forecast grid and the model comparison — so any of the three can be put
// to sleep by work another of them started. Each used to keep its own
// `paceEndMs`, which is exactly why the third one was silent: the countdown was
// something a caller had to remember to wire rather than something the pacer
// carried with it.
//
// The state is a DEADLINE rather than a remaining count. `fetchWeather` reports
// a duration once, at the moment it decides to sleep; everything after that is
// the clock's job, and a count stored in state would need a tick to stay true.

/**
 * Why a fetch is waiting: the shared budget refilling (`quota`), or Open-Meteo
 * not answering and the batch about to be asked again (`outage`, #849).
 */
export type PaceReason = 'quota' | 'outage'

/** What can happen to a wait. */
export type PaceAction =
  /** The pacer is about to sleep this long. */
  | { kind: 'pace'; seconds: number; nowMs: number; reason?: PaceReason }
  /**
   * Nothing is waiting any more: samples landed, the fetch finished, or it was
   * aborted. One action for all three, because the reader cannot tell them
   * apart and the countdown has to go in every case.
   */
  | { kind: 'clear' }

/**
 * The wait as a wall-clock deadline, or null when nothing is waiting.
 *
 * A second pace replaces the first rather than extending it: the pacer reports
 * the wait it is about to take, so the latest word is the true one. That is why
 * the state before the action is unread — both actions are absolute.
 */
export interface PaceState {
  endMs: number
  reason: PaceReason
}

export function paceReducer(_state: PaceState | null, action: PaceAction): PaceState | null {
  switch (action.kind) {
    case 'pace':
      return { endMs: action.nowMs + action.seconds * 1000, reason: action.reason ?? 'quota' }
    case 'clear':
      return null
  }
}

/**
 * Whole seconds until the pacer resumes, or null when nothing is waiting.
 *
 * A deadline already reached reads as null rather than 0, so every surface asks
 * one question ("is there a wait?") instead of two. The rounding is up, so a
 * wait that is nearly over still says one second rather than nothing.
 */
export function paceRemainingS(endMs: number | null, nowMs: number): number | null {
  if (endMs === null) return null
  const remaining = Math.ceil((endMs - nowMs) / 1000)
  return remaining > 0 ? remaining : null
}

/**
 * The wait as one line, or null when there is nothing to say.
 *
 * Named here rather than at each surface so the analysis overlay and the
 * comparison cannot describe one wait two ways. The map's grid legend spells
 * the same wait `Waiting · 45s` instead — it is a key's value beside a label,
 * and vertical space on the map is the scarcest thing the app has. The dot is
 * the legend's, chosen by the maintainer on 2026-10-21 with the overlay's
 * heading (analyzeOverlay.ts, record 0205): 208px at 12px in the overlay
 * card's 230px, where the sentence it replaced was 205px.
 */
export function paceWaitLine(remainingS: number | null, reason: PaceReason = 'quota'): string | null {
  if (remainingS === null || remainingS <= 0) return null
  // The outage line (TJ, 2026-11-13) names no quota: a host that hangs says
  // nothing about the budget, and blaming it would send the reader the wrong way.
  return reason === 'outage'
    ? `Open-Meteo is unavailable · retrying in ${remainingS}s`
    : `Open-Meteo quota · resuming in ${remainingS}s`
}
