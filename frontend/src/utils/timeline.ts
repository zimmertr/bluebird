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
 * - **Radar** is the last 50 minutes of observed rain, in six fixed frames. It
 *   exists whenever the layer is on, analysis or no analysis.
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
 * Does anything span time right now, whatever the player's own switch says?
 *
 * This is what decides whether the player EXISTS, where `availableAxes` below
 * decides whether it is shown. The two are different questions: a checkbox
 * offering to switch on a bar with nothing in it is a control the reader has to
 * try in order to learn it is empty, so the row leaves the Layers popover
 * entirely while this is false. The switch's own value is untouched by that —
 * a reader who turned the player off does not find it back on after a radar
 * toggle.
 *
 * `forecastStamps` is how many hourly stamps the displayed report covers. Two
 * is the floor and it is a real one rather than a guard: a Current analysis, or
 * a day narrowed to a single hour, is one instant, and a transport over one
 * instant is a control with nowhere to go.
 */
export function playerAvailable(radarOn: boolean, forecastStamps: number): boolean {
  return radarOn || forecastStamps >= 2
}

/**
 * Which axes the transport can offer right now.
 *
 * `playerShown` is the Layers popover's own switch, and it answers first: the
 * player is a band across the bottom of the map, which on a phone is a third of
 * what there is to look at, so it is switched off there by default. Switched
 * off, nothing spans time as far as the map is concerned — no bar, no playhead,
 * and the markers keep the window aggregate colour they rank by. It is still an
 * overlay switch rather than a knob: it changes what is looked at, never what
 * was asked for, so no ranking and no fetch follows it.
 */
export function availableAxes(
  playerShown: boolean,
  radarOn: boolean,
  forecastStamps: number,
): TimelineAxis[] {
  if (!playerShown || !playerAvailable(radarOn, forecastStamps)) return []
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
 * The hourly stamp nearest an instant, or null on an empty grid.
 *
 * The nearest rather than an exact match, because a chart hands back the x
 * value under the pointer, which on a wide chart is an interpolated instant
 * between two hourly points. The earlier stamp wins a tie.
 */
export function nearestIndex(times: readonly number[], ms: number): number | null {
  if (times.length === 0) return null
  let nearest = 0
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i] - ms) < Math.abs(times[nearest] - ms)) nearest = i
  }
  return nearest
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
 * One mark under a scrubber: its words, and where along the track it stands,
 * from 0 (the first frame) to 1 (the last).
 */
export interface ScaleMark {
  label: string
  at: number
}

/**
 * The marks under the forecast scrubber: one on each local day's first hour,
 * at the position that hour has on the track, at most three (#687).
 *
 * They were three evenly spaced indices, and the middle one was whatever hour
 * fell halfway: on a two-day window that is 11 PM on the first day, so the
 * marks read Wed, Wed, Thu. A mark on the day's first hour names the day the
 * track is entering there, so every mark is true where it stands.
 *
 * The first hour rather than midnight itself, because the grid is hourly in
 * UTC and a zone half an hour off UTC never has a stamp at midnight. A window
 * that starts mid-day gets no mark at its start: the readout above already
 * names the hour the playhead is on, and the first mark then stands where the
 * next day begins. One that never crosses a day is labelled at its start, so
 * the scale is never empty. More than three days keep the first, the middle
 * and the last, because the track is about 200px on a phone and a mark per day
 * of sixteen overlaps.
 *
 * A window whose marks run a week or more apart names its days by date rather
 * than by weekday: the first, middle and last of sixteen days are a week
 * apart, and Wed, Wed, Thu at true positions would read as the same mistake.
 */
export function forecastScaleMarks(times: readonly number[]): ScaleMark[] {
  if (times.length === 0) return []
  const last = times.length - 1
  const at = (i: number) => (last === 0 ? 0 : i / last)
  const dayOf = (ms: number) => new Date(ms).toDateString()
  const starts = times.flatMap((ms, i) =>
    (i === 0 ? new Date(ms).getHours() === 0 : dayOf(ms) !== dayOf(times[i - 1])) ? [i] : [],
  )
  if (starts.length === 0) return [{ label: forecastDayLabel(times[0]), at: 0 }]
  const picked =
    starts.length <= 3
      ? starts
      : [starts[0], starts[Math.floor((starts.length - 1) / 2)], starts[starts.length - 1]]
  const spansAWeek = times[picked[picked.length - 1]] - times[picked[0]] >= WEEK_MS
  const label = spansAWeek ? forecastDateLabel : forecastDayLabel
  return picked.map((i) => ({ label: label(times[i]), at: at(i) }))
}

const WEEK_MS = 7 * 24 * 3_600_000

/** A scale mark: the day alone, since the readout above carries the hour. */
export function forecastDayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short' })
}

/** A scale mark a week or more from its neighbour: the date, which a weekday cannot tell apart. */
export function forecastDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** The radar axis's two ends, at the two ends of the track. */
export function endMarks([oldest, newest]: readonly [string, string]): ScaleMark[] {
  return [
    { label: oldest, at: 0 },
    { label: newest, at: 1 },
  ]
}

/**
 * The scrubber's thumb width, which `SCRUBBER` in `styles.ts` draws at
 * `w-3.5`; `styles.test.ts` holds the two to one number.
 */
export const SCRUBBER_THUMB_PX = 14

/**
 * Where a mark stands, as the two CSS values the scale row places it with.
 *
 * Over the thumb's centre at that frame: a range input's thumb travels from
 * half its width in from one end to half its width in from the other, so a
 * mark at a frame's fraction of the bare track would drift up to 7px off the
 * thumb sitting on that frame. A mark at either end is aligned to the track's
 * own edge instead of centred, so the first and last labels stay inside it.
 */
export function markPlacement(at: number, thumbPx: number): { marginLeft: string; transform: string } {
  if (at <= 0) return { marginLeft: '0px', transform: 'none' }
  if (at >= 1) return { marginLeft: '100%', transform: 'translateX(-100%)' }
  return {
    marginLeft: `calc(${thumbPx / 2}px + (100% - ${thumbPx}px) * ${at})`,
    transform: 'translateX(-50%)',
  }
}
