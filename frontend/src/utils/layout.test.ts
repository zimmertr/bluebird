import { describe, it, expect } from 'vitest'
import {
  bothFits,
  clampPanelHeight,
  panelOf,
  resolvePanelHeights,
  resolveResultsMode,
  splitChartTable,
} from './layout'
import { draggedMapFloorPx } from './resultsSheet'

describe('clampPanelHeight', () => {
  it('grows with an upward drag when there is room', () => {
    expect(clampPanelHeight(200, 100, 300, 1500)).toBe(300)
  })

  it('shrinks with a downward drag but not below the floor', () => {
    expect(clampPanelHeight(200, -60, 300, 1500)).toBe(140)
    expect(clampPanelHeight(200, -500, 300, 1500)).toBe(120)
  })

  it('caps growth so the map keeps its minimum height', () => {
    // viewport 1000 − mapMin 280 − reserved 300 → ceil 420, so a 400px drag
    // that would reach 800 is held at 420.
    expect(clampPanelHeight(400, 400, 300, 1000, 280)).toBe(420)
  })

  it('never returns below the floor even when space is exhausted', () => {
    // viewport 500 − 280 − 300 is negative; the ceil floors, then so does the result.
    expect(clampPanelHeight(200, 100, 300, 500, 280, 120)).toBe(120)
  })
})

describe('resolvePanelHeights', () => {
  const opts = (chartShown: boolean, tableShown: boolean, availPx: number) => ({
    chartShown,
    tableShown,
    availPx,
    mapMinPx: 280,
    floorPx: 120,
  })

  it('passes both heights through untouched when they fit', () => {
    // avail 900 − map 280 = 620 for the two panels; 288 + 280 = 568 ≤ 620.
    expect(resolvePanelHeights(288, 280, opts(true, true, 900))).toEqual({ chart: 288, table: 280 })
  })

  it('collapses the chart to 0 and clamps the table alone when the chart is hidden', () => {
    expect(resolvePanelHeights(288, 280, opts(false, true, 900))).toEqual({ chart: 0, table: 280 })
    // A table taller than avail − mapMin is capped so the map keeps its floor.
    expect(resolvePanelHeights(288, 5000, opts(false, true, 900))).toEqual({ chart: 0, table: 620 })
  })

  it('gives the chart the full band when the table is closed', () => {
    expect(resolvePanelHeights(288, 280, opts(true, false, 900))).toEqual({ chart: 288, table: 0 })
    expect(resolvePanelHeights(5000, 280, opts(true, false, 900))).toEqual({ chart: 620, table: 0 })
  })

  it('reports zero for both when neither panel is shown', () => {
    expect(resolvePanelHeights(288, 280, opts(false, false, 900))).toEqual({ chart: 0, table: 0 })
  })

  it('shrinks an over-tall table to fit the chart (the toggle-on bug)', () => {
    // Table was maxed with no chart (620 = avail − mapMin). Enabling a 288 chart
    // must shrink the table to 620 − 288 = 332, not overflow the map.
    expect(resolvePanelHeights(288, 620, opts(true, true, 900))).toEqual({ chart: 288, table: 332 })
  })

  it('caps the chart so a floor-height table and the map floor still fit', () => {
    // avail 700 − map 280 − table floor 120 = 300 ceiling for the chart.
    expect(resolvePanelHeights(5000, 120, opts(true, true, 700))).toEqual({ chart: 300, table: 120 })
  })

  it('floors both panels when space is exhausted', () => {
    expect(resolvePanelHeights(500, 500, opts(true, true, 300))).toEqual({ chart: 120, table: 120 })
  })
})

describe('bothFits', () => {
  // The phone the rule exists for, at 360px wide: a sheet drawing two grips may
  // drag the map down to `draggedMapFloorPx(2)`, so that is the floor the pair
  // is measured against.
  const phone = { mapMinPx: draggedMapFloorPx(2) }

  it('fits where the two panels still have something to trade', () => {
    expect(bothFits(700, { mapMinPx: 280 })).toBe(true)
  })

  it('does not fit at exactly two floors, which is the first inert case', () => {
    // 520 − 280 leaves 240: both panels at their 120px floor, the divider with
    // nothing to move between them, and the chart already at its own ceiling.
    expect(bothFits(519, { mapMinPx: 280 })).toBe(false)
    expect(bothFits(520, { mapMinPx: 280 })).toBe(false)
    expect(bothFits(521, { mapMinPx: 280 })).toBe(true)
  })

  it('takes the floors it is given', () => {
    expect(bothFits(500, { mapMinPx: 200, floorPx: 150 })).toBe(false)
    expect(bothFits(501, { mapMinPx: 200, floorPx: 150 })).toBe(true)
  })

  it('defaults to the map floor a drag defaults to', () => {
    expect(bothFits(520)).toBe(false)
    expect(bothFits(521)).toBe(true)
  })

  // Measured 2026-09-16 at 360px wide: `draggedMapFloorPx(2)` is 432 (the
  // timeline's band, the inset the map's button column ends at, the sheet's
  // header and its two grips), so Both needs more than 672px of viewport. A
  // 640px phone is under it and an 800px one is over.
  it('puts the phone threshold at 672px', () => {
    expect(draggedMapFloorPx(2)).toBe(432)
    expect(bothFits(672, phone)).toBe(false)
    expect(bothFits(673, phone)).toBe(true)
    expect(bothFits(640, phone)).toBe(false)
    expect(bothFits(800, phone)).toBe(true)
  })

  // The predicate has to answer the same question the resolver does, or the
  // segment offers a mode the sheet then draws pinned. Both panels open above
  // their floor and a drag cannot take either below it, so a resolver that
  // returns two floors is a resolver with nothing left to give.
  it('agrees with the resolver about when both panels are pinned', () => {
    for (const availPx of [400, 600, 672, 673, 700, 900]) {
      const { chart, table } = resolvePanelHeights(220, 220, {
        chartShown: true,
        tableShown: true,
        availPx,
        mapMinPx: phone.mapMinPx,
      })
      expect(bothFits(availPx, phone), `at ${availPx}px`).toBe(!(chart === 120 && table === 120))
    }
  })
})

describe('resolveResultsMode', () => {
  it('honours the reader wherever Both fits', () => {
    expect(resolveResultsMode('both', 'chart', true)).toBe('both')
    expect(resolveResultsMode('chart', 'table', true)).toBe('chart')
    expect(resolveResultsMode('table', null, true)).toBe('table')
  })

  it('falls back to the panel the reader last chose where it does not', () => {
    expect(resolveResultsMode('both', 'chart', false)).toBe('chart')
    expect(resolveResultsMode('both', 'table', false)).toBe('table')
  })

  it('falls back to the table for a reader who has only ever chosen Both', () => {
    expect(resolveResultsMode('both', null, false)).toBe('table')
  })

  it('leaves a single panel alone however little room there is', () => {
    expect(resolveResultsMode('chart', 'table', false)).toBe('chart')
    expect(resolveResultsMode('table', 'chart', false)).toBe('table')
  })
})

describe('panelOf', () => {
  it('names the single panel a mode draws', () => {
    expect(panelOf('chart')).toBe('chart')
    expect(panelOf('table')).toBe('table')
  })

  it('answers null for Both and for a reader who has not chosen', () => {
    expect(panelOf('both')).toBeNull()
    expect(panelOf(null)).toBeNull()
  })
})

describe('splitChartTable', () => {
  it('grows the table by shrinking the chart, preserving the sum', () => {
    expect(splitChartTable(300, 200, 80)).toEqual({ chart: 220, table: 280 })
  })

  it('grows the chart by shrinking the table on a downward drag', () => {
    expect(splitChartTable(300, 200, -50)).toEqual({ chart: 350, table: 150 })
  })

  it('stops at the chart floor when dragging up too far', () => {
    // chart can give up at most 300 − 120 = 180 before hitting its floor.
    expect(splitChartTable(300, 200, 500)).toEqual({ chart: 120, table: 380 })
  })

  it('stops at the table floor when dragging down too far', () => {
    // table can give up at most 200 − 120 = 80 before hitting its floor.
    expect(splitChartTable(300, 200, -500)).toEqual({ chart: 380, table: 120 })
  })
})

// Mirrors the App drag handlers wiring these primitives together, to cover the
// handler → state → resolver loop the isolated tests above can't: the sequence
// that produced the reported resize bug (max the table, then enable the chart)
// and its follow-on (shrinking the chart must return space to the map).
describe('chart│table resize integration', () => {
  const AVAIL = 900
  const MAP_MIN = 280
  const FLOOR = 120
  const BANNER = 0
  const resolve = (chartH: number, tableH: number, chartShown: boolean) =>
    resolvePanelHeights(chartH, tableH, {
      chartShown,
      tableShown: true,
      availPx: AVAIL,
      mapMinPx: MAP_MIN,
      floorPx: FLOOR,
    })

  it('enabling the chart shrinks a maxed table instead of overflowing the map', () => {
    let chartH = 288
    let tableH = 288

    // Table handle (map│table mode, chart hidden) dragged up hard → maxes out.
    tableH = clampPanelHeight(resolve(chartH, tableH, false).table, 1000, BANNER, AVAIL, MAP_MIN, FLOOR)
    expect(tableH).toBe(620) // AVAIL − MAP_MIN

    // Enable the chart: the resolver shrinks the applied table so the map holds.
    const applied = resolve(chartH, tableH, true)
    expect(applied).toEqual({ chart: 288, table: 332 })
    expect(AVAIL - applied.chart - applied.table).toBe(MAP_MIN)
  })

  it('shrinking the chart afterwards grows the map, leaving the table put', () => {
    // Post-toggle state: desired table (620) is larger than applied (332).
    let chartH = 288
    let tableH = 620
    const applied = resolve(chartH, tableH, true)
    expect(applied).toEqual({ chart: 288, table: 332 })

    // Chart handle drag: pin the table to its applied height (the fix), then
    // shrink the chart by 100px.
    tableH = applied.table
    chartH = clampPanelHeight(applied.chart, -100, applied.table + BANNER, AVAIL, MAP_MIN, FLOOR)

    const after = resolve(chartH, tableH, true)
    expect(after.chart).toBe(188) // 288 − 100
    expect(after.table).toBe(332) // unchanged — the map absorbed the drag
    expect(AVAIL - after.chart - after.table).toBe(380) // map grew 280 → 380
  })
})
