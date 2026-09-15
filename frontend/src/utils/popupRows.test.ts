import { describe, it, expect } from 'vitest'
import { popupGroups, popupIdentity } from './popupRows'
import {
  COLUMNS,
  MODEL_COL,
  WILDFIRE_COL,
  displayedColumns,
  visibleColumns,
} from './tableColumns'
import { AGGREGATE, FAMILY_KEYS, NOUN, RANKED_FAMILIES, UNIT, familyOf } from '../metrics'
import type { DestinationResult } from '../types'

// One fully-populated row. Every aggregate differs, so a test can tell which
// column a value came from.
const row = {
  name: 'Mount Rainier',
  type: 'peak',
  osm_id: 'node/1',
  latitude: 46.851731,
  longitude: -121.760395,
  elevation_ft: 14406,
  precip_total_in: 0.123,
  precip_avg_in_hr: 0.0041,
  precip_min_in_hr: 0.0,
  precip_max_in_hr: 0.0092,
  temp_min_f: 21.4,
  temp_max_f: 38.9,
  temp_avg_f: 30.1,
  wind_min_mph: 3.2,
  wind_max_mph: 41.8,
  wind_avg_mph: 18.5,
  freeze_min_ft: 9843,
  freeze_max_ft: 12100,
  freeze_avg_ft: 10800,
  aqi_avg: 42,
  aqi_min: 18,
  aqi_max: 91,
} as unknown as DestinationResult

const labelsOf = (cols: readonly { label: string }[]) => cols.map((c) => c.label)

describe('popupGroups over a date range', () => {
  const cols = displayedColumns(false, 'precip_total_in')

  it('shows every metric the table shows, and no more', () => {
    const groups = popupGroups(row, cols)
    const shown = groups.flatMap((g) => g.values).length
    // Sixteen metric columns plus the elevation, which is its own group of one.
    expect(shown).toBe(cols.filter((c) => c.key !== 'name' && c.key !== 'type').length)
  })

  it('groups a family under one heading with its shared unit', () => {
    const groups = popupGroups(row, cols)
    const temp = groups.find((g) => g.label.startsWith(NOUN.temp))!
    expect(temp.label).toBe(`${NOUN.temp} (${UNIT.temp})`)
    expect(temp.single).toBe(false)
    expect(temp.values.map((v) => v.aggregate)).toEqual([
      AGGREGATE.minimum,
      AGGREGATE.maximum,
      AGGREGATE.average,
    ])
    // The unit is on the heading, so no value repeats it.
    expect(temp.values.map((v) => v.text)).toEqual(['21.4', '38.9', '30.1'])
  })

  it('drops the unit from an AQI heading, which has none', () => {
    const groups = popupGroups(row, cols)
    const aqi = groups.find((g) => g.label.startsWith(NOUN.aqi))!
    expect(aqi.label).toBe(NOUN.aqi)
    expect(aqi.values.map((v) => v.text)).toEqual(['42', '18', '91'])
  })

  // Precipitation is the one family whose columns do not share a unit: the
  // window total is inches and the other three are a rate. A shared unit on the
  // heading would be wrong for three values out of four, so each value carries
  // its own (TJ, 2026-09-14).
  it('puts the unit on each value where a family mixes two', () => {
    const groups = popupGroups(row, cols)
    const precip = groups.find((g) => g.label.startsWith(NOUN.precip))!
    expect(precip.label).toBe(NOUN.precip)
    expect(precip.values.map((v) => v.text)).toEqual([
      '0.123 in',
      '0.0041 in/hr',
      '0.0000 in/hr',
      '0.0092 in/hr',
    ])
  })

  it('reads the elevation as one line, not a heading and a value', () => {
    const groups = popupGroups(row, cols)
    const elevation = groups.find((g) => g.label.startsWith('Elevation'))!
    expect(elevation.single).toBe(true)
    expect(elevation.values).toHaveLength(1)
    expect(elevation.values[0].text).toBe('14,406')
    expect(elevation.values[0].aggregate).toBeNull()
  })

  it('links every value the table links, at the same layer', () => {
    const groups = popupGroups(row, cols, { modelId: 'gfs_seamless' })
    const precip = groups.find((g) => g.label.startsWith(NOUN.precip))!
    for (const v of precip.values) expect(v.href).toContain('rain')
    // The elevation is not a forecast, so it has nowhere to go.
    const elevation = groups.find((g) => g.label.startsWith('Elevation'))!
    expect(elevation.values[0].href).toBeNull()
  })
})

describe('popupGroups over a Current lookup', () => {
  const cols = displayedColumns(true, 'precip_total_in')

  // The whole of the bug this file was written for: a one-hour window makes
  // every aggregate the same number, so the table collapses each family to one
  // column and drops the aggregate word. The popup used to print "total",
  // "avg", "min" and "max" over four copies of one value.
  it('shows one value per family, with no aggregate word', () => {
    const groups = popupGroups(row, cols)
    for (const g of groups) {
      expect(g.single).toBe(true)
      expect(g.values).toHaveLength(1)
      expect(g.values[0].aggregate).toBeNull()
    }
    expect(labelsOf(groups.map((g) => ({ label: g.label })))).toEqual([
      'Elevation (ft)',
      `${NOUN.precip} (in/hr)`,
      `${NOUN.temp} (${UNIT.temp})`,
      `${NOUN.wind} (${UNIT.wind})`,
      `${NOUN.freeze} (${UNIT.freeze})`,
      NOUN.aqi,
    ])
  })
})

describe('popupGroups follows the table', () => {
  it('leads with the ranked family, as orderColumns does', () => {
    const groups = popupGroups(row, displayedColumns(false, 'aqi_max'))
    // The elevation is an identity column and still leads; the ranked family
    // is the first METRIC group, exactly as it is the first metric column.
    expect(groups[1].label).toBe(NOUN.aqi)
  })

  it('drops a value the Columns picker hides', () => {
    const visible = new Set(
      COLUMNS.map((c) => c.key as string).filter((k) => k !== 'temp_min_f'),
    )
    const groups = popupGroups(row, visibleColumns(false, 'precip_total_in', visible))
    const temp = groups.find((g) => g.label.startsWith(NOUN.temp))!
    expect(temp.values.map((v) => v.aggregate)).toEqual([AGGREGATE.maximum, AGGREGATE.average])
  })

  it('drops a family whose every column is hidden', () => {
    const visible = new Set(
      COLUMNS.map((c) => c.key as string).filter((k) => !k.startsWith('aqi')),
    )
    const groups = popupGroups(row, visibleColumns(false, 'precip_total_in', visible))
    expect(groups.some((g) => g.label.startsWith(NOUN.aqi))).toBe(false)
  })

  // A family narrowed to one aggregate keeps that column's own header, which
  // already names the metric, the aggregate and the unit.
  it('reads a single surviving aggregate as its own column header', () => {
    const visible = new Set(
      COLUMNS.map((c) => c.key as string).filter(
        (k) => !k.startsWith('temp') || k === 'temp_max_f',
      ),
    )
    const groups = popupGroups(row, visibleColumns(false, 'precip_total_in', visible))
    const temp = groups.find((g) => g.label.startsWith(NOUN.temp))!
    expect(temp.single).toBe(true)
    expect(temp.label).toBe(`${NOUN.temp} ${'·'} ${AGGREGATE.maximum} (${UNIT.temp})`)
  })

  it('carries the wind datum into the heading', () => {
    const groups = popupGroups(row, displayedColumns(false, 'precip_total_in', 'forecast'))
    const wind = groups.find((g) => g.label.startsWith(NOUN.wind))!
    expect(wind.label).toBe(`${NOUN.wind} at elevation (${UNIT.wind})`)
  })

  // The wildfire flag is the popup's amber banner, not a measurement among the
  // metrics, and the model rides above the rule beside the type.
  it('never groups the wildfire or model columns', () => {
    const cols = [...displayedColumns(false, 'precip_total_in'), WILDFIRE_COL, MODEL_COL]
    const groups = popupGroups(row, cols)
    expect(groups.some((g) => g.label === WILDFIRE_COL.label)).toBe(false)
    expect(groups.some((g) => g.label === MODEL_COL.label)).toBe(false)
  })
})

describe('popupGroups missing values', () => {
  // A null never reaches a formatter: Number(null).toFixed(1) is "0.0", which
  // is a reading the forecast never gave.
  it('draws a missing AQI as the dash the table draws', () => {
    const bare = { ...row, aqi_avg: null, aqi_min: null, aqi_max: null } as DestinationResult
    const groups = popupGroups(bare, displayedColumns(false, 'precip_total_in'))
    const aqi = groups.find((g) => g.label.startsWith(NOUN.aqi))!
    expect(aqi.values.map((v) => v.text)).toEqual(['—', '—', '—'])
  })

  // A model that publishes no freezing level is a different statement from a
  // missing hour, and it keeps the table's N/A mark. It carries no link: there
  // is nothing for Windy to show.
  it('marks an unpublished freezing level N/A and unlinked', () => {
    const bare = {
      ...row,
      freeze_min_ft: null,
      freeze_max_ft: null,
      freeze_avg_ft: null,
    } as DestinationResult
    const groups = popupGroups(bare, displayedColumns(false, 'precip_total_in'))
    const freeze = groups.find((g) => g.label.startsWith(NOUN.freeze))!
    expect(freeze.values.map((v) => v.text)).toEqual(['N/A', 'N/A', 'N/A'])
    expect(freeze.values.every((v) => v.href === null)).toBe(true)
  })
})

describe('popupIdentity', () => {
  it('title-cases the type the way the table column does', () => {
    const id = popupIdentity(row, displayedColumns(false, 'precip_total_in'))
    expect(id.type).toBe('Peak')
  })

  it('names no model while one model answered every row', () => {
    const id = popupIdentity(row, displayedColumns(false, 'precip_total_in'), 'GFS Seamless')
    expect(id.model).toBeNull()
  })

  it('names the row’s own model while a comparison is up', () => {
    const compared = { ...row, modelId: 'ecmwf_ifs025', modelLabel: 'ECMWF' } as DestinationResult
    const cols = [...displayedColumns(false, 'precip_total_in'), MODEL_COL]
    expect(popupIdentity(compared, cols).model).toBe('ECMWF')
  })
})


// TJ's standing expectation for this surface: add a ranking metric to Bluebird
// Forecast and it appears in a marker's popup too, with nothing here edited
// (2026-09-14). The popup walks the results table's columns and buckets them by
// `familyOf`, so that holds by construction — these fail if it ever stops.
describe('a new metric family reaches the popup on its own', () => {
  it('gives every family a group over a date range', () => {
    const groups = popupGroups(row, displayedColumns(false, 'precip_total_in'))
    const metricGroups = groups.filter((g) => !g.label.startsWith('Elevation'))
    // Derived from the vocabulary, never from a list written in this file.
    expect(metricGroups).toHaveLength(RANKED_FAMILIES.length)
    for (const family of RANKED_FAMILIES) {
      expect(
        metricGroups.some((g) => g.label.startsWith(NOUN[family])),
        `no popup group for ${family}`,
      ).toBe(true)
    }
  })

  it('shows every rankable aggregate a family has', () => {
    const cols = displayedColumns(false, 'precip_total_in')
    const groups = popupGroups(row, cols)
    for (const family of RANKED_FAMILIES) {
      const group = groups.find((g) => g.label.startsWith(NOUN[family]))!
      expect(group.values, `wrong count for ${family}`).toHaveLength(
        FAMILY_KEYS[family].length,
      )
    }
    // And nothing the table shows is left out: every metric column on screen
    // has exactly one value on the card.
    const shown = cols.filter((c) => !['name', 'type', 'elevation_ft'].includes(c.key as string))
    const values = groups.filter((g) => !g.label.startsWith('Elevation')).flatMap((g) => g.values)
    expect(values).toHaveLength(shown.length)
  })

  it('gives every family exactly one value over a Current lookup', () => {
    const groups = popupGroups(row, displayedColumns(true, 'precip_total_in'))
    const metricGroups = groups.filter((g) => !g.label.startsWith('Elevation'))
    expect(metricGroups).toHaveLength(RANKED_FAMILIES.length)
    for (const g of metricGroups) expect(g.values).toHaveLength(1)
  })

  // Every group heading is composed from the vocabulary, so renaming a metric
  // or its unit in metrics.ts renames it here with no edit to the popup.
  it('composes every heading from the metric vocabulary', () => {
    const groups = popupGroups(row, displayedColumns(false, 'precip_total_in'))
    for (const g of groups.filter((x) => !x.label.startsWith('Elevation'))) {
      const family = RANKED_FAMILIES.find((f) => g.label.startsWith(NOUN[f]))!
      const unit = UNIT[family]
      // Either the noun with its shared unit, or the bare noun where the
      // family's columns report in more than one (precipitation).
      expect([NOUN[family], unit ? `${NOUN[family]} (${unit})` : NOUN[family]]).toContain(g.label)
    }
  })

  // The ranking is what decides which family leads, and it reads the sort key's
  // own family rather than a position written down anywhere.
  it('leads with whichever family the report is ranked by', () => {
    for (const family of RANKED_FAMILIES) {
      const sortBy = FAMILY_KEYS[family][0]
      const groups = popupGroups(row, displayedColumns(false, sortBy))
      const first = groups.filter((g) => !g.label.startsWith('Elevation'))[0]
      expect(familyOf(FAMILY_KEYS[family][0])).toBe(family)
      expect(first.label.startsWith(NOUN[family]), `${family} did not lead`).toBe(true)
    }
  })
})
