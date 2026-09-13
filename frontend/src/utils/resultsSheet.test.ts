import { describe, it, expect } from 'vitest'
import { clampPanelHeight, resolvePanelHeights } from './layout'
import {
  DRAGGED_MAP_PX,
  LEGEND_GAP_PX,
  LEGEND_STACK_PX,
  LEGEND_TOP_PX,
  RESTING_MAP_PX,
  SHEET_HEADER_PX,
  TRANSPORT_BAND_PX,
  TRANSPORT_GAP_PX,
  draggedMapFloorPx,
  legendBottomPx,
  maxSheetPx,
  restingLiftPx,
  restingMapFloorPx,
  sheetChromePx,
  sheetHeightPx,
  transportBottomPx,
} from './resultsSheet'
// `?raw` reads the sources as text, so the offsets the anchors here mirror can be
// asserted without a DOM. The three classes quoted below are already in the
// bundle because those files spell them; quoting one that is NOT would emit its
// CSS, which is the trap `styles.test.ts` documents.
import appSource from '../App.tsx?raw'
import transportSource from '../components/TimelineTransport.tsx?raw'

describe('sheetHeightPx', () => {
  it('is the header alone while the results are collapsed', () => {
    expect(sheetHeightPx({ collapsed: true, gripCount: 2, panelsPx: 560 })).toBe(SHEET_HEADER_PX)
  })

  it('adds the grips and the panels when the results are open', () => {
    // One grip, a 280px table: the table-only sheet.
    expect(sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx: 280 })).toBe(
      SHEET_HEADER_PX + 8 + 280,
    )
    // Two grips, a chart and a table: Both mode.
    expect(sheetHeightPx({ collapsed: false, gripCount: 2, panelsPx: 400 })).toBe(
      SHEET_HEADER_PX + 16 + 400,
    )
  })
})

describe('the map chrome anchors', () => {
  it('leaves every offset alone where the results are docked', () => {
    expect(legendBottomPx(0, false)).toBe(LEGEND_GAP_PX)
    expect(legendBottomPx(0, true)).toBe(TRANSPORT_BAND_PX)
    expect(transportBottomPx(0)).toBe(TRANSPORT_GAP_PX)
  })

  it('rides the whole bottom cluster up by the sheet, keeping the gaps it had', () => {
    const lift = 392
    expect(legendBottomPx(lift, false) - lift).toBe(LEGEND_GAP_PX)
    expect(legendBottomPx(lift, true) - lift).toBe(TRANSPORT_BAND_PX)
    expect(transportBottomPx(lift) - lift).toBe(TRANSPORT_GAP_PX)
    // The legend clears the transport by the same margin either way, so the bar
    // appearing never lands it under a control.
    expect(legendBottomPx(lift, true) - transportBottomPx(lift)).toBe(
      TRANSPORT_BAND_PX - TRANSPORT_GAP_PX,
    )
  })

  // These four numbers are the pixel values of classes `App.tsx` and
  // `TimelineTransport.tsx` still spell, which is the only way a lift can be
  // wrong without a test failing.
  it('mirrors the offsets the components spell', () => {
    expect(appSource).toContain('top-28') // LEGEND_TOP_PX
    expect(appSource).toContain('bottom-8') // LEGEND_GAP_PX
    expect(appSource).toContain('bottom-28') // TRANSPORT_BAND_PX
    expect(transportSource).toContain('bottom-10') // TRANSPORT_GAP_PX
    expect(LEGEND_TOP_PX).toBe(28 * 4)
    expect(LEGEND_GAP_PX).toBe(8 * 4)
    expect(TRANSPORT_BAND_PX).toBe(28 * 4)
    expect(TRANSPORT_GAP_PX).toBe(10 * 4)
  })
})

// #249 is a phone-only layout. Desktop keeps the docked panel it had, spelled
// exactly as it was spelled — the sheet is a second branch beside it rather than
// an edit to it, so the two cannot be changed by accident together.
describe('the docked layout', () => {
  it('keeps the desktop results panel verbatim', () => {
    expect(appSource).toContain("'flex flex-shrink-0 flex-col bg-slate-800'")
  })
})

describe('the resting height', () => {
  it('counts the transport band whether or not a timeline is on screen', () => {
    // A map overlay must never resize the results, so the reserve is one number.
    expect(RESTING_MAP_PX).toBe(LEGEND_TOP_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX)
  })

  it('reserves the sheet its own chrome on top of the map it must not cover', () => {
    expect(restingMapFloorPx(1)).toBe(RESTING_MAP_PX + sheetChromePx(1))
    expect(restingMapFloorPx(2)).toBeGreaterThan(restingMapFloorPx(1))
  })

  // The acceptance criterion of #249, as arithmetic: at the viewport the issue
  // measured, every legend section fits above the resting sheet with no
  // scrolling, in each results mode — with the timeline on, which is the tighter
  // of the two clearances.
  describe.each([
    ['table only', { chartShown: false, tableShown: true }, 1],
    ['chart only', { chartShown: true, tableShown: false }, 1],
    ['chart and table', { chartShown: true, tableShown: true }, 2],
  ])('at 402x874, %s', (_mode, shown, gripCount) => {
    const VIEWPORT = 874

    it('rests low enough for the whole legend stack', () => {
      const { chart, table } = resolvePanelHeights(288, 280, {
        ...shown,
        availPx: VIEWPORT,
        mapMinPx: restingMapFloorPx(gripCount),
      })
      const sheet = sheetHeightPx({ collapsed: false, gripCount, panelsPx: chart + table })
      const visibleMap = VIEWPORT - sheet
      const legendBand = visibleMap - LEGEND_TOP_PX - legendBottomPx(0, true)
      expect(legendBand).toBeGreaterThanOrEqual(LEGEND_STACK_PX)
      // The transport occupies the band's bottom 112px, so it clears the map's
      // button column — the collision the issue reports beside the legends.
      expect(visibleMap - TRANSPORT_BAND_PX).toBeGreaterThan(LEGEND_TOP_PX)
      // And the criterion the issue pins the trade to: the sheet covers less map
      // than the panel it replaces, which took the map down to 161px.
      expect(visibleMap).toBeGreaterThanOrEqual(161)
    })
  })

  // A phone short enough that the legend cannot fit however the sheet rests:
  // the panels hold their own floors and the legend scrolls, which is what it
  // does on any map too short for it. It must not collapse the sheet instead.
  it('keeps the panels usable on a viewport too short for both', () => {
    const VIEWPORT = 667
    const { chart, table } = resolvePanelHeights(288, 280, {
      chartShown: false,
      tableShown: true,
      availPx: VIEWPORT,
      mapMinPx: restingMapFloorPx(1),
    })
    expect(chart).toBe(0)
    expect(table).toBe(120)
    expect(VIEWPORT - sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx: table })).toBe(435)
  })
})

// The drag is capped where the timeline would cross the map's own buttons. The
// resting reserve above holds only until the reader takes hold of a grip; this
// one holds however far they pull.
describe('the drag cap', () => {
  it.each([
    ['402x874', 874],
    ['500x757', 757],
  ])('at %s, leaves the transport the floor the legend takes', (_at, availPx) => {
    expect(availPx - maxSheetPx(availPx) - TRANSPORT_BAND_PX).toBe(LEGEND_TOP_PX)
  })

  it('states both caps outright', () => {
    expect(DRAGGED_MAP_PX).toBe(224)
    expect(maxSheetPx(874)).toBe(650)
    expect(maxSheetPx(757)).toBe(533)
  })

  // `clampPanelHeight` is given a map floor rather than a sheet height, and the
  // sheet's own chrome is part of what covers the map, so the two forms of the
  // cap have to agree for every grip count the sheet can carry.
  it.each([1, 2])('reads as a map floor for a sheet with %i grips', (gripCount) => {
    const availPx = 757
    const panelsPx = availPx - draggedMapFloorPx(gripCount)
    expect(sheetHeightPx({ collapsed: false, gripCount, panelsPx })).toBe(maxSheetPx(availPx))
  })

  it('stops a long drag where the docked floor did not', () => {
    const VIEWPORT = 757
    const { table } = resolvePanelHeights(288, 280, {
      chartShown: false,
      tableShown: true,
      availPx: VIEWPORT,
      mapMinPx: restingMapFloorPx(1),
    })
    const lift = (panelsPx: number) => sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx })
    const capped = lift(clampPanelHeight(table, 400, 0, VIEWPORT, draggedMapFloorPx(1)))
    expect(capped).toBe(maxSheetPx(VIEWPORT))
    expect(VIEWPORT - capped - TRANSPORT_BAND_PX).toBe(LEGEND_TOP_PX)
    // The same drag with only the docked floor under it put the bar into the
    // button column, which is the collision this cap exists for.
    const uncapped = lift(clampPanelHeight(table, 400, 0, VIEWPORT))
    expect(VIEWPORT - uncapped - TRANSPORT_BAND_PX).toBeLessThan(LEGEND_TOP_PX)
  })

  it('is the floor the drag handlers pass', () => {
    expect(appSource).toContain('draggedMapFloorPx(gripCount)')
    // Both grips that resize against the map: the map│chart resizer and the
    // table's own. The chart│table divider preserves the pair's sum, so it
    // cannot move the sheet and takes no floor.
    expect(appSource.match(/clampPanelHeight\([^)]*dragFloorPx/g)).toHaveLength(2)
  })
})

// What the camera leaves clear of the sheet. `fitBounds` measures into the
// whole container, which on a phone runs on behind the sheet.
describe('the camera padding', () => {
  const defaults = { chartPx: 288, tablePx: 280 }

  it('is the lift the sheet reserves at 402x874', () => {
    // The sheet's chrome plus a default-height table, which fits inside the
    // resting reserve whole: the same 392 the anchors above ride.
    expect(
      restingLiftPx({
        collapsed: false,
        gripCount: 1,
        chartShown: false,
        tableShown: true,
        availPx: 874,
        ...defaults,
      }),
    ).toBe(392)
  })

  it('takes only the reserve on a viewport too short for the whole table', () => {
    const lift = restingLiftPx({
      collapsed: false,
      gripCount: 1,
      chartShown: false,
      tableShown: true,
      availPx: 757,
      ...defaults,
    })
    expect(lift).toBe(288)
    expect(757 - lift).toBe(RESTING_MAP_PX)
  })

  it('is the header alone while the results are collapsed', () => {
    expect(
      restingLiftPx({
        collapsed: true,
        gripCount: 0,
        chartShown: false,
        tableShown: false,
        availPx: 874,
        ...defaults,
      }),
    ).toBe(SHEET_HEADER_PX)
  })

  // A camera move must not depend on a height the reader is dragging at the
  // time, which is what passing the DEFAULT panel heights buys: the number is
  // the same before and after any drag.
  it('is derived from the default heights, not the ones a drag sets', () => {
    expect(appSource).toContain('chartPx: DEFAULT_CHART_HEIGHT')
    expect(appSource).toContain('tablePx: DEFAULT_TABLE_HEIGHT')
  })
})
