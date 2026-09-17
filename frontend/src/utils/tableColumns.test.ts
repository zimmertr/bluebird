import { describe, it, expect } from 'vitest'
import {
  COLUMNS,
  MODEL_KEY,
  applyColumnOrder,
  moveColumn,
  stepColumn,
  WILDFIRE_COL,
  WILDFIRE_KEY,
  displayedColumns,
  pointModeColumns,
  orderColumns,
  visibleColumns,
  withModelColumn,
} from './tableColumns'
import { FAMILY_KEYS, RANKED_FAMILIES, familyOf, NOUN, SEP } from '../metrics'
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

  // Against the name it qualifies: a comparison repeats one destination's name
  // down consecutive rows and the model is what tells those repeats apart.
  it('sits directly after Name', () => {
    const keys = withModelColumn(cols, true).map((c) => c.key)
    expect(keys.indexOf(MODEL_KEY)).toBe(keys.indexOf('name') + 1)
    expect(keys[keys.indexOf(MODEL_KEY) + 1]).toBe('type')
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

  // Name is hideable like every other column, and the insertion has to land
  // somewhere rather than run off the end when it is off.
  it('leads the columns when Name is not shown', () => {
    const noName = cols.filter((c) => c.key !== 'name')
    expect(withModelColumn(noName, true).map((c) => c.key)).toEqual([
      MODEL_KEY,
      ...noName.map((c) => c.key),
    ])
  })
})

// The reader's own column order (#360). Pure here, because Vitest runs this
// repository in the node environment and a reorder left inside the table or
// the picker could not be tested at all.
describe('a column order the reader set', () => {
  const cols = (...keys: string[]) => keys.map((key) => ({ key }))
  const keys = (list: { key: string }[]) => list.map((c) => c.key)

  it('leaves the columns alone when nothing has been ordered', () => {
    const given = cols('name', 'type', 'wind')
    expect(keys(applyColumnOrder(given, null))).toEqual(['name', 'type', 'wind'])
    expect(keys(applyColumnOrder(given, []))).toEqual(['name', 'type', 'wind'])
  })

  it('puts the named columns in the order given', () => {
    expect(keys(applyColumnOrder(cols('name', 'type', 'wind'), ['wind', 'name', 'type']))).toEqual([
      'wind',
      'name',
      'type',
    ])
  })

  // The stored list cannot know about a column that did not exist when it was
  // written: a new metric, the wildfire column, Model arriving with a
  // comparison. An unnamed column keeps its place after the named ones rather
  // than disappearing or jumping to the front.
  it('keeps a column the order does not name, after the ones it does', () => {
    expect(keys(applyColumnOrder(cols('name', 'model', 'type'), ['type', 'name']))).toEqual([
      'type',
      'name',
      'model',
    ])
  })

  it('ignores a key the columns no longer hold', () => {
    expect(keys(applyColumnOrder(cols('name', 'wind'), ['wind', 'gone', 'name']))).toEqual([
      'wind',
      'name',
    ])
  })

  it('never drops or duplicates a column', () => {
    const given = cols('a', 'b', 'c', 'd')
    const out = keys(applyColumnOrder(given, ['d', 'b']))
    expect(out.length).toBe(4)
    expect(new Set(out).size).toBe(4)
  })
})

describe('moving one column', () => {
  const ORDER = ['name', 'type', 'elevation_ft', 'wind']

  it('drops the column where the target sits, going right', () => {
    expect(moveColumn(ORDER, 'name', 'elevation_ft')).toEqual([
      'type',
      'elevation_ft',
      'name',
      'wind',
    ])
  })

  it('drops the column where the target sits, going left', () => {
    expect(moveColumn(ORDER, 'wind', 'type')).toEqual(['name', 'wind', 'type', 'elevation_ft'])
  })

  // A caller compares by reference to decide whether to write, so a move that
  // moves nothing has to return the list it was given.
  it('returns the same list when nothing moved', () => {
    expect(moveColumn(ORDER, 'name', 'name')).toBe(ORDER)
    expect(moveColumn(ORDER, 'name', 'gone')).toBe(ORDER)
    expect(moveColumn(ORDER, 'gone', 'name')).toBe(ORDER)
  })

  it('moves one step at a time for a keyboard', () => {
    expect(stepColumn(ORDER, 'type', 1)).toEqual(['name', 'elevation_ft', 'type', 'wind'])
    expect(stepColumn(ORDER, 'type', -1)).toEqual(['type', 'name', 'elevation_ft', 'wind'])
  })

  // A column that jumps from the last place to the first reads as a bug, not
  // as a move.
  it('does not wrap at either end', () => {
    expect(stepColumn(ORDER, 'name', -1)).toBe(ORDER)
    expect(stepColumn(ORDER, 'wind', 1)).toBe(ORDER)
    expect(stepColumn(ORDER, 'gone', 1)).toBe(ORDER)
  })
})

// #361: the three wind columns name the datum their numbers came from, and the
// file's headers must say the same as the screen's — a CSV is read detached
// from the app, where an unqualified header is the exact claim the issue is
// about.
describe('wind datum on the displayed columns', () => {
  const windKeys = FAMILY_KEYS.wind as readonly string[]
  const labelOf = (cols: { key: string; label: string }[], key: string) =>
    cols.find((c) => c.key === key)!.label

  it('qualifies every wind column over a forecast window', () => {
    const cols = displayedColumns(false, 'precip_total_in', 'forecast')
    for (const key of windKeys) expect(labelOf(cols, key)).toContain('at elevation')
  })

  it('qualifies every wind column over an archive window', () => {
    const cols = displayedColumns(false, 'precip_total_in', 'archive')
    for (const key of windKeys) expect(labelOf(cols, key)).toContain('at 10 meters')
  })

  // The state that must stay silent, and the one most likely to regress: a
  // spanning report averages both datums into one number.
  it('leaves the columns untouched over a spanning window', () => {
    expect(displayedColumns(false, 'precip_total_in', 'spanning')).toEqual(
      displayedColumns(false, 'precip_total_in'),
    )
  })

  it('leaves the columns untouched with no report', () => {
    expect(displayedColumns(false, 'precip_total_in', null)).toEqual(
      displayedColumns(false, 'precip_total_in'),
    )
  })

  // Wind and temperature, and nothing else. A datum leaking onto another
  // family would be a false claim about a number the adjustment never touched.
  it('touches no column outside the wind and temperature families', () => {
    const adjusted = [...windKeys, ...(FAMILY_KEYS.temp as readonly string[])]
    const plain = displayedColumns(false, 'precip_total_in')
    const qualified = displayedColumns(false, 'precip_total_in', 'forecast')
    for (const col of plain) {
      if (adjusted.includes(col.key as string)) continue
      expect(labelOf(qualified, col.key as string)).toBe(col.label)
    }
  })

  // A relabel, never a different column set: same keys, same order, same
  // formatters, so nothing downstream of the label can tell the difference.
  it('changes only the labels, never the columns themselves', () => {
    const plain = displayedColumns(false, 'wind_avg_mph')
    const qualified = displayedColumns(false, 'wind_avg_mph', 'forecast')
    expect(qualified.map((c) => c.key)).toEqual(plain.map((c) => c.key))
    expect(qualified.map((c) => c.format)).toEqual(plain.map((c) => c.format))
  })

  // The collapsed single column carries no aggregate, so the qualifier has to
  // land without one rather than being dropped with it.
  it('qualifies the collapsed column of a point-sample report', () => {
    const cols = displayedColumns(true, 'wind_avg_mph', 'forecast')
    expect(labelOf(cols, 'wind_avg_mph')).toContain('at elevation')
    expect(labelOf(cols, 'wind_avg_mph')).not.toContain(SEP)
  })

  // The picker and the table read one derivation, so a visible-column set
  // cannot disagree with the full one about what a column is called.
  it('qualifies the visible columns the same way', () => {
    const keys = new Set<string>(['name', 'wind_avg_mph'])
    const visible = visibleColumns(false, 'precip_total_in', keys, 'archive')
    expect(labelOf(visible, 'wind_avg_mph')).toContain('at 10 meters')
  })
})

// #443: the three temperature columns read the free air at the destination's
// own elevation, so the header says so — on the screen and in the file alike,
// for the reason the wind's does.
describe('temperature datum on the displayed columns', () => {
  const tempKeys = FAMILY_KEYS.temp as readonly string[]
  const labelOf = (cols: { key: string; label: string }[], key: string) =>
    cols.find((c) => c.key === key)!.label

  it('qualifies every temperature column over a forecast window', () => {
    const cols = displayedColumns(false, 'precip_total_in', 'forecast')
    for (const key of tempKeys) expect(labelOf(cols, key)).toContain('at elevation')
  })

  // Two states, not the wind's three. The archive answers every pressure level
  // null, so the column IS the surface temperature under exactly the label it
  // carried before this issue — a datum there would only restate the default.
  it('leaves the columns untouched over an archive window', () => {
    const cols = displayedColumns(false, 'precip_total_in', 'archive')
    const plain = displayedColumns(false, 'precip_total_in')
    for (const key of tempKeys) expect(labelOf(cols, key)).toBe(labelOf(plain, key))
  })

  it('leaves the columns untouched over a spanning window and with no report', () => {
    const plain = displayedColumns(false, 'precip_total_in')
    for (const source of ['spanning', null] as const) {
      const cols = displayedColumns(false, 'precip_total_in', source)
      for (const key of tempKeys) expect(labelOf(cols, key)).toBe(labelOf(plain, key))
    }
  })

  // The wind's archive label must still appear beside an unqualified
  // temperature one: the two families answer the same window differently, and
  // an applier that shared one verdict would get one of them wrong.
  it('qualifies the wind and not the temperature over the same archive window', () => {
    const cols = displayedColumns(false, 'precip_total_in', 'archive')
    expect(labelOf(cols, 'wind_avg_mph')).toContain('at 10 meters')
    expect(labelOf(cols, 'temp_avg_f')).not.toContain('at ')
  })

  // The collapsed single column carries no aggregate, so the qualifier has to
  // land without one rather than being dropped with it.
  it('qualifies the collapsed column of a point-sample report', () => {
    const cols = displayedColumns(true, 'temp_avg_f', 'forecast')
    expect(labelOf(cols, 'temp_avg_f')).toContain('at elevation')
    expect(labelOf(cols, 'temp_avg_f')).not.toContain(SEP)
  })

  it('qualifies the visible columns the same way', () => {
    const keys = new Set<string>(['name', 'temp_min_f'])
    const visible = visibleColumns(false, 'precip_total_in', keys, 'forecast')
    expect(labelOf(visible, 'temp_min_f')).toContain('at elevation')
  })
})


// The whole column set is derived from the metric vocabulary, so adding a
// metric to `metrics.ts` and to `COLUMNS` is meant to be the whole job: it then
// reaches the table, the CSV and a marker's popup without any of the three
// naming it (TJ, 2026-09-14). These guard the two places where a new family
// could still be dropped on the floor in silence.
describe('a new metric family needs no second list', () => {
  it('gives every family a column per rankable aggregate', () => {
    const byFamily = new Map<string, string[]>()
    for (const col of COLUMNS) {
      const key = col.key as string
      if (key === 'name' || key === 'type' || key === 'elevation_ft') continue
      const family = familyOf(key)
      byFamily.set(family, [...(byFamily.get(family) ?? []), key])
    }
    // Read off RANKED_FAMILIES rather than a list written here, so a family
    // added there and not to COLUMNS fails this rather than shipping a metric
    // with no column.
    expect([...byFamily.keys()].sort()).toEqual([...RANKED_FAMILIES].sort())
    for (const family of RANKED_FAMILIES) {
      expect(byFamily.get(family)!.sort()).toEqual([...FAMILY_KEYS[family]].sort())
    }
  })

  // `pointModeColumns` keeps the columns it has a collapsed label for, so a
  // family with no entry does not merely lose its aggregate word — it vanishes
  // from a Current lookup entirely, on the screen, in the file and in the card.
  it('collapses every family to exactly one column for a point sample', () => {
    const collapsed = pointModeColumns(COLUMNS).filter(
      (c) => !['name', 'type', 'elevation_ft'].includes(c.key as string),
    )
    expect(collapsed).toHaveLength(RANKED_FAMILIES.length)
    expect(collapsed.map((c) => familyOf(c.key as string)).sort()).toEqual(
      [...RANKED_FAMILIES].sort(),
    )
    // And the collapsed label is the family's own noun, composed rather than
    // spelled, so a renamed metric renames its column here too.
    for (const col of collapsed) {
      expect(col.label.startsWith(NOUN[familyOf(col.key as string)])).toBe(true)
    }
  })
})
