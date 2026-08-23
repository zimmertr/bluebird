/**
 * The map timeline: which axis it plays, where the playhead is, and how long
 * each frame is held.
 *
 * All of it pure, for the reason `calendar.ts` is: Vitest here has no DOM, so
 * anything left inside the component is untestable by construction. The
 * component is wiring — a button, a range input, and a `setInterval`.
 *
 * ## Two axes, one transport
 *
 * Two different things in this app span time, and neither is a special case of
 * the other:
 *
 * - **Radar** is the last 50 minutes of observed rain, in 6 fixed frames. It
 *   exists whenever the layer is on, analysis or no analysis. The count and the
 *   span are `radar.ts`'s to state, and the reason they are 6 and 50 rather
 *   than the product's own 5-minute cadence is documented there.
 * - **Forecast** is the analyzed window's own hourly grid, and every
 *   destination already holds a value at every hour of it. It exists whenever a
 *   report covers more than one hour.
 *
 * They share a bar because they answer the same gesture — drag time, watch the
 * map change — and because two bars would compete for the same corner of the
 * map. What they do not share is a playhead: scrubbing radar back an hour and
 * then switching to the forecast should not land the forecast an hour into
 * itself. Each axis keeps its own index, and switching restores where you left
 * that axis.
 *
 * ## Why the forecast defaults to selected
 *
 * Once an analysis lands, the forecast is what the visitor came for; radar is
 * context they turned on. So the axis switch defaults to Forecast when both are
 * available, and only ever moves on its own when the axis it is sitting on
 * stops existing.
 */

export type TimelineAxis = 'radar' | 'forecast'

/**
 * How long each frame is held during playback, and the extra dwell on the last
 * one.
 *
 * 500 ms is the pace every radar loop on the internet plays at, and it is not
 * an arbitrary convention: below about 300 ms a moving storm reads as flicker
 * rather than motion, and above about 700 ms the eye loses the connection
 * between consecutive frames. Borrowed rather than tuned.
 *
 * The dwell exists because a loop with no pause has no beginning: the newest
 * frame is the answer to "what is happening now", and without a beat on it the
 * loop is a smear you have to watch twice. 1.5 s is about three ordinary
 * frames, which is long enough to read the newest picture and short enough not
 * to feel stalled.
 *
 * Both apply to the forecast axis too, where the same argument holds with the
 * last hour of the window standing in for "now".
 */
export const FRAME_MS = 500
export const LAST_FRAME_DWELL_MS = 1_500

/** How long the playhead rests on `index` of `count` frames. */
export function frameHoldMs(index: number, count: number): number {
  return index >= count - 1 ? FRAME_MS + LAST_FRAME_DWELL_MS : FRAME_MS
}

/** The next frame, wrapping to the start. A one-frame axis stays put. */
export function nextFrame(index: number, count: number): number {
  if (count <= 1) return 0
  return (index + 1) % count
}

/** Hold an index inside an axis that may have changed length under it. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, index))
}

/**
 * Which axes the transport can offer right now.
 *
 * `forecastStamps` is how many hourly stamps the displayed report covers. Two
 * is the floor and it is a real one rather than a guard: a Current analysis, or
 * a day narrowed to a single hour, is one instant, and a transport over one
 * instant is a control with nowhere to go.
 */
export function availableAxes(radarOn: boolean, forecastStamps: number): TimelineAxis[] {
  const axes: TimelineAxis[] = []
  if (radarOn) axes.push('radar')
  if (forecastStamps >= 2) axes.push('forecast')
  return axes
}

/**
 * The axis to show, given what is available and what was last chosen.
 *
 * Returns null when nothing spans time, which is what hides the bar entirely.
 *
 * The rule is "keep the reader's choice while it still exists, otherwise prefer
 * the forecast". Preferring the forecast is not a tie-break: it is the answer
 * to the question the analysis was run to ask, where radar is context the
 * reader switched on. That also makes an analysis landing while radar is
 * playing a move to the new thing rather than a silent stay on the old one.
 */
export function resolveAxis(
  available: TimelineAxis[],
  chosen: TimelineAxis | null,
): TimelineAxis | null {
  if (available.length === 0) return null
  if (chosen !== null && available.includes(chosen)) return chosen
  return available.includes('forecast') ? 'forecast' : available[0]
}

/**
 * Where a newly available axis starts.
 *
 * Both start at the end, and for the same reason from opposite directions:
 * radar's last frame is the present, and the forecast's grid begins at the
 * window the reader chose — so the frame that answers "and now?" is the last
 * one on radar and the first one on the forecast.
 */
export function initialIndex(axis: TimelineAxis, count: number): number {
  return axis === 'radar' ? Math.max(0, count - 1) : 0
}

/**
 * Does a paused playhead follow the newest radar frame as the window slides?
 *
 * Radar's frames are offsets from *now*, so every five minutes the whole set
 * shifts and each frame becomes five minutes older. A playhead parked on the
 * newest frame should stay on the newest frame — that is what "I am watching
 * the current radar" means. A playhead the reader scrubbed back to should stay
 * on the picture they scrubbed to, which as the window slides means it does not
 * move on the index axis either; it simply ages out of the loop eventually.
 *
 * Both cases are therefore "leave the index alone", which is exactly why this
 * is written down: the index is the same, the *meaning* is not, and it is worth
 * being explicit that the newest frame is index `count - 1` in both.
 */
export function followsNewestRadar(index: number, count: number): boolean {
  return index >= count - 1
}

/**
 * The label a scrub position reads as on the forecast axis.
 *
 * Weekday plus hour, matching the chart's own short-span axis ticks, so the
 * playhead line drawn on the chart and the readout above the map are the same
 * moment stated the same way. A long window does not switch to dates the way
 * the chart's axis does: the chart has to fit a dozen ticks side by side and
 * this is one label at a time, and the weekday is the part a person reads when
 * asking "which afternoon".
 */
export function forecastStampLabel(ms: number): string {
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric' })
}

/**
 * Up to three evenly spaced marks under the forecast scrubber.
 *
 * Three because the track is about 200px on a phone and two labels at its ends
 * plus one in the middle is what fits; fewer says less than the ends already
 * do, and more overlaps. A grid shorter than three stamps just labels what it
 * has.
 */
export function forecastScaleMarks(times: number[]): string[] {
  if (times.length === 0) return []
  if (times.length <= 3) return times.map(forecastDayLabel)
  return [0, Math.floor((times.length - 1) / 2), times.length - 1].map((i) =>
    forecastDayLabel(times[i]),
  )
}

/** A scale mark: the day alone, since the readout above carries the hour. */
export function forecastDayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short' })
}
