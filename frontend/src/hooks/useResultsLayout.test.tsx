import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ResultsLayoutInputs, useResultsLayout } from './useResultsLayout'
import { readViewPrefs } from '../utils/viewPrefs'

// jsdom has no media queries, so the one the Both widening asks is answered
// here: a desktop width unless a test says otherwise.
function setDesktopQuery(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }))
}

function setViewport(height: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

const DESKTOP: ResultsLayoutInputs = {
  modeChosen: null,
  isDesktop: true,
  bannerPx: 0,
  showTable: true,
  response: null,
  analysisSeq: 0,
}

beforeEach(() => {
  setDesktopQuery(true)
  setViewport(1000)
})
afterEach(() => vi.unstubAllGlobals())

describe('useResultsLayout', () => {
  it('opens on Table, or on the mode a reader once pressed', () => {
    expect(renderHook(() => useResultsLayout(DESKTOP)).result.current.resultsMode).toBe('table')
    const stored = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'chart' }))
    expect(stored.result.current.resultsMode).toBe('chart')
  })

  it('widens a desktop to Both when a report lands, and only then', () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    expect(result.current.resultsMode).toBe('table')
    rerender({ ...DESKTOP, response: {}, analysisSeq: 1 })
    expect(result.current.resultsMode).toBe('both')
  })

  it('never overrides a mode the reader pressed, or a phone', () => {
    const pressed = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: { ...DESKTOP, modeChosen: 'table' as const },
    })
    pressed.rerender({ ...DESKTOP, modeChosen: 'table', response: {}, analysisSeq: 1 })
    expect(pressed.result.current.resultsMode).toBe('table')

    setDesktopQuery(false)
    const phone = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: { ...DESKTOP, isDesktop: false },
    })
    phone.rerender({ ...DESKTOP, isDesktop: false, response: {}, analysisSeq: 1 })
    expect(phone.result.current.resultsMode).toBe('table')
  })

  // Only a press persists: the automatic widening must not write itself back
  // as though the reader had chosen it.
  it('stores a press, and nothing else', () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    rerender({ ...DESKTOP, response: {}, analysisSeq: 1 })
    expect(readViewPrefs().modeChosen).toBeNull()
    act(() => result.current.chooseResultsMode('chart'))
    expect(result.current.resultsMode).toBe('chart')
    expect(readViewPrefs().modeChosen).toBe('chart')
  })

  it('draws one panel on a phone too short for two, and gives Both back when it grows', () => {
    setViewport(560)
    const { result } = renderHook(() =>
      useResultsLayout({ ...DESKTOP, isDesktop: false, modeChosen: 'both' }),
    )
    expect(result.current.bothHasRoom).toBe(false)
    expect(result.current.resultsMode).toBe('table')
    act(() => {
      setViewport(1000)
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.bothHasRoom).toBe(true)
    expect(result.current.resultsMode).toBe('both')
  })

  it('puts a dragged panel back on a double press', () => {
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'chart' }))
    const opened = result.current.chartPanelPx
    act(() => result.current.chartGrip.onDragStart())
    expect(result.current.isDragging).toBe(true)
    act(() => result.current.chartGrip.onDrag(120))
    act(() => result.current.chartGrip.onDragEnd())
    expect(result.current.isDragging).toBe(false)
    expect(result.current.chartPanelPx).toBeGreaterThan(opened)
    act(() => result.current.chartGrip.onReset())
    expect(result.current.chartPanelPx).toBe(opened)
  })

  // In Both the divider trades one panel for the other and keeps the sum.
  it('keeps the pair its sum when the divider moves', () => {
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'both' }))
    const sum = result.current.chartPanelPx + result.current.tablePanelPx
    act(() => result.current.tableGrip.onDragStart())
    act(() => result.current.tableGrip.onDrag(40))
    expect(result.current.tablePanelPx).toBeGreaterThan(result.current.chartPanelPx)
    expect(result.current.chartPanelPx + result.current.tablePanelPx).toBe(sum)
  })

  it('collapses both panels and leaves no chart showing', () => {
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'both' }))
    expect(result.current.chartShowing).toBe(true)
    act(() => result.current.toggleCollapsed())
    expect(result.current.resultsCollapsed).toBe(true)
    expect(result.current.chartShowing).toBe(false)
  })

  // Docked below the map, the results cover none of it, so nothing on the map
  // rides up and the camera keeps no room for a sheet.
  it('lifts nothing on a desktop', () => {
    const { result } = renderHook(() => useResultsLayout(DESKTOP))
    expect(result.current.sheetLiftPx).toBe(0)
    expect(result.current.cameraPadBottomPx).toBe(0)
  })

  // MapView is memoized, and the camera padding is one of its props.
  it('keeps the camera padding and its callbacks stable across a render that changes nothing', () => {
    const { result, rerender } = renderHook(() =>
      useResultsLayout({ ...DESKTOP, isDesktop: false }),
    )
    const before = result.current
    rerender()
    expect(result.current.cameraPadBottomPx).toBe(before.cameraPadBottomPx)
    expect(result.current.cameraPadBottomPx).toBeGreaterThan(0)
    expect(result.current.chooseResultsMode).toBe(before.chooseResultsMode)
    expect(result.current.toggleCollapsed).toBe(before.toggleCollapsed)
  })
})
