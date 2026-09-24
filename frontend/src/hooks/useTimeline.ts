import { useCallback, useEffect, useMemo, useState } from 'react'
import { RADAR_FRAME_COUNT, radarOffsetLabel, radarOffsets, radarScaleEnds } from '../utils/radar'
import {
  type TimelineAxis,
  availableAxes,
  clampIndex,
  forecastScaleMarks,
  forecastStampLabel,
  frameHoldMs,
  initialIndex,
  nearestIndex,
  nextFrame,
  playerAvailable,
  resolveAxis,
} from '../utils/timeline'

// The forecast axis before any report. Hoisted so the empty grid is one
// identity, which the memoized map and chart receive as `forecastTimes`:
// `?? []` hands a memoized child a new array on every render, which is enough
// to re-render it for a state change that has nothing to do with it (#337,
// finding 8).
const NO_TIMES: number[] = []

export interface TimelineInputs {
  /** The report's hourly grid, epoch ms, or undefined before a report. */
  times: number[] | undefined
  /** Moves once per committed report: the forecast playhead resets on it. */
  analysisSeq: number
  /** Whether the player is on the map (`useMapOverlays`). */
  playerShown: boolean
  /** Whether rain radar is on, which contributes the past axis. */
  showRadar: boolean
}

/**
 * The map timeline (#121): the bar that plays radar's last 55 minutes of
 * observed rain or the analyzed window's own hourly grid.
 *
 * Every reducer behind it is in `utils/timeline.ts`; this hook holds the state
 * and the interval. Each axis keeps its own playhead, so scrubbing radar back
 * half an hour and then switching to the forecast does not land the forecast
 * half an hour in. Playback is marker presentation and nothing else: which rows
 * show, how they rank and what the table says stay where the analysis left
 * them.
 */
export function useTimeline({ times, analysisSeq, playerShown, showRadar }: TimelineInputs) {
  const [chosenAxis, setChosenAxis] = useState<TimelineAxis | null>(null)
  const [radarIndex, setRadarIndex] = useState(() => initialIndex('radar', RADAR_FRAME_COUNT))
  const [forecastIndex, setForecastIndex] = useState(0)
  const [playing, setPlaying] = useState(false)

  // The report's own hourly grid, which is what the forecast axis plays.
  // Memoized for its IDENTITY rather than its cost: an empty fallback made
  // per render gave `movePlayheadTo` a new identity per render and re-rendered
  // the chart that holds it.
  const forecastTimes = useMemo(() => times ?? NO_TIMES, [times])
  const timelineAxes = availableAxes(playerShown, showRadar, forecastTimes.length)
  const timelineAxis = resolveAxis(timelineAxes, chosenAxis)
  // Whether the player has anything to play: radar contributes a past axis and
  // a multi-hour report a forecast one. With neither, the Layers row is not
  // offered at all. The reader's own `showPlayer` survives that, so turning
  // radar off and on again never turns the player back on.
  const playerOffered = playerAvailable(showRadar, forecastTimes.length)
  const frameCount = timelineAxis === 'radar' ? RADAR_FRAME_COUNT : forecastTimes.length
  const frameIndex = clampIndex(timelineAxis === 'radar' ? radarIndex : forecastIndex, frameCount)
  const setFrameIndex = timelineAxis === 'radar' ? setRadarIndex : setForecastIndex

  // A new report is a new grid, so the forecast playhead goes back to its
  // start. Keyed on the analysis rather than on the times array, which is a
  // new reference on every live knob change and would otherwise reset the
  // playhead under a reader who only re-sorted.
  useEffect(() => {
    setForecastIndex(initialIndex('forecast', 0))
  }, [analysisSeq])

  // Playback stops when the bar goes away, so switching an overlay off cannot
  // leave an interval running against an axis that no longer exists.
  useEffect(() => {
    if (timelineAxis === null) setPlaying(false)
  }, [timelineAxis])

  useEffect(() => {
    if (!playing || timelineAxis === null || frameCount < 2) return
    const id = setTimeout(
      () => setFrameIndex((i) => nextFrame(clampIndex(i, frameCount), frameCount)),
      frameHoldMs(frameIndex, frameCount),
    )
    return () => clearTimeout(id)
  }, [playing, timelineAxis, frameCount, frameIndex, setFrameIndex])

  // The hour the markers are colored for, or null to color them by the window
  // aggregate the ranking used.
  const playbackIndex = timelineAxis === 'forecast' ? clampIndex(forecastIndex, frameCount) : null

  // What the transport reads out, composed by whichever axis owns the
  // vocabulary: relative minutes for radar, a weekday and hour for the
  // forecast. The bar itself formats nothing.
  const timelineReadout =
    timelineAxis === 'radar'
      ? radarOffsetLabel(radarOffsets()[frameIndex] ?? 0)
      : forecastStampLabel(forecastTimes[frameIndex] ?? forecastTimes[0] ?? Date.now())
  const timelineScale =
    timelineAxis === 'radar' ? radarScaleEnds() : forecastScaleMarks(forecastTimes)

  // Clicking the chart moves the map's playhead to that hour, and takes the
  // transport to the forecast axis if it was showing radar: the reader just
  // pointed at a forecast hour, so leaving the bar on the past would answer a
  // question they did not ask.
  const movePlayheadTo = useCallback(
    (ms: number) => {
      const nearest = nearestIndex(forecastTimes, ms)
      if (nearest === null) return
      setForecastIndex(nearest)
      setChosenAxis('forecast')
    },
    [forecastTimes],
  )

  return {
    forecastTimes,
    timelineAxes,
    timelineAxis,
    setChosenAxis,
    playerOffered,
    radarIndex,
    frameIndex,
    frameCount,
    setFrameIndex,
    playing,
    setPlaying,
    playbackIndex,
    timelineReadout,
    timelineScale,
    movePlayheadTo,
  }
}
