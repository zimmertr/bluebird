// Which metrics the selected window and models cannot answer at all, before
// an analysis is bought (#803, W1, W2, W5, W6). One answer read by two
// surfaces: the Metrics table greys the row of each (its rank radio, its
// aggregate menu and both bound boxes), and the Analyze gate blocks a ranking
// on one, so a row the reader cannot pick and a ranking the gate refuses are
// the same set. Record 0236.
//
// Pure and apart from both readers for the reason `freezingLevel.ts` is: the
// node project checks every case without a page, and two spellings of the
// rule would let the table grey a row the gate still lets rank.

import type { MetricFamily } from '../metrics'
import type { WindowSource } from './forecastWindow'
import { modelsWithoutFreeze } from './freezingLevel'

/**
 * Why a metric has no answer: the archive publishes no such column, a model
 * the analysis would fetch publishes none, or the window lies wholly past the
 * air-quality forecast's horizon. The gate reads the reason to pick its line.
 */
type Unanswered = 'archive' | 'model' | 'horizon'

export type UnansweredMetrics = ReadonlyMap<MetricFamily, Unanswered>

/** One identity for "every metric answers", so a prop built from it holds still. */
export const ALL_ANSWERED: UnansweredMetrics = new Map()

export interface MetricReachInputs {
  /** Which endpoint answers the selected window, or null with no window yet. */
  source: WindowSource | null
  /** How much of the window the air-quality forecast covers. */
  aqiCoverage: 'full' | 'partial' | 'none'
  /**
   * Every model the analysis would fetch, ranking first: on an archive window
   * the ranking model alone, since compared models are ignored there
   * (`comparedInPlay`).
   */
  models: readonly { id: string; label: string }[]
}

/**
 * The metrics with no answer for this window and these models, each with why.
 *
 * - An **archive** window answers neither the cloud deck nor the freezing
 *   level: its pressure levels and its freezing level come back null under the
 *   unit `undefined` (measured 2026-09-13, and again on #803's audit for the
 *   humidity the cloud deck reads). Air quality and snowfall it does answer.
 * - A **spanning** window is not the archive: its forecast half is the chosen
 *   model's and answers both, and the seam line says where that half begins
 *   (record 0072). So it greys nothing on that account.
 * - The **freezing level** has no answer when any model the analysis would
 *   fetch publishes none (`modelsWithoutFreeze`), on a forecast or spanning
 *   window. The archive's reason wins on an archive window, where no model
 *   applies.
 * - **Air quality** has none when the window starts past its horizon
 *   (`classifyAqiCoverage` says `none`). A window that only runs past it still
 *   has hours to rank on.
 */
export function unansweredMetrics(i: MetricReachInputs): UnansweredMetrics {
  const out = new Map<MetricFamily, Unanswered>()
  if (i.source === 'archive') {
    out.set('cloud_deck', 'archive')
    out.set('freeze', 'archive')
  } else if (modelsWithoutFreeze(i.models).length > 0) {
    out.set('freeze', 'model')
  }
  if (i.aqiCoverage === 'none') out.set('aqi', 'horizon')
  return out.size === 0 ? ALL_ANSWERED : out
}
