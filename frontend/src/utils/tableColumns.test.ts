import { describe, it, expect } from 'vitest'
import { pointModeColumns, orderColumns } from './tableColumns'
import { SEP } from '../metrics'
import { SortBy } from '../types'

// The table's canonical column keys, in their ResultsTable order.
const COLS = [
  'name',
  'elevation_ft',
  'precip_total_in',
  'precip_avg_in_hr',
  'precip_max_in_hr',
  'temp_min_f',
  'temp_max_f',
  'temp_avg_f',
  'wind_min_mph',
  'wind_max_mph',
  'wind_avg_mph',
  'aqi_avg',
  'aqi_max',
].map((key) => ({ key }))

const keys = (sortBy: SortBy) => orderColumns(COLS, sortBy).map((c) => c.key)

describe('orderColumns', () => {
  it('keeps the canonical order when ranking by precipitation (already first)', () => {
    expect(keys('precip_total_in')).toEqual(COLS.map((c) => c.key))
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
    const metrics: SortBy[] = ['precip_total_in', 'wind_avg_mph', 'temp_avg_f', 'aqi_avg']
    for (const m of metrics) {
      expect(keys(m).slice(0, 2)).toEqual(['name', 'elevation_ft'])
      expect(keys(m)).toHaveLength(COLS.length)
    }
  })
})

describe('pointModeColumns', () => {
  const labeled = COLS.map((c) => ({ ...c, label: c.key }))

  it('collapses each metric group to its single representative column', () => {
    expect(pointModeColumns(labeled).map((c) => c.key)).toEqual([
      'name',
      'elevation_ft',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
      'aqi_avg',
    ])
  })

  it('drops the aggregate qualifier from the headers', () => {
    const labels = new Map(pointModeColumns(labeled).map((c) => [c.key, c.label]))
    expect(labels.get('precip_avg_in_hr')).toBe('Precipitation (in/hr)')
    expect(labels.get('temp_avg_f')).toBe('Temperature (°F)')
    expect(labels.get('wind_avg_mph')).toBe('Wind (mph)')
    expect(labels.get('aqi_avg')).toBe('AQI (US)')
    // No aggregate means no separator to hang one off.
    for (const label of labels.values()) expect(label).not.toContain(SEP)
    // Identity columns keep their labels untouched.
    expect(labels.get('name')).toBe('name')
  })

  it('composes with orderColumns — the ranked metric still leads', () => {
    expect(orderColumns(pointModeColumns(labeled), 'aqi_avg').map((c) => c.key)).toEqual([
      'name',
      'elevation_ft',
      'aqi_avg',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
    ])
  })
})
