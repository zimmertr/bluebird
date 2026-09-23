import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useForecastSelection } from './useForecastSelection'
import { capabilities, forecastModel } from '../testSupport/fixtures'
import { type ForecastSelection, addDays, dayKey } from '../utils/calendar'

const TODAY = dayKey(new Date())
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
    const fallback = capabilities({ defaultForecastModel: 'best_match' })
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

  it('answers the point-sample question of the panel, not of a report', () => {
    const { result } = renderHook(() => useForecastSelection(null, CAPS))
    expect(result.current.panelPointSample).toBe(true)
    act(() => result.current.changeSelection(days(1, 2)))
    expect(result.current.panelPointSample).toBe(false)
  })
})
