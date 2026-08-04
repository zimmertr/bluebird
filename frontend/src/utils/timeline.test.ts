import { describe, expect, it } from 'vitest'
import {
  FRAME_MS,
  LAST_FRAME_DWELL_MS,
  availableAxes,
  clampIndex,
  followsNewestRadar,
  forecastDayLabel,
  forecastScaleMarks,
  forecastStampLabel,
  frameHoldMs,
  initialIndex,
  nextFrame,
  resolveAxis,
} from './timeline'

describe('availableAxes', () => {
  it('offers nothing when neither radar nor a multi-hour report exists', () => {
    expect(availableAxes(false, 0)).toEqual([])
  })

  it('offers radar on its own with no analysis at all', () => {
    expect(availableAxes(true, 0)).toEqual(['radar'])
  })

  it('refuses a forecast axis over a single instant', () => {
    // A Current analysis, or a day narrowed to one hour, has no span to play.
    expect(availableAxes(false, 1)).toEqual([])
    expect(availableAxes(false, 2)).toEqual(['forecast'])
  })

  it('offers both when both exist', () => {
    expect(availableAxes(true, 24)).toEqual(['radar', 'forecast'])
  })
})

describe('resolveAxis', () => {
  it('hides the bar when nothing spans time', () => {
    expect(resolveAxis([], null)).toBeNull()
    expect(resolveAxis([], 'radar')).toBeNull()
  })

  it('prefers the forecast once an analysis lands', () => {
    // Not a tie-break: the forecast is the question the analysis was run to
    // ask, and radar is context the reader switched on.
    expect(resolveAxis(['radar', 'forecast'], null)).toBe('forecast')
  })

  it('keeps the reader’s choice while it still exists', () => {
    expect(resolveAxis(['radar', 'forecast'], 'radar')).toBe('radar')
  })

  it('moves off an axis that has stopped existing', () => {
    expect(resolveAxis(['forecast'], 'radar')).toBe('forecast')
    expect(resolveAxis(['radar'], 'forecast')).toBe('radar')
  })
})

describe('the playhead', () => {
  it('wraps at the end of the loop', () => {
    expect(nextFrame(0, 12)).toBe(1)
    expect(nextFrame(11, 12)).toBe(0)
  })

  it('stays put on a one-frame axis rather than dividing by it', () => {
    expect(nextFrame(0, 1)).toBe(0)
    expect(nextFrame(0, 0)).toBe(0)
  })

  it('dwells on the last frame so the loop has a beginning', () => {
    expect(frameHoldMs(0, 12)).toBe(FRAME_MS)
    expect(frameHoldMs(10, 12)).toBe(FRAME_MS)
    expect(frameHoldMs(11, 12)).toBe(FRAME_MS + LAST_FRAME_DWELL_MS)
  })

  it('holds an index inside an axis that changed length under it', () => {
    expect(clampIndex(30, 12)).toBe(11)
    expect(clampIndex(-1, 12)).toBe(0)
    expect(clampIndex(3, 0)).toBe(0)
  })
})

describe('initialIndex', () => {
  it('opens radar on the present and the forecast on the window’s start', () => {
    // Opposite ends, same intent: the frame that answers "and now?" is the last
    // one on radar and the first one on a window the reader chose.
    expect(initialIndex('radar', 12)).toBe(11)
    expect(initialIndex('forecast', 72)).toBe(0)
  })

  it('survives an empty axis', () => {
    expect(initialIndex('radar', 0)).toBe(0)
  })
})

describe('followsNewestRadar', () => {
  it('is true only on the newest frame', () => {
    expect(followsNewestRadar(11, 12)).toBe(true)
    expect(followsNewestRadar(10, 12)).toBe(false)
  })
})

describe('forecast labels', () => {
  const noon = Date.parse('2026-08-08T12:00:00')

  it('states a scrub position as a weekday and an hour', () => {
    const label = forecastStampLabel(noon)
    expect(label).toMatch(/Sat/)
    expect(label).toMatch(/12/)
  })

  it('labels a scale mark with the day alone, since the readout carries the hour', () => {
    expect(forecastDayLabel(noon)).toMatch(/^Sat$/)
  })

  it('marks a long grid at its ends and its middle', () => {
    const times = Array.from({ length: 72 }, (_, i) => noon + i * 3_600_000)
    expect(forecastScaleMarks(times)).toHaveLength(3)
  })

  it('labels a short grid with what it has rather than padding it', () => {
    expect(forecastScaleMarks([noon, noon + 3_600_000])).toHaveLength(2)
    expect(forecastScaleMarks([])).toEqual([])
  })
})
