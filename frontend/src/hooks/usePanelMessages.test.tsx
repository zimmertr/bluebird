import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type PanelMessageState, usePanelMessages } from './usePanelMessages'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { forecastModel } from '../testSupport/fixtures'

// The panel's messages and the Analyze gate from one set of inputs (record
// 0208): what the badge counts, which severity colours it, which line stands
// under which field, and how a dismissal is kept. Which lines exist is
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
    ...over,
  }
}

const hook = (over: Partial<PanelMessageState> = {}) =>
  renderHook((s: PanelMessageState) => usePanelMessages(s), { initialProps: state(over) })

const EMPTY_HOMES = { destinations: [], polygon: [], types: [], model: [], when: [] }

describe('usePanelMessages', () => {
  it('says nothing with a pin and nothing wrong, and opens the gate', () => {
    const { result } = hook()
    expect(result.current).toMatchObject({
      messages: [],
      count: 0,
      worst: null,
      blockers: EMPTY_HOMES,
      analyzeEnabled: true,
      blocked: false,
      areaTooLarge: false,
      pointsNeeded: 3,
      modelDisabled: false,
    })
  })

  it('holds Analyze up for a blocker, counts it, and homes it on its field', () => {
    const { result } = hook({ hasPins: false })
    expect(result.current.analyzeEnabled).toBe(false)
    expect(result.current.blocked).toBe(true)
    expect(result.current.count).toBe(1)
    expect(result.current.worst).toBe('info')
    expect(result.current.blockers).toMatchObject({ ...EMPTY_HOMES, destinations: [{ key: 'blocker:destinations' }] })
  })

  // Each blocker under the field it validates (`BLOCKER_HOME`).
  const HOMES: [string, Partial<PanelMessageState>, string, string][] = [
    ['an oversized ring', { drawPointCount: 4, polygonAreaKm2: 200_000 }, 'polygon', 'blocker:area'],
    ['a ring short of points', { hasPins: false, drawPointCount: 2 }, 'polygon', 'blocker:polygon'],
    ['a ring with no type', { hasPins: false, drawPointCount: 3, destinationTypes: [] }, 'types', 'blocker:types'],
    ['no day picked', { selection: { kind: 'days', startDate: null, endDate: null } }, 'when', 'blocker:dates'],
    ['a window nothing serves', { windowWarning: 'order' }, 'when', 'blocker:window'],
    [
      'air quality compared',
      { sortBy: DEFAULT_FAMILY_KEY.aqi, comparedModels: ['ecmwf_ifs025'] },
      'model',
      'blocker:compare-aqi',
    ],
    [
      'a freezing level compared on a model without one',
      { sortBy: DEFAULT_FAMILY_KEY.freeze, comparedModels: ['ecmwf_ifs025'] },
      'model',
      'blocker:compare-freeze',
    ],
  ]

  it.each(HOMES)('homes %s under its field', (_case, over, home, key) => {
    const { result } = hook(over)
    expect(result.current.blocked).toBe(true)
    const lines = result.current.blockers[home as keyof typeof EMPTY_HOMES]
    expect(lines.map((m) => m.key)).toContain(key)
    for (const [other, those] of Object.entries(result.current.blockers)) {
      if (other !== home) expect(those).toEqual([])
    }
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
    expect(hook({ commitReasons: ['model-changed'], hasPins: false }).result.current.worst).toBe('warn')
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

  // A blocker is the field's state until the reader supplies what it asks.
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
})
