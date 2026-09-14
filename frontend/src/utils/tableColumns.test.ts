import { describe, it, expect } from 'vitest'
import {
  COLUMNS,
  MODEL_KEY,
  WILDFIRE_COL,
  WILDFIRE_KEY,
  displayedColumns,
  pointModeColumns,
  orderColumns,
  visibleColumns,
  withModelColumn,
} from './tableColumns'
import { SEP } from '../metrics'
import { FREEZE_UNAVAILABLE } from './freezingLevel'
import { SortBy } from '../types'

// The identity columns, which describe the destination rather than its
// weather and so have no weather layer to open.
const LEAD = new Set(['name', 'type', 'elevation_ft'])

// The real column set, not a copy of its keys. The list used to be declared in
// ResultsTable and restated here, which meant this suite could pass against a
// table that had gained or lost a column. It is a module export now (the CSV
// export writes the same columns), so the fixture can be the thing itself.
const KEYS = COLUMNS.map((c) => c.key)

const keys = (sortBy: SortBy) => orderColumns(COLUMNS, sortBy).map((c) => c.key)

const METRICS: SortBy[] = [
  'precip_total_in',
  'wind_avg_mph',
  'temp_avg_f',
  'freeze_min_ft',
  'aqi_avg',
]

describe('COLUMNS', () => {
  it('leads with the identity columns and names every one of them', () => {
    expect(KEYS.slice(0, 3)).toEqual(['name', 'type', 'elevation_ft'])
    for (const col of COLUMNS) expect(col.label).not.toBe('')
  })

  // Only where a display formatter would be unparseable or would editorialize.
  // Elevation is the first case — a grouped number puts a comma inside a
  // comma-separated cell. Type is the second and a different one: the file
  // keeps OSM's own word, lower-case, because a caller re-importing it wants
  // the value the API uses rather than the one the table title-cases for
  // reading. Adding a third means a file cell changed shape.
  // Elevation is the first case — a grouped number puts a comma inside a
  // comma-separated cell — and the three freezing-level columns are the same
  // case for the same reason, being heights in feet formatted the same way.
  it('overrides the display formatter for exactly the columns that need it', () => {
    expect(COLUMNS.filter((c) => c.csv).map((c) => c.key)).toEqual([
      'type',
      'elevation_ft',
      'freeze_min_ft',
      'freeze_max_ft',
      'freeze_avg_ft',
    ])
  })

  // A blank cell is how a spreadsheet spells "no value", which is the truth
  // for every metric but this one: a freezing level is absent because the
  // model carries no such variable, and the file is read detached from the
  // app that could say so. So the three declare the mark the screen uses and
  // nothing else does.
  it('declares a file mark for exactly the freezing-level columns', () => {
    expect(COLUMNS.filter((c) => c.csvNull).map((c) => c.key)).toEqual([
      'freeze_min_ft',
      'freeze_max_ft',
      'freeze_avg_ft',
    ])
    for (const col of COLUMNS.filter((c) => c.csvNull)) {
      expect(col.csvNull).toBe(FREEZE_UNAVAILABLE)
    }
  })

  // Every metric column opens the same map at the same place, on the layer
  // that shows what the column measures. `deg0` is Windy's own id for the
  // zero-degree isotherm, which is the freezing level under another name.
  it('points every metric column at its own Windy layer', () => {
    const layers = new Map(COLUMNS.map((c) => [c.key, c.windyLayer]))
    expect(layers.get('freeze_min_ft')).toBe('deg0')
    expect(layers.get('freeze_max_ft')).toBe('deg0')
    expect(layers.get('freeze_avg_ft')).toBe('deg0')
    for (const col of COLUMNS) {
      if (LEAD.has(col.key as string)) continue
      expect(col.windyLayer, `${col.key} links to no layer`).toBeTruthy()
    }
  })
})

describe('orderColumns', () => {
  it('keeps the canonical order when ranking by precipitation (already first)', () => {
    expect(keys('precip_total_in')).toEqual(KEYS)
  })

  it('moves the AQI pair right after the identity columns when ranking by AQI', () => {
    expect(keys('aqi_avg')).toEqual([
      'name',
      'type',
      'elevation_ft',
      'aqi_avg',
      'aqi_min',
      'aqi_max',
      'precip_total_in',
      'precip_avg_in_hr',
      'precip_min_in_hr',
      'precip_max_in_hr',
      'temp_min_f',
      'temp_max_f',
      'temp_avg_f',
      'wind_min_mph',
      'wind_max_mph',
      'wind_avg_mph',
      'freeze_min_ft',
      'freeze_max_ft',
      'freeze_avg_ft',
    ])
  })

  it('moves the temperature trio up, other groups keeping their relative order', () => {
    expect(keys('temp_avg_f')).toEqual([
      'name',
      'type',
      'elevation_ft',
      'temp_min_f',
      'temp_max_f',
      'temp_avg_f',
      'precip_total_in',
      'precip_avg_in_hr',
      'precip_min_in_hr',
      'precip_max_in_hr',
      'wind_min_mph',
      'wind_max_mph',
      'wind_avg_mph',
      'freeze_min_ft',
      'freeze_max_ft',
      'freeze_avg_ft',
      'aqi_avg',
      'aqi_min',
      'aqi_max',
    ])
  })

  // The column order is a reading order and has nothing to do with the color a
  // cell carries.
  it('moves the freezing-level trio up when ranking by it', () => {
    expect(keys('freeze_min_ft').slice(0, 6)).toEqual([
      'name',
      'type',
      'elevation_ft',
      'freeze_min_ft',
      'freeze_max_ft',
      'freeze_avg_ft',
    ])
    expect(keys('freeze_min_ft')).toHaveLength(KEYS.length)
  })

  it('always leads with the identity columns, for every metric', () => {
    for (const m of METRICS) {
      expect(keys(m).slice(0, 3)).toEqual(['name', 'type', 'elevation_ft'])
      expect(keys(m)).toHaveLength(KEYS.length)
    }
  })
})

describe('pointModeColumns', () => {
  it('collapses each metric group to its single representative column', () => {
    expect(pointModeColumns(COLUMNS).map((c) => c.key)).toEqual([
      'name',
      'type',
      'elevation_ft',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
      'freeze_avg_ft',
      'aqi_avg',
    ])
  })

  it('drops the aggregate qualifier from the headers', () => {
    const labels = new Map(pointModeColumns(COLUMNS).map((c) => [c.key, c.label]))
    expect(labels.get('precip_avg_in_hr')).toBe('Precipitation (in/hr)')
    expect(labels.get('temp_avg_f')).toBe('Temperature (°F)')
    expect(labels.get('wind_avg_mph')).toBe('Wind (mph)')
    expect(labels.get('freeze_avg_ft')).toBe('Freezing level (ft)')
    expect(labels.get('aqi_avg')).toBe('AQI')
    // No aggregate means no separator to hang one off.
    for (const label of labels.values()) expect(label).not.toContain(SEP)
    // Identity columns keep their labels untouched.
    expect(labels.get('name')).toBe('Name')
  })

  it('composes with orderColumns — the ranked metric still leads', () => {
    expect(orderColumns(pointModeColumns(COLUMNS), 'aqi_avg').map((c) => c.key)).toEqual([
      'name',
      'type',
      'elevation_ft',
      'aqi_avg',
      'precip_avg_in_hr',
      'temp_avg_f',
      'wind_avg_mph',
      'freeze_avg_ft',
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
    expect(displayedColumns(true, 'precip_total_in')).toHaveLength(8)
    expect(displayedColumns(false, 'precip_total_in')).toHaveLength(KEYS.length)
  })
})

describe('visibleColumns', () => {
  it('returns all columns when visibleKeys is null (default)', () => {
    const all = displayedColumns(false, 'precip_total_in')
    const visible = visibleColumns(false, 'precip_total_in', null)
    expect(visible).toEqual(all)
  })

  it('filters to only visible keys, but force-shows the ranked group', () => {
    const keys = new Set(['name', 'elevation_ft', 'precip_total_in'])
    const visible = visibleColumns(false, 'precip_total_in', keys)
    // Ranked group includes all precip columns, so they all appear
    expect(visible.map((c) => c.key)).toEqual([
      'name',
      'elevation_ft',
      'precip_total_in',
      'precip_avg_in_hr',
      'precip_min_in_hr',
      'precip_max_in_hr',
    ])
  })

  it('always includes the ranked metric group even if not in visibleKeys', () => {
    const keys = new Set(['name', 'elevation_ft'])
    const visible = visibleColumns(false, 'precip_total_in', keys)
    expect(visible.map((c) => c.key)).toContain('precip_total_in')
    expect(visible.map((c) => c.key)).toContain('precip_avg_in_hr')
    expect(visible.map((c) => c.key)).toContain('precip_max_in_hr')
  })

  it('respects both visibility and force-shown constraints', () => {
    const keys = new Set(['name', 'temp_min_f'])
    const visible = visibleColumns(false, 'aqi_avg', keys)
    const visibleKeys = visible.map((c) => c.key)

    expect(visibleKeys).toContain('name')
    expect(visibleKeys).toContain('temp_min_f')
    // AQI is the ranked group, should be force-shown
    expect(visibleKeys).toContain('aqi_avg')
    expect(visibleKeys).toContain('aqi_max')
  })
})

// The wildfire column (#256): defined here so the table and the CSV share one
// header, appended by the caller once the fire check has answered rather than
// riding in COLUMNS, whose keys all index a DestinationResult.
describe('WILDFIRE_COL', () => {
  it('carries the approved label under its virtual key', () => {
    expect(WILDFIRE_COL.key).toBe(WILDFIRE_KEY)
    expect(WILDFIRE_COL.label).toBe('Wildfire (mi)')
  })

  it('is not part of the row-backed column set', () => {
    expect(COLUMNS.map((c) => c.key)).not.toContain(WILDFIRE_KEY)
    expect(displayedColumns(false, 'precip_total_in').map((c) => c.key)).not.toContain(WILDFIRE_KEY)
  })
})

// The table and the CSV are handed the same rows — one per destination per
// model — so the column that says which model a row is has to come from one
// derivation or the file repeats every destination unexplained.
describe('the Model column', () => {
  const cols = displayedColumns(false, 'precip_total_in')

  it('leaves the columns alone when nothing is compared', () => {
    expect(withModelColumn(cols, false).map((c) => c.key)).toEqual(cols.map((c) => c.key))
  })

  it('sits after the identity columns and before the first metric', () => {
    const keys = withModelColumn(cols, true).map((c) => c.key)
    const at = keys.indexOf(MODEL_KEY)
    expect(at).toBeGreaterThan(-1)
    expect(keys.slice(0, at).every((k) => LEAD.has(k as string))).toBe(true)
    expect(LEAD.has(keys[at + 1] as string)).toBe(false)
  })

  it('adds the column once and drops nothing', () => {
    const keys = withModelColumn(cols, true).map((c) => c.key)
    expect(keys.filter((k) => k === MODEL_KEY)).toHaveLength(1)
    expect(keys.length).toBe(cols.length + 1)
    for (const col of cols) expect(keys).toContain(col.key)
  })

  // The wildfire column is appended last by the caller, so the insertion must
  // not move it or trip over its virtual key.
  it('keeps a trailing wildfire column last', () => {
    const keys = withModelColumn([...cols, WILDFIRE_COL], true).map((c) => c.key)
    expect(keys[keys.length - 1]).toBe(WILDFIRE_KEY)
  })

  // A point-sample report collapses to identity columns plus one instant per
  // metric; the insertion must still land rather than run off the end.
  it('appends when every column is an identity column', () => {
    const lead = cols.filter((c) => LEAD.has(c.key as string))
    expect(withModelColumn(lead, true).map((c) => c.key)).toEqual([
      ...lead.map((c) => c.key),
      MODEL_KEY,
    ])
  })
})
