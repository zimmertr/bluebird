import type { MultiPolygon } from 'geojson'
import { describe, it, expect } from 'vitest'
import {
  ACTION_WORDS,
  actionWord,
  analyzeBlockers,
  analyzeGateFor,
  canAnalyze,
  refusalStands,
  retryStands,
  ringAddsNothing,
  ringUsable,
  shouldAutoAnalyze,
  AnalyzeGate,
  AnalyzeGateInputs,
  AutoAnalyzeState,
  type AnalyzeBlocker,
} from './analyzeGate'
import { NO_CONSTRAINTS } from './clientAnalyze'
import { discoveryKeys, type PanelState } from './present'
import { analyzedSnapshot, forecastModel, refusalPanel } from '../testSupport/fixtures'

// Every veto #803 added, off.
const NO_VETOES = {
  refused: false,
  overCap: null,
  spend: null,
  archiveCloud: false,
  archiveFreeze: false,
  aqiHorizon: false,
  boundOrder: false,
  modelDomain: null,
} satisfies Partial<AnalyzeGate>

// A fully-ready polygon analysis: three points drawn, no vetoes.
const READY_POLYGON: AnalyzeGate = {
  ...NO_VETOES,
  hasWindowWarning: false,
  datesPending: false,
  loading: false,
  areaTooLarge: false,
  polygonReady: true,
  hasCustom: false,
  hasPins: false,
  compareAqi: false,
  compareFreeze: false,
}

// The rule the type checkboxes grey on, which is the ring half of the polygon
// gate: a type with no usable ring discovers nothing.
describe('ringUsable', () => {
  it('holds from three points, inside the cap', () => {
    expect(ringUsable(0, false)).toBe(false)
    expect(ringUsable(2, false)).toBe(false)
    expect(ringUsable(3, false)).toBe(true)
  })
  it('fails a ring past the area cap however many points it has', () => {
    expect(ringUsable(8, true)).toBe(false)
  })
})

describe('canAnalyze — ranked inputs', () => {
  it('enables when a complete polygon is drawn', () => {
    expect(canAnalyze(READY_POLYGON)).toBe(true)
  })

  it('blocks an incomplete polygon with no CSV and no pins', () => {
    expect(canAnalyze({ ...READY_POLYGON, polygonReady: false })).toBe(false)
  })

  it('enables with a CSV alone — a polygon is not required', () => {
    expect(
      canAnalyze({ ...READY_POLYGON, polygonReady: false, hasCustom: true }),
    ).toBe(true)
  })

  it('enables with a polygon and a CSV together (the union)', () => {
    expect(canAnalyze({ ...READY_POLYGON, hasCustom: true })).toBe(true)
  })
})

describe('canAnalyze — pins-only path', () => {
  // No polygon, no CSV — just a searched pin in the table. Analyze becomes
  // "refetch the pinned forecasts for the selected window".
  const PINS_ONLY: AnalyzeGate = {
    ...READY_POLYGON,
    polygonReady: false,
    hasPins: true,
  }

  it('enables Analyze with pins alone', () => {
    expect(canAnalyze(PINS_ONLY)).toBe(true)
  })

  it('pins do not override a window warning', () => {
    expect(canAnalyze({ ...PINS_ONLY, hasWindowWarning: true })).toBe(false)
  })

  it('pins do not override an oversized polygon', () => {
    expect(canAnalyze({ ...PINS_ONLY, areaTooLarge: true })).toBe(false)
  })

  it('stays disabled while a fetch is in flight', () => {
    expect(canAnalyze({ ...PINS_ONLY, loading: true })).toBe(false)
  })
})

describe('analyzeBlockers', () => {
  // Nothing drawn, nothing pasted, nothing pinned: the panel's opening state.
  const EMPTY = { ...READY_POLYGON, polygonReady: false, drawPointCount: 0 }

  it('says nothing when Analyze is ready', () => {
    expect(analyzeBlockers({ ...READY_POLYGON, drawPointCount: 3 })).toEqual([])
  })

  it('names the missing input when there is none of any kind', () => {
    expect(analyzeBlockers(EMPTY)).toEqual(['destinations'])
  })

  // The reason this function replaced a ternary chain. Both were true at once
  // before; the panel showed the first, so fixing it revealed a second problem
  // that had been there the whole time.
  it('stacks an unservable window with a missing input', () => {
    expect(analyzeBlockers({ ...EMPTY, hasWindowWarning: true })).toEqual([
      'window',
      'destinations',
    ])
  })

  it('stacks an oversized polygon with an unservable window', () => {
    expect(
      analyzeBlockers({
        ...EMPTY,
        drawPointCount: 4,
        areaTooLarge: true,
        hasWindowWarning: true,
      }),
    ).toEqual(['area', 'window'])
  })

  // An unfinished polygon is its own instruction ("one more point"), so the
  // general "provide a destination" line would be naming the same gap twice.
  it('asks for the rest of a polygon rather than for a destination', () => {
    expect(analyzeBlockers({ ...EMPTY, drawPointCount: 2 })).toEqual(['polygon'])
  })

  // The bug the two-state split exists to prevent: an oversized polygon has
  // three or more points and is still not ready, which under a plain
  // "!polygonReady" test produced "add 0 more points" beside the real reason.
  it('does not ask for more points on an oversized polygon', () => {
    expect(analyzeBlockers({ ...EMPTY, drawPointCount: 5, areaTooLarge: true })).toEqual([
      'area',
    ])
  })

  it('says nothing about a polygon once a pasted list or a pin stands in for one', () => {
    expect(analyzeBlockers({ ...EMPTY, hasCustom: true })).toEqual([])
    expect(analyzeBlockers({ ...EMPTY, hasPins: true })).toEqual([])
  })

  // Mid-analysis the button reads "Analyzing…", which is the whole
  // explanation; a list of reasons under it would be noise the reader cannot
  // act on.
  it('is silent while a fetch is in flight', () => {
    expect(analyzeBlockers({ ...EMPTY, loading: true, hasWindowWarning: true })).toEqual([])
  })

  // The two must agree, or the panel disables a button and gives no reason —
  // or gives a reason for a button that works. Exhaustive over every
  // combination of the sixteen flags plus a representative point count each,
  // the three that carry a payload on or off with one. Mismatches are
  // gathered and compared once, since 393,216 expects would be the slow part.
  it('is non-empty exactly when canAnalyze is false', () => {
    const wrong: string[] = []
    for (let bits = 0; bits < 1 << 16; bits++) {
      for (const drawPointCount of [0, 2, 3]) {
        const on = (bit: number) => (bits & (1 << bit)) !== 0
        const gate: AnalyzeGate = {
          loading: false,
          hasWindowWarning: on(0),
          areaTooLarge: on(1),
          polygonReady: on(2),
          hasCustom: on(3),
          hasPins: on(4),
          datesPending: on(5),
          compareAqi: on(6),
          compareFreeze: on(7),
          refused: on(8),
          overCap: on(9) ? { found: 1501, noun: 'destination', limit: 1500 } : null,
          spend: on(10) ? { needed: 8357, limit: 5000 } : null,
          archiveCloud: on(11),
          archiveFreeze: on(12),
          aqiHorizon: on(13),
          boundOrder: on(14),
          modelDomain: on(15) ? 'NOAA HRRR' : null,
        }
        if (analyzeBlockers({ ...gate, drawPointCount }).length > 0 !== !canAnalyze(gate)) {
          wrong.push(`${JSON.stringify(gate)} points=${drawPointCount}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  // Each veto #803 added holds a ready analysis up alone, under its own name.
  it.each([
    ['refusal', { refused: true }],
    ['over-cap', { overCap: { found: 1501, noun: 'destination', limit: 1500 } }],
    ['spend', { spend: { needed: 8357, limit: 5000 } }],
    ['archive-cloud', { archiveCloud: true }],
    ['archive-freeze', { archiveFreeze: true }],
    ['aqi-horizon', { aqiHorizon: true }],
    ['model-domain', { modelDomain: 'NOAA HRRR' }],
    ['bound-order', { boundOrder: true }],
  ] as [AnalyzeBlocker, Partial<AnalyzeGate>][])('holds a ready analysis up for %s', (blocker, over) => {
    const gate = { ...READY_POLYGON, ...over }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 3 })).toEqual([blocker])
  })

  // The order the gate's comment states: the work first (the refused run,
  // the ring, the count, the spend, the window), the settings second, the
  // missing input last.
  it('keeps every blocker in its fixed order', () => {
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        polygonReady: false,
        drawPointCount: 0,
        refused: true,
        areaTooLarge: true,
        spend: { needed: 8357, limit: 5000 },
        hasWindowWarning: true,
        datesPending: true,
        compareAqi: true,
        compareFreeze: true,
        archiveCloud: true,
        archiveFreeze: true,
        aqiHorizon: true,
        modelDomain: 'NOAA HRRR',
        boundOrder: true,
      }),
    ).toEqual([
      'refusal',
      'area',
      'spend',
      'window',
      'dates',
      'compare-aqi',
      'compare-freeze',
      'archive-cloud',
      'archive-freeze',
      'aqi-horizon',
      'model-domain',
      'bound-order',
    ])
    expect(
      analyzeBlockers({ ...READY_POLYGON, polygonReady: false, drawPointCount: 0, boundOrder: true }),
    ).toEqual(['bound-order', 'destinations'])
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        drawPointCount: 3,
        areaTooLarge: true,
        overCap: { found: 1501, noun: 'destination', limit: 1500 },
        spend: { needed: 8357, limit: 5000 },
      }),
    ).toEqual(['area', 'over-cap', 'spend'])
  })

  // The over-cap line says what the refusal said, with the count as it
  // stands now, so the two never stand side by side.
  it('lets an over-cap line speak in the refusal\'s place', () => {
    const overCap = { found: 2613, noun: 'destination', limit: 1500 }
    const gate = { ...READY_POLYGON, refused: true, overCap }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 3 })).toEqual(['over-cap'])
  })
})

// Checkboxes made "what the polygon looks for" a set that can be empty, so a
// finished polygon is no longer proof of an input (#119 follow-on).
describe('a polygon with nothing checked', () => {
  const drawn = {
    ...NO_VETOES,
    hasWindowWarning: false,
    loading: false,
    areaTooLarge: false,
    polygonReady: false, // three points, but no types checked
    hasCustom: false,
    hasPins: false,
    datesPending: false,
    compareAqi: false,
    compareFreeze: false,
    drawPointCount: 4,
  }

  it('does not enable Analyze on its own', () => {
    expect(canAnalyze(drawn)).toBe(false)
  })

  it('says the polygon has nothing to look for, not that it is unfinished', () => {
    expect(analyzeBlockers(drawn)).toEqual(['types'])
  })

  it('stops being a blocker as soon as another input exists', () => {
    expect(analyzeBlockers({ ...drawn, hasCustom: true })).toEqual([])
    expect(analyzeBlockers({ ...drawn, hasPins: true })).toEqual([])
  })

  it('still reports an unfinished polygon as unfinished', () => {
    expect(analyzeBlockers({ ...drawn, drawPointCount: 2 })).toEqual(['polygon'])
  })

  // With another input the button stays open and the ring is simply ignored,
  // which the panel says rather than hides (#579). Only for a finished ring:
  // mid-draw the polygon's counter speaks for it.
  it('adds nothing beside another input, which Analyze still runs', () => {
    const withList = { ...drawn, hasCustom: true, drawing: false }
    expect(canAnalyze(withList)).toBe(true)
    expect(ringAddsNothing(withList)).toBe(true)
    expect(ringAddsNothing({ ...drawn, hasPins: true, drawing: false })).toBe(true)
  })

  it('says nothing while the ring is still being drawn', () => {
    expect(ringAddsNothing({ ...drawn, hasCustom: true, drawing: true })).toBe(false)
    expect(ringAddsNothing({ ...drawn, hasCustom: true, drawing: false, drawPointCount: 2 })).toBe(false)
  })

  it('says nothing for a ring with a type, an oversized ring, or no other input', () => {
    expect(ringAddsNothing({ ...drawn, hasCustom: true, drawing: false, polygonReady: true })).toBe(false)
    expect(ringAddsNothing({ ...drawn, hasCustom: true, drawing: false, areaTooLarge: true })).toBe(false)
    expect(ringAddsNothing({ ...drawn, drawing: false })).toBe(false)
  })
})

// Two settings the reader has already made can contradict each other, and the
// report they would buy cannot answer the question the panel is asking. Both
// veto Analyze rather than explaining themselves after the spend (TJ,
// 2026-09-14).
describe('a model selection the ranking cannot use', () => {
  it('blocks a ready analysis ranked on air quality with models compared', () => {
    const gate = { ...READY_POLYGON, compareAqi: true }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 4 })).toEqual(['compare-aqi'])
  })

  it('blocks a ranking on freezing level when a picked model has none', () => {
    const gate = { ...READY_POLYGON, compareFreeze: true }
    expect(canAnalyze(gate)).toBe(false)
    expect(analyzeBlockers({ ...gate, drawPointCount: 4 })).toEqual(['compare-freeze'])
  })

  // The vetoes are about work already done, so they lead the missing-input
  // lines and follow the window's own problems.
  it('reports every contradiction and keeps them in order', () => {
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        drawPointCount: 4,
        datesPending: true,
        compareAqi: true,
        compareFreeze: true,
      }),
    ).toEqual(['dates', 'compare-aqi', 'compare-freeze'])
  })

  // An input the reader has yet to give is still worth saying beside them.
  it('says the analysis has no destination as well', () => {
    expect(
      analyzeBlockers({
        ...READY_POLYGON,
        polygonReady: false,
        drawPointCount: 0,
        compareFreeze: true,
      }),
    ).toEqual(['compare-freeze', 'destinations'])
  })
})

// A link's run on open (#511): the same gate a click reads, after the live
// limits, and once.
describe('shouldAutoAnalyze', () => {
  const READY: AutoAnalyzeState = {
    requested: true,
    capabilitiesSettled: true,
    gateOpen: true,
    fired: false,
  }

  it('runs when the link asked, capabilities settled and the gate is open', () => {
    expect(shouldAutoAnalyze(READY)).toBe(true)
  })

  it('does not run before capabilities settle', () => {
    expect(shouldAutoAnalyze({ ...READY, capabilitiesSettled: false })).toBe(false)
  })

  it('does not run while the gate is closed', () => {
    expect(shouldAutoAnalyze({ ...READY, gateOpen: false })).toBe(false)
    // The gate it reads is the button's, so an incomplete input closes it.
    const gateOpen = canAnalyze({ ...READY_POLYGON, polygonReady: false })
    expect(shouldAutoAnalyze({ ...READY, gateOpen })).toBe(false)
  })

  it('does not run for a link that did not ask', () => {
    expect(shouldAutoAnalyze({ ...READY, requested: false })).toBe(false)
  })

  it('does not run a second time', () => {
    expect(shouldAutoAnalyze({ ...READY, fired: true })).toBe(false)
  })

  // The panel's effect, driven through a page load: capabilities land, the gate
  // opens, the run closes it (loading) and the end reopens it. Only the first
  // opening after settling may fire.
  it('fires exactly once across a load', () => {
    const steps: Array<Pick<AutoAnalyzeState, 'capabilitiesSettled' | 'gateOpen'>> = [
      { capabilitiesSettled: false, gateOpen: false },
      { capabilitiesSettled: false, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: false },
      { capabilitiesSettled: true, gateOpen: true },
      { capabilitiesSettled: true, gateOpen: true },
    ]
    let fired = false
    const firedAt: number[] = []
    steps.forEach((step, i) => {
      if (shouldAutoAnalyze({ requested: true, fired, ...step })) {
        fired = true
        firedAt.push(i)
      }
    })
    expect(firedAt).toEqual([2])
  })

  it('never fires across a load whose gate stays closed', () => {
    let fired = false
    for (const capabilitiesSettled of [false, true, true]) {
      if (shouldAutoAnalyze({ requested: true, fired, capabilitiesSettled, gateOpen: false })) {
        fired = true
      }
    }
    expect(fired).toBe(false)
  })
})

// The gate from the panel's inputs (#696): the panel's Analyze and the
// phone's Analyze on the map both build it here, so the two open together.
describe('analyzeGateFor', () => {
  const MODELS = [
    forecastModel(),
    forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
    forecastModel({ id: 'ukmo_seamless', label: 'UK Met Office' }),
  ]
  const PINNED: AnalyzeGateInputs = {
    selection: { kind: 'now' },
    hasWindowWarning: false,
    loading: false,
    polygonAreaKm2: null,
    maxAreaKm2: 1000,
    drawPointCount: 0,
    destinationTypes: [],
    hasCustom: false,
    hasPins: true,
    sortBy: 'temp_avg_f',
    forecastModels: MODELS,
    forecastModel: 'gfs_seamless',
    comparedModels: [],
    refusal: null,
    failedView: null,
    panel: refusalPanel(),
    customCount: 0,
    maxDestinations: 1500,
  }
  const gateOf = (over: Partial<AnalyzeGateInputs> = {}) => analyzeGateFor({ ...PINNED, ...over }).gate

  it('opens on a pin, and on nothing else when nothing else is given', () => {
    expect(canAnalyze(gateOf())).toBe(true)
    expect(canAnalyze(gateOf({ hasPins: false }))).toBe(false)
  })

  it('reads a ring as an input only once it is closed, inside the cap and has a type', () => {
    const ring = { hasPins: false, drawPointCount: 3, polygonAreaKm2: 10, destinationTypes: ['peak' as const] }
    expect(gateOf(ring).polygonReady).toBe(true)
    expect(gateOf({ ...ring, drawPointCount: 2 }).polygonReady).toBe(false)
    expect(gateOf({ ...ring, destinationTypes: [] }).polygonReady).toBe(false)
    const big = gateOf({ ...ring, polygonAreaKm2: 2000 })
    expect(big.areaTooLarge).toBe(true)
    expect(big.polygonReady).toBe(false)
  })

  it('shuts on a Dates arm with no day picked, a window warning or a run', () => {
    expect(gateOf({ selection: { kind: 'days', startDate: null, endDate: null } }).datesPending).toBe(true)
    expect(gateOf({ selection: { kind: 'days', startDate: '2026-10-13', endDate: '2026-10-13' } }).datesPending).toBe(false)
    expect(canAnalyze(gateOf({ hasWindowWarning: true }))).toBe(false)
    expect(canAnalyze(gateOf({ loading: true }))).toBe(false)
  })

  it('vetoes a comparison on air quality, and names the models with no freezing level', () => {
    expect(gateOf({ sortBy: 'aqi_avg', comparedModels: ['ecmwf_ifs025'] }).compareAqi).toBe(true)
    expect(gateOf({ sortBy: 'aqi_avg' }).compareAqi).toBe(false)
    const freeze = analyzeGateFor({ ...PINNED, sortBy: 'freeze_min_ft', comparedModels: ['ukmo_seamless'] })
    expect(freeze.freezeGaps).toEqual(['UK Met Office'])
    expect(freeze.gate.compareFreeze).toBe(true)
    expect(analyzeGateFor({ ...PINNED, sortBy: 'freeze_min_ft' }).freezeGaps).toEqual([])
  })

  // #803, D4: the list's size is known before any request, so a list over
  // the published cap is held here rather than refused after a press. The
  // noun is `analysisNoun`'s: a list makes it `destination`, ring or none.
  it('holds a list over the cap, with the count, the noun and the cap its line quotes', () => {
    expect(gateOf({ customCount: 1500 }).overCap).toBeNull()
    expect(gateOf({ customCount: 1501 }).overCap).toEqual({ found: 1501, noun: 'destination', limit: 1500 })
    const ring = { drawPointCount: 3, polygonAreaKm2: 10, destinationTypes: ['peak' as const] }
    expect(gateOf({ ...ring, customCount: 1501, maxDestinations: 1000 }).overCap).toEqual({
      found: 1501,
      noun: 'destination',
      limit: 1000,
    })
    expect(canAnalyze(gateOf({ customCount: 1501 }))).toBe(false)
  })

  // #803, D1: the ring's count ahead of Analyze joins the list's, because the
  // pod refuses the union, and a ring alone names its one kind.
  it("holds a ring whose count ahead of Analyze is over the cap, alone or with the list", () => {
    const ring = { hasPins: false, drawPointCount: 3, polygonAreaKm2: 10, destinationTypes: ['peak' as const] }
    expect(gateOf({ ...ring, ringCount: 1500 }).overCap).toBeNull()
    expect(gateOf({ ...ring, ringCount: 2613 }).overCap).toEqual({ found: 2613, noun: 'peak', limit: 1500 })
    expect(gateOf({ ...ring, ringCount: 1400, customCount: 101 }).overCap).toEqual({
      found: 1501,
      noun: 'destination',
      limit: 1500,
    })
    expect(canAnalyze(gateOf({ ...ring, ringCount: 2613 }))).toBe(false)
    expect(canAnalyze(gateOf({ ...ring, ringCount: null }))).toBe(true)
  })

  it('holds a spend the panel priced past the budget', () => {
    const spend = { needed: 9407, limit: 5000 }
    expect(gateOf({ spend }).spend).toEqual(spend)
    expect(canAnalyze(gateOf({ spend }))).toBe(false)
    expect(analyzeBlockers({ ...gateOf({ spend }), drawPointCount: 0 })).toEqual(['spend'])
  })

  it('holds a refusal that stands, and lets one go once the panel moves', () => {
    const failed = analyzedSnapshot(discoveryKeys(null, [], false))
    const refusal = { message: 'This search covers 1,501 destinations. The analysis limit is 1,500 destinations.' }
    expect(gateOf({ refusal, failedView: failed }).refused).toBe(true)
    expect(canAnalyze(gateOf({ refusal, failedView: failed }))).toBe(false)
    expect(gateOf({ refusal, failedView: failed, panel: refusalPanel({ forecastModel: 'ecmwf_ifs025' }) }).refused).toBe(
      false,
    )
    expect(gateOf({ refusal: null, failedView: failed }).refused).toBe(false)
  })

  it('leaves every #803 veto off when none of its inputs is given', () => {
    expect(gateOf()).toMatchObject(NO_VETOES)
    expect(gateOf({ spend: { needed: 8357, limit: 5000 } }).spend).toEqual({ needed: 8357, limit: 5000 })
  })

  // --- #803, W1 to W8 (record 0235)
  const DAY = { kind: 'days' as const, startDate: '2026-01-10', endDate: '2026-01-11' }

  // W1, W2: a ranking on a column the archive does not publish.
  it('blocks a cloud deck or freezing level ranking on an archive window', () => {
    expect(gateOf({ selection: DAY, source: 'archive', sortBy: 'cloud_deck_min_ft' }).archiveCloud).toBe(true)
    expect(gateOf({ selection: DAY, source: 'archive', sortBy: 'freeze_min_ft' }).archiveFreeze).toBe(true)
    expect(canAnalyze(gateOf({ selection: DAY, source: 'archive', sortBy: 'cloud_deck_min_ft' }))).toBe(false)
    // Air quality and snowfall the archive does answer, and so the rest.
    for (const sortBy of ['aqi_avg', 'snowfall_total_in', 'temp_avg_f'] as const) {
      expect(canAnalyze(gateOf({ selection: DAY, source: 'archive', sortBy }))).toBe(true)
    }
  })

  // Record 0072: the forecast half answers both.
  it('lets a window that spans the archive boundary rank on either', () => {
    expect(canAnalyze(gateOf({ source: 'spanning', sortBy: 'cloud_deck_min_ft' }))).toBe(true)
    expect(canAnalyze(gateOf({ source: 'spanning', sortBy: 'freeze_min_ft' }))).toBe(true)
  })

  // The archive's line speaks, not the model's: the picker it would name is
  // disabled on that window.
  it('names no model for a freezing level ranking on archive', () => {
    const archive = analyzeGateFor({ ...PINNED, source: 'archive', sortBy: 'freeze_min_ft', forecastModel: 'ecmwf_ifs025' })
    expect(archive.freezeGaps).toEqual([])
    expect(archive.gate.compareFreeze).toBe(false)
    expect(archive.gate.archiveFreeze).toBe(true)
    const forecast = analyzeGateFor({ ...PINNED, source: 'forecast', sortBy: 'freeze_min_ft', forecastModel: 'ecmwf_ifs025' })
    expect(forecast.freezeGaps).toEqual(['ECMWF IFS'])
    expect(forecast.gate.archiveFreeze).toBe(false)
  })

  // W3: compared models are ignored on archive, so neither comparison veto
  // can stand on a picker the reader cannot open.
  it('counts the ranking model alone on an archive window', () => {
    const compared = { comparedModels: ['ecmwf_ifs025'] }
    expect(gateOf({ ...compared, source: 'archive', sortBy: 'aqi_avg' }).compareAqi).toBe(false)
    expect(gateOf({ ...compared, source: 'forecast', sortBy: 'aqi_avg' }).compareAqi).toBe(true)
    const freeze = analyzeGateFor({ ...PINNED, ...compared, source: 'archive', sortBy: 'freeze_min_ft' })
    expect(freeze.gate.compareFreeze).toBe(false)
  })

  // W5: only a window wholly past the horizon.
  it('blocks an air quality ranking over a window wholly past its horizon', () => {
    expect(gateOf({ aqiCoverage: 'none', sortBy: 'aqi_avg' }).aqiHorizon).toBe(true)
    expect(gateOf({ aqiCoverage: 'partial', sortBy: 'aqi_avg' }).aqiHorizon).toBe(false)
    expect(gateOf({ aqiCoverage: 'none', sortBy: 'temp_avg_f' }).aqiHorizon).toBe(false)
  })

  // The table greys from this answer, so it rides out beside the gate.
  it('hands back the metrics it found unanswerable', () => {
    const { unanswered } = analyzeGateFor({ ...PINNED, source: 'archive', aqiCoverage: 'none' })
    expect([...unanswered.keys()].sort()).toEqual(['aqi', 'cloud_deck', 'freeze'])
  })

  // W7: a floor above its ceiling admits no row.
  it('blocks a bound whose minimum is above its maximum, but not one an inert box holds', () => {
    const inverted = { ...NO_CONSTRAINTS, minTempF: 50, maxTempF: 20 }
    expect(gateOf({ constraints: inverted }).boundOrder).toBe(true)
    expect(gateOf({ constraints: { ...NO_CONSTRAINTS, minTempF: 20, maxTempF: 20 } }).boundOrder).toBe(false)
    expect(gateOf({ constraints: NO_CONSTRAINTS }).boundOrder).toBe(false)
    const cloud = { ...NO_CONSTRAINTS, minCloudDeckFt: 9000, maxCloudDeckFt: 3000 }
    expect(gateOf({ constraints: cloud, source: 'forecast' }).boundOrder).toBe(true)
    expect(gateOf({ constraints: cloud, source: 'archive' }).boundOrder).toBe(false)
  })

  // W8: a regional model's published grid against every point to analyze.
  it('blocks a regional model whose domain leaves out a point, by its label', () => {
    const square: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[[[-125, 45], [-118, 45], [-118, 50], [-125, 50], [-125, 45]]]],
    }
    const models = [...MODELS, forecastModel({ id: 'gfs_hrrr', label: 'NOAA HRRR', regional: true, domain: square })]
    const inside = [{ latitude: 46.85, longitude: -121.76 }]
    const outside = [...inside, { latitude: 51.18, longitude: -115.57 }]
    const hrrr = { forecastModels: models, forecastModel: 'gfs_hrrr' }
    expect(gateOf({ ...hrrr, points: inside }).modelDomain).toBeNull()
    expect(gateOf({ ...hrrr, points: outside }).modelDomain).toBe('NOAA HRRR')
    expect(canAnalyze(gateOf({ ...hrrr, points: outside }))).toBe(false)
    // A compared regional model is held too, and a global one never.
    expect(gateOf({ forecastModels: models, comparedModels: ['gfs_hrrr'], points: outside }).modelDomain).toBe('NOAA HRRR')
    expect(gateOf({ forecastModels: models, points: outside }).modelDomain).toBeNull()
    // The archive names no model.
    expect(gateOf({ ...hrrr, points: outside, source: 'archive' }).modelDomain).toBeNull()
  })
  // --- end #803 W1 to W8
})

// The word on the Analyze button (#736). One button is the retry, and it says
// so only while the request the panel would send is the one that failed.
describe('retryStands', () => {
  const RING = { coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
  const WINDOW = { startMs: Date.UTC(2026, 6, 20, 6), endMs: Date.UTC(2026, 6, 20, 18) }
  // The run that failed: peaks inside RING over WINDOW on the default model.
  const failed = analyzedSnapshot({ window: WINDOW, ...discoveryKeys(RING, ['peak'], false) })
  const transient = { message: 'Open-Meteo request failed. Try again later.', retry: true }
  const panel = (over: Partial<Omit<PanelState, 'settled'>> = {}): Omit<PanelState, 'settled'> => ({
    selectionKind: 'days',
    windowMs: WINDOW,
    forecastModel: failed.forecastModel,
    comparedModels: [],
    polygon: RING,
    destinationTypes: ['peak'],
    includeUnnamedPeaks: false,
    pendingCount: 0,
    sortBy: 'precip_total_in',
    constraints: NO_CONSTRAINTS,
    ...over,
  })

  it('stands while a transient failure is up and the panel still describes its request', () => {
    expect(retryStands(transient, failed, panel())).toBe(true)
  })

  it('does not stand with no error, a dismissed error, or no failed run to compare against', () => {
    expect(retryStands(null, failed, panel())).toBe(false)
    expect(retryStands(transient, null, panel())).toBe(false)
  })

  // A model with no coverage over the area fails the same way again, so the
  // button keeps its own word and the box's sentence names the remedy.
  it('does not stand for a failure that would only repeat itself', () => {
    expect(retryStands({ message: 'No coverage.', retry: false }, failed, panel())).toBe(false)
  })

  // The same changes that stale a report revert the word: each is a request
  // the failed run never made.
  it.each([
    ['the model', { forecastModel: 'ecmwf_ifs025' }],
    ['a compared model', { comparedModels: ['ecmwf_ifs025'] }],
    ['the window', { windowMs: { startMs: WINDOW.startMs, endMs: WINDOW.endMs + 3_600_000 } }],
    ['the selection arm', { selectionKind: 'now' as const }],
    ['the ring', { polygon: { coordinates: [[[-122, 47], [-121, 47], [-121, 48], [-122, 47]]] } }],
    ['the types', { destinationTypes: ['peak', 'lake'] }],
    ['the unnamed-peaks toggle', { includeUnnamedPeaks: true }],
    ['a destination the run never saw', { pendingCount: 1 }],
  ] as [string, Partial<Omit<PanelState, 'settled'>>][])('falls when %s changes', (_what, over) => {
    expect(retryStands(transient, failed, panel(over))).toBe(false)
  })

  // Sort and the bounds re-present held rows and change nothing a run
  // fetches, so the failed request is still the one the panel would send.
  it('stands through a changed sort or bound', () => {
    expect(retryStands(transient, failed, panel({ sortBy: 'aqi_avg' }))).toBe(true)
    expect(retryStands(transient, failed, panel({ constraints: { ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.5 } }))).toBe(true)
  })

  // A cleared ring is no request either way: the ring cue is silent without
  // a complete ring, so a failed ring search with the ring since cleared
  // keeps the word until the run or the error goes.
  it('ignores the ring while none is drawn, as the commit cue does', () => {
    expect(retryStands(transient, failed, panel({ polygon: null }))).toBe(true)
  })
})

// A refused run holds Analyze until the panel describes a different request
// (#803). It reads the commit cues the way `retryStands` does, and two more
// changes the cues pass over, since a blocker with no way out is a trap.
describe('refusalStands', () => {
  const RING = { coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
  const WINDOW = { startMs: Date.UTC(2026, 6, 20, 6), endMs: Date.UTC(2026, 6, 20, 18) }
  // The run that was refused: peaks inside RING with two listed destinations.
  const failed = analyzedSnapshot({
    window: WINDOW,
    ...discoveryKeys(RING, ['peak'], true),
    customKeys: new Set(['47.1,-121.2', '47.2,-121.3']),
  })
  const refusal = { message: 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.' }
  const panel = (over: Partial<Parameters<typeof refusalStands>[2]> = {}) =>
    refusalPanel({
      windowMs: WINDOW,
      polygon: RING,
      destinationTypes: ['peak'],
      includeUnnamedPeaks: true,
      customCount: 2,
      ...over,
    })

  it('stands while the panel still describes the refused request', () => {
    expect(refusalStands(refusal, failed, panel())).toBe(true)
  })

  it('does not stand with no refusal or no refused run to compare against', () => {
    expect(refusalStands(null, failed, panel())).toBe(false)
    expect(refusalStands(refusal, null, panel())).toBe(false)
  })

  it.each([
    ['the model', { forecastModel: 'ecmwf_ifs025' }],
    ['a compared model', { comparedModels: ['ecmwf_ifs025'] }],
    ['the window', { windowMs: { startMs: WINDOW.startMs, endMs: WINDOW.endMs + 3_600_000 } }],
    ['the selection arm', { selectionKind: 'now' as const }],
    ['the ring', { polygon: { coordinates: [[[-122, 47], [-121, 47], [-121, 48], [-122, 47]]] } }],
    ['the types', { destinationTypes: ['peak', 'lake'] }],
    // The remedy for the reported case: unnamed peaks unticked.
    ['the unnamed-peaks toggle', { includeUnnamedPeaks: false }],
    ['a destination the run never saw', { pendingCount: 1, customCount: 3 }],
    // The two the commit cues pass over: a cleared ring, and a shorter list.
    ['the ring is cleared', { polygon: null }],
    ['a listed destination is taken out', { customCount: 1 }],
  ] as [string, Partial<Parameters<typeof refusalStands>[2]>][])('falls when %s changes', (_what, over) => {
    expect(refusalStands(refusal, failed, panel(over))).toBe(false)
  })

  // A sort or a bound changes nothing the pod is asked, so the same request
  // would be refused the same way.
  it('stands through a changed sort or bound', () => {
    expect(refusalStands(refusal, failed, panel({ sortBy: 'aqi_avg' }))).toBe(true)
    expect(refusalStands(refusal, failed, panel({ constraints: { ...NO_CONSTRAINTS, maxPrecipTotalIn: 0.5 } }))).toBe(true)
  })
})

describe('actionWord', () => {
  it('reads Analyzing… while a run is up, whatever else holds', () => {
    expect(actionWord(true, true)).toBe('Analyzing…')
    expect(actionWord(true, false)).toBe('Analyzing…')
  })

  it('reads Try again while a retry stands, and Analyze otherwise', () => {
    expect(actionWord(false, true)).toBe('Try again')
    expect(actionWord(false, false)).toBe('Analyze')
  })

  // The phone's floating button reserves every word's width (record 0135).
  it('lists every word the button can read', () => {
    expect(ACTION_WORDS).toEqual(['Analyze', 'Analyzing…', 'Try again'])
  })
})
