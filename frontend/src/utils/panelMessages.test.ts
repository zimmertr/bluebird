import { describe, expect, it } from 'vitest'
import { AQI_NOTE_KEY, panelMessages, type PanelMessageInputs } from './panelMessages'
import type { AnalyzeBlocker } from './analyzeGate'
import type { CommitReason } from './present'
import { FIRE_UNAVAILABLE_NOTE } from './fireProximity'
import { archiveSeamPhrase } from './calendar'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { NOUN } from '../metrics'

// Which lines the panel shows under the Analyze button, one case per line and
// the condition that raises it, and one case for the order they come in. The
// panel renders whatever this returns; `ControlPanel.test.tsx` shows that it
// does, and `notices.test.ts` covers the boxing and dismissal that follow.

const NOW = new Date('2026-09-22T12:00:00Z')

// A panel with nothing to say: no run, no report, no stale knob, no blocker,
// and a window the air-quality forecast covers.
function inputs(over: Partial<PanelMessageInputs> = {}): PanelMessageInputs {
  return {
    loading: false,
    error: null,
    refusal: null,
    commitReasons: [],
    modelLabel: 'NOAA GFS',
    modelClamped: false,
    windowWarning: null,
    window: null,
    source: null,
    aqiCoverage: 'full',
    blockers: [],
    pointsNeeded: 0,
    freezeGaps: [],
    maxAreaKm2: 100_000,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    hasReport: false,
    aqiAllNull: false,
    wildfireCheckFailed: false,
    now: NOW,
    ...over,
  }
}

const keys = (over: Partial<PanelMessageInputs>) => panelMessages(inputs(over)).map((m) => m.key)
const only = (over: Partial<PanelMessageInputs>) => {
  const messages = panelMessages(inputs(over))
  expect(messages).toHaveLength(1)
  return messages[0]
}

describe('panelMessages', () => {
  it('says nothing when nothing is wrong', () => {
    expect(panelMessages(inputs())).toEqual([])
  })

  describe('the run error', () => {
    it('is one error line that offers a retry, keyed on its message', () => {
      expect(only({ error: 'Open-Meteo request failed. Try again later.' })).toEqual({
        key: 'error:Open-Meteo request failed. Try again later.',
        text: 'Open-Meteo request failed. Try again later.',
        severity: 'error',
        retry: true,
      })
    })

    it('gives way to a refusal', () => {
      expect(keys({ error: 'boom', refusal: { message: 'Too many.' } })).toEqual(['refusal:Too many.'])
    })
  })

  describe('the refusal', () => {
    it('is one error line with no retry, keyed on its message', () => {
      expect(only({ refusal: { message: 'Too many.' } })).toEqual({
        key: 'refusal:Too many.',
        text: 'Too many.',
        severity: 'error',
      })
    })

    it('waits while an analysis runs', () => {
      expect(keys({ refusal: { message: 'Too many.' }, loading: true })).toEqual([])
    })
  })

  describe('the commit cues', () => {
    const CUES: [CommitReason, string][] = [
      ['window-changed', 'A new forecast range requires a new analysis.'],
      ['model-changed', 'A new forecast model requires a new analysis.'],
      ['polygon-changed', 'A new search area requires a new analysis.'],
      ['types-changed', 'A new destination type requires a new analysis.'],
      ['destination-added', 'A new destination requires a new analysis.'],
    ]

    it.each(CUES)('warns %s with its own sentence', (reason, text) => {
      expect(only({ commitReasons: [reason] })).toEqual({ key: `cue:${reason}`, text, severity: 'warn' })
    })

    it('says every reason, in the order it was given', () => {
      expect(keys({ commitReasons: ['model-changed', 'window-changed'] })).toEqual([
        'cue:model-changed',
        'cue:window-changed',
      ])
    })

    it('waits while an analysis runs', () => {
      expect(keys({ commitReasons: ['model-changed'], loading: true })).toEqual([])
    })
  })

  describe('the window lines', () => {
    it('says why the model does not apply to an archive window', () => {
      expect(only({ source: 'archive' })).toEqual({
        key: 'window:archive-model',
        text: 'Archive data uses no forecast model.',
        severity: 'info',
      })
    })

    it('says nothing about the model for a forecast or a crossing window', () => {
      expect(keys({ source: 'forecast' })).toEqual([])
      expect(keys({ source: 'spanning' })).not.toContain('window:archive-model')
    })

    it('names the model that shortened the window', () => {
      expect(only({ modelClamped: true })).toEqual({
        key: 'window:clamped',
        text: 'NOAA GFS shortened the window.',
        severity: 'warn',
      })
    })

    it.each([
      ['order', 'The narrowed hours end before they start.'],
      ['past', 'Forecast range starts before the 365-day limit.'],
      ['future', 'NOAA GFS does not reach that far.'],
    ] as const)('warns a %s window with its own sentence', (warning, text) => {
      expect(only({ windowWarning: warning })).toEqual({
        key: `window:${warning}`,
        text,
        severity: 'warn',
      })
    })

    it('names the seam of a window that crosses the archive boundary', () => {
      const window = {
        startMs: Date.parse('2026-07-01T00:00:00Z'),
        endMs: Date.parse('2026-09-23T00:00:00Z'),
      }
      expect(only({ source: 'spanning', window })).toEqual({
        key: 'window:spanning',
        text: archiveSeamPhrase(window.startMs, window.endMs, 'NOAA GFS', NOW, FALLBACK_WINDOW_LIMITS),
        severity: 'info',
      })
    })

    it('names no seam without a window to cut', () => {
      expect(keys({ source: 'spanning', window: null })).toEqual([])
    })

    it.each(['partial', 'none'] as const)(
      'says how far air quality reaches when it covers %s of the window',
      (aqiCoverage) => {
        expect(only({ aqiCoverage })).toEqual({
          key: 'window:aqi-horizon',
          text: `${NOUN.aqi} forecasts only extend 5 days.`,
          severity: 'info',
        })
      },
    )

    it('leaves the air-quality horizon unsaid while the window itself is wrong', () => {
      expect(keys({ aqiCoverage: 'partial', windowWarning: 'order' })).toEqual(['window:order'])
    })
  })

  describe('the Analyze blockers', () => {
    const BLOCKERS: [AnalyzeBlocker, Partial<PanelMessageInputs>, string, string][] = [
      ['area', {}, 'error', `The polygon is too large. The maximum supported size is ${(100_000).toLocaleString()} km².`],
      ['window', {}, 'info', 'Adjust the forecast window to continue.'],
      ['dates', {}, 'info', 'Select at least one date to analyze.'],
      ['destinations', {}, 'info', 'Provide at least one destination to analyze.'],
      ['polygon', { pointsNeeded: 1 }, 'info', 'Add at least 1 more point to the polygon to continue.'],
      ['types', {}, 'info', 'Select at least one destination type for the polygon search.'],
      [
        'compare-aqi',
        {},
        'warn',
        `${NOUN.aqi} data is retrieved independently of the model and cannot be compared.`,
      ],
      [
        'compare-freeze',
        { freezeGaps: ['ECMWF IFS', 'DWD ICON'] },
        'warn',
        `${NOUN.freeze} data is not available for ECMWF IFS and DWD ICON.`,
      ],
      ['compare-snow', {}, 'warn', `${NOUN.snow} is retrieved independently of the model and cannot be compared.`],
    ]

    it.each(BLOCKERS)('says why %s blocks, at its severity', (blocker, over, severity, text) => {
      expect(only({ blockers: [blocker], ...over })).toEqual({
        key: `blocker:${blocker}`,
        text,
        severity,
      })
    })

    it('counts the points still needed in the plural', () => {
      expect(only({ blockers: ['polygon'], pointsNeeded: 2 }).text).toBe(
        'Add at least 2 more points to the polygon to continue.',
      )
    })

    it('keeps the order the gate gave', () => {
      expect(keys({ blockers: ['polygon', 'types'] })).toEqual(['blocker:polygon', 'blocker:types'])
    })
  })

  describe('the wildfire line', () => {
    it('is an error in the shared sentence when the check failed', () => {
      expect(only({ wildfireCheckFailed: true })).toEqual({
        key: 'fire:unavailable',
        text: FIRE_UNAVAILABLE_NOTE,
        severity: 'error',
      })
    })

    it('waits while an analysis runs', () => {
      expect(keys({ wildfireCheckFailed: true, loading: true })).toEqual([])
    })
  })

  describe('the air-quality gap in a report', () => {
    const empty = { hasReport: true, aqiAllNull: true }

    it('warns when every row came back without air quality inside the horizon', () => {
      expect(only(empty)).toEqual({
        key: AQI_NOTE_KEY,
        text: `${NOUN.aqi} data is not available for this forecast window.`,
        severity: 'warn',
      })
    })

    it.each([
      ['there is no report', { hasReport: false }],
      ['an analysis runs', { loading: true }],
      ['the run failed', { error: 'boom' }],
      ['the run was refused', { refusal: { message: 'Too many.' } }],
      ['some row has air quality', { aqiAllNull: false }],
    ] as [string, Partial<PanelMessageInputs>][])('stays quiet when %s', (_case, over) => {
      expect(keys({ ...empty, ...over })).not.toContain(AQI_NOTE_KEY)
    })

    // Past the horizon the empty column is expected, and the horizon line
    // already says so.
    it('stays quiet when the window is wholly past the horizon', () => {
      expect(keys({ ...empty, aqiCoverage: 'none' })).toEqual(['window:aqi-horizon'])
    })
  })

  // The fixed order within the list: why the last run failed, why the report
  // is stale, what the window costs, why the button is disabled, then what a
  // delivered report is missing. `noticeBoxes` then splits it by severity and
  // keeps this order inside each box.
  it('puts every line in one fixed order', () => {
    expect(
      keys({
        error: 'boom',
        commitReasons: ['model-changed', 'window-changed'],
        source: 'spanning',
        window: { startMs: Date.parse('2026-07-01T00:00:00Z'), endMs: Date.parse('2026-09-23T00:00:00Z') },
        modelClamped: true,
        windowWarning: 'future',
        blockers: ['polygon'],
        pointsNeeded: 2,
        wildfireCheckFailed: true,
      }),
    ).toEqual([
      'error:boom',
      'cue:model-changed',
      'cue:window-changed',
      'window:clamped',
      'window:future',
      'window:spanning',
      'blocker:polygon',
      'fire:unavailable',
    ])
    expect(
      keys({
        source: 'archive',
        modelClamped: true,
        aqiCoverage: 'partial',
        refusal: { message: 'Too many.' },
        hasReport: true,
        wildfireCheckFailed: true,
      }),
    ).toEqual(['window:archive-model', 'window:clamped', 'window:aqi-horizon', 'fire:unavailable', 'refusal:Too many.'])
    expect(keys({ hasReport: true, aqiAllNull: true, aqiCoverage: 'partial', blockers: ['types'] })).toEqual([
      'window:aqi-horizon',
      'blocker:types',
      AQI_NOTE_KEY,
    ])
  })
})
