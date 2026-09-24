import { describe, expect, it } from 'vitest'
import {
  AGGREGATE,
  DEFAULT_FAMILY_KEY,
  FAMILY_KEYS,
  MetricFamily,
  NOUN,
  RANKED_FAMILIES,
  RANKING_KEYS,
  SEP,
  SNAPSHOT_FAMILIES,
  UNIT,
  aggregateToken,
  familyOf,
  ON_REQUEST_FAMILIES,
  isOnRequestFamily,
  isSnapshotFamily,
  formatPrecipRate,
  formatPrecipTotal,
  metricLabel,
  rankedNoun,
  windowAggregate,
} from './metrics'
import { COLUMNS } from './utils/tableColumns'
import { formatMetricValue } from './utils/chartData'
import { SortBy } from './types'
// `?raw` gives us each file's text without executing it, so the precision
// guard below stays a pure node test with no DOM.
import appSource from './App.tsx?raw'
import controlPanelSource from './components/ControlPanel.tsx?raw'
import destinationsSource from './components/DestinationsSection.tsx?raw'
import forecastSectionSource from './components/ForecastSection.tsx?raw'
import metricsTableSource from './components/MetricsTable.tsx?raw'
import panelFooterSource from './components/PanelFooter.tsx?raw'
import panelMessagesSource from './utils/panelMessages.ts?raw'
import resultsTableSource from './components/ResultsTable.tsx?raw'
import resultsTableHeaderSource from './components/ResultsTableHeader.tsx?raw'
import resultsTableRowSource from './components/ResultsTableRow.tsx?raw'
import resultsCellsSource from './utils/resultsCells.ts?raw'
import timeSeriesChartSource from './components/TimeSeriesChart.tsx?raw'
import timelineTransportSource from './components/TimelineTransport.tsx?raw'
import mapLegendSource from './components/MapLegend.tsx?raw'
import resultsBarSource from './components/ResultsBar.tsx?raw'
import chartDataSource from './utils/chartData.ts?raw'
import colorsSource from './utils/colors.ts?raw'
import resultPopupSource from './utils/resultPopup.ts?raw'
import popupRowsSource from './utils/popupRows.ts?raw'
import resultsCsvSource from './utils/resultsCsv.ts?raw'
import tableColumnsSource from './utils/tableColumns.ts?raw'
import freezingLevelSource from './utils/freezingLevel.ts?raw'

const SORTS: SortBy[] = [
  'precip_total_in',
  'wind_avg_mph',
  'temp_avg_f',
  'freeze_min_ft',
  'snow_depth_in',
  'aqi_avg',
]

describe('the rankable keys', () => {
  // Every aggregate column the table shows is rankable, and nothing else is:
  // the per-family lists mirror the table's column set, and the flat list is
  // derived from them. The order is alphabetical by display word, so every
  // dropdown opens with the same word first (TJ, 2026-08-22).
  it('offers exactly the aggregate columns per family, alphabetically', () => {
    expect(FAMILY_KEYS.precip).toEqual([
      'precip_avg_in_hr',
      'precip_max_in_hr',
      'precip_min_in_hr',
      'precip_total_in',
    ])
    expect(FAMILY_KEYS.wind).toEqual(['wind_avg_mph', 'wind_max_mph', 'wind_min_mph'])
    expect(FAMILY_KEYS.temp).toEqual(['temp_avg_f', 'temp_max_f', 'temp_min_f'])
    expect(FAMILY_KEYS.freeze).toEqual(['freeze_avg_ft', 'freeze_max_ft', 'freeze_min_ft'])
    // One key, because a snapshot has no aggregates to choose between (#449).
    expect(FAMILY_KEYS.snow).toEqual(['snow_depth_in'])
    expect(FAMILY_KEYS.aqi).toEqual(['aqi_avg', 'aqi_max', 'aqi_min'])
    for (const family of RANKED_FAMILIES) {
      if (isSnapshotFamily(family)) continue
      const words = FAMILY_KEYS[family].map(windowAggregate)
      expect(words).toEqual([...words].sort())
    }
  })

  // The rows are alphabetical by the noun each one shows, so the check reads
  // NOUN rather than a second hand-written list: renaming a noun then moves its
  // row instead of silently leaving the table out of order (#341).
  it('keeps the metric rows alphabetical by their nouns', () => {
    const nouns = RANKED_FAMILIES.map((f) => NOUN[f])
    expect(nouns).toEqual([...nouns].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('derives RANKING_KEYS from the family lists', () => {
    expect(RANKING_KEYS).toEqual(RANKED_FAMILIES.flatMap((f) => FAMILY_KEYS[f]))
    expect(RANKING_KEYS).toHaveLength(23)
  })

  // The pre-#291 rankable four: what each row holds until the user says
  // otherwise, so a fresh session ranks exactly as it always has. The freezing
  // level has no such history and defaults to its minimum instead, which is
  // the overnight refreeze the metric was added to answer (#295).
  it('defaults every family to its historical representative key', () => {
    expect(DEFAULT_FAMILY_KEY).toEqual({
      precip: 'precip_total_in',
      wind: 'wind_avg_mph',
      temp: 'temp_avg_f',
      freeze: 'freeze_min_ft',
      snow: 'snow_depth_in',
      aqi: 'aqi_avg',
      // #117, TJ's defaults: the lowest base, because whether a summit ever
      // stood in cloud is the question; the average cover.
      cloud_base: 'cloud_base_min_ft',
      cloud_cover: 'cloud_cover_avg_pct',
    })
    for (const family of RANKED_FAMILIES) {
      expect(FAMILY_KEYS[family]).toContain(DEFAULT_FAMILY_KEY[family])
    }
  })

  it('keys every family entry to its own family', () => {
    for (const family of RANKED_FAMILIES) {
      for (const key of FAMILY_KEYS[family]) expect(familyOf(key)).toBe(family)
    }
  })
})

describe('aggregateToken', () => {
  // Every key yields the token of the aggregate it is built from. Asserted
  // against the aggregate each key carries rather than against a hand-written
  // list in row order, which only measured how the rows happen to be sorted:
  // alphabetizing them (#341) failed this test while nothing about the tokens
  // had changed.
  it('reads the reduction out of every ranking key', () => {
    const TOKENS: Record<string, string> = {
      [AGGREGATE.total]: 'total',
      [AGGREGATE.average]: 'avg',
      [AGGREGATE.minimum]: 'min',
      [AGGREGATE.maximum]: 'max',
    }

    expect(RANKING_KEYS).toHaveLength(23)
    for (const key of RANKING_KEYS) {
      const word = windowAggregate(key)
      // A snapshot key reduces nothing, so it has no token and no word. The
      // two answer null together or the surfaces disagree about whether the
      // metric has an aggregate at all.
      if (word === null) {
        expect(aggregateToken(key)).toBeNull()
        expect(isSnapshotFamily(familyOf(key))).toBe(true)
        continue
      }
      expect(aggregateToken(key)).toBe(TOKENS[word])
    }
    // Precipitation is the one family with a fourth, and the only Total.
    expect(RANKING_KEYS.filter((k) => aggregateToken(k) === 'total')).toEqual(['precip_total_in'])
  })

  it('throws on a key with no aggregate segment', () => {
    expect(() => aggregateToken('elevation_ft' as SortBy)).toThrow(/elevation_ft/)
  })

  // A snapshot answers null rather than throwing: it is a metric with one
  // column, not a caller mistake.
  it('answers null for a snapshot key', () => {
    expect(aggregateToken('snow_depth_in')).toBeNull()
    expect(windowAggregate('snow_depth_in')).toBeNull()
  })
})

describe('the vocabulary', () => {
  it('names every metric in full, with no short form', () => {
    expect(Object.keys(NOUN).sort()).toEqual([
      'aqi',
      'cloud_base',
      'cloud_cover',
      'freeze',
      'precip',
      'snow',
      'temp',
      'wind',
    ])
    expect(NOUN.precip).toBe('Precipitation')
    expect(NOUN.temp).toBe('Temperature')
    expect(NOUN.wind).toBe('Wind')
    // Sentence case, like every other string in the app: it is a noun phrase
    // rather than a proper name, and the height it names is its second word.
    expect(NOUN.freeze).toBe('Freezing level')
    // Two words for the same reason: the quantity is the depth, not the snow.
    expect(NOUN.snow).toBe('Snow depth')
    // The one initialism: a word people read as a word, not a clipped noun.
    // Deliberately not "AQI (PM2.5)" — air_quality.py fetches Open-Meteo's
    // `us_aqi`, the EPA index combined across every pollutant, so naming one
    // of them understated what the number covers.
    expect(NOUN.aqi).toBe('AQI')
    // The two nouns and units TJ approved for #117.
    expect(NOUN.cloud_base).toBe('Cloud base')
    expect(NOUN.cloud_cover).toBe('Cloud cover')
    expect(UNIT.cloud_base).toBe('ft')
    expect(UNIT.cloud_cover).toBe('%')
  })

  // The approved wire keys lead with `cloud` for both families, so a family is
  // a whole prefix rather than the key's first word.
  it('reads a family whose id holds an underscore', () => {
    expect(familyOf('cloud_base_min_ft')).toBe('cloud_base')
    expect(familyOf('cloud_cover_avg_pct')).toBe('cloud_cover')
    expect(aggregateToken('cloud_base_max_ft')).toBe('max')
    expect(aggregateToken('cloud_cover_min_pct')).toBe('min')
    expect(() => familyOf('cloud_ceiling_ft')).toThrow(/cloud_ceiling_ft/)
  })

  it('names the cloud families as the ones fetched on request', () => {
    expect([...ON_REQUEST_FAMILIES]).toEqual(['cloud_base', 'cloud_cover'])
    expect(isOnRequestFamily('cloud_base')).toBe(true)
    expect(isOnRequestFamily('freeze')).toBe(false)
  })

  // Nouns are identity and spell out; aggregates are modifiers and wear the
  // short forms every spreadsheet taught. Single-sourcing, not length, is what
  // keeps the surfaces consistent.
  it('keeps the aggregates to their universal short forms', () => {
    expect(Object.values(AGGREGATE)).toEqual(['Total', 'Avg', 'Min', 'Max'])
  })

  it('gives every metric a unit but AQI, which has none', () => {
    for (const family of Object.keys(NOUN) as MetricFamily[]) {
      expect(typeof UNIT[family]).toBe('string')
    }
    expect(UNIT.aqi).toBe('')
    // The same unit and datum as the elevation column, because the reading is
    // the comparison between the two.
    expect(UNIT.freeze).toBe('ft')
    expect(UNIT.snow).toBe('in')
  })
})

describe('familyOf', () => {
  it('resolves every ranking key', () => {
    expect(SORTS.map(familyOf)).toEqual(['precip', 'wind', 'temp', 'freeze', 'snow', 'aqi'])
  })

  // Every column the results table can show, so a new field cannot reach a
  // header without this module having a name for it.
  it('resolves every result field the table renders', () => {
    const fields = [
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
      'snow_depth_in',
      'aqi_avg',
      'aqi_min',
      'aqi_max',
    ]
    for (const field of fields) expect(() => familyOf(field)).not.toThrow()
  })

  // Identity columns are filtered out upstream; reaching here means a caller
  // is about to label a column it has no name for, which should be loud.
  it('throws on a key that names no metric', () => {
    expect(() => familyOf('elevation_ft')).toThrow(/elevation_ft/)
    expect(() => familyOf('name')).toThrow()
  })
})

describe('windowAggregate', () => {
  it('reads the display word off the key itself', () => {
    expect(windowAggregate('precip_total_in')).toBe('Total')
    expect(windowAggregate('wind_avg_mph')).toBe('Avg')
    expect(windowAggregate('wind_min_mph')).toBe('Min')
    expect(windowAggregate('temp_max_f')).toBe('Max')
    expect(windowAggregate('aqi_max')).toBe('Max')
  })

  it('answers with an AGGREGATE word for every rankable key that has one', () => {
    for (const key of RANKING_KEYS) {
      if (isSnapshotFamily(familyOf(key))) {
        expect(windowAggregate(key)).toBeNull()
        continue
      }
      expect(Object.values(AGGREGATE)).toContain(windowAggregate(key))
    }
  })
})

describe('rankedNoun', () => {
  // The header's window caption fixes the tense ("as of 12:09 PM"), so a point
  // sample takes no qualifier here or it gets stated twice.
  it('qualifies a window ranking and leaves a point sample bare', () => {
    expect(rankedNoun('precip_total_in', false)).toBe('Total Precipitation')
    expect(rankedNoun('temp_avg_f', false)).toBe('Avg Temperature')
    expect(rankedNoun('wind_max_mph', false)).toBe('Max Wind')
    expect(rankedNoun('temp_min_f', false)).toBe('Min Temperature')
    expect(rankedNoun('precip_total_in', true)).toBe('Precipitation')
    expect(rankedNoun('wind_max_mph', true)).toBe('Wind')
    expect(rankedNoun('aqi_avg', true)).toBe('AQI')
  })

  // A snapshot was never reduced over the window, so there is no word to put
  // in front of it in either mode, and the caption beside it says which day
  // the number is (#449).
  it('leaves a snapshot bare in both modes', () => {
    expect(rankedNoun('snow_depth_in', false)).toBe(NOUN.snow)
    expect(rankedNoun('snow_depth_in', true)).toBe(NOUN.snow)
  })
})

describe('snapshot families', () => {
  // One list, read by every surface that composes a name, reads an aggregate
  // or asks for a series, so a second such metric is one entry rather than a
  // new special case in six files.
  it('names snow depth and nothing else', () => {
    expect([...SNAPSHOT_FAMILIES]).toEqual(['snow'])
    for (const family of RANKED_FAMILIES) {
      expect(isSnapshotFamily(family)).toBe(family === 'snow')
    }
  })

  // A snapshot has exactly one column, which is what makes it one: there is
  // no reduction, so there is nothing to offer a dropdown.
  it('gives every snapshot family a single key', () => {
    for (const family of SNAPSHOT_FAMILIES) {
      expect(FAMILY_KEYS[family]).toHaveLength(1)
      expect(DEFAULT_FAMILY_KEY[family]).toBe(FAMILY_KEYS[family][0])
    }
  })

  it('labels a snapshot column with its bare noun and unit', () => {
    expect(metricLabel('snow')).toBe(`${NOUN.snow} (${UNIT.snow})`)
    expect(metricLabel('snow')).not.toContain(SEP)
  })
})

describe('metricLabel', () => {
  it('separates the metric from its aggregate and appends the unit', () => {
    expect(metricLabel('precip', AGGREGATE.total)).toBe(`Precipitation ${SEP} Total (in)`)
    expect(metricLabel('temp', AGGREGATE.minimum)).toBe(`Temperature ${SEP} Min (°F)`)
    expect(metricLabel('wind', AGGREGATE.average)).toBe(`Wind ${SEP} Avg (mph)`)
  })

  it('omits the parentheses for a metric with no unit', () => {
    expect(metricLabel('aqi', AGGREGATE.average)).toBe(`AQI ${SEP} Avg`)
    expect(metricLabel('aqi')).toBe('AQI')
  })

  it('drops the separator when there is no aggregate to separate', () => {
    expect(metricLabel('temp')).toBe('Temperature (°F)')
    expect(metricLabel('temp')).not.toContain(SEP)
  })

  it('takes an overriding unit for the columns reporting a rate', () => {
    expect(metricLabel('precip', AGGREGATE.average, 'in/hr')).toBe(
      `Precipitation ${SEP} Avg (in/hr)`,
    )
    expect(metricLabel('precip', undefined, 'in/hr')).toBe('Precipitation (in/hr)')
  })
})

// #395: one rainfall figure, one string, on every surface that prints it.
//
// The chart's tooltip spelled three digits and the table's rate cells spelled
// four, so a reader hovering an hour and reading the cell beside it got the
// same quantity at two lengths. Neither count was pinned, so neither was a
// decision. Three now is (TJ, 2026-09-15).
describe('precipitation formatting', () => {
  // The value the change is measured by: four digits made it 0.0125, three
  // make it 0.013.
  const RATE = 0.0125
  const rateCol = COLUMNS.find((c) => c.key === 'precip_avg_in_hr')!
  const totalCol = COLUMNS.find((c) => c.key === 'precip_total_in')!

  it('gives the table, the file and the chart one string for one value', () => {
    const onScreen = rateCol.format!(RATE)
    // What the export writes, derived the way resultsCsv.ts derives it: the
    // csv projection where a column has one, the display formatter otherwise.
    const inTheFile = (rateCol.csv ?? rateCol.format!)(RATE)
    const inTheTooltip = formatMetricValue(RATE, 'precip')

    expect(onScreen).toBe('0.013')
    expect(inTheFile).toBe(onScreen)
    expect(inTheTooltip).toBe(onScreen)
  })

  // The total and the rate are two quantities, and the digit count is the one
  // thing they share. A column of totals and a column of rates read side by
  // side, so a difference here is the same defect at one remove.
  it('prints a window total to the same digits as an hourly rate', () => {
    expect(totalCol.format!(RATE)).toBe(formatPrecipRate(RATE))
    expect(formatPrecipTotal(RATE)).toBe(formatPrecipRate(RATE))
  })

  // JS toFixed, not the round-half-even the aggregation uses: this rounds a
  // number the backend already rounded, and the two are separate matters.
  it('rounds a half up, the way toFixed does', () => {
    expect(formatPrecipRate(0.0005)).toBe('0.001')
  })

  // A zero is a reading rather than a gap, and it is the commonest value in
  // the minimum column: it has to carry its digits like any other.
  it('pads a zero out to the full width', () => {
    expect(formatPrecipRate(0)).toBe('0.000')
    expect(formatPrecipTotal(0)).toBe('0.000')
  })
})

// Every surface that composes a rainfall figure out of this module. The names
// these files print are held by an ESLint rule (#379); the digits are held by
// the guard below (#395), which reads the files as text.
const CONSUMERS: [string, string][] = [
  ['App.tsx', appSource],
  ['ControlPanel.tsx', controlPanelSource],
  // The panel's sections and the sentences under its button, which were one
  // file with it until the panel was split.
  ['DestinationsSection.tsx', destinationsSource],
  ['ForecastSection.tsx', forecastSectionSource],
  ['MetricsTable.tsx', metricsTableSource],
  ['PanelFooter.tsx', panelFooterSource],
  ['panelMessages.ts', panelMessagesSource],
  ['ResultsTable.tsx', resultsTableSource],
  // The table's body rows, and what each of their cells says.
  ['ResultsTableRow.tsx', resultsTableRowSource],
  ['resultsCells.ts', resultsCellsSource],
  // The table's header row, which draws every column's label.
  ['ResultsTableHeader.tsx', resultsTableHeaderSource],
  ['TimeSeriesChart.tsx', timeSeriesChartSource],
  ['TimelineTransport.tsx', timelineTransportSource],
  // The legend box, whose metric key names the ranked metric.
  ['MapLegend.tsx', mapLegendSource],
  // The results bar, whose title names the ranked metric.
  ['ResultsBar.tsx', resultsBarSource],
  ['chartData.ts', chartDataSource],
  ['colors.ts', colorsSource],
  ['resultPopup.ts', resultPopupSource],
  // The popup's derivation, which composes a group's heading from the
  // vocabulary the way the columns compose a header (#370).
  ['popupRows.ts', popupRowsSource],
  // The seventh surface: a downloaded file is read in a spreadsheet, where
  // nothing around it says which app wrote the header.
  ['resultsCsv.ts', resultsCsvSource],
  ['tableColumns.ts', tableColumnsSource],
  // The one file that writes a whole SENTENCE about a metric (#295), which
  // is the same duty: it composes the noun from the vocabulary rather than
  // spelling it, so a renamed metric renames its own note.
  ['freezingLevel.ts', freezingLevelSource],
]

// The point of the module: a surface must compose its names from here rather
// than writing its own. Nothing in the type system enforces that — a string
// literal in JSX type-checks fine — so the guard reads the sources as text.
//
// Capitalisation is what keeps this from firing on code: field identifiers
// (`precip_total_in`, `tempAvgF`, `Math.min`) are lowercase or camel, and the
// abbreviations only ever appeared in display copy with a leading capital.
// A surface composes a rainfall figure from metrics.ts instead of
// picking a precision at the call site. Nothing in the type system can say
// this — `toFixed` is a method on every number — so it is read off the sources.
//
// Per line, because that is the shape both offending sites had: a column
// definition is one line, and the chart's branch is one line. The two halves
// have to meet on a line for the pattern to fire, which is what keeps it off
// prose that mentions one of them: the guard is about code that formats a
// rainfall number, not about a comment that names the method.
describe('no surface picks its own precipitation precision', () => {
  const OWN_PRECISION = /^.*precip.*\.toFixed\(.*$/im

  // Every assertion below is "this pattern found nothing", which an empty
  // string satisfies, so check the sources arrived before trusting them.
  it('reads every consumer it claims to lint', () => {
    for (const [name, source] of CONSUMERS) {
      expect(source.length, `${name} loaded empty`).toBeGreaterThan(500)
    }
    expect(CONSUMERS.map(([name]) => name)).toContain('App.tsx')
  })

  for (const [name, source] of CONSUMERS) {
    it(`leaves the digit count to metrics.ts in ${name}`, () => {
      expect(source.match(OWN_PRECISION), `${name} sets its own precision`).toBeNull()
    })
  }

  // The guard's own proof: it fires on the two lines it was written for, in
  // the shape they were in before #395. Without this the pattern could be
  // wrong in a way that makes every assertion above vacuously true.
  it('fires on the shapes it was written for', () => {
    const table = `  { key: 'precip_avg_in_hr', format: (v) => Number(v).toFixed(4) },`
    const chart = `  if (metric === 'precip') return v.toFixed(3)`
    expect(table).toMatch(OWN_PRECISION)
    expect(chart).toMatch(OWN_PRECISION)
  })
})
