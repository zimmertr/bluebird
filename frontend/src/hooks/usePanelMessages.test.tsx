import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type PanelMessageState, usePanelMessages } from './usePanelMessages'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { analyzedSnapshot, forecastModel, refusalPanel } from '../testSupport/fixtures'
import { discoveryKeys } from '../utils/present'
import { NO_CONSTRAINTS } from '../utils/constraints'

// The panel's messages and the Analyze gate from one set of inputs (record
// 0208): what the badge counts, which severity colours it, and how a
// dismissal is kept. Which lines exist is
// `panelMessages.test.ts`; which reason wins the gate is `analyzeGate.test.ts`.

const MODELS = [
  forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' }),
  forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
]

// A panel with a pin and nothing wrong, so the gate is open and the list is
// empty; each case overrides the few inputs it is about.
function state(over: Partial<PanelMessageState> = {}): PanelMessageState {
  return {
    selection: { kind: 'now' },
    windowWarning: null,
    modelClamped: false,
    forecastModel: 'gfs_seamless',
    comparedModels: [],
    forecastModels: MODELS,
    polygonAreaKm2: null,
    maxAreaKm2: 100_000,
    drawPointCount: 0,
    drawing: false,
    destinationTypes: ['peak'],
    hasCustom: false,
    hasPins: true,
    sortBy: DEFAULT_FAMILY_KEY.precip,
    loading: false,
    error: null,
    refusal: null,
    failedView: null,
    failedPanel: refusalPanel(),
    customCount: 0,
    maxDestinations: 1500,
    failureSeq: 0,
    commitReasons: [],
    hasReport: false,
    aqiAllNull: false,
    wildfireCheckFailed: false,
    closureCheckFailed: false,
    basemapFailed: false,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    dismissEvent: () => {},
    constraints: NO_CONSTRAINTS,
    points: [],
    ...over,
  }
}

const hook = (over: Partial<PanelMessageState> = {}) =>
  renderHook((s: PanelMessageState) => usePanelMessages(s), { initialProps: state(over) })

describe('usePanelMessages', () => {
  it('says nothing with a pin and nothing wrong, and opens the gate', () => {
    const { result } = hook()
    expect(result.current).toMatchObject({
      messages: [],
      count: 0,
      worst: null,
      analyzeEnabled: true,
      blocked: false,
      areaTooLarge: false,
      pointsNeeded: 3,
      modelDisabled: false,
    })
  })

  it('holds Analyze up for a blocker, counts it, and reads it red', () => {
    const { result } = hook({ hasPins: false })
    expect(result.current.analyzeEnabled).toBe(false)
    expect(result.current.blocked).toBe(true)
    expect(result.current.count).toBe(1)
    expect(result.current.worst).toBe('error')
    expect(result.current.messages.map((m) => m.key)).toEqual(['blocker:destinations'])
  })

  // Every blocker the gate names holds the button up and reads red on the
  // badge (record 0210), whatever it is about.
  const BLOCKED: [string, Partial<PanelMessageState>, string][] = [
    ['an oversized ring', { drawPointCount: 4, polygonAreaKm2: 200_000 }, 'blocker:area'],
    ['a ring short of points', { hasPins: false, drawPointCount: 2 }, 'blocker:polygon'],
    ['a ring with no type', { hasPins: false, drawPointCount: 3, destinationTypes: [] }, 'blocker:types'],
    ['no day picked', { selection: { kind: 'days', startDate: null, endDate: null } }, 'blocker:dates'],
    ['a window nothing serves', { windowWarning: 'order' }, 'blocker:window'],
    ['air quality compared', { sortBy: DEFAULT_FAMILY_KEY.aqi, comparedModels: ['ecmwf_ifs025'] }, 'blocker:compare-aqi'],
    [
      'a freezing level compared on a model without one',
      { sortBy: DEFAULT_FAMILY_KEY.freeze, comparedModels: ['ecmwf_ifs025'] },
      'blocker:compare-freeze',
    ],
    // #803: a list over the published cap, known before any request.
    ['a list over the cap', { hasCustom: true, customCount: 1501 }, 'blocker:over-cap'],
  ]

  // #803: a refused run is a blocker, said once in its own words, until the
  // panel describes a different request.
  it('holds Analyze up for a refusal that stands, and lets it go once the panel moves', () => {
    const message = 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.'
    const refused = {
      refusal: { message },
      failedView: analyzedSnapshot(discoveryKeys(null, [], false)),
      failedPanel: refusalPanel(),
    }
    const { result, rerender } = hook(refused)
    expect(result.current.blocked).toBe(true)
    expect(result.current.messages).toEqual([{ key: 'blocker:refusal', text: message, severity: 'error' }])
    // No dismissal reaches it.
    act(() => result.current.dismiss('blocker:refusal'))
    expect(result.current.count).toBe(1)
    rerender(state({ ...refused, failedPanel: refusalPanel({ forecastModel: 'ecmwf_ifs025' }) }))
    expect(result.current.blocked).toBe(false)
    expect(result.current.messages).toEqual([])
  })

  it('says the list over the cap in the over-cap sentence', () => {
    const { result } = hook({ hasCustom: true, customCount: 2613 })
    expect(result.current.messages.map((m) => m.text)).toEqual([
      'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
    ])
  })

  it('hands the failure count on, which opens the list', () => {
    expect(hook({ failureSeq: 3 }).result.current.failureSeq).toBe(3)
  })

  it.each(BLOCKED)('holds Analyze up for %s and reads red', (_case, over, key) => {
    const { result } = hook(over)
    expect(result.current.blocked).toBe(true)
    expect(result.current.messages.find((m) => m.key === key)?.severity).toBe('error')
    expect(result.current.worst).toBe('error')
  })

  it('reads the area cap and the points still needed off the gate', () => {
    const { result } = hook({ drawPointCount: 4, polygonAreaKm2: 200_000 })
    expect(result.current.areaTooLarge).toBe(true)
    expect(result.current.worst).toBe('error')
    expect(hook({ drawPointCount: 2 }).result.current.pointsNeeded).toBe(1)
    expect(hook({ drawPointCount: 5 }).result.current.pointsNeeded).toBe(0)
  })

  it('colours the badge by the worst severity present', () => {
    expect(hook({ commitReasons: ['model-changed'] }).result.current.worst).toBe('warn')
    // A blocker beside a stale report: the button is held up, and the badge
    // says so before the list is opened.
    expect(hook({ commitReasons: ['model-changed'], hasPins: false }).result.current.worst).toBe('error')
    expect(hook({ commitReasons: ['model-changed'], error: { message: 'boom', retry: true } }).result.current.worst).toBe('error')
  })

  // Busy is the button's own news, not a reason the reader can act on.
  it('is busy rather than blocked while a run is up', () => {
    const { result } = hook({ loading: true })
    expect(result.current.analyzeEnabled).toBe(false)
    expect(result.current.blocked).toBe(false)
  })

  // A dismissal lives as long as its condition: once the line is gone and
  // comes back, it is news again.
  it('keeps a dismissed line out until its condition clears and returns', () => {
    const { result, rerender } = hook({ commitReasons: ['model-changed'] })
    expect(result.current.messages.map((m) => m.key)).toEqual(['cue:model-changed'])
    act(() => result.current.dismiss('cue:model-changed'))
    expect(result.current.messages).toEqual([])
    expect(result.current.count).toBe(0)
    rerender(state({ commitReasons: [] }))
    rerender(state({ commitReasons: ['model-changed'] }))
    expect(result.current.messages.map((m) => m.key)).toEqual(['cue:model-changed'])
  })

  // An event line is one run's outcome, held as state: dismissing it clears
  // the event (#736) rather than hiding the line in the ledger.
  it('hands an event dismissal up and leaves the line to its state', () => {
    const dismissEvent = vi.fn()
    const { result } = hook({ error: { message: 'boom', retry: true }, dismissEvent })
    act(() => result.current.dismiss('error:boom'))
    expect(dismissEvent).toHaveBeenCalledExactlyOnceWith('error')
    expect(result.current.messages.map((m) => m.key)).toEqual(['error:boom'])
  })

  // What a link could not restore (#803, M6) is information, counted on the
  // badge in blue, and dismissable like every derived line: the ledger keeps
  // it out while the loss stands, and it goes with its condition.
  it('counts what a link lost, lets the reader dismiss it, and keeps it gone', () => {
    const { result, rerender } = hook({ linkLost: ['ring', 'model'] })
    expect(result.current.messages.map((m) => m.key)).toEqual(['link:ring', 'link:model'])
    expect(result.current.worst).toBe('info')
    expect(result.current.analyzeEnabled).toBe(true)
    act(() => result.current.dismiss('link:ring'))
    expect(result.current.messages.map((m) => m.key)).toEqual(['link:model'])
    // The reader picked a model: that line is gone too.
    rerender(state({ linkLost: ['ring'] }))
    expect(result.current.messages).toEqual([])
    rerender(state({ linkLost: [] }))
    expect(result.current.count).toBe(0)
  })

  // A blocker stands until the reader supplies what it asks.
  it('passes over the dismissal of a blocker', () => {
    const dismissEvent = vi.fn()
    const { result } = hook({ hasPins: false, dismissEvent })
    act(() => result.current.dismiss('blocker:destinations'))
    expect(result.current.messages.map((m) => m.key)).toEqual(['blocker:destinations'])
    expect(dismissEvent).not.toHaveBeenCalled()
  })

  // A window the archive answers names no model (#123): the picker fades and
  // the list says why.
  it('fades the model for a window the archive answers', () => {
    const day = new Date()
    day.setDate(day.getDate() - 100)
    const date = day.toISOString().slice(0, 10)
    const { result } = hook({ selection: { kind: 'days', startDate: date, endDate: date } })
    expect(result.current.modelDisabled).toBe(true)
    expect(result.current.messages.map((m) => m.key)).toContain('window:archive-model')
  })

  // --- #803, W1 to W8 (record 0235): the window's source and the bounds
  // reach the gate, and the greyed rows ride out beside it.
  const archiveDay = () => {
    const day = new Date()
    day.setDate(day.getDate() - 100)
    const date = day.toISOString().slice(0, 10)
    return { kind: 'days' as const, startDate: date, endDate: date }
  }
  const keys = (r: { current: { messages: readonly { key: string }[] } }) => r.current.messages.map((m) => m.key)

  it('greys the metrics an archive window cannot answer and blocks a ranking on one', () => {
    const { result } = hook({ selection: archiveDay(), sortBy: 'cloud_deck_min_ft' })
    expect([...result.current.unanswered.keys()].sort()).toEqual(['cloud_deck', 'freeze'])
    expect(result.current.analyzeEnabled).toBe(false)
    expect(keys(result)).toContain('blocker:archive-cloud')
  })

  // The archive's line speaks, not the compare line naming a model in a
  // picker the window disables, and the compared models are ignored there.
  it('names the archive, not a model, for a freezing level ranking on archive', () => {
    const { result } = hook({
      selection: archiveDay(),
      sortBy: 'freeze_min_ft',
      forecastModel: 'ecmwf_ifs025',
      comparedModels: ['gfs_seamless'],
    })
    expect(keys(result)).toContain('blocker:archive-freeze')
    expect(keys(result)).not.toContain('blocker:compare-freeze')
  })

  it('holds a bound whose minimum is above its maximum', () => {
    const { result } = hook({ constraints: { ...NO_CONSTRAINTS, minTempF: 50, maxTempF: 20 } })
    expect(result.current.analyzeEnabled).toBe(false)
    expect(keys(result)).toEqual(['blocker:bound-order'])
  })
  // --- end #803 W1 to W8
})
