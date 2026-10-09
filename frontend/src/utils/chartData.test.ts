import { describe, it, expect } from 'vitest'
import { DestinationResult, HourlySeries } from '../types'
import {
  CHART_METRICS,
  ChartLine,
  alignRowToGrid,
  axisTimeLabel,
  comparedLineLabel,
  modelNamed,
  modelSuffix,
  gridRemapper,
  nowWithinGrid,
  tracksCursor,
  buildChartData,
  candidateSetKey,
  chartKey,
  computeYDomain,
  debutRows,
  formatMetricValue,
  metricForSort,
  nearestKey,
  pixelToTime,
  pixelToValue,
  rowsBetween,
  selectionState,
  valueAt,
  gustLineKey,
  lineGroup,
  orderTooltipItems,
  seriesFieldFor,
  withGustLines,
  TOOLTIP_CHROME_PX,
  TOOLTIP_MAX_ROWS,
  TOOLTIP_MIN_ROWS,
  TOOLTIP_ROW_PX,
  tooltipCapacity,
} from './chartData'
import { RANKED_FAMILIES, RANKING_KEYS, familyOf } from '../metrics'
import { resultRow, series as seriesOf } from '../testSupport/fixtures'

function row(name: string, lat: number, over: Partial<HourlySeries>): DestinationResult {
  return resultRow({ name, latitude: lat, longitude: 0, series: seriesOf(over) })
}

describe('metricForSort', () => {
  it('maps each rankable sort key to its chart metric', () => {
    expect(metricForSort('precip_total_in')).toBe('precip')
    expect(metricForSort('temp_avg_f')).toBe('temp')
    expect(metricForSort('wind_avg_mph')).toBe('wind')
    expect(metricForSort('freeze_min_ft')).toBe('freeze')
    expect(metricForSort('aqi_avg')).toBe('aqi')
  })

  // EVERY rankable key, not one per family: since #291 a family has three or
  // four of them, and a lookup naming one each opened the precipitation chart
  // for the other two.
  it('answers with the key’s own family for every rankable key', () => {
    for (const key of RANKING_KEYS) {
      expect(metricForSort(key)).toBe(familyOf(key))
    }
  })

  // Snowfall is an hourly series like every other family (#678), so a
  // snowfall ranking opens the snowfall chart, where snow depth kept the one
  // on screen.
  it('follows a snowfall ranking onto the snowfall chart', () => {
    expect(metricForSort('snowfall_total_in')).toBe('snowfall')
    expect(metricForSort('snowfall_max_in_hr')).toBe('snowfall')
  })

  it('offers every metric family in the metric select', () => {
    expect(CHART_METRICS.map((m) => m.key).sort()).toEqual([...RANKED_FAMILIES].sort())
  })
})

function line(key: string, over: Partial<HourlySeries>): ChartLine {
  return { key, label: key, color: '#38bdf8', series: seriesOf(over) }
}

describe('valueAt / buildChartData', () => {
  const a = row('A', 1, { precip_in: [0.1, null, 0.3] })
  const b = row('B', 2, { precip_in: [0.2, 0.4, 0.6] })

  it('reads the metric value at an index, preserving nulls and bounds', () => {
    expect(valueAt(a, 'precip', 0)).toBe(0.1)
    expect(valueAt(a, 'precip', 1)).toBeNull()
    expect(valueAt(a, 'precip', 9)).toBeNull()
  })

  it('builds one point per timestamp keyed by line', () => {
    const data = buildChartData(
      [1000, 2000, 3000],
      [line(chartKey(a), a.series!), line(chartKey(b), b.series!)],
      'precip',
    )
    expect(data).toHaveLength(3)
    expect(data[0]).toEqual({ t: 1000, [chartKey(a)]: 0.1, [chartKey(b)]: 0.2 })
    expect(data[1][chartKey(a)]).toBeNull()
  })

  // A model's line and a destination's line share one chart when a comparison
  // is up (#232), and nothing downstream may tell them apart.
  it('plots a model line beside a destination line', () => {
    const data = buildChartData(
      [1000, 2000],
      [line(chartKey(a), a.series!), line('model:ecmwf_ifs025', { precip_in: [0.9, 0.8] })],
      'precip',
    )
    expect(data[0]).toEqual({ t: 1000, [chartKey(a)]: 0.1, 'model:ecmwf_ifs025': 0.9 })
  })
})

describe('gridRemapper', () => {
  it('re-indexes by timestamp and nulls hours the source lacks', () => {
    const remap = gridRemapper([2000, 3000], [1000, 2000, 3000])
    expect(remap([5, 7])).toEqual([null, 5, 7])
  })

  it('keeps the first position when a timestamp repeats', () => {
    const remap = gridRemapper([2000, 2000], [2000])
    expect(remap([1, 9])).toEqual([1])
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

describe('pixelToTime', () => {
  it('maps the plot left edge to tMin and the right edge to tMax', () => {
    expect(pixelToTime(52, 52, 292, 1000, 2000)).toBe(1000)
    expect(pixelToTime(344, 52, 292, 1000, 2000)).toBe(2000)
    expect(pixelToTime(198, 52, 292, 1000, 2000)).toBe(1500)
  })

  it('clamps a tap outside the plot area', () => {
    expect(pixelToTime(10, 52, 292, 1000, 2000)).toBe(1000)
    expect(pixelToTime(400, 52, 292, 1000, 2000)).toBe(2000)
  })

  it('answers tMin for a plot with no width', () => {
    expect(pixelToTime(100, 52, 0, 1000, 2000)).toBe(1000)
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
    // Inches an hour, so precipitation's rate digits (#678).
    expect(formatMetricValue(0.12345, 'snowfall')).toBe(formatMetricValue(0.12345, 'precip'))
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

describe('candidateSetKey', () => {
  const a = row('A', 1, {})
  const b = row('B', 2, {})
  const c = row('C', 3, {})

  // The whole point: a rebuilt array of the same destinations is the same
  // question, so the debut effect keyed on this string does not run again.
  it('is the same for a rebuilt array of the same destinations', () => {
    expect(candidateSetKey([a, b, c])).toBe(candidateSetKey([row('A', 1, {}), b, c]))
  })

  it('ignores order, so a live re-rank debuts nothing', () => {
    expect(candidateSetKey([c, a, b])).toBe(candidateSetKey([a, b, c]))
  })

  it('changes when a destination joins or leaves', () => {
    expect(candidateSetKey([a, b])).not.toBe(candidateSetKey([a, b, c]))
    expect(candidateSetKey([a, b])).not.toBe(candidateSetKey([a]))
  })

  it('is empty for no destinations', () => {
    expect(candidateSetKey([])).toBe('')
  })
})

describe('debutRows', () => {
  const a = row('A', 1, {})
  const b = row('B', 2, {})
  const c = row('C', 3, {})

  it('returns every destination the chart has never seen, in list order', () => {
    expect(debutRows([a, b, c], {}).map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  // colorByKey is the "ever charted" memory. A key in it has had its debut, so
  // a later report must not re-check a box the user deliberately unchecked.
  it('skips a destination that already owns a color', () => {
    expect(debutRows([a, b, c], { [chartKey(b)]: '#38bdf8' }).map((r) => r.name)).toEqual(['A', 'C'])
  })

  it('returns one row per coordinate key', () => {
    const twin = row('A again', 1, {})
    expect(debutRows([a, twin, b], {}).map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('is empty when every destination is already charted', () => {
    const charted = { [chartKey(a)]: '#38bdf8', [chartKey(b)]: '#f472b6' }
    expect(debutRows([a, b], charted)).toEqual([])
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

  it('carries wind bearings through the remap, and invents none', () => {
    // The chart does not plot bearings, but the forecast grid aligns its cells
    // through here (#246) and dropping the series would silently take that
    // layer's wind arrows with it. A row that never had them keeps no key, so
    // `['has','bearing']` still draws nothing rather than drawing north.
    const pin = {
      ...row('C', 3, { precip_in: [5, 6], wind_dir_deg: [90, 270] }),
      series_times: [2000, 3000],
    }
    expect(alignRowToGrid(pin, [1000, 2000, 3000]).series?.wind_dir_deg).toEqual([null, 90, 270])

    const bare = { ...row('D', 4, { precip_in: [5, 6] }), series_times: [2000, 3000] }
    expect(alignRowToGrid(bare, [1000, 2000, 3000]).series).not.toHaveProperty('wind_dir_deg')
  })

  // Every array the series carries has to be remapped, and the remap is an
  // object literal: a field left out of it is silently dropped rather than
  // misaligned, which on the chart reads as a metric with no data at all.
  it('remaps every series field onto the grid, not just the plotted three', () => {
    const pin = {
      ...row('E', 5, {
        precip_in: [5, 6],
        temp_f: [30, 31],
        wind_mph: [10, 11],
        freeze_ft: [9000, 9500],
        snowfall_in: [0.2, 0.4],
        wind_gust_mph: [18, 24],
        aqi: [40, 41],
      }),
      series_times: [2000, 3000],
    }
    const aligned = alignRowToGrid(pin, [1000, 2000, 3000]).series!

    expect(Object.keys(aligned).sort()).toEqual([
      'aqi',
      'freeze_ft',
      'precip_in',
      'snowfall_in',
      'temp_f',
      'wind_gust_mph',
      'wind_mph',
    ])
    for (const field of Object.keys(aligned) as (keyof typeof aligned)[]) {
      expect(aligned[field], `${field} was not remapped`).toHaveLength(3)
      expect(aligned[field]![0], `${field} filled its gap`).toBeNull()
    }
    expect(aligned.freeze_ft).toEqual([null, 9000, 9500])
  })

})

// The wind draws each line's gust beside it, dashed in the same colour (TJ,
// #584), and no other metric draws one.
describe('withGustLines', () => {
  const wind: ChartLine = {
    key: '1,0',
    label: 'Mount Baker',
    color: '#38bdf8',
    series: seriesOf({ wind_mph: [10, 12], wind_gust_mph: [18, 31] }),
  }
  const other: ChartLine = { ...wind, key: '2,0', label: 'Glacier Peak', color: '#f472b6' }

  it('pairs every wind line with a dashed gust in its colour, directly after it', () => {
    const lines = withGustLines([wind, other], 'wind')
    expect(lines.map((l) => [l.key, l.label, l.color, l.dashed ?? false])).toEqual([
      ['1,0', 'Mount Baker', '#38bdf8', false],
      ['1,0|gust', 'Mount Baker (gust)', '#38bdf8', true],
      ['2,0', 'Glacier Peak', '#f472b6', false],
      ['2,0|gust', 'Glacier Peak (gust)', '#f472b6', true],
    ])
    expect(lines.map(lineGroup)).toEqual(['1,0', '1,0', '2,0', '2,0'])
    expect(valueAt(lines[0], 'wind', 1)).toBe(12)
    expect(valueAt(lines[1], 'wind', 1)).toBe(31)
  })

  it('draws no gust under any other metric', () => {
    for (const metric of RANKED_FAMILIES.filter((f) => f !== 'wind')) {
      const lines = [wind, other]
      expect(withGustLines(lines, metric)).toBe(lines)
    }
  })

  // The y range covers the gust, which runs above the wind it rides on, or
  // the tallest dashed line would run off the top of the plot.
  it('stretches the y range to the strongest gust', () => {
    const [, top] = computeYDomain(withGustLines([wind], 'wind'), 'wind')
    expect(top).toBeGreaterThanOrEqual(31)
    expect(computeYDomain([wind], 'wind')[1]).toBeLessThan(31)
  })

  it('puts a gust in the chart data under its own key', () => {
    const data = buildChartData([0, 1], withGustLines([wind], 'wind'), 'wind')
    expect(data[1]).toEqual({ t: 1, '1,0': 12, [gustLineKey('1,0')]: 31 })
  })
})

describe('orderTooltipItems', () => {
  const line = (key: string, parentKey?: string): ChartLine => ({ key, label: key, color: '#000', parentKey })
  const item = (key: string, value: number, parentKey?: string) => ({ key, value, line: line(key, parentKey) })

  // The gust's row stands directly under its own wind line's, however the
  // rest are ordered, and the pair moves as one.
  it('lists each gust directly under its wind line', () => {
    const items = [item('a', 10), item('a|gust', 30, 'a'), item('b', 20), item('b|gust', 22, 'b')]
    expect(orderTooltipItems(items, null, null).map((i) => i.key)).toEqual(['b', 'b|gust', 'a', 'a|gust'])
    expect(orderTooltipItems(items, null, 11).map((i) => i.key)).toEqual(['a', 'a|gust', 'b', 'b|gust'])
    expect(orderTooltipItems(items, 'b', 11).map((i) => i.key)).toEqual(['b', 'b|gust', 'a', 'a|gust'])
  })

  it('orders plain lines by nearness as before', () => {
    const items = [item('a', 10), item('b', 20), item('c', 15)]
    expect(orderTooltipItems(items, null, 19).map((i) => i.key)).toEqual(['b', 'c', 'a'])
    expect(orderTooltipItems(items, 'a', 19).map((i) => i.key)).toEqual(['a', 'b', 'c'])
  })
})

describe('seriesFieldFor', () => {
  // Playback reads a gust ranking's hour off the gust's own series (#584).
  it('reads the gust off its own series and every other key off its family', () => {
    expect(seriesFieldFor('wind_gust_mph')).toBe('wind_gust_mph')
    expect(seriesFieldFor('wind_max_mph')).toBe('wind_mph')
    expect(seriesFieldFor('precip_total_in')).toBe('precip_in')
    expect(metricForSort('wind_gust_mph')).toBe('wind')
  })
})

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

describe('comparedLineLabel', () => {
  // Rank, destination, model. The #232 review's second finding was a key whose
  // entries read differently from each other — a destination on one line, a
  // model on the next — so this is the one spelling every entry takes.
  it('reads rank, destination, then model', () => {
    expect(comparedLineLabel(1, 'Mount Rainier', 'NOAA GFS')).toBe('1. Mount Rainier (NOAA GFS)')
  })

  // The ranking model's own lines take it too, which is what makes two entries
  // for one destination comparable at a glance.
  it('distinguishes two models at one destination', () => {
    expect(comparedLineLabel(1, 'Mount Rainier', 'ECMWF IFS')).toBe(
      '1. Mount Rainier (ECMWF IFS)',
    )
  })
})

describe('modelNamed', () => {
  // The legend chip's form: the hover box's name without the rank.
  it('reads destination, then model', () => {
    expect(modelNamed('Cathedral Peak', 'ECMWF IFS')).toBe('Cathedral Peak (ECMWF IFS)')
  })

  it('ends in the model suffix the legend chip draws apart', () => {
    expect(modelNamed('Cathedral Peak', 'ECMWF IFS')).toBe(`Cathedral Peak${modelSuffix('ECMWF IFS')}`)
  })

  // One spelling for both, so the chip and the hover box cannot drift apart.
  it('is the compared line label without its rank', () => {
    expect(comparedLineLabel(3, 'Cathedral Peak', 'ECMWF IFS')).toBe(
      `3. ${modelNamed('Cathedral Peak', 'ECMWF IFS')}`,
    )
  })
})
