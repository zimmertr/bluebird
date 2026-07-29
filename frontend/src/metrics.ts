import { AnalysisMode, SortBy } from './types'

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
 * The aggregate a window-mode ranking actually used: precipitation ranks by
 * its total over the window, everything else by its average.
 *
 * This mirrors the backend's choice of representative value per metric, and is
 * the same sentence the ranking picker's helper text spells out for the user.
 */
export function windowAggregate(sortBy: SortBy): string {
  return familyOf(sortBy) === 'precip' ? AGGREGATE.total : AGGREGATE.average
}

/**
 * The ranked metric as the results header names it: "Total Precipitation" over
 * a window, plain "Precipitation" for a single hour.
 *
 * The header composes this with the sort direction ("Highest …", "Lowest …")
 * and its own mode prefix, which is why a point sample takes no qualifier here
 * — the prefix already said "Current Conditions:", and "Current Conditions:
 * Highest Current Precipitation" says it twice.
 */
export function rankedNoun(sortBy: SortBy, mode: AnalysisMode): string {
  const noun = NOUN[familyOf(sortBy)]
  return mode === 'window' ? `${windowAggregate(sortBy)} ${noun}` : noun
}

/**
 * The legend's title: what the marker colors mean in this analysis.
 *
 * One rule across all three modes, which is the whole point — the legend used
 * to say "Current Wind", "Wind" and "Avg Wind" for the same colors depending
 * only on how the window was picked. The legend has no prefix to lean on the
 * way the header does, so a point sample takes a tense here; 'at' takes
 * "Forecast" rather than "Current" because "Current" would be a lie about a
 * future hour.
 */
export function legendTitle(sortBy: SortBy, mode: AnalysisMode): string {
  const noun = NOUN[familyOf(sortBy)]
  if (mode === 'now') return `Current ${noun}`
  if (mode === 'at') return `Forecast ${noun}`
  return rankedNoun(sortBy, mode)
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
