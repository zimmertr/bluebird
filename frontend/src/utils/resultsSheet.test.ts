import { describe, it, expect } from 'vitest'
import { clampPanelHeight, resolvePanelHeights } from './layout'
import {
  DRAGGED_MAP_PX,
  LEGEND_GAP_PX,
  LEGEND_STACK_PX,
  LEGEND_STRIP_FINE_PX,
  LEGEND_STRIP_PX,
  LEGEND_TOP_FINE_PX,
  LEGEND_TOP_PHONE_PX,
  LEGEND_TOP_PX,
  RESTING_MAP_PX,
  RESULTS_BAR_PX,
  SHEET_HEADER_PX,
  TRANSPORT_BAND_PX,
  CORNER_CONTROL_PX,
  CORNER_MARGIN_PX,
  TRANSPORT_GAP_PX,
  TRANSPORT_HEIGHT_PX,
  LEGEND_KEY_BODY_PX,
  MARKER_BAND_PX,
  bandUnderLegendPx,
  dockedMapFloorPx,
  draggedMapFloorPx,
  legendBottomPx,
  legendDefaultOpen,
  openingMapPx,
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
    // Coarse and compact: a phone's column, the search field and the row
    // under it, where its Legends strip stands (#696).
    expect(LEGEND_TOP_PHONE_PX).toBe(108)
    // The strip is one row and one gap of the column it continues, on either
    // pointer: the role's own two heights, 44 + 4 and 36 + 4.
    expect(stylesSource).toContain("export const MAP_ROW_H = 'h-9 touch:h-11'")
    expect(LEGEND_STRIP_PX).toBe(44 + 4)
    expect(LEGEND_STRIP_FINE_PX).toBe(36 + 4)
    // Where the box starts on a phone at rest: the column plus the strip,
    // which is the number the three-row column made before the strip took
    // the row Controls gave up, so the sheet rests where it did.
    expect(LEGEND_TOP_PX).toBe(LEGEND_TOP_PHONE_PX + LEGEND_STRIP_PX)
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

// The drag is capped where the timeline would cross the map's own buttons. The
// resting reserve above holds only until the reader takes hold of a grip; this
// one holds however far they pull.
describe('the drag cap', () => {
  it('leaves the transport the floor the legend takes', () => {
    expect(DRAGGED_MAP_PX - TRANSPORT_BAND_PX).toBe(LEGEND_TOP_PX)
  })

  it('states the cap outright', () => {
    expect(DRAGGED_MAP_PX).toBe(280)
  })

  // `clampPanelHeight` is given a map floor rather than a sheet height, and the
  // sheet's own chrome is part of what covers the map, so the two forms of the
  // cap have to agree for every grip count the sheet can carry.
  it.each([1, 2])('reads as a map floor for a sheet with %i grips', (gripCount) => {
    const availPx = 757
    const panelsPx = availPx - draggedMapFloorPx(gripCount)
    expect(sheetHeightPx({ collapsed: false, gripCount, panelsPx })).toBe(availPx - DRAGGED_MAP_PX)
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
    expect(capped).toBe(VIEWPORT - DRAGGED_MAP_PX)
    expect(VIEWPORT - capped - TRANSPORT_BAND_PX).toBe(LEGEND_TOP_PX)
    // The same drag with only the docked floor under it put the bar into the
    // button column, which is the collision this cap exists for.
    const uncapped = lift(clampPanelHeight(table, 400, 0, VIEWPORT))
    expect(VIEWPORT - uncapped - TRANSPORT_BAND_PX).toBeLessThan(LEGEND_TOP_PX)
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
    // The Legends strip heads the stack at a desk too (#696).
    expect(dockedMapFloorPx(0)).toBe(
      LEGEND_TOP_FINE_PX + LEGEND_STRIP_FINE_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX + RESULTS_BAR_PX,
    )
    // Lower than the phone's reserve by exactly the inset the two disagree on.
    expect(RESTING_MAP_PX - (dockedMapFloorPx(0) - RESULTS_BAR_PX)).toBe(
      LEGEND_TOP_PX - LEGEND_TOP_FINE_PX - LEGEND_STRIP_FINE_PX,
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
    expect(legendBand).toBeGreaterThanOrEqual(LEGEND_STRIP_FINE_PX + LEGEND_STACK_PX)
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


// The legend's default (#696, the maintainer 2026-10-13): open on every device
// unless the band of map under the open card, with the results just opened,
// could not hold one marker and its name.
describe('legendDefaultOpen', () => {
  const at = (viewportH: number, docked: boolean) => ({ viewportH, docked, panelPx: DEFAULT_PANEL_PX })

  // The four viewports the decision was made at. A phone opens on the table
  // alone and a desk on Both, each at the default heights.
  it.each([
    ['390x844', 844, false, 496, 168],
    ['360x800', 800, false, 462, 134],
    ['430x932', 932, false, 584, 256],
    ['1440x900', 900, true, 438, 134],
  ])('opens at %s, with %ipx of map over the results and a band left under the card', (_, h, docked, map, band) => {
    expect(openingMapPx(at(h, docked))).toBe(map)
    expect(bandUnderLegendPx(at(h, docked))).toBe(band)
    expect(legendDefaultOpen(at(h, docked))).toBe(true)
  })

  // Where it starts folding: a phone turned on its side, or a short window.
  it('folds where the band under the card cannot hold a marker and its name', () => {
    expect(legendDefaultOpen(at(621, false))).toBe(true)
    expect(legendDefaultOpen(at(620, false))).toBe(false)
    expect(legendDefaultOpen(at(390, false))).toBe(false)
    expect(legendDefaultOpen(at(641, true))).toBe(true)
    expect(legendDefaultOpen(at(640, true))).toBe(false)
  })

  // The card counted is the header and the metric key, measured, and the band
  // is one marker with a one-line name, from the marker's own paint.
  it('counts the card and the marker band it was measured at', () => {
    expect(LEGEND_KEY_BODY_PX).toBe(48)
    expect(MARKER_BAND_PX).toBe(Math.ceil(10 + 2 + 1.6 * 11 + 11 * 1.2 + 1.5))
  })
})
