import { describe, expect, it } from 'vitest'
import demo from '../tour/demoScene.json'
import { resultRow } from '../testSupport/fixtures'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { buildScene, dayShift, type DemoCapture } from './tourScene'

const DAY = 86_400_000
const capture = demo as unknown as DemoCapture
const start = Date.parse(capture.request.start_datetime)

describe('dayShift', () => {
  it('moves the window to its next occurrence after now', () => {
    expect(dayShift(start, start - 1)).toBe(0)
    expect(dayShift(start, start)).toBe(1)
    expect(dayShift(start, start + 10 * DAY + 3_600_000)).toBe(11)
  })
})

describe('buildScene', () => {
  const now = start + 40 * DAY + 5 * 3_600_000
  const scene = buildScene(capture, now, FALLBACK_WINDOW_LIMITS)
  const moved = dayShift(start, now) * DAY

  it('starts the window within a day after now', () => {
    expect(scene.analyzed.window.startMs).toBeGreaterThan(now)
    expect(scene.analyzed.window.startMs - now).toBeLessThanOrEqual(DAY)
  })

  it('moves every stamp by the same whole days and no number at all', () => {
    expect(scene.analyzed.window.startMs).toBe(start + moved)
    expect(scene.times).toEqual((capture.response.times ?? []).map((t) => t + moved))
    expect(scene.response.times).toBe(scene.times)
    scene.universe.forEach((row, i) => {
      const { series_times: _, ...numbers } = row
      const { series_times: __, ...recorded } = capture.universe[i]
      expect(numbers).toEqual(recorded)
    })
  })

  // A 24-hour step keeps every hour at the same height of the sun, so across a
  // daylight saving change the UTC time of day holds and the local label moves.
  it('keeps the UTC time of day across any number of days', () => {
    for (const days of [1, 37, 180, 365]) {
      const later = buildScene(capture, start + days * DAY - 1, FALLBACK_WINDOW_LIMITS)
      expect(later.analyzed.window.startMs % DAY).toBe(start % DAY)
    }
  })

  it('shows the first rows of the field as the same objects, the way a commit does', () => {
    expect(scene.response.results.length).toBe(capture.request.limit)
    scene.response.results.forEach((row, i) => expect(row).toBe(scene.universe[i]))
  })

  it('snapshots a finished analysis with no comparison and every column fetched', () => {
    expect(scene.analyzed.kind).toBe('days')
    expect(scene.analyzed.windowSource).toBe('forecast')
    expect(scene.analyzed.compareModels).toEqual([])
    expect(scene.analyzed.cloudFetched).toBe(true)
    expect(scene.analyzed.snowAnalysisDate).not.toBe(capture.snowAnalysisDate)
  })

  it('selects the window as local days and hours', () => {
    expect(scene.selection.kind).toBe('days')
  })
})

// The demo is recorded, not built, so a column added to the report after the
// capture would be missing from every demo row and show as a dash only in the
// tutorial. `make capture-tour-demo` re-records it.
describe('demoScene.json', () => {
  it('carries every column a result row has', () => {
    const want = Object.keys(resultRow()).sort()
    for (const row of capture.universe) {
      const have = Object.keys(row).filter((k) => k !== 'series' && k !== 'series_times').sort()
      expect(have, row.name).toEqual(want.filter((k) => k !== 'series' && k !== 'series_times'))
    }
  })

  it('carries the hourly series the chart and the player read, the wind bearing included', () => {
    for (const row of capture.universe) {
      expect(row.series?.wind_dir_deg?.length, row.name).toBe(capture.response.times?.length)
    }
  })
})
