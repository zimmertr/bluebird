import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ResultsLayoutInputs, useResultsLayout } from './useResultsLayout'
import { readViewPrefs } from '../utils/viewPrefs'
import { RESULTS_BAR_PX, dockedMapFloorPx } from '../utils/resultsSheet'
import { PANEL_FLOOR_PX } from '../utils/layout'

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

  // The tutorial's Results and Chart steps (#696): the reverse of a row tap's
  // collapse, set as state so the sheet stays where the step left it, and on
  // a phone at its resting height in the step's view, without storing it.
  it("opens the sheet to rest in the tutorial step's view", () => {
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
    rerender({ ...PHONE, restView: 'table' })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('table')
    expect(result.current.tablePanelPx).toBe(resting)
    // The press stays the stored answer: the tour chose the view, the reader did not.
    expect(readViewPrefs().modeChosen).toBe('chart')
    // The Chart step turns it to the chart, which on a phone rests at the
    // sheet's full stop (record 0155).
    rerender({ ...PHONE, restView: 'chart' })
    expect(result.current.resultsMode).toBe('chart')
    expect(result.current.chartPanelPx).toBeGreaterThan(resting)
    // The step ends and the sheet stays where it put it.
    rerender({ ...PHONE, restView: null })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('chart')
  })

  // A phone's Chart alone rests at the sheet's full stop, because the rest
  // stop is the table's (#696; record 0155). Table comes back at the height
  // it had, a drag on the Chart is the reader's and wins, and the tutorial's
  // Chart step holds the full stop whatever the reader did.
  describe('a phone Chart at the full stop', () => {
    function phone() {
      setDesktopQuery(false)
      setViewport(1000)
      const PHONE = { ...DESKTOP, isDesktop: false, response: {} }
      const hook = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), { initialProps: PHONE })
      return { ...hook, PHONE }
    }
    const drag = (result: { current: ReturnType<typeof useResultsLayout> }, grip: 'chartGrip' | 'tableGrip', up: number) => {
      act(() => result.current[grip].onDragStart())
      act(() => result.current[grip].onDrag(up))
      act(() => result.current[grip].onDragEnd())
    }

    it('lifts the sheet when Chart is picked', () => {
      const { result } = phone()
      const resting = result.current.tablePanelPx
      act(() => result.current.chooseResultsMode('chart'))
      const full = result.current.chartPanelPx
      expect(full).toBeGreaterThan(resting)
      // As high as a drag on the Table takes it: the same stop.
      act(() => result.current.chooseResultsMode('table'))
      drag(result, 'tableGrip', 2000)
      expect(result.current.tablePanelPx).toBe(full)
    })

    it('gives Table back the height it had before Chart was picked', () => {
      const { result } = phone()
      drag(result, 'tableGrip', 60)
      const chosen = result.current.tablePanelPx
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBeGreaterThan(chosen)
      act(() => result.current.chooseResultsMode('table'))
      expect(result.current.tablePanelPx).toBe(chosen)
    })

    it('lets a drag on the Chart win, until Chart is picked again', () => {
      const { result } = phone()
      act(() => result.current.chooseResultsMode('chart'))
      const full = result.current.chartPanelPx
      drag(result, 'chartGrip', -200)
      expect(result.current.chartPanelPx).toBe(full - 200)
      // A double press puts the Chart back at its rest, the full stop.
      act(() => result.current.chartGrip.onReset())
      expect(result.current.chartPanelPx).toBe(full)
      drag(result, 'chartGrip', -200)
      act(() => result.current.chooseResultsMode('table'))
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBe(full)
    })

    // A drag reports its whole distance so far, so each move is measured from
    // where the drag began, not from the last move's height.
    it('measures every move of a drag from where it began', () => {
      const { result } = phone()
      act(() => result.current.chooseResultsMode('chart'))
      const full = result.current.chartPanelPx
      act(() => result.current.chartGrip.onDragStart())
      for (const down of [20, 40, 60, 80]) act(() => result.current.chartGrip.onDrag(-down))
      act(() => result.current.chartGrip.onDragEnd())
      expect(result.current.chartPanelPx).toBe(full - 80)
      act(() => result.current.chooseResultsMode('table'))
      const table = result.current.tablePanelPx
      act(() => result.current.tableGrip.onDragStart())
      for (const up of [10, 20, 30]) act(() => result.current.tableGrip.onDrag(up))
      act(() => result.current.tableGrip.onDragEnd())
      expect(result.current.tablePanelPx).toBe(table + 30)
    })

    it("holds the full stop for the tutorial's Chart step, and gives the reader's drag back", () => {
      const { result, rerender, PHONE } = phone()
      act(() => result.current.chooseResultsMode('chart'))
      const full = result.current.chartPanelPx
      drag(result, 'chartGrip', -200)
      rerender({ ...PHONE, fullOverride: true })
      expect(result.current.chartPanelPx).toBe(full)
      rerender({ ...PHONE, fullOverride: false })
      expect(result.current.chartPanelPx).toBe(full - 200)
    })
  })

  it('opens the docked results on a desk to the view, keeping Both', () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: DESKTOP,
    })
    act(() => result.current.chooseResultsMode('chart'))
    act(() => result.current.toggleCollapsed())
    rerender({ ...DESKTOP, restView: 'table' })
    expect(result.current.resultsCollapsed).toBe(false)
    expect(result.current.resultsMode).toBe('table')
    act(() => result.current.chooseResultsMode('both'))
    rerender({ ...DESKTOP, restView: 'chart' })
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

  // The docked bar's MEASURED height is what the map's floor counts on a desk:
  // beside the docked panel at 1024 it is two lines or three rather than the
  // one the estimate counts, and the panels give up the difference rather
  // than the map (#714).
  it('keeps a desk map its floor under a bar taller than one line', () => {
    setViewport(768)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const BAR = 85
    const bar = document.createElement('div')
    bar.getBoundingClientRect = () => ({ height: BAR }) as DOMRect
    const { result, rerender } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'both' }))
    const panels = () => result.current.chartPanelPx + result.current.tablePanelPx
    const estimated = panels()
    act(() => {
      result.current.barRef.current = bar
    })
    rerender()
    expect(panels()).toBe(estimated - (BAR - RESULTS_BAR_PX))
    // What is left is the map's whole reserve: rows, legend stack and band.
    expect(768 - BAR - 2 * 8 - panels()).toBe(dockedMapFloorPx(0) - RESULTS_BAR_PX)
  })

  // At a desk the chart stands at the height Both gives it, in Chart too
  // (#795): Chart keeps the table's floor and its grip free under the chart,
  // where the legend opens, so no press between the two changes the chart's
  // size. A column 150px over Both's floors caps the chart at 150 in both,
  // under its 220 default, and a drag in Chart stops where Both's would.
  it('stands a desk chart at Both\'s height in Chart', () => {
    setViewport(dockedMapFloorPx(2) + PANEL_FLOOR_PX + 150)
    const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: 'chart' }))
    expect(result.current.resultsMode).toBe('chart')
    expect(result.current.chartPanelPx).toBe(150)
    act(() => result.current.chooseResultsMode('both'))
    expect(result.current.chartPanelPx).toBe(150)
    act(() => result.current.chooseResultsMode('chart'))
    act(() => result.current.chartGrip.onDragStart())
    act(() => result.current.chartGrip.onDrag(1000))
    act(() => result.current.chartGrip.onDragEnd())
    const dragged = result.current.chartPanelPx
    expect(dragged).toBeGreaterThan(150)
    act(() => result.current.chooseResultsMode('both'))
    expect(result.current.chartPanelPx).toBe(dragged)
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
    // The sheet it is about to open rests the band higher, with the same panels
    // less the band. 844px leaves the resting lift short of its clamp, so the
    // whole band shows.
    expect(banded.sheetPadBottomPx).toBe(bare.sheetPadBottomPx + 34)
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
