import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { demoMessageList, useDemoMessages } from './demoMessages'
import { panelMessages } from '../testSupport/fixtures'
import { blockerKey, blockerOf } from '../utils/notices'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import type { FooterMessage } from '../utils/notices'

// The tutorial's Messages card stands on a fixed demonstration (#786): the
// two lines come out of the app's own derivation, and they stand in for the
// reader's only while the card holds the list.

const LIMITS = { aqiForecastDays: 5, archiveDays: 365, maxAreaKm2: 25_000, windowLimits: FALLBACK_WINDOW_LIMITS }
const READER: FooterMessage[] = [{ key: 'cue:model-changed', text: 'A reader line.', severity: 'warn' }]

describe('the demonstration list', () => {
  it('is a red blocker with no × and a blue line with one, in the live words', () => {
    const list = demoMessageList(LIMITS)
    expect(list.map((m) => [m.key, m.severity])).toEqual([
      ['window:aqi-horizon', 'info'],
      [blockerKey('dates'), 'error'],
    ])
    expect(list.map((m) => m.text)).toEqual(['AQI forecasts only extend 5 days.', 'Select at least one date to analyze.'])
    expect(list.map((m) => blockerOf(m.key))).toEqual([null, 'dates'])
  })

  it('reads the published horizon rather than a copy of it', () => {
    expect(demoMessageList({ ...LIMITS, aqiForecastDays: 4 })[0].text).toBe('AQI forecasts only extend 4 days.')
  })
})

describe('useDemoMessages', () => {
  function setup(held: boolean) {
    const real = panelMessages({ messages: READER })
    return renderHook(({ held }) => useDemoMessages(held, real, LIMITS), { initialProps: { held } })
  }

  it('hands the reader\'s own messages through while the card is not up', () => {
    const { result } = setup(false)
    expect(result.current.messages).toEqual(READER)
    expect(result.current.held).toBe(false)
  })

  it('greys Analyze under a red count of two while the card holds the list', () => {
    const { result } = setup(true)
    expect(result.current).toMatchObject({ count: 2, worst: 'error', analyzeEnabled: false, blocked: true, held: true })
    expect(result.current.messages.map((m) => m.key)).not.toContain('cue:model-changed')
  })

  it('takes a dismissed line out of the demonstration alone, never the blocker, and puts it back next time', () => {
    const { result, rerender } = setup(true)
    act(() => result.current.dismiss(blockerKey('dates')))
    act(() => result.current.dismiss('window:aqi-horizon'))
    expect(result.current.messages.map((m) => m.key)).toEqual([blockerKey('dates')])
    rerender({ held: false })
    expect(result.current.messages).toEqual(READER)
    rerender({ held: true })
    expect(result.current.count).toBe(2)
  })
})
