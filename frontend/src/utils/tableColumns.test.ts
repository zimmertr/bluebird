import { describe, it, expect } from 'vitest'
import { orderColumns } from './tableColumns'
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
