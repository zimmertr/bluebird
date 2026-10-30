import { describe, expect, it } from 'vitest'
import { AQI_NOTE_KEY, AQI_PARTIAL_KEY, panelMessages, type PanelMessageInputs } from './panelMessages'
import type { AnalyzeBlocker } from './analyzeGate'
import type { CommitReason } from './present'
import { FIRE_UNAVAILABLE_NOTE } from './fireProximity'
import { CLOSURE_UNAVAILABLE_NOTE } from './closureProximity'
import { archiveSeamPhrase } from './calendar/calendar'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { NOUN } from '../metrics'

// Which lines the panel has to say, one case per line and the condition that
// raises it, and one case for the order they come in. The list the Analyze
// button's badge opens renders whatever this returns; `ControlPanel.test.tsx`
// shows that it does, and `notices.test.ts` covers the boxing and dismissal
// that follow.

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
    overCap: null,
    spend: null,
    modelDomain: null,
    ringIgnored: false,
    pointsNeeded: 0,
    freezeGaps: [],
    maxAreaKm2: 100_000,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    hasReport: false,
    aqiAllNull: false,
    aqiPartial: false,
    wildfireCheckFailed: false,
    closureCheckFailed: false,
    basemapFailed: false,
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
    // One line, and nothing a reader presses: whether the run is worth
    // repeating is the Analyze button's word (#736, `retryStands`).
    it('is one error line, keyed on its message', () => {
      expect(only({ error: { message: 'Open-Meteo request failed. Try again later.' } })).toEqual({
        key: 'error:Open-Meteo request failed. Try again later.',
        text: 'Open-Meteo request failed. Try again later.',
        severity: 'error',
      })
    })

    it('gives way to a refusal', () => {
      expect(
        keys({ error: { message: 'boom' }, refusal: { message: 'Too many.' }, blockers: ['refusal'] }),
      ).toEqual(['blocker:refusal'])
    })
  })

  // A refusal is a blocker (#803): it says its sentence once, as the gate's
  // line, and never as an event line of its own beside it.
  describe('the refusal', () => {
    it('is said once, as its blocker, in its own words', () => {
      expect(only({ refusal: { message: 'Too many.' }, blockers: ['refusal'] })).toEqual({
        key: 'blocker:refusal',
        text: 'Too many.',
        severity: 'error',
      })
    })

    it('says nothing once the gate no longer names it', () => {
      expect(keys({ refusal: { message: 'Too many.' } })).toEqual([])
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
      ['window', {}, 'error', 'Adjust the forecast window to continue.'],
      ['dates', {}, 'error', 'Select at least one date to analyze.'],
      ['destinations', {}, 'error', 'Provide at least one destination to analyze.'],
      ['polygon', { pointsNeeded: 1 }, 'error', 'Add at least 1 more point to the polygon to continue.'],
      ['types', {}, 'error', 'Select at least one destination type for the polygon search.'],
      [
        'compare-aqi',
        {},
        'error',
        `${NOUN.aqi} data is retrieved independently of the model and cannot be compared.`,
      ],
      [
        'compare-freeze',
        { freezeGaps: ['ECMWF IFS', 'DWD ICON'] },
        'error',
        `${NOUN.freeze} data is not available for ECMWF IFS and DWD ICON.`,
      ],
      // The approved lines of #803, each spelled out in full here so a
      // reword anywhere fails this table.
      [
        'refusal',
        { refusal: { message: 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.' } },
        'error',
        'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
      ],
      [
        'over-cap',
        { overCap: { found: 2613, noun: 'destination', limit: 1500 } },
        'error',
        'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
      ],
      [
        'spend',
        { spend: { needed: 8357, limit: 5000 } },
        'error',
        'This analysis needs 8,357 Open-Meteo calls. The hourly limit is 5,000.',
      ],
      ['archive-cloud', {}, 'error', 'Cloud deck data is not available for archive windows.'],
      ['archive-freeze', {}, 'error', 'Freezing level data is not available for archive windows.'],
      ['aqi-horizon', {}, 'error', `${NOUN.aqi} data is not available for this forecast window.`],
      ['model-domain', { modelDomain: 'NOAA HRRR' }, 'error', 'NOAA HRRR has no forecast coverage for this area.'],
      ['bound-order', {}, 'error', 'A filter minimum is above its maximum.'],
    ]

    it.each(BLOCKERS)('says why %s blocks, at its severity', (blocker, over, severity, text) => {
      expect(only({ blockers: [blocker], ...over })).toEqual({
        key: `blocker:${blocker}`,
        text,
        severity,
      })
    })

    // The text counts down as the user draws ("2 more points" to "1 more
    // point"), but the key stays `blocker:polygon`, so a dismissal holds
    // through the countdown instead of resurfacing per click.
    it('counts the points still needed in the plural', () => {
      expect(only({ blockers: ['polygon'], pointsNeeded: 2 }).text).toBe(
        'Add at least 2 more points to the polygon to continue.',
      )
    })

    it('keeps the order the gate gave', () => {
      expect(keys({ blockers: ['polygon', 'types'] })).toEqual(['blocker:polygon', 'blocker:types'])
    })

    // A finished ring with no type beside a pasted list: Analyze runs, and the
    // same sentence says, as information, why the ring adds nothing (#579).
    it('says the types line as information when the ring blocks nothing', () => {
      expect(only({ ringIgnored: true })).toEqual({
        key: 'ring:types',
        text: 'Select at least one destination type for the polygon search.',
        severity: 'info',
      })
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

  describe('the closure line', () => {
    it('is an error in the shared sentence when the check failed', () => {
      expect(only({ closureCheckFailed: true })).toEqual({
        key: 'closure:unavailable',
        text: CLOSURE_UNAVAILABLE_NOTE,
        severity: 'error',
      })
    })

    it('waits while an analysis runs', () => {
      expect(keys({ closureCheckFailed: true, loading: true })).toEqual([])
    })
  })

  // A share link that opened without part of what it carried (#803, M6):
  // one info line each, keyed on the condition, in a fixed order.
  describe('what a link could not restore', () => {
    it.each([
      ['ring', "The link's search area could not be restored."],
      ['list', "The link's destination list could not be restored."],
      ['model', "The link's forecast model is not available here."],
    ] as const)('says the %s is gone, as information', (what, text) => {
      expect(only({ linkLost: [what] })).toEqual({ key: `link:${what}`, text, severity: 'info' })
    })

    it('says nothing with nothing lost, or with no report of losses at all', () => {
      expect(keys({ linkLost: [] })).toEqual([])
      expect(keys({ linkLost: undefined })).toEqual([])
    })

    it('says each in one order, whatever order it was reported in', () => {
      expect(keys({ linkLost: ['model', 'list', 'ring'] })).toEqual(['link:ring', 'link:list', 'link:model'])
    })

    // About the link the panel was built from, so ahead of the window's lines
    // and of the blockers.
    it('comes before the window lines and the blockers', () => {
      expect(keys({ linkLost: ['ring'], source: 'archive', blockers: ['destinations'] })).toEqual([
        'link:ring',
        'window:archive-model',
        'blocker:destinations',
      ])
    })
  })

  describe('the basemap line', () => {
    // #580: a blank map says why, below Analyze with every other message.
    it('says the map could not load while the basemap style is failing', () => {
      expect(only({ basemapFailed: true })).toEqual({
        key: 'map:style',
        text: 'The map could not load. Try again later.',
        severity: 'error',
      })
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
      ['the run failed', { error: { message: 'boom' } }],
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

  // #803, D5: one refused air-quality batch nulls every batch after it, so a
  // field can rank on air quality with holes in it.
  describe('air quality that failed for part of the field', () => {
    const partial = { hasReport: true, aqiPartial: true }

    it('warns in the approved sentence', () => {
      expect(only(partial)).toEqual({
        key: AQI_PARTIAL_KEY,
        text: 'Air quality data is missing for some destinations.',
        severity: 'warn',
      })
    })

    it.each([
      ['there is no report', { hasReport: false }],
      ['an analysis runs', { loading: true }],
      ['the run failed', { error: { message: 'boom' } }],
      ['every displayed row is without it, which the other line says', { aqiAllNull: true }],
    ] as [string, Partial<PanelMessageInputs>][])('stays quiet when %s', (_case, over) => {
      expect(keys({ ...partial, ...over })).not.toContain(AQI_PARTIAL_KEY)
    })
  })

  // The fixed order within the list: why the last run failed, why the report
  // is stale, what the window costs, why the button is disabled, then what a
  // delivered report is missing. `noticeBoxes` then splits it by severity and
  // keeps this order inside each box.
  it('puts every line in one fixed order', () => {
    expect(
      keys({
        error: { message: 'boom' },
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
        blockers: ['refusal', 'dates'],
        hasReport: true,
        wildfireCheckFailed: true,
        closureCheckFailed: true,
      }),
    ).toEqual([
      'window:archive-model',
      'window:clamped',
      'window:aqi-horizon',
      'blocker:refusal',
      'blocker:dates',
      'fire:unavailable',
      'closure:unavailable',
    ])
    expect(keys({ hasReport: true, aqiAllNull: true, aqiCoverage: 'partial', blockers: ['types'] })).toEqual([
      'window:aqi-horizon',
      'blocker:types',
      AQI_NOTE_KEY,
    ])
  })
})
