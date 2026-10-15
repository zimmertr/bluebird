import { describe, it, expect } from 'vitest'
import { clampPanelHeight, resolvePanelHeights } from './layout'
import {
  DRAGGED_MAP_PX,
  FAB_GAP_PX,
  FAB_INSET_PX,
  FAB_PX,
  FAB_STRIP_PX,
  CONTROLS_MAP_PX,
  NOTICE_BAND_MAX_PX,
  NOTICE_LINE_PX,
  PHONE_ROWS_PX,
  PLAYER_ROOM_PX,
  LEGEND_GAP_PX,
  LEGEND_STACK_PX,
  LEGEND_TOP_FINE_PX,
  LEGEND_TOP_PX,
  RESTING_MAP_PX,
  RESULTS_BAR_PX,
  SHEET_HEADER_PX,
  TRANSPORT_BAND_PX,
  CORNER_CONTROL_PX,
  CORNER_MARGIN_PX,
  TRANSPORT_GAP_PX,
  TRANSPORT_HEIGHT_PX,
  dockedMapFloorPx,
  draggedMapFloorPx,
  controlsFullPx,
  controlsSheetPx,
  fabBottomPx,
  noticeBottomPx,
  phoneCornerLiftPx,
  phoneFootLiftPx,
  transportFits,
  transportStandPx,
  legendBottomPx,
  mapCornerLiftPx,
  resolveSheetLift,
  restingLiftPx,
  restingMapFloorPx,
  sheetChromePx,
  sheetHeightPx,
  transportBottomPx,
} from './resultsSheet'
// `?raw` reads the sources as text, so the offsets the anchors here mirror can be
// asserted without a DOM. The classes quoted below are already in the bundle
// because styles.ts spells them; quoting one that is NOT would emit its CSS,
// which is the trap `styles.test.ts` documents. What App.tsx,
// useResultsLayout.ts and TimelineTransport.tsx spell is held by the `app-` checks in
// tools/eslint/checks/app.js.
import layoutSource from '../hooks/useResultsLayout.ts?raw'
import stylesSource from '../styles.ts?raw'

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

  // Every offset on this edge is derived here and applied as a style, so the
  // one class left to mirror is the legend's top inset.
  it('mirrors the legend inset the role spells', () => {
    // The inset is a role with four numbers: two pointer sizes, each with and
    // without the Controls button, which stands in the column only while the
    // panel is collapsed. The two a floor is about are asserted against the
    // classes, so a shade of either cannot move alone.
    expect(stylesSource).toContain("compact: 'top-[92px] touch:top-[108px]'")
    expect(stylesSource).toContain("full: 'top-[132px] touch:top-[156px]'")
    // Fine and compact: a docked desktop, which is the only pointer the docked
    // floor is asked about.
    expect(LEGEND_TOP_FINE_PX).toBe(92)
    // Coarse and full: a phone at rest, where the drawer is closed, the
    // Controls button is up, and the sheet covers the map's bottom regardless.
    expect(LEGEND_TOP_PX).toBe(156)
    // The sheet's floor is promised against the taller column of the two.
    expect(LEGEND_TOP_PX).toBeGreaterThan(LEGEND_TOP_FINE_PX)
  })

  // The band above the results holds the taller of MapLibre's two bottom
  // controls with the library's own margin on BOTH sides of it (one margin
  // stood the attribution against the player), and the band the legend clears
  // is that gap plus the bar standing in it. Derived rather than measured a
  // second time, so the three cannot drift.
  it('sizes the transport band from the gap and the bar', () => {
    expect(CORNER_CONTROL_PX).toBe(24)
    expect(CORNER_MARGIN_PX).toBe(10)
    expect(TRANSPORT_GAP_PX).toBe(CORNER_CONTROL_PX + 2 * CORNER_MARGIN_PX)
    expect(TRANSPORT_GAP_PX).toBe(44)
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
  //
  // Both mode used to be the exception, and it had lost ground twice: the
  // freezing level's six-band key made the stack 20px taller (2026-09-14), and
  // the search field moving above the Controls button made the column it hangs
  // under 52px taller in the same week. Its two panels floor at 120 each, so
  // the sheet could hand the map only 202px of the 265 the stack wanted, and
  // the key's last bands scrolled. #454 cut the stack to 182 — one box, and
  // both scale keys drawn as a strip with their numbers inside it — so every
  // mode now clears it outright, Both included, with 20px to spare.
  describe.each([
    ['table only', { chartShown: false, tableShown: true }, 1, LEGEND_STACK_PX],
    ['chart only', { chartShown: true, tableShown: false }, 1, LEGEND_STACK_PX],
    ['chart and table', { chartShown: true, tableShown: true }, 2, LEGEND_STACK_PX],
  ])('at 402x874, %s', (_mode, shown, gripCount, wanted) => {
    const VIEWPORT = 874

    it('rests low enough for the legend stack it can hold', () => {
      const { chart, table } = resolvePanelHeights(288, 280, {
        ...shown,
        availPx: VIEWPORT,
        mapMinPx: restingMapFloorPx(gripCount),
      })
      const sheet = sheetHeightPx({ collapsed: false, gripCount, panelsPx: chart + table })
      const visibleMap = VIEWPORT - sheet
      const legendBand = visibleMap - LEGEND_TOP_PX - legendBottomPx(0, true)
      expect(legendBand).toBeGreaterThanOrEqual(wanted)
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
    expect(VIEWPORT - sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx: table })).toBe(439)
  })
})

// The drag is capped where a full sheet still leaves the Analyze button its
// strip under the chip row (#696). The resting reserve above holds only until
// the reader takes hold of a grip; this one holds however far they pull.
describe('the drag cap', () => {
  it('leaves the rows and the button\'s strip: 92 and 16 + 56 + 16', () => {
    expect(PHONE_ROWS_PX).toBe(92)
    expect(FAB_STRIP_PX).toBe(FAB_INSET_PX + FAB_PX + FAB_INSET_PX)
    expect([FAB_INSET_PX, FAB_PX, FAB_STRIP_PX]).toEqual([16, 56, 88])
    expect(DRAGGED_MAP_PX).toBe(180)
  })

  // With the player on, a full sheet also leaves the bar its room over the
  // button, so a chart and its playhead stay on screen together.
  it('leaves the player its room while it is on, and it fits there', () => {
    expect(PLAYER_ROOM_PX).toBe(FAB_GAP_PX + TRANSPORT_HEIGHT_PX)
    expect(draggedMapFloorPx(2, true) - draggedMapFloorPx(2)).toBe(PLAYER_ROOM_PX)
    const mapPx = 740
    const lift = mapPx - DRAGGED_MAP_PX - PLAYER_ROOM_PX
    expect(transportFits(fabBottomPx(lift, 0, mapPx), mapPx)).toBe(true)
    expect(transportFits(fabBottomPx(lift + 1, 0, mapPx), mapPx)).toBe(false)
  })

  // `clampPanelHeight` is given a map floor rather than a sheet height, and the
  // sheet's own chrome is part of what covers the map, so the two forms of the
  // cap have to agree for every grip count the sheet can carry.
  it.each([1, 2])('reads as a map floor for a sheet with %i grips', (gripCount) => {
    const availPx = 757
    const panelsPx = availPx - draggedMapFloorPx(gripCount)
    expect(sheetHeightPx({ collapsed: false, gripCount, panelsPx })).toBe(availPx - DRAGGED_MAP_PX)
  })

  it('stops a long drag with the button\'s strip left under the rows', () => {
    const VIEWPORT = 757
    const { table } = resolvePanelHeights(288, 280, {
      chartShown: false,
      tableShown: true,
      availPx: VIEWPORT,
      mapMinPx: restingMapFloorPx(1),
    })
    const lift = (panelsPx: number) => sheetHeightPx({ collapsed: false, gripCount: 1, panelsPx })
    const capped = lift(clampPanelHeight(table, 600, 0, VIEWPORT, draggedMapFloorPx(1)))
    expect(capped).toBe(VIEWPORT - DRAGGED_MAP_PX)
    // The button at the sheet's edge and an inset under the rows.
    const fab = fabBottomPx(capped, 0, VIEWPORT)
    expect(fab).toBe(capped + FAB_INSET_PX)
    expect(VIEWPORT - fab - FAB_PX).toBe(PHONE_ROWS_PX + FAB_INSET_PX)
  })
})

// The phone's Analyze button (record 0135): two things move it, the sheet and
// the notice band, and the player stands on it.
describe('the Analyze button', () => {
  it('rides the sheet\'s top edge 16px above it at any height', () => {
    for (const lift of [0, 84, 300]) expect(fabBottomPx(lift, 0, 844)).toBe(lift + FAB_INSET_PX)
  })

  // The band stands on the sheet's edge, 10px off it, the gap the scale and
  // the (i) kept above the sheet before they moved up beside the button,
  // and the button 16px over the band (record 0140).
  it('rises over the notice band by the band\'s height', () => {
    expect(noticeBottomPx(104)).toBe(104 + CORNER_MARGIN_PX)
    expect(CORNER_MARGIN_PX).toBe(10)
    expect(fabBottomPx(104, 52, 844)).toBe(noticeBottomPx(104) + 52 + FAB_INSET_PX)
    expect(fabBottomPx(104, 52, 844) - fabBottomPx(104, 40, 844)).toBe(12)
  })

  // Three lines of a notice box, then the band scrolls inside itself.
  it('lets the band show three lines of a box at most', () => {
    expect(NOTICE_LINE_PX).toBe(16)
    expect(NOTICE_BAND_MAX_PX).toBe(3 * 16 + 2 * 8 + 2)
  })

  // The scale, the (i) and the opened credit line stand on the button's
  // row with their bottoms on the button's bottom edge (TJ, 2026-10-14): each
  // stands on the library's 10px margin inside the corner band, so the band
  // starts that margin under the button.
  it('stands the map corners on the button\'s bottom edge', () => {
    const fab = 120
    expect(phoneCornerLiftPx(fab) + CORNER_MARGIN_PX).toBe(fab)
  })

  // A notice over a sheet dragged high goes under the button, which never
  // rises over the chip row.
  it('never rises over the rows', () => {
    const lift = 844 - DRAGGED_MAP_PX
    expect(fabBottomPx(lift, 52, 844)).toBe(lift + FAB_INSET_PX)
    const fab = fabBottomPx(300, 400, 844)
    expect(844 - fab - FAB_PX).toBe(PHONE_ROWS_PX + FAB_INSET_PX)
  })

  // The player's bottom 8px over the button's top, and off the map while
  // that would cross the rows.
  it('carries the player, which steps off when there is no room', () => {
    expect(transportBottomPx(transportStandPx(120))).toBe(120 + FAB_PX + FAB_GAP_PX)
    expect(transportFits(16, 844)).toBe(true)
    const top = (fab: number) => fab + FAB_PX + FAB_GAP_PX + TRANSPORT_HEIGHT_PX
    const highest = 844 - PHONE_ROWS_PX - FAB_INSET_PX
    expect(transportFits(highest - top(0), 844)).toBe(true)
    expect(transportFits(highest - top(0) + 1, 844)).toBe(false)
  })
})

// What the camera leaves clear of the sheet. `fitBounds` measures into the
// whole container, which on a phone runs on behind the sheet.
describe('the camera padding', () => {
  const defaults = { chartPx: 288, tablePx: 280 }

  it('is the lift the sheet reserves at 402x874', () => {
    // The sheet's chrome plus a default-height table (84 + 24 + 280) is 388,
    // and the resting reserve leaves 412 at this height (874 less
    // `RESTING_MAP_PX`), so the table stands at its own default and the lift
    // is the sheet's own height. #454's last 14px are what bought that: at a
    // 196px stack the reserve was the binding edge and the table was clamped
    // to 398.
    const lift = restingLiftPx({
      collapsed: false,
      gripCount: 1,
      chartShown: false,
      tableShown: true,
      availPx: 874,
      ...defaults,
    })
    expect(lift).toBe(388)
    expect(874 - lift).toBeGreaterThanOrEqual(RESTING_MAP_PX)
  })

  // The other side of the same clamp: a viewport short enough that the reserve
  // asks for more map than is left once the table holds its own floor. The
  // panel floors win there, as they do in `clampPanelHeight`, and the lift is
  // the sheet's own smallest height rather than the reserve. The line moves
  // with the reserve: 757 crossed it when the column above the legends grew by
  // a row (2026-09-14) and crossed back when #454 took 83px out of the stack,
  // so the case is asserted at 667 now — the shortest phone the app is read on.
  it('falls back to the sheet floor on a viewport the reserve cannot have', () => {
    const lift = restingLiftPx({
      collapsed: false,
      gripCount: 1,
      chartShown: false,
      tableShown: true,
      availPx: 667,
      ...defaults,
    })
    expect(lift).toBe(sheetChromePx(1) + 120)
    expect(lift).toBe(228)
    expect(667 - lift).toBeLessThan(RESTING_MAP_PX)
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
})

/** What `useResultsLayout.ts` opens both panels at; asserted against the source below. */
const DEFAULT_PANEL_PX = 220

// The desktop half of the same question: the results are docked below the map
// rather than parked over it, so nothing is covered — but the bar and the grips
// come out of the same column, and `resolvePanelHeights` clamps only the panels.
describe('dockedMapFloorPx', () => {
  it('is the fine-pointer reserve plus the chrome the panels are stacked under', () => {
    expect(dockedMapFloorPx(0)).toBe(
      LEGEND_TOP_FINE_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX + RESULTS_BAR_PX,
    )
    // Lower than the phone's reserve by exactly the inset the two disagree on.
    expect(RESTING_MAP_PX - (dockedMapFloorPx(0) - RESULTS_BAR_PX)).toBe(
      LEGEND_TOP_PX - LEGEND_TOP_FINE_PX,
    )
    expect(dockedMapFloorPx(2) - dockedMapFloorPx(1)).toBe(dockedMapFloorPx(1) - dockedMapFloorPx(0))
  })

  // It replaces `resolvePanelHeights`' own default, which was 280 — a number
  // that predates the legend stack and is under half of what the stack needs.
  it('reserves far more than the fixed default it replaced', () => {
    expect(dockedMapFloorPx(2)).toBeGreaterThan(280)
  })

  // The acceptance criterion for the desktop half, at the viewport the change
  // was measured on: both panels open at their default height, and the map
  // still holds the whole legend stack above the transport's band.
  it('leaves the whole stack on screen at 1440x1000 in Both mode', () => {
    const VIEWPORT = 1000
    const gripCount = 2
    const { chart, table } = resolvePanelHeights(DEFAULT_PANEL_PX, DEFAULT_PANEL_PX, {
      chartShown: true,
      tableShown: true,
      availPx: VIEWPORT,
      mapMinPx: dockedMapFloorPx(gripCount),
    })
    // Nothing is clamped: the defaults are chosen to fit this window.
    expect({ chart, table }).toEqual({ chart: DEFAULT_PANEL_PX, table: DEFAULT_PANEL_PX })
    const visibleMap = VIEWPORT - RESULTS_BAR_PX - gripCount * 8 - chart - table
    // The FINE inset: a docked layout is the pointer case, which is the whole
    // reason `dockedMapFloorPx` reads that one rather than the phone's.
    const legendBand = visibleMap - LEGEND_TOP_FINE_PX - legendBottomPx(0, true)
    expect(legendBand).toBeGreaterThanOrEqual(LEGEND_STACK_PX)
  })
})

// The panel defaults, asserted against the component that holds them rather
// than restated: they are one number now, and the number is what Both mode can
// spend on a 1000px window under the floor above.
describe('the default panel heights', () => {
  // That both panels read DEFAULT_PANEL_HEIGHT is the `results-layout-hook` check.
  it('open at the number measured here', () => {
    expect(layoutSource).toContain(`const DEFAULT_PANEL_HEIGHT = ${DEFAULT_PANEL_PX}`)
  })

  it('fit inside the docked floor on the window they were measured at', () => {
    expect(2 * DEFAULT_PANEL_PX).toBeLessThanOrEqual(1000 - dockedMapFloorPx(2))
  })
})

// The Controls sheet (#696; record 0141): the panel on a phone, a fixed share
// of the map that leaves the rows, the button's strip and a full notice band.
describe('the Controls sheet', () => {
  it('leaves the rows, the button and the fullest band above it', () => {
    expect(CONTROLS_MAP_PX).toBe(DRAGGED_MAP_PX + CORNER_MARGIN_PX + NOTICE_BAND_MAX_PX)
    expect(controlsSheetPx(844)).toBe(844 - CONTROLS_MAP_PX)
    expect(controlsSheetPx(100)).toBe(0)
  })

  // With the fullest band on its edge, the button still stands under the rows.
  it('leaves the button its place over a full band', () => {
    const lift = controlsSheetPx(844)
    const fab = fabBottomPx(lift, NOTICE_BAND_MAX_PX, 844)
    expect(fab).toBe(lift + CORNER_MARGIN_PX + NOTICE_BAND_MAX_PX + FAB_INSET_PX)
    expect(844 - fab - FAB_PX).toBe(PHONE_ROWS_PX + FAB_INSET_PX)
  })

  it('is the edge the foot rides while it is up and stands higher', () => {
    const sheet = controlsSheetPx(844)
    expect(phoneFootLiftPx(104, sheet)).toBe(sheet)
    expect(phoneFootLiftPx(104, null)).toBe(104)
    expect(phoneFootLiftPx(sheet + 20, sheet)).toBe(sheet + 20)
    // A drag moves the edge with it.
    expect(phoneFootLiftPx(104, 300)).toBe(300)
  })

  // Dragged up whole, it stops where a dragged results sheet does, and the
  // button keeps its strip under the chip row (#696; record 0146).
  it('rises under a drag to the button\'s strip and no higher', () => {
    expect(controlsFullPx(844)).toBe(844 - DRAGGED_MAP_PX)
    const lift = controlsFullPx(844)
    expect(844 - fabBottomPx(lift, 0, 844) - FAB_PX).toBe(PHONE_ROWS_PX + FAB_INSET_PX)
  })
})

// The home indicator's band (record 0145) is the datum before there is a
// sheet, and a desk's docked lift stays 0.
describe('resolveSheetLift and the safe area', () => {
  it('stands the foot on the band with no sheet, and on the sheet with one', () => {
    expect(resolveSheetLift({ docked: true, measuredPx: null, estimatePx: 84, footPx: 34 })).toBe(34)
    expect(resolveSheetLift({ docked: true, measuredPx: null, estimatePx: 84 })).toBe(0)
    expect(resolveSheetLift({ docked: false, measuredPx: 118, estimatePx: 84, footPx: 34 })).toBe(118)
  })
})
