import { describe, it, expect } from 'vitest'
import { popupGrid, popupGroups, popupIdentity } from './popupRows'
import {
  COLUMNS,
  MODEL_COL,
  WILDFIRE_COL,
  CLOSURE_COL,
  displayedColumns,
  visibleColumns,
} from './tableColumns'
import { AGGREGATE, FAMILY_KEYS, NOUN, RANKED_FAMILIES, UNIT, WIND_GUST } from '../metrics'
import type { DestinationResult } from '../types'
import { resultRow } from '../testSupport/fixtures'

// Every aggregate differs, so a test can tell which column a value came from.
const row = resultRow({
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
  wind_gust_mph: 52.3,
  freeze_min_ft: 9843,
  freeze_max_ft: 12100,
  freeze_avg_ft: 10800,
  aqi_avg: 42,
  aqi_min: 18,
  aqi_max: 91,
})

const labelsOf = (cols: readonly { label: string }[]) => cols.map((c) => c.label)

describe('popupGroups over a date range', () => {
  const cols = displayedColumns(false, 'precip_total_in')

  it('shows every metric the table shows, and no more', () => {
    const groups = popupGroups(row, cols)
    const shown = groups.flatMap((g) => g.values).length
    // Every metric column. The name, the type and the elevation are the
    // card's title and the line under it.
    expect(shown).toBe(
      cols.filter((c) => c.key !== 'name' && c.key !== 'type' && c.key !== 'elevation_ft').length,
    )
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

  // Precipitation's columns do not share a unit: the window total is inches
  // and the other three are a rate. The label names the rate and the total
  // stands in the Total column with no unit, which a reader takes from the
  // column (TJ, 2026-10-08).
  it('names the rate on a family whose total is in a unit of its own', () => {
    const groups = popupGroups(row, cols)
    const precip = groups.find((g) => g.label.startsWith(NOUN.precip))!
    expect(precip.label).toBe(`${NOUN.precip} (in/hr)`)
    expect(precip.values.map((v) => [v.text, v.unit])).toEqual([
      ['0.123', null],
      ['0.004', null],
      ['0.000', null],
      ['0.009', null],
    ])
    // A family that shares one leaves it to the heading.
    const temp = groups.find((g) => g.label.startsWith(NOUN.temp))!
    expect(temp.values.every((v) => v.unit === null)).toBe(true)
  })

  // A fact about the place rather than a forecast, so it moved to the line
  // under the name (TJ, 2026-10-08).
  it('leaves the elevation out of the grid', () => {
    const groups = popupGroups(row, cols)
    expect(groups.some((g) => g.label.startsWith('Elevation'))).toBe(false)
  })

  it('links every value the table links, at the same layer', () => {
    const groups = popupGroups(row, cols, { modelId: 'gfs_seamless' })
    const precip = groups.find((g) => g.label.startsWith(NOUN.precip))!
    for (const v of precip.values) expect(v.href).toContain('rain')
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
      NOUN.aqi,
      `${NOUN.cloud_deck} (${UNIT.cloud_deck})`,
      `${NOUN.freeze} (${UNIT.freeze})`,
      `${NOUN.precip} (in/hr)`,
      // An hour of new snow is a rate, as an hour of rain is (#678).
      `${NOUN.snowfall} (in/hr)`,
      `${NOUN.temp} (${UNIT.temp})`,
      `${NOUN.wind} (${UNIT.wind})`,
      // The gust's own line, straight after the wind's (#584).
      `${WIND_GUST} (${UNIT.wind})`,
    ])
  })
})

// The gust is one option of the Wind row and a line of its own on the card
// (TJ, #584): `Wind gust (mph)` after `Wind (mph)`, its one number in the Max
// column, and the Min, Avg and Total cells empty.
describe('popupGroups and the wind gust', () => {
  const cols = displayedColumns(false, 'precip_total_in')
  const GUST_LABEL = `${WIND_GUST} (${UNIT.wind})`

  it('gives the gust its own line straight after the wind', () => {
    const labels = popupGroups(row, cols).map((g) => g.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(labels.indexOf(GUST_LABEL)).toBe(labels.indexOf(`${NOUN.wind} (${UNIT.wind})`) + 1)
    const wind = popupGroups(row, cols).find((g) => g.label === `${NOUN.wind} (${UNIT.wind})`)!
    expect(wind.values.map((v) => v.text)).toEqual(['3.2', '41.8', '18.5'])
  })

  it('puts the gust in the Max cell and leaves the others empty', () => {
    const grid = popupGrid(popupGroups(row, cols))
    const gust = grid.rows.find((r) => r.label === GUST_LABEL)!
    if (gust.kind !== 'aggregates') throw new Error('the gust spreads to the aggregate columns')
    expect(grid.columns).toEqual([AGGREGATE.minimum, AGGREGATE.maximum, AGGREGATE.average, AGGREGATE.total])
    expect(gust.cells.map((c) => c?.text ?? null)).toEqual([null, '52.3', null, null])
  })

  it('marks the gust under a gust ranking, and never the wind', () => {
    const grid = popupGrid(popupGroups(row, cols, { rankedBy: 'wind_gust_mph' }))
    const marked = grid.rows.flatMap((r) =>
      (r.kind === 'aggregates' ? r.cells : [r.cell]).filter((c) => c?.ranked).map(() => r.label),
    )
    expect(marked).toEqual([GUST_LABEL])
  })

  it('reads JMA’s missing gust as N/A', () => {
    const gust = popupGroups({ ...row, wind_gust_mph: null }, cols).find((g) => g.label === GUST_LABEL)!
    expect(gust.values.map((v) => [v.text, v.href])).toEqual([['N/A', null]])
  })

  // At one hour every line is one number, the gust's included, and a gust
  // ranking marks the gust's line rather than the wind's.
  it('is one value over a Current lookup, marked under its ranking alone', () => {
    const point = displayedColumns(true, 'wind_gust_mph')
    const groups = popupGroups(row, point, { rankedBy: 'wind_gust_mph' })
    const gust = groups.find((g) => g.label === GUST_LABEL)!
    expect(gust.single).toBe(true)
    expect(gust.values.map((v) => [v.text, v.ranked])).toEqual([['52.3', true]])
    const wind = groups.find((g) => g.label === `${NOUN.wind} (${UNIT.wind})`)!
    expect(wind.values[0].ranked).toBe(false)
  })
})

describe('popupGroups follows the table', () => {
  // Which families show follows the table; their order does not. A to Z,
  // whatever the ranking (TJ, 2026-10-08).
  it('orders the families alphabetically rather than by the ranking', () => {
    const groups = popupGroups(row, displayedColumns(false, 'wind_max_mph'))
    const labels = groups.map((g) => g.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(labels[0]).toBe(NOUN.aqi)
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

  // #457: the heading is the bare noun and the shared unit, with nothing else
  // inside the noun phrase.
  it('heads a group with the bare noun and unit', () => {
    const groups = popupGroups(row, displayedColumns(false, 'precip_total_in'))
    const wind = groups.find((g) => g.label.startsWith(NOUN.wind))!
    expect(wind.label).toBe(`${NOUN.wind} (${UNIT.wind})`)
  })

  // The two flags are the popup's amber banners, not measurements among the
  // metrics, and the model rides above the rule beside the type.
  it('never groups the wildfire, closure or model columns', () => {
    const cols = [...displayedColumns(false, 'precip_total_in'), WILDFIRE_COL, CLOSURE_COL, MODEL_COL]
    const groups = popupGroups(row, cols)
    expect(groups.some((g) => g.label === WILDFIRE_COL.label)).toBe(false)
    expect(groups.some((g) => g.label === CLOSURE_COL.label)).toBe(false)
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

  // The elevation sits on the type's line as `14,406 ft` (TJ, 2026-10-08).
  it('gives the elevation with its unit, when the place has one', () => {
    const cols = displayedColumns(false, 'precip_total_in')
    expect(popupIdentity(row, cols).elevation).toBe('14,406 ft')
    expect(popupIdentity({ ...row, elevation_ft: null }, cols).elevation).toBeNull()
  })

  it('gives no elevation when the reader hid the column', () => {
    const cols = displayedColumns(false, 'precip_total_in').filter((c) => c.key !== 'elevation_ft')
    expect(popupIdentity(row, cols).elevation).toBeNull()
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
    // Derived from the vocabulary, never from a list written in this file,
    // plus the gust's own line (#584).
    expect(metricGroups).toHaveLength(RANKED_FAMILIES.length + 1)
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
      // The wind's gust stands on its own line, so the wind's line has one
      // fewer.
      const expected = FAMILY_KEYS[family].filter((k) => k !== 'wind_gust_mph').length
      expect(group.values, `wrong count for ${family}`).toHaveLength(expected)
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
    expect(metricGroups).toHaveLength(RANKED_FAMILIES.length + 1)
    for (const g of metricGroups) expect(g.values).toHaveLength(1)
  })

  // Every group heading is composed from the vocabulary, so renaming a metric
  // or its unit in metrics.ts renames it here with no edit to the popup.
  it('composes every heading from the metric vocabulary', () => {
    const groups = popupGroups(row, displayedColumns(false, 'precip_total_in'))
    for (const g of groups.filter((x) => !x.label.startsWith('Elevation'))) {
      // The gust's line is composed from WIND_GUST, asserted above.
      if (g.label === `${WIND_GUST} (${UNIT.wind})`) continue
      const family = RANKED_FAMILIES.find((f) => g.label.startsWith(NOUN[f]))!
      const unit = UNIT[family]
      // The noun with its shared unit, or, where a window total is in the
      // unit and the other columns are a rate (precipitation, snowfall), the
      // noun with the rate.
      expect([NOUN[family], `${NOUN[family]} (${unit})`, `${NOUN[family]} (${unit}/hr)`]).toContain(g.label)
    }
  })

  // A new family takes its alphabetical place, whatever the report ranks by.
  it('keeps one order whichever family the report is ranked by', () => {
    const orders = RANKED_FAMILIES.map((family) =>
      popupGroups(row, displayedColumns(false, FAMILY_KEYS[family][0])).map((g) => g.label),
    )
    for (const order of orders) expect(order).toEqual(orders[0])
  })
})

// TJ, 2026-10-08: the popup is a grid at every width, a row per family and a
// column per aggregate, with the aggregate words said once.
describe('popupGrid', () => {
  const cols = displayedColumns(false, 'precip_total_in')

  it('heads the columns Min, Max, Avg and Total, in that order for every family', () => {
    const grid = popupGrid(popupGroups(row, cols))
    expect(grid.columns).toEqual([AGGREGATE.minimum, AGGREGATE.maximum, AGGREGATE.average, AGGREGATE.total])
    // AQI's own columns lead with Avg; its cells follow the grid's order.
    const aqi = grid.rows.find((r) => r.label === NOUN.aqi)!
    expect(aqi.kind).toBe('aggregates')
    if (aqi.kind !== 'aggregates') return
    // A family with no total leaves the Total column empty.
    expect(aqi.cells.map((c) => c?.text ?? null)).toEqual(['18', '91', '42', null])
  })

  // One line for a family with a window total, the total last (TJ,
  // 2026-10-08), rather than a total line with the rates under it.
  it('puts a window total in the last column of its family’s line', () => {
    const grid = popupGrid(popupGroups(row, cols))
    const precip = grid.rows.filter((r) => r.label.startsWith(NOUN.precip))
    expect(precip).toHaveLength(1)
    expect(precip[0]).toMatchObject({ kind: 'aggregates', label: `${NOUN.precip} (in/hr)` })
    if (precip[0].kind !== 'aggregates') return
    expect(precip[0].cells.map((c) => c?.text)).toEqual(['0.000', '0.009', '0.004', '0.123'])
  })

  it('has no elevation line', () => {
    const grid = popupGrid(popupGroups(row, cols))
    expect(grid.rows.some((r) => r.label.startsWith('Elevation'))).toBe(false)
  })

  it('heads no columns over a Current lookup, where each family is one number', () => {
    const grid = popupGrid(popupGroups(row, displayedColumns(true, 'precip_total_in')))
    expect(grid.columns).toEqual([])
    expect(grid.rows.every((r) => r.kind === 'value')).toBe(true)
  })

  it('drops a column the reader hid everywhere, and leaves a hole where one family hid it', () => {
    const noAvg = cols.filter((c) => !(c.key as string).includes('avg'))
    expect(popupGrid(popupGroups(row, noAvg)).columns).toEqual([
      AGGREGATE.minimum,
      AGGREGATE.maximum,
      AGGREGATE.total,
    ])
    const noTempMax = cols.filter((c) => c.key !== 'temp_max_f')
    const temp = popupGrid(popupGroups(row, noTempMax)).rows.find((r) => r.label.startsWith(NOUN.temp))!
    if (temp.kind !== 'aggregates') throw new Error('temperature is a grid row')
    expect(temp.cells.map((c) => c?.text ?? null)).toEqual(['21.4', null, '30.1', null])
  })

  // The two edges of the cloud deck's walk print as bounds through the
  // column's own formatter, so the popup says what the table says (TJ,
  // 2026-10-08).
  it('prints the edges of the cloud deck as bounds', () => {
    const edges = { ...row, cloud_deck_min_ft: 364, cloud_deck_max_ft: 30066, cloud_deck_avg_ft: 11850 }
    const deck = popupGrid(popupGroups(edges, cols)).rows.find((r) => r.label.startsWith(NOUN.cloud_deck))!
    if (deck.kind !== 'aggregates') throw new Error('the cloud deck is a grid row')
    expect(deck.cells.map((c) => c?.text ?? null)).toEqual(['≤364', '≥30,000', '11,850', null])
  })

  // Three bounds side by side are wider than the card, so a deck that held at
  // one edge all window says it once, across the columns.
  it('prints a bound held all window once', () => {
    for (const [ft, text] of [[30066, '≥30,000'], [364, '≤364']] as const) {
      const held = { ...row, cloud_deck_min_ft: ft, cloud_deck_max_ft: ft, cloud_deck_avg_ft: ft }
      const deck = popupGrid(popupGroups(held, cols)).rows.find((r) => r.label.startsWith(NOUN.cloud_deck))!
      if (deck.kind !== 'value') throw new Error('a held bound is one value')
      expect(deck.cell.text).toBe(text)
    }
  })

  // Only a bound collapses: three equal heights are three readings, and a
  // calm hour's equal numbers keep their columns like any other row.
  it('keeps three equal heights in their columns', () => {
    const flat = { ...row, cloud_deck_min_ft: 8000, cloud_deck_max_ft: 8000, cloud_deck_avg_ft: 8000 }
    const deck = popupGrid(popupGroups(flat, cols)).rows.find((r) => r.label.startsWith(NOUN.cloud_deck))!
    if (deck.kind !== 'aggregates') throw new Error('equal heights stay a grid row')
    expect(deck.cells.map((c) => c?.text ?? null)).toEqual(['8,000', '8,000', '8,000', null])
  })

  // The card marks the number the report ranks by (TJ, 2026-10-08), so it
  // says why its destination stands where it does.
  it('marks the number the report ranks by, and no other', () => {
    const grid = popupGrid(popupGroups(row, cols, { rankedBy: 'wind_max_mph' }))
    const ranked = grid.rows.flatMap((r) => (r.kind === 'aggregates' ? r.cells : [r.cell])).filter((c) => c?.ranked)
    expect(ranked.map((c) => c!.text)).toEqual(['41.8'])
  })

  it('marks nothing without a ranking', () => {
    const grid = popupGrid(popupGroups(row, cols))
    expect(grid.rows.flatMap((r) => (r.kind === 'aggregates' ? r.cells : [r.cell])).some((c) => c?.ranked)).toBe(false)
  })

  // A held bound says the three numbers once, so the one cell carries the
  // mark whichever of the three the ranking read.
  it('keeps the mark on a bound held all window', () => {
    const held = { ...row, cloud_deck_min_ft: 30066, cloud_deck_max_ft: 30066, cloud_deck_avg_ft: 30066 }
    for (const rankedBy of ['cloud_deck_min_ft', 'cloud_deck_max_ft', 'cloud_deck_avg_ft'] as const) {
      const deck = popupGrid(popupGroups(held, cols, { rankedBy })).rows.find((r) => r.label.startsWith(NOUN.cloud_deck))!
      if (deck.kind !== 'value') throw new Error('a held bound is one value')
      expect(deck.cell.ranked).toBe(true)
    }
  })

  // Over a Current lookup each family is one number, and the ranked family's
  // is the one marked.
  it('marks a Current lookup’s ranked family', () => {
    // The table collapses the family to its Avg column, which is not the
    // ranked key, and the one number still carries the mark.
    const point = displayedColumns(true, 'temp_max_f')
    expect(point.some((c) => c.key === 'temp_max_f')).toBe(false)
    const grid = popupGrid(popupGroups(row, point, { rankedBy: 'temp_max_f' }))
    const marked = grid.rows.filter((r) => r.kind === 'value' && r.cell.ranked)
    expect(marked.map((r) => r.label.startsWith(NOUN.temp))).toEqual([true])
  })
})
