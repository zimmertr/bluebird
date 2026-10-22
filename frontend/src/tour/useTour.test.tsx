import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { MapCamera, MapViewHandle } from '../components/MapView'
import { useTour } from './useTour'
import { sheetKeepOut, SPOTLIGHT_PAD } from './place'
import { placeAt } from '../testSupport/render'
import { TOUR_ATTR, TOUR_STEPS, TUTORIAL_PATH } from '../utils/tourSteps'

// The tour's state, driven through the hook. The browser suite walks the
// whole tour end to end; these pin what it leaves behind.

type Args = Parameters<typeof useTour>[0]

function setup(over: Partial<Args> = {}) {
  return renderHook(() =>
    useTour({
      isDesktop: true,
      sidebarOpen: true,
      setSidebarOpen: () => {},
      mapRef: { current: null },
      tourLayer: { shown: false, show: () => {} },
      ...over,
    }),
  )
}

/** An element the test puts on the page, taken off again however the test ends. */
function append<T extends HTMLElement>(el: T, parent: HTMLElement = document.body): T {
  parent.appendChild(el)
  onTestFinished(() => el.remove())
  return el
}

// `end` goes back over the entry `start` pushed, and jsdom lands that
// traversal as a popstate some time later, which would end whichever tour the
// next test had started by then. No test here reads where Back goes, so it
// goes nowhere, and every test starts from the app's own path.
beforeEach(() => {
  vi.spyOn(window.history, 'back').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the tour hands the keyboard back', () => {
  it('to the control that started it', () => {
    const link = append(document.createElement('a'))
    link.href = '/tutorial'
    const card = append(document.createElement('button'))
    link.focus()
    const { result } = setup()
    act(() => result.current.start())
    // The card takes the focus while the tour runs.
    card.focus()
    act(() => result.current.end())
    expect(document.activeElement).toBe(link)
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

// The Messages card runs on a demonstration (#786), so it stands in every
// tour whether or not the reader has a message, and holds the list open for
// its own step alone.
describe('the Messages card', () => {
  it('stands in every tour, and holds the list for its step alone', () => {
    const { result } = setup()
    act(() => result.current.start())
    const seen: [string, boolean][] = []
    for (;;) {
      const i = result.current.index
      if (i === null) break
      seen.push([result.current.steps[i].anchor, result.current.messagesHeld])
      act(() => result.current.next())
    }
    expect(seen.filter(([, held]) => held)).toEqual([['messages', true]])
    expect(result.current.messagesHeld).toBe(false)
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
      // Only the Chart step holds the sheet at its full stop.
      expect(result.current.sheetFull).toBe(result.current.steps[i].anchor === 'chart')
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

// Ending, by any route, puts back what the tour moved: the camera, the
// drawer and the panel's scroll.
describe('the tour puts the page back', () => {
  it('puts the camera, the drawer and the panel\'s scroll back when it ends', () => {
    const scroller = append(document.createElement('div'))
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    Object.defineProperty(scroller, 'clientHeight', { value: 600 })
    Object.defineProperty(scroller, 'scrollTop', { value: 120, writable: true })
    const section = append(document.createElement('section'), scroller)
    section.setAttribute(TOUR_ATTR, TOUR_STEPS[0].anchor)
    const camera = { center: [-121.7, 46.9], zoom: 9 } as unknown as MapCamera
    const setCamera = vi.fn()
    const setSidebarOpen = vi.fn()
    const mapRef = { current: { getCamera: () => camera, setCamera } as unknown as MapViewHandle }
    const { result } = setup({ mapRef, setSidebarOpen })
    act(() => result.current.start())
    // The tour scrolls the panel to each step's section.
    scroller.scrollTop = 300
    act(() => result.current.end())
    expect(setCamera).toHaveBeenCalledWith(camera)
    expect(setSidebarOpen).toHaveBeenLastCalledWith(true)
    expect(scroller.scrollTop).toBe(120)
  })

  it('steps back, but not past the first card', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.prev())
    expect(result.current.index).toBe(0)
    act(() => result.current.next())
    act(() => result.current.next())
    act(() => result.current.prev())
    expect(result.current.index).toBe(1)
  })

  // Back lands on the entry under the one `start` pushed, whose path is not
  // the tour's.
  it('ends on the browser\'s Back, and not on a traversal that stays on the tour', () => {
    const { result } = setup()
    act(() => result.current.start())
    expect(window.location.pathname).toBe(TUTORIAL_PATH)
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')))
    expect(result.current.index).toBe(0)
    window.history.replaceState(null, '', '/')
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')))
    expect(result.current.index).toBeNull()
  })
})

// The marker step opens the first demonstration row's popup, after two
// frames so the results have collapsed, with the card's keep-out on a phone,
// and takes it down when the step is left.
describe('the marker step', () => {
  // Frames the test runs by hand.
  function frames() {
    const queue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    return () => act(() => void queue.shift()?.(0))
  }

  async function toMarker(width: number) {
    const was = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    onTestFinished(() => {
      if (was) Object.defineProperty(window, 'innerWidth', was)
      else delete (window as { innerWidth?: number }).innerWidth
    })
    const frame = frames()
    const focusResult = vi.fn()
    const closePopups = vi.fn()
    const mapRef = { current: { getCamera: () => null, focusResult, closePopups } as unknown as MapViewHandle }
    const hook = setup({ mapRef })
    act(() => hook.result.current.start())
    while (hook.result.current.steps[hook.result.current.index!].anchor !== 'marker') {
      act(() => hook.result.current.next())
    }
    // The demonstration is a chunk of its own: let its import land inside act.
    await act(async () => {
      await import('./demoReport')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    return { ...hook, frame, focusResult, closePopups }
  }

  it('opens the first row\'s popup after two frames, and closes it at the end', async () => {
    const { result, frame, focusResult, closePopups } = await toMarker(1280)
    frame()
    expect(focusResult).not.toHaveBeenCalled()
    frame()
    expect(focusResult).toHaveBeenCalledWith(result.current.demo!.universe[0], { instant: true, avoid: [] })
    act(() => result.current.end())
    expect(closePopups).toHaveBeenCalled()
  })

  it('keeps the popup out of a phone\'s card', async () => {
    const card = append(document.createElement('div'))
    card.setAttribute('data-tour-card', '')
    placeAt(card, { left: 0, top: 560, width: 390, height: 180 })
    const { result, frame, focusResult } = await toMarker(390)
    frame()
    frame()
    const box = card.getBoundingClientRect()
    expect(focusResult).toHaveBeenCalledWith(result.current.demo!.universe[0], {
      instant: true,
      avoid: [sheetKeepOut(box, box.height, window.innerHeight, SPOTLIGHT_PAD)],
    })
  })
})
