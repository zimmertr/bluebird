import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ResultsLayoutInputs, ROOM_HOLD_MS, TALL_RESULTS_PX, useResultsLayout } from './useResultsLayout'
import { readViewPrefs } from '../utils/viewPrefs'
import {
  RESULTS_BAR_PX,
  dockedMapFloorPx,
  draggedMapFloorPx,
  fullScreenMapFloorPx,
} from '../utils/results/resultsSheet'
import { SHEET_SNAP_PX } from '../utils/sheetDrag'

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

  // #850: the tutorial's demonstration is no report landing. Arriving at the
  // Results card it put Both back over the card's table (the maintainer,
  // 2026-11-04: "Card 7 is still showing both the chart and table? Not just
  // the table."), and leaving it would undo the chart the tour leaves open.
  it("never widens to Both for the tutorial's demonstration, arriving or leaving", () => {
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: { ...DESKTOP, ownResponse: null as unknown },
    })
    const demo = {}
    rerender({ ...DESKTOP, response: demo, ownResponse: null, restView: 'table' })
    expect(result.current.resultsMode).toBe('table')
    rerender({ ...DESKTOP, response: demo, ownResponse: null, restView: 'chart' })
    expect(result.current.resultsMode).toBe('chart')
    rerender({ ...DESKTOP, response: null, ownResponse: null, restView: null })
    expect(result.current.resultsMode).toBe('chart')
    // A reader's own report over the demonstration: the same.
    const own = {}
    const reader = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: { ...DESKTOP, response: own, ownResponse: own, analysisSeq: 1 },
    })
    expect(reader.result.current.resultsMode).toBe('both')
    reader.rerender({ ...DESKTOP, response: demo, ownResponse: own, analysisSeq: 1, restView: 'table' })
    expect(reader.result.current.resultsMode).toBe('table')
    reader.rerender({ ...DESKTOP, response: demo, ownResponse: own, analysisSeq: 1, restView: 'chart' })
    reader.rerender({ ...DESKTOP, response: own, ownResponse: own, analysisSeq: 1, restView: null })
    expect(reader.result.current.resultsMode).toBe('chart')
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
      // The cap a drag on the Table holds at: the same stop, short of full
      // screen (#837).
      act(() => result.current.chooseResultsMode('table'))
      drag(result, 'tableGrip', full - resting)
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

  // A drag on a phone's grip runs past the cap to the top of the map (#837),
  // and a release near the top leaves the sheet over the whole map. It is
  // never where the sheet opens, and the next drag or a double press brings
  // it down.
  describe('a phone sheet at full screen', () => {
    const VIEWPORT = 1000
    function phone(over: Partial<ResultsLayoutInputs> = {}) {
      setDesktopQuery(false)
      setViewport(VIEWPORT)
      const PHONE = { ...DESKTOP, isDesktop: false, response: {}, ...over }
      const hook = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), { initialProps: PHONE })
      return { ...hook, PHONE }
    }
    type Hook = { current: ReturnType<typeof useResultsLayout> }
    const drag = (result: Hook, grip: 'chartGrip' | 'tableGrip', up: number) => {
      act(() => result.current[grip].onDragStart())
      act(() => result.current[grip].onDrag(up))
      act(() => result.current[grip].onDragEnd())
    }
    const capPx = VIEWPORT - draggedMapFloorPx(1)
    const fullPx = VIEWPORT - fullScreenMapFloorPx(1)

    it('opens at rest, and goes full when let go near the top', () => {
      const { result } = phone()
      const resting = result.current.tablePanelPx
      expect(resting).toBeLessThan(capPx)
      expect(result.current.overMapRows).toBe(false)
      drag(result, 'tableGrip', fullPx - SHEET_SNAP_PX - resting)
      expect(result.current.tablePanelPx).toBe(fullPx)
      expect(result.current.overMapRows).toBe(true)
    })

    // A drag renders twice, when it begins and when it ends (record 0259):
    // a table is drawn at its most and the sheet raised over the map's
    // controls, the foot keeps the lift it began on, and the moves between
    // render nothing.
    it('draws a table at its most for a drag, and falls back to the cap short of the top', () => {
      const { result } = phone()
      const resting = result.current.tablePanelPx
      const lift = result.current.sheetLiftPx
      act(() => result.current.tableGrip.onDragStart())
      expect(result.current.tablePanelPx).toBe(fullPx)
      expect(result.current.sheetRaised).toBe(true)
      expect(result.current.sheetLiftPx).toBe(lift)
      const before = result.current
      act(() => result.current.tableGrip.onDrag(capPx + 60 - resting))
      // No render: the hook hands back the very object it did.
      expect(result.current).toBe(before)
      act(() => result.current.tableGrip.onDragEnd())
      expect(result.current.tablePanelPx).toBe(capPx)
      expect(result.current.sheetRaised).toBe(false)
      expect(result.current.overMapRows).toBe(false)
    })

    // A chart keeps its height at the press (the maintainer, 2026-11-03):
    // its box is sized per move on the element, so nothing on screen moves
    // until the finger does, and in Both the table stays where it was.
    it('leaves a chart at its height for a drag, and sizes its box per move', () => {
      const { result } = phone({ modeChosen: 'both' })
      const pane = document.createElement('div')
      result.current.chartPaneRef.current = pane
      const chart = result.current.chartPanelPx
      const table = result.current.tablePanelPx
      act(() => result.current.chartGrip.onDragStart())
      expect(result.current.chartPanelPx).toBe(chart)
      expect(result.current.tablePanelPx).toBe(table)
      expect(result.current.sheetRaised).toBe(true)
      const before = result.current
      act(() => result.current.chartGrip.onDrag(120))
      expect(result.current).toBe(before)
      expect(pane.style.height).toBe(`${chart + 120}px`)
      act(() => result.current.chartGrip.onDragEnd())
      expect(result.current.chartPanelPx).toBe(chart + 120)
      expect(result.current.tablePanelPx).toBe(table)
      // The box wears the committed height after a release that lands where
      // the drag began too, which no render rewrites.
      act(() => result.current.chartGrip.onDragStart())
      act(() => result.current.chartGrip.onDrag(40))
      act(() => result.current.chartGrip.onDrag(0))
      act(() => result.current.chartGrip.onDragEnd())
      expect(result.current.chartPanelPx).toBe(chart + 120)
      expect(pane.style.height).toBe(`${chart + 120}px`)
    })

    it('comes down under the next drag, from where it stands, or a double press', () => {
      const { result } = phone()
      const resting = result.current.tablePanelPx
      drag(result, 'tableGrip', 2000)
      expect(result.current.tablePanelPx).toBe(fullPx)
      drag(result, 'tableGrip', -400)
      expect(result.current.tablePanelPx).toBe(fullPx - 400)
      expect(result.current.overMapRows).toBe(false)
      drag(result, 'tableGrip', 2000)
      act(() => result.current.tableGrip.onReset())
      expect(result.current.tablePanelPx).toBe(resting)
      expect(result.current.overMapRows).toBe(false)
    })

    it('keeps it through a switch to Chart, which alone lifts only to the cap', () => {
      const { result } = phone()
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBe(capPx)
      expect(result.current.overMapRows).toBe(false)
      act(() => result.current.chooseResultsMode('table'))
      drag(result, 'tableGrip', 2000)
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBe(fullPx)
      expect(result.current.overMapRows).toBe(true)
    })

    // In Both the map grip takes it there, the chart keeps the reader's
    // share, and the divider trades the pair without bringing it down.
    it('fills Both with the table under the chart, and keeps it through the divider', () => {
      const { result } = phone({ modeChosen: 'both' })
      const fullBoth = VIEWPORT - fullScreenMapFloorPx(2)
      drag(result, 'chartGrip', 2000)
      expect(result.current.overMapRows).toBe(true)
      expect(result.current.chartPanelPx + result.current.tablePanelPx).toBe(fullBoth)
      const chart = result.current.chartPanelPx
      drag(result, 'tableGrip', 50)
      expect(result.current.chartPanelPx).toBe(chart - 50)
      expect(result.current.chartPanelPx + result.current.tablePanelPx).toBe(fullBoth)
      expect(result.current.overMapRows).toBe(true)
    })

    // The divider's double press in Both puts the table back alone (the
    // maintainer, 2026-11-03): the chart keeps the height it had, and the
    // sheet's top moves by the difference, out of full screen if it stood
    // there.
    it('resets the table alone from the divider in Both', () => {
      const { result } = phone({ modeChosen: 'both' })
      const rest = { chart: result.current.chartPanelPx, table: result.current.tablePanelPx }
      drag(result, 'chartGrip', 100)
      drag(result, 'tableGrip', -60)
      const chart = result.current.chartPanelPx
      expect(result.current.tablePanelPx).not.toBe(rest.table)
      act(() => result.current.tableGrip.onReset())
      expect(result.current.tablePanelPx).toBe(rest.table)
      expect(result.current.chartPanelPx).toBe(chart)
      // The map grip's double press puts the chart back alone the same way,
      // and the table keeps the height it has.
      drag(result, 'tableGrip', 40)
      const table = result.current.tablePanelPx
      act(() => result.current.chartGrip.onReset())
      expect(result.current.chartPanelPx).toBe(rest.chart)
      expect(result.current.tablePanelPx).toBe(table)
      drag(result, 'chartGrip', 100)
      // At full screen the top cannot move, so the chart takes the
      // difference and the sheet stays full.
      drag(result, 'chartGrip', 2000)
      expect(result.current.overMapRows).toBe(true)
      const sum = result.current.chartPanelPx + result.current.tablePanelPx
      drag(result, 'tableGrip', -100)
      expect(result.current.tablePanelPx).toBe(table - 100)
      act(() => result.current.tableGrip.onReset())
      expect(result.current.overMapRows).toBe(true)
      expect(result.current.tablePanelPx).toBe(rest.table)
      expect(result.current.chartPanelPx).toBe(sum - rest.table)
    })

    it("gives way to the tutorial's rest", () => {
      const { result, rerender, PHONE } = phone()
      const resting = result.current.tablePanelPx
      drag(result, 'tableGrip', 2000)
      rerender({ ...PHONE, restView: 'table' })
      expect(result.current.tablePanelPx).toBe(resting)
      expect(result.current.overMapRows).toBe(false)
    })

    it('never happens at a desk', () => {
      setViewport(VIEWPORT)
      const { result } = renderHook(() => useResultsLayout(DESKTOP))
      drag(result, 'tableGrip', 2000)
      expect(result.current.overMapRows).toBe(false)
    })
  })

  // The tutorial's Results card through Pinned hours hold a desk's results at
  // one room, at least `TALL_RESULTS_PX` (#850), up to the floor a reader's
  // own drag keeps the map at, and give the reader's heights back after.
  describe("a desk's results under the tutorial's results cards", () => {
    // The map a reader's drag leaves, `resolvePanelHeights`' default.
    const DRAG_MAP_PX = 280
    it.each([
      ['a short desk', 700, 700 - DRAG_MAP_PX],
      ['a tall desk', 1200, TALL_RESULTS_PX],
    ])('stands taller on %s, and goes back after', (_, height, tall) => {
      setViewport(height)
      const desk = { ...DESKTOP, modeChosen: 'chart' as const, response: {} }
      const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
        initialProps: desk,
      })
      const rest = result.current.chartPanelPx
      rerender({ ...desk, tallResults: true })
      expect(result.current.chartPanelPx).toBe(tall)
      expect(result.current.chartPanelPx).toBeGreaterThan(rest)
      rerender({ ...desk, tallResults: false })
      expect(result.current.chartPanelPx).toBe(rest)
    })

    // A chart a press handed a room taller than the hold keeps that room.
    it('leaves a chart already taller at its height', () => {
      setViewport(1200)
      const desk = { ...DESKTOP, modeChosen: 'both' as const, response: {} }
      const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
        initialProps: desk,
      })
      act(() => result.current.tableGrip.onDragStart())
      act(() => result.current.tableGrip.onDrag(-200))
      act(() => result.current.tableGrip.onDragEnd())
      act(() => result.current.chooseResultsMode('chart'))
      const room = result.current.chartPanelPx
      expect(room).toBeGreaterThan(TALL_RESULTS_PX)
      rerender({ ...desk, tallResults: true })
      expect(result.current.chartPanelPx).toBe(room)
    })

    it('leaves a phone alone, whose Panels card holds the full stop instead', () => {
      setDesktopQuery(false)
      const PHONE = { ...DESKTOP, isDesktop: false, modeChosen: 'chart' as const, response: {} }
      const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
        initialProps: PHONE,
      })
      const before = result.current.chartPanelPx
      rerender({ ...PHONE, tallResults: true })
      expect(result.current.chartPanelPx).toBe(before)
    })

    // The maintainer, 2026-11-04: "I want tutorial steps 7 and 8 to have the
    // same results area vertical size as 9, 10, and 11." The room is worked
    // out once, from the reader's Both at 1280x720 (166, the divider and
    // 120, so 294), and stands at 440: the table alone on Results, the chart
    // and its legend after, and the reader's own room back at the end.
    it('stands the table, then the chart and its legend, in one room, and gives the reader theirs back', () => {
      setViewport(720)
      const desk = { ...DESKTOP, modeChosen: 'both' as const, response: {} }
      const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
        initialProps: desk,
      })
      expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual([166, 120])
      const strip = document.createElement('div')
      strip.getBoundingClientRect = () => ({ height: 40 }) as DOMRect
      act(() => {
        result.current.legendRef.current = strip
      })
      rerender({ ...desk, restView: 'table', tallResults: true })
      expect(result.current.resultsMode).toBe('table')
      expect(result.current.tablePanelPx).toBe(TALL_RESULTS_PX)
      rerender({ ...desk, restView: 'chart', tallResults: true })
      expect(result.current.resultsMode).toBe('chart')
      expect(result.current.chartPanelPx + 40).toBe(TALL_RESULTS_PX)
      rerender({ ...desk, restView: null, tallResults: true })
      expect(result.current.chartPanelPx + 40).toBe(TALL_RESULTS_PX)
      // The reader's own room, the 294 their Both stood in, less the legend.
      rerender({ ...desk, restView: null, tallResults: false })
      expect(result.current.chartPanelPx).toBe(294 - 40)
      expect(readViewPrefs().modeChosen).toBeNull()
    })
  })

  // Nothing has been resized at first load, so a double press on either bar
  // changes nothing (the maintainer, 2026-11-03): a press that does not move
  // leaves the floor and both heights where they stood, and the reset puts a
  // panel back to the height the rest gave it, not to a number the rest
  // clamps differently.
  describe('a double press at first load', () => {
    const doublePress = (result: { current: ReturnType<typeof useResultsLayout> }, grip: 'chartGrip' | 'tableGrip') => {
      act(() => result.current[grip].onDragStart())
      act(() => result.current[grip].onDragEnd())
      act(() => result.current[grip].onReset())
    }
    it.each([
      ['a short phone', { isDesktop: false, height: 740 }],
      ['a tall phone', { isDesktop: false, height: 1000 }],
      ['a short desk', { isDesktop: true, height: 768 }],
      ['a tall desk', { isDesktop: true, height: 1000 }],
    ])('changes nothing in Both on %s', (_, { isDesktop, height }) => {
      setDesktopQuery(isDesktop)
      setViewport(height)
      const { result } = renderHook(() => useResultsLayout({ ...DESKTOP, isDesktop, modeChosen: 'both', response: {} }))
      const heights = () => [result.current.chartPanelPx, result.current.tablePanelPx]
      const at = heights()
      for (const grip of ['tableGrip', 'chartGrip'] as const) {
        act(() => result.current[grip].onDragStart())
        expect(heights()).toEqual(at)
        act(() => result.current[grip].onDragEnd())
        expect(heights()).toEqual(at)
        act(() => result.current[grip].onReset())
        expect(heights()).toEqual(at)
      }
      doublePress(result, 'tableGrip')
      doublePress(result, 'chartGrip')
      expect(heights()).toEqual(at)
    })
  })

  // #850: a desk's Results and Chart steps switch the view as a phone's do,
  // Both included, the way a press does, and store nothing, so the view
  // stays after the step and a press is still what a later visit opens.
  it("switches a desk's docked results to the step's view from Both, storing nothing", () => {
    const desk = { ...DESKTOP, response: {}, analysisSeq: 1 }
    const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
      initialProps: desk,
    })
    act(() => result.current.chooseResultsMode('both'))
    const room = result.current.chartPanelPx + 8 + result.current.tablePanelPx
    rerender({ ...desk, restView: 'table' })
    expect(result.current.resultsMode).toBe('table')
    // The table takes the room Both stood in.
    expect(result.current.tablePanelPx).toBe(room)
    expect(readViewPrefs().modeChosen).toBe('both')
    rerender({ ...desk, restView: 'chart' })
    expect(result.current.resultsMode).toBe('chart')
    expect(result.current.chartPanelPx).toBe(room)
    expect(readViewPrefs().modeChosen).toBe('both')
    rerender({ ...desk, restView: null })
    expect(result.current.resultsMode).toBe('chart')
    expect(readViewPrefs().modeChosen).toBe('both')
    const later = renderHook(() => useResultsLayout({ ...DESKTOP, modeChosen: readViewPrefs().modeChosen }))
    expect(later.result.current.resultsMode).toBe('both')
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

  // A desk's press keeps the results' height (#850; the maintainer,
  // 2026-11-04: "Yes, area keeps its height"): the mode pressed takes the
  // room the panes stood in, Chart's legend coming out of the chart, and Both
  // splits it back the way it last split it.
  describe("a desk's press on the segment", () => {
    const desk = { ...DESKTOP, modeChosen: 'both' as const, response: {} }
    const legendOf = (result: { current: ReturnType<typeof useResultsLayout> }, px: number) => {
      const strip = document.createElement('div')
      strip.getBoundingClientRect = () => ({ height: px }) as DOMRect
      act(() => {
        result.current.legendRef.current = strip
      })
    }

    it('hands the room to the mode pressed and splits it back', () => {
      const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
        initialProps: desk,
      })
      expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual([220, 220])
      const room = 220 + 8 + 220
      act(() => result.current.chooseResultsMode('table'))
      expect(result.current.tablePanelPx).toBe(room)
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBe(room)
      act(() => result.current.chooseResultsMode('both'))
      expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual([220, 220])
      // A divider drag moves the split, and Both comes back to it.
      act(() => result.current.tableGrip.onDragStart())
      act(() => result.current.tableGrip.onDrag(40))
      act(() => result.current.tableGrip.onDragEnd())
      const split = [result.current.chartPanelPx, result.current.tablePanelPx]
      expect(split).toEqual([180, 260])
      act(() => result.current.chooseResultsMode('chart'))
      expect(result.current.chartPanelPx).toBe(room)
      // Chart's legend, once laid out, comes out of the chart.
      legendOf(result, 40)
      rerender(desk)
      expect(result.current.chartPanelPx).toBe(room - 40)
      act(() => result.current.chooseResultsMode('table'))
      expect(result.current.tablePanelPx).toBe(room)
      act(() => result.current.chooseResultsMode('both'))
      expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual(split)
    })

    it('shares a room that moved in the split Both last had', () => {
      const { result } = renderHook(() => useResultsLayout(desk))
      act(() => result.current.chooseResultsMode('table'))
      act(() => result.current.tableGrip.onDragStart())
      act(() => result.current.tableGrip.onDrag(-100))
      act(() => result.current.tableGrip.onDragEnd())
      expect(result.current.tablePanelPx).toBe(348)
      act(() => result.current.chooseResultsMode('both'))
      // 348 less the divider, shared 220 to 220.
      expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual([170, 170])
    })

    it('holds the results at their height while the panes move, and only for a press', () => {
      vi.useFakeTimers()
      try {
        const { result, rerender } = renderHook((inputs: ResultsLayoutInputs) => useResultsLayout(inputs), {
          initialProps: { ...DESKTOP, response: null as unknown },
        })
        // The first report widens to Both by itself, at the opening heights,
        // and holds nothing.
        rerender({ ...DESKTOP, response: {}, analysisSeq: 1 })
        expect(result.current.resultsMode).toBe('both')
        expect([result.current.chartPanelPx, result.current.tablePanelPx]).toEqual([220, 220])
        expect(result.current.roomHoldPx).toBeNull()
        // The height the results stand at when the press comes.
        const sheet = document.createElement('div')
        sheet.getBoundingClientRect = () => ({ height: 492 }) as DOMRect
        act(() => {
          result.current.sheetRef.current = sheet
        })
        act(() => result.current.chooseResultsMode('chart'))
        expect(result.current.roomHoldPx).toBe(492)
        act(() => vi.advanceTimersByTime(ROOM_HOLD_MS))
        expect(result.current.roomHoldPx).toBeNull()
        act(() => result.current.chooseResultsMode('table'))
        expect(result.current.roomHoldPx).not.toBeNull()
        // The chevron lets go at once.
        act(() => result.current.toggleCollapsed())
        expect(result.current.roomHoldPx).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps the heights through a press while the results are folded', () => {
      const { result } = renderHook(() => useResultsLayout(desk))
      act(() => result.current.toggleCollapsed())
      act(() => result.current.chooseResultsMode('table'))
      act(() => result.current.toggleCollapsed())
      expect(result.current.tablePanelPx).toBe(220)
    })

    it('leaves a phone to size its own panes', () => {
      setDesktopQuery(false)
      const phone = { ...desk, isDesktop: false }
      const { result } = renderHook(() => useResultsLayout(phone))
      act(() => result.current.chooseResultsMode('table'))
      const fresh = renderHook(() => useResultsLayout({ ...phone, modeChosen: 'table' }))
      expect(result.current.tablePanelPx).toBe(fresh.result.current.tablePanelPx)
      expect(result.current.roomHoldPx).toBeNull()
    })
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
