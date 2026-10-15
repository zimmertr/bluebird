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

  // #687: a short desk column opens the first report on Table, because Both
  // would pin the table at its floor under a short map. The reader can still
  // press Both, and a press wins over the opening.
  it('keeps a short desk column on Table when a report lands', () => {
    setViewport(768)
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    rerender({ ...DESKTOP, response: {}, analysisSeq: 1 })
    expect(result.current.resultsMode).toBe('table')
    act(() => result.current.chooseResultsMode('both'))
    expect(result.current.resultsMode).toBe('both')
  })

  it('counts the preview banner out of the column it measures', () => {
    setViewport(800)
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: { ...DESKTOP, bannerPx: 30 },
    })
    rerender({ ...DESKTOP, bannerPx: 30, response: {}, analysisSeq: 1 })
    expect(result.current.resultsMode).toBe('table')
  })

  // #560: the first rows widen it before anything commits, and a first run
  // that never commits leaves the pre-analysis screen, which opens on Table.
  it('narrows back to Table when the rows of a first run go without a commit', () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    rerender({ ...DESKTOP, response: {} })
    expect(result.current.resultsMode).toBe('both')
    rerender(DESKTOP)
    expect(result.current.resultsMode).toBe('table')
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
    setViewport(520)
    // A report on screen, so the pending-only hold below is not what decides.
    const { result } = renderHook(() =>
      useResultsLayout({ ...DESKTOP, isDesktop: false, modeChosen: 'both', response: {} }),
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

  // The tutorial's Results step (#696): the reverse of a row tap's collapse,
  // set as state so the sheet stays open when the step ends, and on a phone
  // the resting Table a first report opens in, without storing the mode.
  it("opens the sheet to rest in Table view for the tutorial's results step", () => {
    setDesktopQuery(false)
    setViewport(1000)
    const PHONE = { ...DESKTOP, isDesktop: false, response: {} }
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: PHONE,
    })
    const resting = result.current.tablePanelPx
    act(() => result.current.chooseResultsMode('chart'))
    act(() => result.current.chartGrip.onDragStart())
    act(() => result.current.chartGrip.onDrag(120))
    act(() => result.current.chartGrip.onDragEnd())
    act(() => result.current.collapse())
    expect(result.current.resultsCollapsed).toBe(true)
    rerender({ ...PHONE, restRequested: true })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('table')
    expect(result.current.tablePanelPx).toBe(resting)
    // The press stays the stored answer: the tour chose Table, the reader did not.
    expect(readViewPrefs().modeChosen).toBe('chart')
    // The step ends and the sheet stays where it put it.
    rerender({ ...PHONE, restRequested: false })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('table')
  })

  it('only opens the docked results on a desk, keeping their mode', () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    act(() => result.current.chooseResultsMode('chart'))
    act(() => result.current.toggleCollapsed())
    rerender({ ...DESKTOP, restRequested: true })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('chart')
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

  // A phone sheet holding only rows nobody has forecast yet draws the table
  // alone (#696): an empty chart took most of the sheet a search had opened.
  // The saved mode is left alone and comes back with the first report.
  it('holds a pending-only phone sheet to the table, and gives the saved mode back', () => {
    setDesktopQuery(false)
    const phone: ResultsLayoutInputs = { ...DESKTOP, isDesktop: false, modeChosen: 'both' }
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: phone,
    })
    expect(result.current.resultsMode).toBe('table')
    expect(result.current.chartShowing).toBe(false)
    expect(readViewPrefs().modeChosen).toBeNull()
    rerender({ ...phone, response: {}, analysisSeq: 1 })
    expect(result.current.resultsMode).toBe('both')
  })

  // A press is the reader answering the hold, and a segment that ignores one
  // reads as broken.
  it('lets a press on the segment lift the hold', () => {
    setDesktopQuery(false)
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, isDesktop: false }))
    act(() => result.current.chooseResultsMode('chart'))
    expect(result.current.resultsMode).toBe('chart')
  })

  it('never holds a desktop', () => {
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'chart' }))
    expect(result.current.resultsMode).toBe('chart')
  })

  // A searched place is framed for the sheet it is about to open (#696): the
  // padding before the sheet opens is the one the camera takes once it has.
  it('knows the resting lift of a sheet that is not open yet', () => {
    setDesktopQuery(false)
    const closed: ResultsLayoutInputs = { ...DESKTOP, isDesktop: false, showTable: false }
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: closed,
    })
    expect(result.current.cameraPadBottomPx).toBe(0)
    const coming = result.current.sheetPadBottomPx
    expect(coming).toBeGreaterThan(0)
    rerender({ ...closed, showTable: true })
    expect(result.current.cameraPadBottomPx).toBe(coming)
    // The table alone, which is what a pending-only sheet holds to: a
    // stored Both would otherwise have padded for two panels.
    const both = renderHook(() => useResultsLayout({ ...closed, modeChosen: 'both' }))
    expect(both.result.current.sheetPadBottomPx).toBe(coming)
  })

  it('pads for no sheet on a desktop', () => {
    expect(renderHook(() => useResultsLayout({ ...DESKTOP, showTable: false })).result.current.sheetPadBottomPx).toBe(0)
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

  // The sheet's MEASURED height is what the map's bottom chrome rides on a
  // phone. The measurement runs after every render on purpose (no deps), so a
  // height that changes without any input changing is still caught.
  it('lifts the map chrome by the measured sheet on a phone, after every render', () => {
    setDesktopQuery(false)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    let height = 321
    const sheet = document.createElement('div')
    sheet.getBoundingClientRect = () => ({ height }) as DOMRect
    const phone = { ...DESKTOP, isDesktop: false }
    const { result, rerender } = renderHook(() => useResultsLayout(phone))
    act(() => {
      result.current.sheetRef.current = sheet
    })
    rerender()
    expect(result.current.sheetLiftPx).toBe(321)
    expect(result.current.mapCornerLift).toBe(321)
    height = 400
    rerender()
    expect(result.current.sheetLiftPx).toBe(400)
  })

  // A phone's home indicator band (record 0145): the foot stands on it with
  // no sheet, the sheet's padding is the band's, and the panels give the band
  // up rather than the map. A desk takes none of it.
  it('stands a phone on the home indicator band and gives the panels the rest', () => {
    setDesktopQuery(false)
    setViewport(844)
    const closed: ResultsLayoutInputs = { ...DESKTOP, isDesktop: false, showTable: false }
    const bare = renderHook(() => useResultsLayout(closed)).result.current
    const banded = renderHook(() => useResultsLayout({ ...closed, safeBottomPx: 34 })).result.current
    expect(bare.sheetLiftPx).toBe(0)
    expect(banded.sheetLiftPx).toBe(34)
    // The sheet it is about to open rests the band higher, with the same panels less the band.
    expect(banded.sheetPadBottomPx - bare.sheetPadBottomPx).toBeLessThanOrEqual(34)
    expect(banded.sheetPadBottomPx).toBeGreaterThan(bare.sheetPadBottomPx - 34)
    const desk = renderHook(() => useResultsLayout({ ...DESKTOP, showTable: false, safeBottomPx: 34 })).result.current
    expect(desk.sheetLiftPx).toBe(0)
  })

  // A phone's row tap lowers the sheet to its bar (record 0143).
  it('collapses on request and keeps the callback still', () => {
    const { result, rerender } = renderHook(() => useResultsLayout({ ...DESKTOP, isDesktop: false }))
    const collapse = result.current.collapse
    act(() => collapse())
    rerender()
    expect(result.current.resultsCollapsed).toBe(true)
    expect(result.current.collapse).toBe(collapse)
  })
})
