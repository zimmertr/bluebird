import {
  type BandLimits,
  DAY_END,
  DAY_START,
  type ForecastSelection,
  classifyWindow,
  clampSelection,
  dayKey,
} from './calendar'

/** What a model change leaves the panel holding. */
export interface ModelChangePlan {
  /** The window after the change: restored, clamped, or the one it was. */
  selection: ForecastSelection
  /** Whether the change trimmed the window, which the clamp notice reports. */
  clamped: boolean
  /** The window a clamp took away, kept so a later model can give it back. */
  remember: ForecastSelection | null
}

/**
 * The window a model change leaves, given the band the NEW model draws.
 *
 * Every model change reconsiders the window, because the far edge moves with
 * it — by twelve days between ECMWF and HRRR. Clamping rather than refusing:
 * the alternative rejects the model over a window chosen before the user knew
 * the model bounded it, and leaves them to guess by how much to shorten it.
 *
 * A remembered pre-clamp window comes back the moment a model can serve it
 * whole (clampSelection returns null for "fits unchanged"). A clamp is the
 * picker editing the user's dates on its own authority; this is the undo
 * (#242 review).
 */
export function planModelChange(
  selection: ForecastSelection,
  remembered: ForecastSelection | null,
  nextBand: BandLimits,
  now: Date,
): ModelChangePlan {
  if (remembered && clampSelection(remembered, now, nextBand) === null) {
    return { selection: remembered, clamped: false, remember: null }
  }
  const clamped = clampSelection(selection, now, nextBand)
  if (clamped === null) return { selection, clamped: false, remember: remembered }
  // Remember the FIRST window in a clamp chain: stepping HRRR → ICON →
  // GFS should restore the range the user picked, not the wreckage of
  // the intermediate clamp.
  return { selection: clamped, clamped: true, remember: remembered ?? selection }
}

/**
 * The panel's window as epoch ms, for the display.
 *
 * A dateless Dates arm has no window (Analyze is blocked on it), but the
 * display still needs a shape — column regime, captions — so it borrows a
 * whole-day span. Never analyzed: handleAnalyze re-reads the selection and
 * refuses a null window.
 */
export function panelWindowMs(
  panelWindow: { start: string; end: string } | null,
  now: Date,
): { startMs: number; endMs: number } {
  if (panelWindow) return { startMs: Date.parse(panelWindow.start), endMs: Date.parse(panelWindow.end) }
  return {
    startMs: Date.parse(`${dayKey(now)}T${DAY_START}`),
    endMs: Date.parse(`${dayKey(now)}T${DAY_END}`),
  }
}

/**
 * Why the selection cannot be analyzed as it stands, or null.
 *
 * Warn when the selection falls outside Open-Meteo's servable range, or its
 * narrowed hours run backwards. Blocks Analyze (in ControlPanel): Open-Meteo
 * rejects out-of-range dates outright, so submitting would only produce an
 * upstream error. The calendar cannot pick an unservable day, so a horizon
 * warning now means a shared or hand-edited link brought one in.
 */
export function windowWarningFor(
  selection: ForecastSelection,
  panelWindow: { start: string; end: string } | null,
  now: Date,
  band: BandLimits,
) {
  const status = panelWindow
    ? classifyWindow(panelWindow.start, panelWindow.end, now, band)
    : // No dates picked yet: nothing to warn about, the dates blocker owns it.
      'ok'
  return selection.kind === 'now' || status === 'ok' ? null : status
}
