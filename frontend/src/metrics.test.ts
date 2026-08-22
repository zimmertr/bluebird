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
  UNIT,
  aggregateToken,
  familyOf,
  metricLabel,
  rankedNoun,
  windowAggregate,
} from './metrics'
import { SortBy } from './types'
// `?raw` gives us each file's text without executing it, so the drift guard
// below stays a pure node test with no DOM — the same trick styles.test.ts
// uses to lint class lists.
import appSource from './App.tsx?raw'
import controlPanelSource from './components/ControlPanel.tsx?raw'
import resultsTableSource from './components/ResultsTable.tsx?raw'
import timeSeriesChartSource from './components/TimeSeriesChart.tsx?raw'
import timelineTransportSource from './components/TimelineTransport.tsx?raw'
import chartDataSource from './utils/chartData.ts?raw'
import colorsSource from './utils/colors.ts?raw'
import resultPopupSource from './utils/resultPopup.ts?raw'
import resultsCsvSource from './utils/resultsCsv.ts?raw'
import tableColumnsSource from './utils/tableColumns.ts?raw'
import openMeteoSource from './utils/openMeteo.ts?raw'
import presentSource from './utils/present.ts?raw'

const SORTS: SortBy[] = ['precip_total_in', 'wind_avg_mph', 'temp_avg_f', 'aqi_avg']

describe('the rankable keys', () => {
  // Every aggregate column the table shows is rankable, and nothing else is:
  // the per-family lists mirror the table's column set, AQI's missing minimum
  // included, and the flat list is derived from them.
  it('offers exactly the aggregate columns per family', () => {
    expect(FAMILY_KEYS.precip).toEqual(['precip_total_in', 'precip_avg_in_hr', 'precip_max_in_hr'])
    expect(FAMILY_KEYS.wind).toEqual(['wind_min_mph', 'wind_avg_mph', 'wind_max_mph'])
    expect(FAMILY_KEYS.temp).toEqual(['temp_min_f', 'temp_avg_f', 'temp_max_f'])
    expect(FAMILY_KEYS.aqi).toEqual(['aqi_avg', 'aqi_max'])
  })

  it('derives RANKING_KEYS from the family lists', () => {
    expect(RANKING_KEYS).toEqual(RANKED_FAMILIES.flatMap((f) => FAMILY_KEYS[f]))
    expect(RANKING_KEYS).toHaveLength(11)
  })

  // The pre-#291 rankable four: what each row holds until the user says
  // otherwise, so a fresh session ranks exactly as it always has.
  it('defaults every family to its historical representative key', () => {
    expect(DEFAULT_FAMILY_KEY).toEqual({
      precip: 'precip_total_in',
      wind: 'wind_avg_mph',
      temp: 'temp_avg_f',
      aqi: 'aqi_avg',
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
  it('reads the reduction out of every ranking key', () => {
    expect(RANKING_KEYS.map(aggregateToken)).toEqual([
      'total',
      'avg',
      'max',
      'min',
      'avg',
      'max',
      'min',
      'avg',
      'max',
      'avg',
      'max',
    ])
  })

  it('throws on a key with no aggregate segment', () => {
    expect(() => aggregateToken('elevation_ft' as SortBy)).toThrow(/elevation_ft/)
  })
})

describe('the vocabulary', () => {
  it('names every metric in full, with no short form', () => {
    expect(Object.keys(NOUN).sort()).toEqual(['aqi', 'precip', 'temp', 'wind'])
    expect(NOUN.precip).toBe('Precipitation')
    expect(NOUN.temp).toBe('Temperature')
    expect(NOUN.wind).toBe('Wind')
    // The one initialism: a word people read as a word, not a clipped noun.
    // Deliberately not "AQI (PM2.5)" — air_quality.py fetches Open-Meteo's
    // `us_aqi`, the EPA index combined across every pollutant, so naming one
    // of them understated what the number covers.
    expect(NOUN.aqi).toBe('AQI')
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
  })
})

describe('familyOf', () => {
  it('resolves every ranking key', () => {
    expect(SORTS.map(familyOf)).toEqual(['precip', 'wind', 'temp', 'aqi'])
  })

  // Every column the results table can show, so a new field cannot reach a
  // header without this module having a name for it.
  it('resolves every result field the table renders', () => {
    const fields = [
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

  it('answers with an AGGREGATE word for every rankable key', () => {
    for (const key of RANKING_KEYS) {
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

// The point of the module: a surface must compose its names from here rather
// than writing its own. Nothing in the type system enforces that — a string
// literal in JSX type-checks fine — so the guard reads the sources as text.
//
// Capitalisation is what keeps this from firing on code: field identifiers
// (`precip_total_in`, `tempAvgF`, `Math.min`) are lowercase or camel, and the
// abbreviations only ever appeared in display copy with a leading capital.
describe('no surface writes its own metric name', () => {
  const CONSUMERS: [string, string][] = [
    ['App.tsx', appSource],
    ['ControlPanel.tsx', controlPanelSource],
    ['ResultsTable.tsx', resultsTableSource],
    ['TimeSeriesChart.tsx', timeSeriesChartSource],
    ['TimelineTransport.tsx', timelineTransportSource],
    ['chartData.ts', chartDataSource],
    ['colors.ts', colorsSource],
    ['resultPopup.ts', resultPopupSource],
    // The seventh surface: a downloaded file is read in a spreadsheet, where
    // nothing around it says which app wrote the header.
    ['resultsCsv.ts', resultsCsvSource],
    ['tableColumns.ts', tableColumnsSource],
  ]

  // metrics.ts itself is absent on purpose: its doc comments quote these
  // abbreviations to explain what went wrong, which is the one place naming
  // them is the point.
  const BANNED: [string, RegExp][] = [
    ['Precip', /\bPrecip\b(?!itation)/],
    ['Temp', /\bTemp\b(?!erature)/],
    ['Avg', /\bAvg\b/],
    ['Min', /\bMin\b(?!imum)/],
    ['Max', /\bMax\b(?!imum)/],
    ['Elev', /\bElev\b(?!ation)/],
  ]

  // Every assertion below is "this pattern found nothing", which an empty
  // string satisfies. If a `?raw` import ever resolved to one — a moved file,
  // a resolver change — the whole guard would go quietly vacuous and still
  // report green, so check the sources arrived before trusting them.
  it('reads every consumer it claims to lint', () => {
    for (const [name, source] of CONSUMERS) {
      expect(source.length, `${name} loaded empty`).toBeGreaterThan(500)
    }
    expect(CONSUMERS.map(([name]) => name)).toContain('App.tsx')
  })

  for (const [name, source] of CONSUMERS) {
    for (const [abbreviation, pattern] of BANNED) {
      it(`keeps "${abbreviation}" out of ${name}`, () => {
        expect(source.match(pattern), `${name} writes "${abbreviation}"`).toBeNull()
      })
    }
  }
})

describe('copy lints', () => {
  // L3: No "the weather service" in frontend sources. Use "Open-Meteo" or
  // restructure to avoid the phrase.
  it('keeps "the weather service" phrase out of frontend', () => {
    expect(openMeteoSource.match(/\bthe weather service\b/i)).toBeNull()
    expect(presentSource.match(/\bthe weather service\b/i)).toBeNull()
  })

  // L4: No raw interpolation after "failed" in error messages. Pattern
  // /failed: \$\{/ catches string templates that insert values without context.
  it('wraps all error details in sentences', () => {
    expect(openMeteoSource).not.toMatch(/failed:\s*\$\{/)
    expect(presentSource).not.toMatch(/failed:\s*\$\{/)
  })

  // L5: No "analyze a smaller area" or "draw a smaller area" in frontend
  // user strings. The defect-2 remedy has been replaced.
  it('removes the defect-2 remedy phrases from frontend', () => {
    expect(openMeteoSource).not.toMatch(/(?:analyze|draw) a smaller area/i)
    expect(presentSource).not.toMatch(/(?:analyze|draw) a smaller area/i)
  })

  // L7: No "Please try again" or "Try again shortly" in user-facing strings.
  // Use the standing tail instead: "Try again later."
  it('replaces generic retry prompts with the standing tail', () => {
    expect(openMeteoSource).not.toMatch(/Please try again|Try again shortly/i)
    expect(presentSource).not.toMatch(/Please try again|Try again shortly/i)
  })
})
