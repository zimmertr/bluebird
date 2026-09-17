// The browser half of the mirrored-constant contract (issue #380).
//
// `mirrored_constants.json` is written by the backend
// (`backend/scripts/generate_mirrored_constants.py`) and read from where it is
// committed, the way `weather_vectors.json` is. Pytest proves that one file
// still matches Python, and this file is what makes a backend change reach the
// TypeScript side: every value below is one half of a pair, so a constant
// moved on one side alone fails here instead of shipping two apps that
// disagree about the same number.
//
// A comment was the whole mechanism before this, and it did not hold:
// `N_VARIABLES` and the browser's hourly variable list disagreed for a
// release, and the browser priced its Open-Meteo spend on a literal that no
// longer counted anything.
import { describe, expect, it } from 'vitest'
import manifest from '../../../backend/tests/data/mirrored_constants.json'
import { BATCH_SIZE, HOURLY_VARIABLES, MAX_CONCURRENT_BATCHES } from './openMeteo'
import { MAX_ANALYZE_DESTINATIONS } from './clientAnalyze'
import { COARSE_TOLERANCE_DEG } from './wildfires'
import {
  ARCHIVE_STRADDLE_DAYS,
  FUTURE_LIMIT_SLACK_DAYS,
  PAST_DATA_DAYS,
  PAST_LIMIT_SLACK_DAYS,
} from './forecastWindow'
// `?raw` gives a file's text without executing it, the drift-guard idiom
// `styles.test.ts` and `metrics.test.ts` use. The two sentences below are
// composed inside React hooks, which a node-env test cannot run, and the text
// is the whole of what is mirrored.
import useAnalyzeSource from '../hooks/useAnalyze.ts?raw'
import useModelCompareSource from '../hooks/useModelCompare.ts?raw'

const { constants, strings } = manifest

describe('the constants the backend publishes for this side to match', () => {
  it('prices a weather request on one more variable than the backend', () => {
    // The browser also asks for `wind_direction_10m`, which only the map's
    // playback arrows read, so this pair is off by exactly one rather than
    // equal. Both counts still floor to weight factor 1 — max(1, vars/10) —
    // which is why the drift that prompted issue #380 cost nothing; the next
    // variable either side adds is the one that would.
    expect(HOURLY_VARIABLES.length).toBe(constants.N_VARIABLES + 1)
    expect(HOURLY_VARIABLES).toContain('wind_direction_10m')
  })

  it('batches a weather fetch the way the backend batches one', () => {
    // 50 and 4 are measured rather than chosen (issue #182): 50 locations is
    // what fits under Open-Meteo's 8,192-byte request URI, and 4 in flight is
    // the fairness gate. A browser that batched larger would be the one
    // visitor spending the quota everyone behind that address shares.
    expect(BATCH_SIZE).toBe(constants.BATCH_SIZE)
    expect(MAX_CONCURRENT_BATCHES).toBe(constants.MAX_CONCURRENT_BATCHES)
  })

  it('caps a browser analysis where the server caps one', () => {
    expect(MAX_ANALYZE_DESTINATIONS).toBe(constants.MAX_ANALYZE_PEAKS)
  })

  it('believes the wildfire simplification the backend applies', () => {
    expect(COARSE_TOLERANCE_DEG).toBe(constants.COARSE_OFFSET_DEG)
  })

  it('puts the archive boundary where the backend puts it', () => {
    expect(PAST_DATA_DAYS).toBe(constants.PAST_DATA_DAYS)
    expect(ARCHIVE_STRADDLE_DAYS).toBe(constants.ARCHIVE_STRADDLE_DAYS)
  })

  it('refuses a window the backend would refuse', () => {
    // The backend derives the past bound from ARCHIVE_DATA_DAYS; the browser
    // has no such constant, so it carries the resolved number and this is what
    // holds the two together.
    expect(PAST_LIMIT_SLACK_DAYS).toBe(constants.PAST_LIMIT_SLACK_DAYS)
    expect(FUTURE_LIMIT_SLACK_DAYS).toBe(constants.FUTURE_LIMIT_SLACK_DAYS)
  })
})

describe('the model-coverage sentence', () => {
  // The label is composed per model on both sides, so the manifest carries the
  // sentence with `{label}` where the name goes and the tail is what the two
  // surfaces below must spell.
  const tail = strings.model_coverage_message.replace('{label} ', '')
  const firstSentence = `${tail.split('. ')[0]}.`

  it('reads on the analysis path exactly as the backend writes it', () => {
    expect(useAnalyzeSource).toContain(tail)
  })

  it('reads on the model-compare path without the remedy clause', () => {
    // The compare panel drops the second sentence deliberately: unticking the
    // model in the picker is what removes these lines, so "switch to a
    // different model" is not its remedy. The first sentence is still shared.
    expect(useModelCompareSource).toContain(firstSentence)
  })
})
