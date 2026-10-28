import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useForecastSelection } from './useForecastSelection'
import { FALLBACK_FORECAST_MODELS } from './useCapabilities'
import { capabilities, forecastModel } from '../testSupport/fixtures'
import { type ForecastSelection, addDays, bandEnd, bandStart, dayKey } from '../utils/calendar/calendar'

// The hook reads the clock at render, so the selections are built from the
// same fixed local noon rather than from an import-time read a run across
// midnight would leave a day behind.
let TODAY = ''
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 18, 12))
  TODAY = dayKey(new Date())
})
afterEach(() => {
  vi.useRealTimers()
})
const days = (from: number, to: number): ForecastSelection => ({
  kind: 'days',
  startDate: addDays(TODAY, from),
  endDate: addDays(TODAY, to),
})
const CAPS = capabilities({
  forecastModels: [
    forecastModel({ id: 'gfs_seamless', forecastHours: 384 }),
    forecastModel({ id: 'gfs_hrrr', forecastHours: 42 }),
  ],
})

describe('useForecastSelection', () => {
  it('opens on what the link restored', () => {
    const picked = days(1, 2)
    const { result } = renderHook(() =>
      useForecastSelection({ selection: picked, forecastModel: 'gfs_hrrr', compareModels: ['gfs_seamless'] }, CAPS),
    )
    expect(result.current.selection).toEqual(picked)
    expect(result.current.forecastModel).toBe('gfs_hrrr')
    expect(result.current.comparedModels).toEqual(['gfs_seamless'])
  })

  it('clamps on a model change, says so, and gives the window back', () => {
    const picked = days(5, 8)
    const { result } = renderHook(() => useForecastSelection({ selection: picked }, CAPS))
    act(() => result.current.changeForecastModel('gfs_hrrr'))
    expect(result.current.modelClamped).toBe(true)
    expect(result.current.selection).not.toEqual(picked)
    act(() => result.current.changeForecastModel('gfs_seamless'))
    expect(result.current.modelClamped).toBe(false)
    expect(result.current.selection).toEqual(picked)
  })

  it('retires the clamp and its memory on a window the user picks', () => {
    const { result } = renderHook(() => useForecastSelection({ selection: days(5, 8) }, CAPS))
    act(() => result.current.changeForecastModel('gfs_hrrr'))
    const mine = days(0, 1)
    act(() => result.current.changeSelection(mine))
    expect(result.current.modelClamped).toBe(false)
    act(() => result.current.changeForecastModel('gfs_seamless'))
    expect(result.current.selection).toEqual(mine)
  })

  it('forgets the pre-clamp window once an analysis pins one', () => {
    const { result } = renderHook(() => useForecastSelection({ selection: days(5, 8) }, CAPS))
    act(() => result.current.changeForecastModel('gfs_hrrr'))
    const clamped = result.current.selection
    act(() => result.current.forgetPreClamp())
    act(() => result.current.changeForecastModel('gfs_seamless'))
    expect(result.current.selection).toEqual(clamped)
  })

  it('adopts the published default only while nothing chose a model', () => {
    const fallback = capabilities({ forecastModels: FALLBACK_FORECAST_MODELS, defaultForecastModel: 'best_match' })
    const blank = renderHook(({ caps }) => useForecastSelection(null, caps), {
      initialProps: { caps: fallback },
    })
    blank.rerender({ caps: CAPS })
    expect(blank.result.current.forecastModel).toBe('gfs_seamless')

    const linked = renderHook(({ caps }) => useForecastSelection({ forecastModel: 'gfs_hrrr' }, caps), {
      initialProps: { caps: fallback },
    })
    linked.rerender({ caps: CAPS })
    expect(linked.result.current.forecastModel).toBe('gfs_hrrr')

    const picked = renderHook(({ caps }) => useForecastSelection(null, caps), {
      initialProps: { caps: fallback },
    })
    act(() => picked.result.current.changeForecastModel('gfs_hrrr'))
    picked.rerender({ caps: CAPS })
    expect(picked.result.current.forecastModel).toBe('gfs_hrrr')
  })

  // A link can name a model this deployment does not offer. Only the
  // deployment's own list can say so: the fallback holds one model because
  // nothing better is known yet.
  describe('a model the link named and the deployment does not offer', () => {
    const FALLBACK_CAPS = capabilities({ forecastModels: FALLBACK_FORECAST_MODELS })
    const linked = { forecastModel: 'not_a_model', compareModels: ['also_not', 'gfs_hrrr'] }

    it('is kept until the list arrives, then falls to the default', () => {
      const { result, rerender } = renderHook(({ caps }) => useForecastSelection(linked, caps), {
        initialProps: { caps: FALLBACK_CAPS },
      })
      expect(result.current.forecastModel).toBe('not_a_model')
      expect(result.current.comparedModels).toEqual(['also_not', 'gfs_hrrr'])
      rerender({ caps: CAPS })
      expect(result.current.forecastModel).toBe('gfs_seamless')
      expect(result.current.comparedModels).toEqual(['gfs_hrrr'])
    })

    // A failed fetch, or a build that publishes no list, leaves the fallback
    // in place for good. That is still not a list that can refuse a model.
    it('is kept when the deployment never publishes a list', () => {
      const { result } = renderHook(() => useForecastSelection(linked, FALLBACK_CAPS))
      expect(result.current.forecastModel).toBe('not_a_model')
      expect(result.current.comparedModels).toEqual(['also_not', 'gfs_hrrr'])
    })

    it('drops a compared model the fallback made the ranking one', () => {
      const { result } = renderHook(() =>
        useForecastSelection({ forecastModel: 'not_a_model', compareModels: ['gfs_seamless'] }, CAPS),
      )
      expect(result.current.forecastModel).toBe('gfs_seamless')
      expect(result.current.comparedModels).toEqual([])
    })

    // The panel says the link's model is not available here (#803, M6), from
    // the moment the list refuses it until the reader picks one.
    it('says so once the list refuses it, until the reader picks a model', () => {
      const { result, rerender } = renderHook(({ caps }) => useForecastSelection(linked, caps), {
        initialProps: { caps: FALLBACK_CAPS },
      })
      expect(result.current.modelLost).toBe(false)
      rerender({ caps: CAPS })
      expect(result.current.modelLost).toBe(true)
      act(() => result.current.changeForecastModel('gfs_hrrr'))
      expect(result.current.modelLost).toBe(false)
    })

    it('says nothing while no list can refuse it, or for a model the list offers', () => {
      expect(renderHook(() => useForecastSelection(linked, FALLBACK_CAPS)).result.current.modelLost).toBe(false)
      expect(
        renderHook(() => useForecastSelection({ forecastModel: 'gfs_hrrr' }, CAPS)).result.current.modelLost,
      ).toBe(false)
    })

    // A `model=` the decoder could not read never reached the state at all.
    it('says so for a model the decoder dropped', () => {
      const { result } = renderHook(() => useForecastSelection(null, CAPS, true))
      expect([result.current.forecastModel, result.current.modelLost]).toEqual(['gfs_seamless', true])
      act(() => result.current.changeForecastModel('gfs_seamless'))
      expect(result.current.modelLost).toBe(false)
    })

    it('leaves a model the list offers alone', () => {
      const { result } = renderHook(() =>
        useForecastSelection({ forecastModel: 'gfs_hrrr', compareModels: ['gfs_seamless'] }, CAPS),
      )
      expect(result.current.forecastModel).toBe('gfs_hrrr')
      expect(result.current.comparedModels).toEqual(['gfs_seamless'])
    })
  })

  // A link's dates outside the band opened the calendar on a month with every
  // day greyed (#803, M4). Once the published list lands they are held to the
  // band of the model that ranks, the way a model change holds them, and the
  // model's clamp line stays quiet: no model change did it.
  describe("a link's dates outside the band", () => {
    const FALLBACK_CAPS = capabilities({ forecastModels: FALLBACK_FORECAST_MODELS })
    const band = { forecastHours: 384, pastDays: 365, aqiDays: 5 }

    it('are clamped once the list lands, and not before', () => {
      const linked = { selection: days(200, 230) }
      const { result, rerender } = renderHook(({ caps }) => useForecastSelection(linked, caps), {
        initialProps: { caps: FALLBACK_CAPS },
      })
      expect(result.current.selection).toEqual(days(200, 230))
      rerender({ caps: CAPS })
      const last = bandEnd(new Date(), band)
      expect(result.current.selection).toEqual({ kind: 'days', startDate: last, endDate: last })
      expect(result.current.modelClamped).toBe(false)
    })

    it('are clamped at the near edge too, and to the band of the model that ranks', () => {
      const old = renderHook(() => useForecastSelection({ selection: days(-400, -398) }, CAPS))
      const first = bandStart(new Date(), band)
      expect(old.result.current.selection).toEqual({ kind: 'days', startDate: first, endDate: first })
      const hrrr = renderHook(() => useForecastSelection({ selection: days(0, 9), forecastModel: 'gfs_hrrr' }, CAPS))
      const hrrrEnd = bandEnd(new Date(), { ...band, forecastHours: 42 })
      expect(hrrr.result.current.selection).toEqual({ kind: 'days', startDate: TODAY, endDate: hrrrEnd })
    })

    it('leave a window inside the band, and the reader\'s own pick, alone', () => {
      expect(renderHook(() => useForecastSelection({ selection: days(1, 2) }, CAPS)).result.current.selection).toEqual(
        days(1, 2),
      )
      const { result, rerender } = renderHook(({ caps }) => useForecastSelection({ selection: days(200, 230) }, caps), {
        initialProps: { caps: FALLBACK_CAPS },
      })
      const mine = days(3, 4)
      act(() => result.current.changeSelection(mine))
      rerender({ caps: CAPS })
      expect(result.current.selection).toEqual(mine)
    })
  })

  it('answers the point-sample question of the panel, not of a report', () => {
    const { result } = renderHook(() => useForecastSelection(null, CAPS))
    expect(result.current.panelPointSample).toBe(true)
    act(() => result.current.changeSelection(days(1, 2)))
    expect(result.current.panelPointSample).toBe(false)
  })
})
