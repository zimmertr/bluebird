import { describe, it, expect } from 'vitest'
import { DestinationResult, HourlySeries } from '../types'
import {
  alignRowToGrid,
  buildChartData,
  chartKey,
  computeYDomain,
  formatMetricValue,
  metricForSort,
  nearestKey,
  pixelToValue,
  rowsBetween,
  selectionState,
  valueAt,
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
