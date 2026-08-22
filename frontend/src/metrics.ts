import { SortBy } from './types'

/**
 * One vocabulary for the four things Bluebird measures.
 *
 * Bluebird measures precipitation, temperature, wind and air quality, and names
 * them on six surfaces: the map legend, the ranking picker, the results header,
 * the results table, the forecast chart's radios, and a marker's popup. Before
 * this module each surface spelled them itself, so the same metric appeared as
 * "Current Wind", "Wind" and "Avg Wind" within one screen — nothing made two
 * spellings disagree visibly, so they drifted one commit at a time.
 *
 * The rule is that a surface never writes a metric's name. It composes one from
 * here, the same way it composes its type from `styles.ts` rather than picking
 * a size. `metrics.test.ts` reads the consuming files as text and fails on a
 * literal "Precip", "Temp" or "Avg", so the next drift is a red test rather
 * than something you notice on the map months later.
 *
 * Two things deliberately live outside this module. Ranking *direction*
 * ("Highest" / "Lowest") is not a name, it is the second axis of the sort, and
 * it reads naturally only in the results header. And the legend's band
 * captions ("0.10 – 0.25\"") stay in `colors.ts` next to the thresholds they
 * describe, because a caption that disagrees with its threshold is a bug the
 * numbers should catch, not a wording choice.
 */

/**
 * The four metrics, keyed the way the forecast chart already keyed them.
 *
 * Reusing those keys is what lets `chartData.ts` alias this type instead of
 * maintaining a parallel union and a mapping between the two.
 */
export type MetricFamily = 'precip' | 'temp' | 'wind' | 'aqi'

/**
 * The four metric rows of the ranking picker, in the order they render — the
 * same order the ranking radios have always used.
 */
export const RANKED_FAMILIES: readonly MetricFamily[] = ['precip', 'wind', 'temp', 'aqi']

/**
 * Each family's rankable keys, in the order its aggregate picker offers them
 * (#291). One key per aggregate column the table shows, so the picker and the
 * table cannot disagree about what a metric's choices are; AQI has no minimum
 * column, which is why its list is the one short one. The order is
 * alphabetical by display word (Avg, Max, Min, Total; TJ, 2026-08-22), so all
 * four dropdowns open with the same word first.
 */
export const FAMILY_KEYS: Record<MetricFamily, readonly SortBy[]> = {
  precip: ['precip_avg_in_hr', 'precip_max_in_hr', 'precip_total_in'],
  wind: ['wind_avg_mph', 'wind_max_mph', 'wind_min_mph'],
  temp: ['temp_avg_f', 'temp_max_f', 'temp_min_f'],
  aqi: ['aqi_avg', 'aqi_max'],
}

/**
 * The aggregate each family ranks by until the user says otherwise: the total
 * for precipitation, the window average for the rest. These were the only four
 * rankable keys before #291, which is why they are the defaults rather than a
 * new opinion.
 */
export const DEFAULT_FAMILY_KEY: Record<MetricFamily, SortBy> = {
  precip: 'precip_total_in',
  wind: 'wind_avg_mph',
  temp: 'temp_avg_f',
  aqi: 'aqi_avg',
}

/**
 * Every key a report can be RANKED by: the values the URL's `sort` param
 * accepts, and the union the aggregate pickers choose from (#291).
 *
 * Derived from the per-family lists above rather than spelled again, so a key
 * cannot be rankable in the picker and unknown to the URL.
 */
export const RANKING_KEYS: readonly SortBy[] = RANKED_FAMILIES.flatMap(
  (family) => FAMILY_KEYS[family],
)

/**
 * The metric's name. Spelled out, with no short form anywhere.
 *
 * "AQI" is the exception that proves the rule: it is an initialism people read
 * as a word, not an abbreviation of one, and "Air Quality Index" is what the
 * legend would have to wrap to fit. It is also deliberately not "AQI (PM2.5)",
 * which the results header claimed for a while — `air_quality.py` fetches
 * Open-Meteo's `us_aqi`, the EPA index combined across every pollutant, so
 * naming one of them understated what the number covers.
 */
export const NOUN: Record<MetricFamily, string> = {
  precip: 'Precipitation',
  temp: 'Temperature',
  wind: 'Wind',
  aqi: 'AQI',
}

/**
 * The unit a metric is quoted in, empty where it has none.
 *
 * Callers append their own where a column reports a rate rather than the base
 * quantity — precipitation is inches in a window total but inches per hour in
 * the average and peak columns.
 */
export const UNIT: Record<MetricFamily, string> = {
  precip: 'in',
  temp: '°F',
  wind: 'mph',
  aqi: '',
}

/**
 * How a value was reduced over the analysis window.
 *
 * The nouns above spell out because they are the identity of what's measured;
 * these wear their universal short forms because they are modifiers, and
 * spreadsheets and weather UIs long ago taught everyone to read them. What
 * keeps the surfaces consistent is not the length of these strings but their
 * address: they exist only here, and the source lint in metrics.test.ts fails
 * any consumer that writes one by hand.
 */
export const AGGREGATE = {
  total: 'Total',
  average: 'Avg',
  minimum: 'Min',
  maximum: 'Max',
} as const

/**
 * Separates a metric from its aggregate in a table header.
 *
 * A header is two facts — which metric, and how it was reduced — and left as
 * "Precipitation Total (in)" the eye has to find the seam itself. The popup
 * already spends this character separating two stats on one line, so it writes
 * its labels as prose instead of borrowing this form.
 */
export const SEP = '·'

/**
 * The metric behind a ranking key or a result field: `temp_min_f` is
 * temperature, `precip_avg_in_hr` is precipitation.
 *
 * Every one of those keys leads with its family, so the prefix is the answer.
 * Anything else is a caller mistake rather than a missing case — the table
 * pulls its identity columns out before it gets here — so this throws instead
 * of inventing a fallback that would ship a mislabelled column.
 */
export function familyOf(key: string): MetricFamily {
  const head = key.split('_')[0]
  if (head === 'precip' || head === 'temp' || head === 'wind' || head === 'aqi') return head
  throw new Error(`no metric family for "${key}"`)
}

/**
 * The reduction spelled inside a ranking key: `wind_max_mph` reduces by its
 * maximum, `precip_total_in` by its total.
 *
 * Every key writes its aggregate as its second segment, the same way it leads
 * with its family, so the token is the answer — a lookup table here would be a
 * second copy of the key list waiting to miss one. Throws on an unknown token
 * for the same reason `familyOf` does.
 */
export function aggregateToken(sortBy: SortBy): 'total' | 'avg' | 'min' | 'max' {
  const token = sortBy.split('_')[1]
  if (token === 'total' || token === 'avg' || token === 'min' || token === 'max') return token
  throw new Error(`no aggregate in "${sortBy}"`)
}

/**
 * The aggregate a window-mode ranking used, as the display word the surfaces
 * compose: "Total" for `precip_total_in`, "Max" for `wind_max_mph`.
 *
 * Before #291 this was a rule (precipitation totals, everything else
 * averages); now every aggregate column is rankable, it is a reading of the
 * key itself.
 */
export function windowAggregate(sortBy: SortBy): string {
  const word = {
    total: AGGREGATE.total,
    avg: AGGREGATE.average,
    min: AGGREGATE.minimum,
    max: AGGREGATE.maximum,
  } as const
  return word[aggregateToken(sortBy)]
}

/**
 * The ranked metric as the results header names it: "Total Precipitation" over
 * a window, plain "Precipitation" for a single hour.
 *
 * The header composes this with the sort direction ("Highest …", "Lowest …")
 * and the window caption that follows it, which is why a point sample takes no
 * qualifier here: the caption already fixes the tense ("as of 12:09 PM"), and
 * "Highest Current Precipitation as of 12:09 PM" says it twice.
 */
export function rankedNoun(sortBy: SortBy, pointSample: boolean): string {
  const noun = NOUN[familyOf(sortBy)]
  return pointSample ? noun : `${windowAggregate(sortBy)} ${noun}`
}

/**
 * A metric named alongside its unit, for the surfaces that tabulate rather
 * than rank: "Precipitation · Total (in)", "AQI · Avg", "Wind (mph)".
 *
 * The aggregate is optional because two callers have none. A point-sample
 * analysis collapses its avg/min/max triplets to one column — they would be
 * the same hour three times — and the forecast chart plots the raw hourly
 * series, which is the value before any aggregate is taken.
 *
 * The unit defaults to the metric's own but is overridable, because a column
 * can report a rate rather than the base quantity: precipitation is inches in
 * a window total and inches per hour in the average and peak columns.
 */
export function metricLabel(
  family: MetricFamily,
  aggregate?: string,
  unit: string = UNIT[family],
): string {
  const named = aggregate ? `${NOUN[family]} ${SEP} ${aggregate}` : NOUN[family]
  return unit ? `${named} (${unit})` : named
}
