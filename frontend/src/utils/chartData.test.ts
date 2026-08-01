import { describe, it, expect } from 'vitest'
import { DestinationResult, HourlySeries } from '../types'
import {
  alignRowToGrid,
  axisTimeLabel,
  nowWithinGrid,
  tracksCursor,
  buildChartData,
  chartKey,
  computeYDomain,
  defaultChartRows,
  formatMetricValue,
  metricForSort,
  nearestKey,
  pixelToValue,
  rowsBetween,
  selectionState,
  valueAt,
  TOOLTIP_CHROME_PX,
  TOOLTIP_MAX_ROWS,
  TOOLTIP_MIN_ROWS,
  TOOLTIP_ROW_PX,
  tooltipCapacity,
} from './chartData'

function row(name: string, lat: number, series: Partial<HourlySeries>): DestinationResult {
  return {
    name,
    type: 'peak',
    latitude: lat,
    longitude: 0,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    aqi_avg: null,
    aqi_max: null,
    series: { precip_in: [], temp_f: [], wind_mph: [], aqi: [], ...series },
  }
}

describe('metricForSort', () => {
  it('maps each rankable sort key to its chart metric', () => {
    expect(metricForSort('precip_total_in')).toBe('precip')
    expect(metricForSort('temp_avg_f')).toBe('temp')
    expect(metricForSort('wind_avg_mph')).toBe('wind')
    expect(metricForSort('aqi_avg')).toBe('aqi')
  })
})

describe('valueAt / buildChartData', () => {
  const a = row('A', 1, { precip_in: [0.1, null, 0.3] })
  const b = row('B', 2, { precip_in: [0.2, 0.4, 0.6] })

  it('reads the metric value at an index, preserving nulls and bounds', () => {
    expect(valueAt(a, 'precip', 0)).toBe(0.1)
    expect(valueAt(a, 'precip', 1)).toBeNull()
    expect(valueAt(a, 'precip', 9)).toBeNull()
  })

  it('builds one point per timestamp keyed by destination', () => {
    const data = buildChartData([1000, 2000, 3000], [a, b], 'precip')
    expect(data).toHaveLength(3)
    expect(data[0]).toEqual({ t: 1000, [chartKey(a)]: 0.1, [chartKey(b)]: 0.2 })
    expect(data[1][chartKey(a)]).toBeNull()
  })
})

describe('computeYDomain', () => {
  it('floors magnitudes at zero and pads the top', () => {
    const [lo, hi] = computeYDomain([row('A', 1, { precip_in: [5, 7] })], 'precip')
    expect(lo).toBe(0)
    expect(hi).toBeGreaterThan(7)
  })

  it('lets temperature float to its own min', () => {
    const [lo] = computeYDomain([row('A', 1, { temp_f: [40, 55] })], 'temp')
    expect(lo).toBe(40)
  })

  it('gives a flat series a non-zero-height axis', () => {
    const [lo, hi] = computeYDomain([row('A', 1, { wind_mph: [3, 3] })], 'wind')
    expect(hi).toBeGreaterThan(lo)
  })

  it('falls back to a placeholder range when nothing has data', () => {
    expect(computeYDomain([], 'precip')).toEqual([0, 1])
  })
})

describe('pixelToValue', () => {
  it('maps the plot top to yMax and the bottom to yMin', () => {
    expect(pixelToValue(0, 0, 100, 0, 10)).toBe(10)
    expect(pixelToValue(100, 0, 100, 0, 10)).toBe(0)
    expect(pixelToValue(50, 0, 100, 0, 10)).toBe(5)
  })

  it('clamps a cursor outside the plot area', () => {
    expect(pixelToValue(-20, 0, 100, 0, 10)).toBe(10)
    expect(pixelToValue(200, 0, 100, 0, 10)).toBe(0)
  })
})

describe('nearestKey', () => {
  it('picks the line closest in value, skipping nulls', () => {
    expect(nearestKey({ a: 10, b: 2, c: null }, 3)).toBe('b')
  })

  it('is null when every line is null at that time', () => {
    expect(nearestKey({ a: null, b: null }, 3)).toBeNull()
  })
})

describe('formatMetricValue', () => {
  it('formats to each metric’s precision', () => {
    expect(formatMetricValue(0.12345, 'precip')).toBe('0.123')
    expect(formatMetricValue(52.34, 'temp')).toBe('52.3')
    expect(formatMetricValue(87.6, 'aqi')).toBe('88')
  })
})

describe('rowsBetween', () => {
  const a = row('A', 1, {})
  const b = row('B', 2, {})
  const c = row('C', 3, {})
  const d = row('D', 4, {})
  const ordered = [a, b, c, d]

  it('returns the inclusive range regardless of click direction', () => {
    expect(rowsBetween(ordered, chartKey(b), chartKey(d)).map((r) => r.name)).toEqual(['B', 'C', 'D'])
    expect(rowsBetween(ordered, chartKey(d), chartKey(b)).map((r) => r.name)).toEqual(['B', 'C', 'D'])
  })

  it('returns a single row when anchor equals target', () => {
    expect(rowsBetween(ordered, chartKey(c), chartKey(c)).map((r) => r.name)).toEqual(['C'])
  })

  it('is empty when a key is not in the list', () => {
    expect(rowsBetween(ordered, 'missing', chartKey(c))).toEqual([])
  })
})

describe('selectionState', () => {
  const a = row('A', 1, {})
  const b = row('B', 2, {})
  const c = row('C', 3, {})

  it('is "all" when every row is selected', () => {
    expect(selectionState([a, b, c], () => true)).toBe('all')
  })

  it('is "none" when no row is selected', () => {
    expect(selectionState([a, b, c], () => false)).toBe('none')
  })

  it('is "some" for a partial selection', () => {
    const on = new Set([chartKey(a)])
    expect(selectionState([a, b, c], (r) => on.has(chartKey(r)))).toBe('some')
  })

  it('treats an empty set as "none"', () => {
    expect(selectionState([], () => true)).toBe('none')
  })
})

describe('alignRowToGrid', () => {
  it('returns a ranked row (no series_times) unchanged', () => {
    const r = row('A', 1, { precip_in: [0.1, 0.2] })
    expect(alignRowToGrid(r, [1000, 2000])).toBe(r)
  })

  it('remaps a pinned row onto the grid by timestamp, gapping non-overlap', () => {
    const pin = { ...row('B', 2, { precip_in: [5, 6] }), series_times: [2000, 3000] }
    const aligned = alignRowToGrid(pin, [1000, 2000, 3000])
    expect(aligned.series?.precip_in).toEqual([null, 5, 6])
  })
})

describe('defaultChartRows', () => {
  const a = row('A', 1, {})
  const b = row('B', 2, {})
  const c = row('C', 3, {})
  const none: ReadonlySet<string> = new Set()

  it('selects every chartable row when nothing has been charted yet', () => {
    expect(defaultChartRows([a, b, c], none)?.map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('excludes rows without series data', () => {
    const bare = { ...row('D', 4, {}), series: undefined }
    expect(defaultChartRows([a, bare, c], none)?.map((r) => r.name)).toEqual(['A', 'C'])
  })

  // The bug this rule replaced: ticking Lakes alongside Peaks and re-analyzing
  // left every new lake off the chart, because a peak was still on it.
  it('charts rows the report just gained, even while others are charted', () => {
    expect(defaultChartRows([a, b, c], new Set([chartKey(b)]))?.map((r) => r.name)).toEqual([
      'A',
      'C',
    ])
  })

  // The other half, which the old rule got right and this must not lose: a box
  // you unticked names a row that HAS been charted, so it stays off.
  it('leaves a deliberately unchecked row alone', () => {
    const everCharted = new Set([chartKey(a), chartKey(b), chartKey(c)])
    expect(defaultChartRows([a, b, c], everCharted)).toBeNull()
  })

  it('is null when no row can chart', () => {
    const bare = { ...row('A', 1, {}), series: undefined }
    expect(defaultChartRows([bare], none)).toBeNull()
    expect(defaultChartRows([], none)).toBeNull()
  })
})

// A calendar makes a 16-day range two clicks, so the long-span axis went from a
// rare shape to an ordinary one (#166).
describe('axisTimeLabel', () => {
  const t = Date.parse('2026-07-21T15:00:00Z')
  const HOURS = 3_600_000

  it('names the weekday and the hour inside a two-day span', () => {
    expect(axisTimeLabel(t, 24 * HOURS)).not.toMatch(/Jul/)
    expect(axisTimeLabel(t, 24 * HOURS)).toMatch(/\d/)
  })

  it('swaps the weekday for the date once the span passes two days', () => {
    expect(axisTimeLabel(t, 16 * 24 * HOURS)).toContain('Jul')
    expect(axisTimeLabel(t, 72 * HOURS)).toContain('Jul')
  })

  // Recharts thins ticks by measuring the labels it is handed, so a date with no
  // hour lets a dozen identical strings all "fit" and the axis repeats one date
  // down its whole length.
  it('keeps an hour on the long form so no two ticks read the same', () => {
    const labels = [0, 6, 12].map((h) => axisTimeLabel(t + h * HOURS, 16 * 24 * HOURS))
    expect(new Set(labels).size).toBe(3)
  })

  it('holds the weekday form exactly at the threshold', () => {
    expect(axisTimeLabel(t, 48 * HOURS)).not.toMatch(/Jul/)
  })

  // A one-timestamp grid has no span, so it keeps the weekday-and-hour form —
  // which is what a single moment wants to be read as anyway.
  it('keeps the hour form for a point sample, which has no span', () => {
    expect(axisTimeLabel(t, 0)).not.toMatch(/Jul/)
  })
})

// The forecast endpoint serves history as well as forecast, so one window can
// hold both kinds of number and the chart has to say where the seam is.
describe('nowWithinGrid', () => {
  const HOUR = 3_600_000
  const t0 = Date.parse('2026-07-31T00:00:00Z')
  const grid = [t0, t0 + HOUR, t0 + 2 * HOUR, t0 + 3 * HOUR]

  it('reports the moment when the grid straddles it', () => {
    expect(nowWithinGrid(grid, t0 + 2 * HOUR)).toBe(t0 + 2 * HOUR)
  })

  it('includes both ends, where the seam is still on the chart', () => {
    expect(nowWithinGrid(grid, t0)).toBe(t0)
    expect(nowWithinGrid(grid, t0 + 3 * HOUR)).toBe(t0 + 3 * HOUR)
  })

  it('reports nothing for a window wholly on one side', () => {
    expect(nowWithinGrid(grid, t0 - HOUR)).toBeNull() // an all-forecast window
    expect(nowWithinGrid(grid, t0 + 4 * HOUR)).toBeNull() // an all-history window
  })

  // A line through the single dot of a point sample marks nothing.
  it('reports nothing for a one-stamp grid, or none at all', () => {
    expect(nowWithinGrid([t0], t0)).toBeNull()
    expect(nowWithinGrid([], t0)).toBeNull()
  })
})

// The cap exists because hovering rebuilds every line's path from every point, so
// the two variables multiply. Calibrated against the running app; the numbers
// below are the maintainer's own verdicts at the boundary.
describe('tracksCursor', () => {
  it('follows the cursor through the sizes that read as smooth', () => {
    expect(tracksCursor(624, 25)).toBe(true) // 15,600 points, satisfactory
    expect(tracksCursor(840, 25)).toBe(true) // 21,000, satisfactory
  })

  // The cap sits between the last count that read as satisfactory and the first
  // that read as degrading, so the degrading band is excluded rather than admitted.
  it('stops at the first size that read as degrading', () => {
    expect(tracksCursor(840, 25)).toBe(true) // 21,000, satisfactory
    expect(tracksCursor(1056, 25)).toBe(false) // 26,400, starting to degrade
    expect(tracksCursor(2208, 20)).toBe(false) // 44,160, the case needing a limit
  })

  // Shape independence, checked in the app at 19,200 points across three very
  // different shapes: the product is the variable, not either term on its own.
  it('judges by the product, not by lines or hours alone', () => {
    expect(tracksCursor(192, 100)).toBe(true) // 100 lines, 8 days
    expect(tracksCursor(384, 50)).toBe(true) // 50 lines, 16 days
    expect(tracksCursor(960, 20)).toBe(true) // 20 lines, 40 days
    // Many lines alone is fine, and many hours alone is fine; together they are not.
    expect(tracksCursor(24, 200)).toBe(true)
    expect(tracksCursor(2544, 5)).toBe(true)
    expect(tracksCursor(2544, 100)).toBe(false)
  })

  // Both edges of the cap, so a change to it has to be deliberate.
  it('admits exactly the budget and refuses one point past it', () => {
    expect(tracksCursor(25_000, 1)).toBe(true)
    expect(tracksCursor(25_001, 1)).toBe(false)
  })

  it('charges for hours rather than days, so a narrowed window buys back the emphasis', () => {
    // 30 whole days at 40 lines is over; the same days narrowed to 12 hours is not.
    expect(tracksCursor(30 * 24, 40)).toBe(false) // 28,800
    expect(tracksCursor(30 * 12, 40)).toBe(true) // 14,400
  })

  it('is unbothered by an empty chart', () => {
    expect(tracksCursor(0, 0)).toBe(true)
  })
})

// The hover card is drawn inside the plotting area, so a fixed eight rows
// overhung the results table once the chart panel was dragged toward its floor.
describe('tooltipCapacity', () => {
  it('lists the full set when the chart is tall', () => {
    expect(tooltipCapacity(600)).toBe(TOOLTIP_MAX_ROWS)
  })

  it('never lists more than is readable, however tall the chart', () => {
    expect(tooltipCapacity(5000)).toBe(TOOLTIP_MAX_ROWS)
  })

  it('sheds rows as the chart shrinks', () => {
    const tall = tooltipCapacity(400)
    const short = tooltipCapacity(160)
    expect(short).toBeLessThan(tall)
  })

  it('always leaves at least one row, so the card still says something', () => {
    expect(tooltipCapacity(0)).toBe(TOOLTIP_MIN_ROWS)
    expect(tooltipCapacity(-50)).toBe(TOOLTIP_MIN_ROWS)
  })

  // The property that matters: the card it describes fits the space given.
  it('never asks for more height than the plot area has', () => {
    for (const px of [80, 120, 160, 240, 320, 480]) {
      const rows = tooltipCapacity(px)
      const cardPx = rows * TOOLTIP_ROW_PX + TOOLTIP_CHROME_PX
      // One row is the floor and may legitimately overhang a very short panel;
      // above that the card must fit.
      if (rows > TOOLTIP_MIN_ROWS) expect(cardPx).toBeLessThanOrEqual(px)
    }
  })
})
