import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTour } from './useTour'

// The tour's card takes the keyboard for its whole run and then unmounts, so
// the focus would fall to the body when it ends. These pin where it goes back
// to (#576). The rest of the tour is driven end to end in the browser suite.

function setup() {
  return renderHook(() =>
    useTour({
      isDesktop: true,
      sidebarOpen: true,
      setSidebarOpen: () => {},
      mapRef: { current: null },
      tourLayer: { shown: false, show: () => {} },
    }),
  )
}

describe('the tour hands the keyboard back', () => {
  it('to the control that started it', () => {
    const link = document.body.appendChild(document.createElement('a'))
    link.href = '/tutorial'
    const card = document.body.appendChild(document.createElement('button'))
    link.focus()
    const { result } = setup()
    act(() => result.current.start())
    // The card takes the focus while the tour runs.
    card.focus()
    act(() => result.current.end())
    expect(document.activeElement).toBe(link)
    link.remove()
    card.remove()
  })

  it('to nothing when that control has left the page', () => {
    const welcome = document.body.appendChild(document.createElement('button'))
    welcome.focus()
    const { result } = setup()
    act(() => result.current.start())
    welcome.remove()
    act(() => result.current.end())
    expect(document.activeElement).toBe(document.body)
  })
})

// The Results and Chart steps ask the sheet to open at rest in their view
// before their spotlight reads it (#696); the marker step after them
// collapses it.
describe('the tour opens the results for their steps', () => {
  it('asks for the table on the results step and the chart on the chart step', () => {
    const { result } = setup()
    act(() => result.current.start())
    const seen: [string, string | null, boolean | null][] = []
    for (;;) {
      const i = result.current.index
      if (i === null) break
      seen.push([result.current.steps[i].anchor, result.current.sheetView, result.current.sheetCollapsed])
      act(() => result.current.next())
    }
    expect(seen.filter(([, view]) => view !== null).map(([a, view]) => [a, view])).toEqual([
      ['results', 'table'],
      ['chart', 'chart'],
    ])
    expect(seen.find(([a]) => a === 'marker')?.[2]).toBe(true)
  })
})

// The Chart card shows the readout as a finger resting mid-window shows it
// (#696): no pointer is drawn and nothing sweeps, the hour simply stands.
describe('the chart readout under the tour', () => {
  it('stands on the demonstration\'s middle hour through the results steps, and lets go at the end', async () => {
    // An earlier test's tour went back over its own history entry, and that
    // traversal's popstate would end this one: let it land first.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const { result } = setup()
    act(() => result.current.start())
    const anchor = () => result.current.steps[result.current.index!].anchor
    while (anchor() !== 'results') {
      expect(result.current.chartTooltipIndex).toBeNull()
      act(() => result.current.next())
    }
    // The demonstration is a chunk of its own: let its import land inside act.
    await act(async () => {
      await import('./demoReport')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(result.current.demo).not.toBeNull()
    const hours = result.current.demo!.response.times!.length
    const middle = Math.floor((hours - 1) / 2)
    expect(middle).toBeGreaterThan(0)
    expect(middle).toBeLessThan(hours - 1)
    expect(result.current.chartTooltipIndex).toBe(middle)
    act(() => result.current.next())
    expect(anchor()).toBe('chart')
    expect(result.current.chartTooltipIndex).toBe(middle)
    act(() => result.current.end())
    expect(result.current.chartTooltipIndex).toBeNull()
  })
})

// A phone's Layers step switches the tour's layer on for its length, and
// off when it is left, unless the reader already had it on (#696).
describe('the Layers step on a phone', () => {
  function phone(shown: boolean) {
    const show = vi.fn()
    const hook = renderHook(() =>
      useTour({
        isDesktop: false,
        sidebarOpen: false,
        setSidebarOpen: () => {},
        mapRef: { current: null },
        tourLayer: { shown, show },
      }),
    )
    act(() => hook.result.current.start())
    return { ...hook, show }
  }
  const toStep = (result: { current: ReturnType<typeof useTour> }, anchor: string) => {
    while (result.current.steps[result.current.index!].anchor !== anchor) act(() => result.current.next())
  }

  it('switches the layer on for the step and off after it', () => {
    const { result, show } = phone(false)
    toStep(result, 'layers')
    expect(show.mock.calls).toEqual([[true]])
    act(() => result.current.next())
    expect(show.mock.calls).toEqual([[true], [false]])
  })

  it('leaves a layer the reader had on alone', () => {
    const { result, show } = phone(true)
    toStep(result, 'layers')
    act(() => result.current.end())
    expect(show).not.toHaveBeenCalled()
  })
})
