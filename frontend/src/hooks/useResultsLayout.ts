import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  bothFits,
  clampPanelHeight,
  panelOf,
  resolvePanelHeights,
  resolveResultsMode,
  splitChartTable,
} from '../utils/layout'
import {
  dockedMapFloorPx,
  draggedMapFloorPx,
  mapCornerLiftPx,
  restingLiftPx,
  restingMapFloorPx,
  resolveSheetLift,
  sheetHeightPx,
} from '../utils/resultsSheet'
import { type ResultsMode, writeViewPrefs } from '../utils/viewPrefs'

// Opening heights for the two docked panels, and where a double-click on a
// resizer puts them back. A drag is easy to overshoot and there was no way
// back short of dragging until it looked right again.
/**
 * The chart and the table open at the same height, and at the height that
 * leaves the map its whole legend stack.
 *
 * One number for both, because they are two halves of one answer and an 8px
 * difference between them read as a mistake. The value is what Both mode can
 * spend on a 1000px-tall window: 1000 less the docked map floor
 * (`dockedMapFloorPx`, 541 with two grips) is 459, and two panels of 220 fit
 * inside it with the map a few pixels clear of its floor. They were 288 and
 * 280, chosen before the legend stack had a number, and at those heights the
 * bottom of the stack sat under the results bar on exactly this window.
 *
 * Shared with the phone, where the sheet's own floors take over; they are the
 * starting heights either way, and the reader's drag replaces them.
 */
const DEFAULT_PANEL_HEIGHT = 220
const DEFAULT_CHART_HEIGHT = DEFAULT_PANEL_HEIGHT
const DEFAULT_TABLE_HEIGHT = DEFAULT_PANEL_HEIGHT

// Live viewport height, so the chart/table panel heights can be re-clamped when
// the window resizes or a phone rotates — otherwise a stale height could let the
// panels crowd the map below its floor after a resize.
function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800,
  )
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return height
}

/** What one resize grip is wired to. The shape `ResizeGrip` takes. */
export interface GripHandlers {
  onReset: () => void
  onDragStart: () => void
  onDrag: (up: number) => void
  onDragEnd: () => void
}

export interface ResultsLayoutInputs {
  /** The mode the reader pressed in an earlier session, or null if never. */
  modeChosen: ResultsMode | null
  isDesktop: boolean
  /** Height above the map that no panel may take: the preview banner. */
  bannerPx: number
  /** Whether the results area is rendered at all. */
  showTable: boolean
  /** The report, whose arrival widens a desktop to Both. */
  response: unknown
  analysisSeq: number
}

/**
 * Where the results stand and how tall they are: the Table/Chart/Both mode,
 * the two panel heights and their grips, the collapse chevron, and the one
 * lift the map's bottom chrome rides.
 *
 * State and wiring only. Every number it decides with is a pure function in
 * `utils/layout.ts` or `utils/resultsSheet.ts`, and the grip's markup and its
 * double-press clock are `ResizeGrip`'s; what is left here is which of those
 * answers applies this render, and the measurement of the sheet that nothing
 * can derive.
 */
export function useResultsLayout({
  modeChosen,
  isDesktop,
  bannerPx,
  showTable,
  response,
  analysisSeq,
}: ResultsLayoutInputs) {
  // The heights both panels open at, and the ones a double-click on either
  // resizer restores. Named rather than inline because a reset that hard-coded
  // its own numbers would be a second opinion about what "default" means.
  const [tableHeight, setTableHeight] = useState(DEFAULT_TABLE_HEIGHT)
  const [chartHeight, setChartHeight] = useState(DEFAULT_CHART_HEIGHT)
  // Which views the results area shows: chart-only, table-only, or both. The
  // mode is always honored literally — a mode with nothing to draw yet shows
  // its empty panel rather than quietly displaying a different one, or the
  // segment reads as broken (#242 review: it sat on Chart while the table
  // showed, and clicking did nothing visible).
  //
  // Everyone opens on Table; a desktop-width window widens to Both when an
  // analysis lands (the effect below). Only an EXPLICIT press on the segment
  // persists, under `modeChosen`: the old code stored every mode change, so
  // the automatic default wrote itself back as if the user had picked it and
  // then beat the desktop widening forever. The stale `mode` field from that
  // code is deliberately ignored for the same reason — nothing in it says
  // whether the user ever actually chose.
  const modeChosenRef = useRef(modeChosen !== null)
  // What the reader asked for, which is not always what a short viewport can
  // draw: `resultsMode` below is this answer resolved against the room there is
  // (#430). The preference is what persists, so the fallback costs no setting.
  const [modePref, setModePref] = useState<ResultsMode>(() => modeChosen ?? 'table')
  // The panel that fallback lands on. Held rather than derived because a stored
  // Both cannot say which of the two the reader would keep, and a ref rather
  // than state because nothing draws it: every render that reads it is one a
  // press or a resize already caused.
  const lastPanelRef = useRef(panelOf(modeChosen))
  // An intentional press on the segment: sticks for the session and persists.
  const chooseResultsMode = useCallback((mode: ResultsMode) => {
    modeChosenRef.current = true
    lastPanelRef.current = panelOf(mode) ?? lastPanelRef.current
    setModePref(mode)
    writeViewPrefs({ modeChosen: mode })
  }, [])
  // Chevron to collapse/expand the entire results area.
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  const toggleCollapsed = useCallback(() => setResultsCollapsed((c) => !c), [])
  // The results' own height as rendered, which on a phone is how much map the
  // sheet covers. Observed rather than derived because everything anchored to
  // the map's bottom edge measures from this one number, and a derivation has
  // to guess a header bar whose height depends on the pointer and on what the
  // bar is carrying. `null` until the first observation, and while the results
  // are docked, where the number means nothing.
  const [sheetMeasuredPx, setSheetMeasuredPx] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Whether the reader has set a panel height themselves. It only matters on a
  // phone, where the results are a sheet standing on the map (#249): until they
  // drag, the sheet rests low enough for the whole legend stack to fit above it,
  // and a drag hands the height over — the legends then scroll, the way they do
  // on any map too short for them. A double press on a grip means "put it back",
  // so it returns the resting height with the rest of the default.
  const [heightsChosen, setHeightsChosen] = useState(false)

  // A desktop-width window widens to Both when an analysis lands, so the first
  // report arrives with its chart — unless the user has ever explicitly picked
  // a mode, which always wins. A phone stays on Table: the stacked pair leaves
  // the map a sliver there. Checked per analysis rather than on mount so the
  // pre-analysis screen still opens on the plain table.
  useEffect(() => {
    if (response === null || modeChosenRef.current) return
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    setModePref('both')
  }, [response, analysisSeq])

  // Applied panel heights, re-derived every render from the desired (state)
  // heights and the live viewport. Chart-priority: enabling the chart shrinks an
  // over-tall table to fit rather than pushing the map's legends off-screen, and
  // the map always keeps its floor. Drives both breakpoints — mobile is resizable
  // too, so it can no longer rely on Tailwind's fixed panel heights.
  const viewportH = useViewportHeight()
  // Whether Both is on offer at all: under two panel floors plus the map's own,
  // the pair can only be drawn pinned with both grips inert, so the segment
  // disables it and the sheet draws one panel instead (#430).
  //
  // The floor is Both mode's, spelled rather than read off `gripCount` below,
  // which is derived from the mode this answer decides. A desktop passes
  // nothing: the results are docked there and the drag keeps the plain map
  // floor `clampPanelHeight` defaults to.
  const bothHasRoom = bothFits(viewportH - bannerPx, {
    mapMinPx: isDesktop ? undefined : draggedMapFloorPx(2),
  })
  const resultsMode = resolveResultsMode(modePref, lastPanelRef.current, bothHasRoom)
  // Which panels are visible: the mode and the collapse chevron alone decide.
  // Deliberately NOT gated on having data — a mode with nothing to draw shows
  // its empty panel (the chart with no analysis renders bare axes), because a
  // segment that says Chart while the table shows reads as broken.
  const chartShowing = !resultsCollapsed && (resultsMode === 'chart' || resultsMode === 'both')
  const tableShowing = !resultsCollapsed && (resultsMode === 'table' || resultsMode === 'both')
  // One grip per panel on screen: the map│chart resizer, the chart│table divider.
  const gripCount = resultsCollapsed ? 0 : resultsMode === 'both' ? 2 : 1
  // On a phone the results stand ON the map rather than beside it, so the floor
  // the panels leave is not "some map" but "enough map for the legend stack to
  // sit above the sheet" (#249). Two of them, and the sheet is never taller
  // than the looser one allows: the resting reserve holds the whole legend
  // stack and lasts until the reader takes a grip, and the drag floor holds
  // however far they pull — it keeps the band the timeline needs to stay clear
  // of the map's button column, which is where the bar landed before the cap.
  // Desktop takes the same split, from the same three constants. A docked
  // panel covers nothing, so there is no sheet to hold up — but its bar and
  // grips come out of the map's own column, so the resting floor counts them
  // (`dockedMapFloorPx`) and the map keeps the whole legend stack at the
  // default heights. The DRAG floor stays `clampPanelHeight`'s own, as it was:
  // a reader who pulls the panels up has chosen a shorter map, and the stack
  // scrolls rather than the drag stopping short.
  const dragFloorPx = isDesktop ? undefined : draggedMapFloorPx(gripCount)
  const mapFloorPx = isDesktop
    ? heightsChosen
      ? undefined
      : dockedMapFloorPx(gripCount)
    : heightsChosen
      ? dragFloorPx
      : restingMapFloorPx(gripCount)
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    chartHeight,
    tableHeight,
    {
      chartShown: chartShowing,
      tableShown: tableShowing && showTable,
      availPx: viewportH - bannerPx,
      mapMinPx: mapFloorPx,
    },
  )
  // What the map│chart grip may not drag the chart over. The table's height
  // counts only while the table is rendered, which is the one thing that
  // differs between Both and chart-only mode.
  const chartReservedPx = (resultsMode === 'both' ? tablePanelPx : 0) + bannerPx
  // The results' real height, which is what the map's bottom chrome rides.
  //
  // Two paths, because the height moves for two different kinds of reason.
  // This one is the render: a mode switch, the collapse chevron, a drag and a
  // rotation all re-render the app, so measuring after every render catches
  // each of them in the frame it happens. It settles immediately — nothing
  // downstream of this number changes the sheet's own height, so the
  // re-render it causes measures the same value and stops.
  //
  // `null` while the results are docked below the map, where nothing covers the
  // map's bottom edge and the number would mean nothing.
  //
  // Kept: no list is the point. The rule offers `[isDesktop]`, which would miss
  // the mode switch, the chevron, the drag and the rotation this exists to
  // catch. The same-value guard below is what stops the update chain.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = sheetRef.current
    const next = !el || isDesktop ? null : el.getBoundingClientRect().height
    setSheetMeasuredPx((prev) => (prev === next ? prev : next))
  })

  // And the second path: a resize that no render caused — a font landing, the
  // on-screen keyboard, a scrollbar appearing inside the table. Rare, and the
  // reason this is not left to the render alone.
  useEffect(() => {
    const el = sheetRef.current
    if (!el || isDesktop) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      // The BORDER box: the sheet's own top border is part of what covers the
      // map, and `contentRect` leaves it out.
      const box = entry.borderBoxSize?.[0]?.blockSize
      const next = box ?? entry.target.getBoundingClientRect().height
      setSheetMeasuredPx((prev) => (prev === next ? prev : next))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isDesktop, showTable])

  // How far the sheet reaches up the map, and therefore how far the map's own
  // bottom chrome — the legend stack, the timeline, and MapLibre's scale and
  // attribution — rides up to clear it. Zero wherever the results are docked
  // below the map, which is every desktop width and the moment before the first
  // analysis.
  //
  // The MEASURED height, not the derived one: the estimate has to guess a
  // header and a grip, and a guess 20px out is 20px of gap the reader can see
  // under the player. The estimate is what the first frame gets, before the
  // observer above has reported.
  const sheetLiftPx = resolveSheetLift({
    docked: isDesktop || !showTable,
    measuredPx: sheetMeasuredPx,
    estimatePx: sheetHeightPx({
      collapsed: resultsCollapsed,
      gripCount,
      panelsPx: chartPanelPx + tablePanelPx,
    }),
  })
  // Both of the library's bottom corners ride the same lift as the app's own
  // chrome, at every width: the scale bar bottom-left and the attribution
  // bottom-right sit in the band between the forecast player and the top of the
  // results, which is the one place on that edge nothing else stands.
  const mapCornerLift = mapCornerLiftPx(sheetLiftPx)
  // What the map's camera must keep clear of the sheet. The RESTING lift, not
  // the live one above: a fit re-framed mid-drag would move the map under the
  // hand that is dragging it.
  const cameraPadBottomPx =
    isDesktop || !showTable
      ? 0
      : restingLiftPx({
          collapsed: resultsCollapsed,
          gripCount,
          chartShown: chartShowing,
          tableShown: tableShowing,
          chartPx: DEFAULT_CHART_HEIGHT,
          tablePx: DEFAULT_TABLE_HEIGHT,
          availPx: viewportH - bannerPx,
        })

  // The map│chart grip, in Both AND chart-only mode: a panel shown by itself
  // is still resizable against the map (#242 review). Only the reserved space
  // differs — the table's height counts only while it is rendered.
  const chartGrip: GripHandlers = {
    onReset: () => {
      if (resultsMode === 'both') setTableHeight(tablePanelPx)
      setChartHeight(DEFAULT_CHART_HEIGHT)
      // "Put it back" includes the resting height a phone
      // sheet opens at, which a drag had handed over.
      setHeightsChosen(false)
    },
    onDragStart: () => {
      setIsDragging(true)
      setHeightsChosen(true)
      if (resultsMode === 'both') setTableHeight(tablePanelPx)
    },
    onDrag: (up) =>
      setChartHeight(
        clampPanelHeight(chartPanelPx, up, chartReservedPx, window.innerHeight, dragFloorPx),
      ),
    onDragEnd: () => setIsDragging(false),
  }
  // In Both mode this grip is the chart│table divider and preserves the pair's
  // sum; alone, there is no chart to trade with, so it resizes the table
  // against the map exactly as the chart grip above does.
  const tableGrip: GripHandlers = {
    onReset: () => {
      if (resultsMode === 'both') setChartHeight(chartPanelPx)
      setTableHeight(DEFAULT_TABLE_HEIGHT)
      setHeightsChosen(false)
    },
    onDragStart: () => {
      setIsDragging(true)
      setHeightsChosen(true)
    },
    onDrag: (up) => {
      if (resultsMode === 'both') {
        const next = splitChartTable(chartPanelPx, tablePanelPx, up)
        setChartHeight(next.chart)
        setTableHeight(next.table)
        return
      }
      setTableHeight(clampPanelHeight(tablePanelPx, up, bannerPx, window.innerHeight, dragFloorPx))
    },
    onDragEnd: () => setIsDragging(false),
  }

  return {
    sheetRef,
    isDragging,
    resultsCollapsed,
    toggleCollapsed,
    resultsMode,
    chooseResultsMode,
    bothHasRoom,
    chartShowing,
    chartPanelPx,
    tablePanelPx,
    sheetLiftPx,
    mapCornerLift,
    cameraPadBottomPx,
    chartGrip,
    tableGrip,
  }
}
