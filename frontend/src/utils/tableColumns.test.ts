import { describe, it, expect } from 'vitest'
import { COLUMNS, displayedColumns, pointModeColumns, orderColumns } from './tableColumns'
import { SEP } from '../metrics'
import { SortBy } from '../types'

// The real column set, not a copy of its keys. The list used to be declared in
// ResultsTable and restated here, which meant this suite could pass against a
// table that had gained or lost a column. It is a module export now (the CSV
// export writes the same columns), so the fixture can be the thing itself.
const KEYS = COLUMNS.map((c) => c.key)

const keys = (sortBy: SortBy) => orderColumns(COLUMNS, sortBy).map((c) => c.key)

const METRICS: SortBy[] = ['precip_total_in', 'wind_avg_mph', 'temp_avg_f', 'aqi_avg']

describe('COLUMNS', () => {
  it('leads with the identity columns and names every one of them', () => {
    expect(KEYS.slice(0, 2)).toEqual(['name', 'elevation_ft'])
    for (const col of COLUMNS) expect(col.label).not.toBe('')
  })

  // Only where a display formatter would be unparseable: the grouped elevation
  // is the case, and adding another means a file cell changed shape.
  it('overrides the display formatter for exactly the columns that need it', () => {
    expect(COLUMNS.filter((c) => c.csv).map((c) => c.key)).toEqual(['elevation_ft'])
  })
})

describe('orderColumns', () => {
  it('keeps the canonical order when ranking by precipitation (already first)', () => {
    expect(keys('precip_total_in')).toEqual(KEYS)
  })

  it('moves the AQI pair right after the identity columns when ranking by AQI', () => {
    expect(keys('aqi_avg')).toEqual([
      'name',
      'elevation_ft',
      'aqi_avg',
      'aqi_max',
      'precip_total_in',
      'precip_avg_in_hr',
      'precip_max_in_hr',
      'temp_min_f',
      'temp_max_f',
      'temp_avg_f',
      'wind_min_mph',
      'wind_max_mph',
      'wind_avg_mph',
    ])
  })

  it('moves the temperature trio up, other groups keeping their relative order', () => {
    expect(keys('temp_avg_f')).toEqual([
      'name',
      'elevation_ft',
      'temp_min_f',
      'temp_max_f',
      'temp_avg_f',
      'precip_total_in',
      'precip_avg_in_hr',
      'precip_max_in_hr',
      'wind_min_mph',
      'wind_max_mph',
      'wind_avg_mph',
      'aqi_avg',
      'aqi_max',
    ])
  })

  it('always leads with the identity columns, for every metric', () => {
    for (const m of METRICS) {
      expect(keys(m).slice(0, 2)).toEqual(['name', 'elevation_ft'])
      expect(keys(m)).toHaveLength(KEYS.length)
    }
  })
})

describe('pointModeColumns', () => {
  it('collapses each metric group to its single representative column', () => {
    expect(pointModeColumns(COLUMNS).map((c) => c.key)).toEqual([
      'name',
      'elevation_ft',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
      'aqi_avg',
    ])
  })

  it('drops the aggregate qualifier from the headers', () => {
    const labels = new Map(pointModeColumns(COLUMNS).map((c) => [c.key, c.label]))
    expect(labels.get('precip_avg_in_hr')).toBe('Precipitation (in/hr)')
    expect(labels.get('temp_avg_f')).toBe('Temperature (°F)')
    expect(labels.get('wind_avg_mph')).toBe('Wind (mph)')
    expect(labels.get('aqi_avg')).toBe('AQI')
    // No aggregate means no separator to hang one off.
    for (const label of labels.values()) expect(label).not.toContain(SEP)
    // Identity columns keep their labels untouched.
    expect(labels.get('name')).toBe('Name')
  })

  it('composes with orderColumns — the ranked metric still leads', () => {
    expect(orderColumns(pointModeColumns(COLUMNS), 'aqi_avg').map((c) => c.key)).toEqual([
      'name',
      'elevation_ft',
      'aqi_avg',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
    ])
  })
})

// The table and the CSV export both read this, and a file whose columns
// disagreed with the screen's would be a quiet bug rather than a visible one.
describe('displayedColumns', () => {
  it('is the point-sample collapse and the ranked-group lift, composed', () => {
    for (const m of METRICS) {
      expect(displayedColumns(false, m)).toEqual(orderColumns(COLUMNS, m))
      expect(displayedColumns(true, m)).toEqual(orderColumns(pointModeColumns(COLUMNS), m))
    }
  })

  // Measured rather than named: the collapse is keyed on the window covering one
  // hourly stamp, not on a mode, so "a day narrowed to one hour" collapses too.
  it('collapses a point sample and nothing else', () => {
    expect(displayedColumns(true, 'precip_total_in')).toHaveLength(6)
    expect(displayedColumns(false, 'precip_total_in')).toHaveLength(KEYS.length)
  })
})
