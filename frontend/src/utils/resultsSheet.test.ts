import { describe, it, expect } from 'vitest'
import { resolvePanelHeights } from './layout'
import {
  LEGEND_GAP_PX,
  LEGEND_STACK_PX,
  LEGEND_TOP_PX,
  RESTING_MAP_PX,
  SHEET_HEADER_PX,
  TRANSPORT_BAND_PX,
  TRANSPORT_GAP_PX,
  legendBottomPx,
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
