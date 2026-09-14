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
  TRANSPORT_HEIGHT_PX,
  draggedMapFloorPx,
  legendBottomPx,
  mapCornerLiftPx,
  maxSheetPx,
  resolveSheetLift,
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
    // A grip is 24px on a coarse pointer, which is what a phone sheet carries:
    // `h-2` with `TAP.grip`'s floor under it.
    const grip = sheetChromePx(1) - SHEET_HEADER_PX
    expect(grip).toBe(24)
    // One grip, a 280px table: the table-only sheet.
    expect(sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx: 280 })).toBe(
      SHEET_HEADER_PX + grip + 280,
    )
    // Two grips, a chart and a table: Both mode.
    expect(sheetHeightPx({ collapsed: false, gripCount: 2, panelsPx: 400 })).toBe(
      SHEET_HEADER_PX + 2 * grip + 400,
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

  // The legend stack hangs under the Layers button and grows DOWNWARD, so a
  // box never moves because a panel was dragged, and the overflow leaves
  // through the edge a scroll can follow. A stack pushed to the bottom edge —
  // by an auto margin on its first child, or by justifying the column to the
  // end — overflows past its START edge instead, where content sits at
  // negative coordinates with `scrollTop` pinned at 0 and cannot be reached.
  //
  // Both patterns are matched without spelling either class verbatim: v4 scans
  // this file as raw text and would emit the CSS for anything it finds.
  it('anchors the legend stack at the top, not at the bottom', () => {
    expect(appSource).not.toMatch(/\bm[tb]-(?:auto)\b/)
    expect(appSource).not.toMatch(/\bjustify-(?:end)\b/)
    expect(appSource).toContain('top-28')
  })

  // Every offset on this edge is derived here and applied as a style, so the
  // one class left to mirror is the legend's top inset. A bottom spelled in
  // either component would be a second opinion about the same edge — which is
  // how the gap under the player came to differ per results mode.
  it('leaves no bottom offset spelled in a component', () => {
    expect(appSource).toContain('top-28') // LEGEND_TOP_PX
    expect(LEGEND_TOP_PX).toBe(28 * 4)
    // `bottom-0` is exempt and is the sheet itself, which stands ON the edge
    // rather than measuring off it.
    expect(appSource).not.toMatch(/\bbottom-(?:[1-9]|\[)/)
    expect(transportSource).not.toMatch(/\bbottom-(?:[1-9]|\[)/)
    expect(appSource).toContain('legendBottomPx(sheetLiftPx')
    expect(transportSource).toContain('transportBottomPx(liftPx)')
  })

  // The band above the results is exactly the room MapLibre's two bottom
  // controls need, and the band the legend clears is that gap plus the bar
  // standing in it. Derived rather than measured a second time, so the two
  // cannot drift.
  it('sizes the transport band from the gap and the bar', () => {
    expect(TRANSPORT_GAP_PX).toBe(34)
    expect(TRANSPORT_BAND_PX).toBe(TRANSPORT_GAP_PX + TRANSPORT_HEIGHT_PX)
    expect(legendBottomPx(0, true) - transportBottomPx(0)).toBe(TRANSPORT_HEIGHT_PX)
  })

  // The one gap the review is about: the distance from the top of the results
  // to the bottom of the player, which must be the same number in every
  // results mode and with the results collapsed.
  it('keeps one gap under the player in every results state', () => {
    // Four states as they render on a phone: table, chart, both, collapsed.
    // The lift is the sheet's MEASURED height, so these are four different
    // heights and one gap rather than four gaps.
    for (const measuredPx of [387.5, 395.5, 416.5, 83.5]) {
      const lift = resolveSheetLift({ docked: false, measuredPx, estimatePx: 392 })
      expect(transportBottomPx(lift) - lift).toBe(TRANSPORT_GAP_PX)
    }
    // Docked, the map's own bottom edge is the top of the results.
    expect(transportBottomPx(resolveSheetLift({ docked: true, measuredPx: 300, estimatePx: 392 })))
      .toBe(TRANSPORT_GAP_PX)
  })

  // The estimate is the first frame's answer and nothing else's: it has to
  // guess a header bar whose height depends on the pointer type.
  it('prefers the measurement to the estimate', () => {
    expect(resolveSheetLift({ docked: false, measuredPx: 387.5, estimatePx: 392 })).toBe(387.5)
    expect(resolveSheetLift({ docked: false, measuredPx: null, estimatePx: 392 })).toBe(392)
  })
})

// MapLibre's scale bar and attribution are the library's controls, anchored to
// the map container's bottom edge — which carries the results: docked below the
// map at a desk, a sheet standing on it on a phone. Both corners therefore ride
// the results' own height, which puts them in the band the transport's gap
// keeps clear above them.
describe('mapCornerLiftPx', () => {
  it('leaves the corners on the bottom edge where the results are docked', () => {
    expect(mapCornerLiftPx(0)).toBe(0)
  })

  it('rides the sheet, landing under the transport rather than over it', () => {
    expect(mapCornerLiftPx(392)).toBe(392)
    // The band between the results and the bar is the transport's own gap, and
    // the corner sits inside it rather than taking a step of its own.
    expect(transportBottomPx(392) - mapCornerLiftPx(392)).toBe(TRANSPORT_GAP_PX)
  })

  // map.css cannot be read as text here (vitest stubs a CSS import to an empty
  // string), so what is pinned is the name App publishes it under.
  it('is published under the name the stylesheet reads', () => {
    expect(appSource).toContain('--map-corner-lift')
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
    expect(VIEWPORT - sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx: table })).toBe(419)
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
    expect(DRAGGED_MAP_PX).toBe(226)
    expect(maxSheetPx(874)).toBe(648)
    expect(maxSheetPx(757)).toBe(531)
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
    ).toBe(403)
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
    expect(lift).toBe(286)
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
