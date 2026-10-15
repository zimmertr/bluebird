import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  type SinglePanel,
  bothFits,
  bothOpensWithRoom,
  clampPanelHeight,
  heldResultsMode,
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
  /**
   * The report, whose arrival widens a desktop to Both. Null while the sheet
   * holds only pending rows, which a phone shows as the table alone (#696).
   */
  response: unknown
  analysisSeq: number
  /**
   * Collapse the sheet to its bar regardless of the chevron, or null to leave
   * it to the reader. The tutorial's marker step sets it on a phone, where the
   * open sheet leaves no room for a marker's popup (#536).
   */
  collapsedOverride?: boolean | null
  /**
   * The view the tutorial's Results or Chart step shows (#696): the sheet
   * opens to it before the step's spotlight reads it, the reverse of a row
   * tap's collapse, and is left there when the step ends. On a phone it also
   * comes back to its resting height; a desk keeps Both, which shows either.
   */
  restView?: SinglePanel | null
  /**
   * Hold a phone's sheet at its full stop, as high as a drag takes it, for as
   * long as this is true, and give it back to the height it had after (#696).
   * The tutorial's Chart step sets it, because at rest the plot is too short
   * for a readout of five lines to stand inside it beside them.
   */
  fullOverride?: boolean
  /**
   * The reader has the forecast player on, so a phone's full sheet leaves it
   * room above the Analyze button (#696, `PLAYER_ROOM_PX`).
   */
  playerOn?: boolean
  /**
   * The band a phone keeps for its own gestures at the screen's foot
   * (`useSafeAreaBottom`; record 0145), which the sheet's surface runs under
   * and its grip and header stand above. 0 on a desk and wherever the browser
   * reports none.
   */
  safeBottomPx?: number
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
  collapsedOverride = null,
  restView = null,
  fullOverride = false,
  playerOn = false,
  safeBottomPx = 0,
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
  // Whether the segment has been pressed in this session, which is what lifts
  // the pending-only hold below (`heldResultsMode`): a stored mode is a habit
  // the hold may set aside for a moment, and a press is an answer it may not.
  const pressedRef = useRef(false)
  // An intentional press on the segment: sticks for the session and persists.
  const chooseResultsMode = useCallback((mode: ResultsMode) => {
    pressedRef.current = true
    modeChosenRef.current = true
    lastPanelRef.current = panelOf(mode) ?? lastPanelRef.current
    setModePref(mode)
    writeViewPrefs({ modeChosen: mode })
  }, [])
  // Chevron to collapse/expand the entire results area.
  const [collapsedChoice, setResultsCollapsed] = useState(false)
  const toggleCollapsed = useCallback(() => setResultsCollapsed((c) => !c), [])
  // A phone's row tap lowers the sheet to its bar so the popup it opens has
  // the map (record 0143).
  const collapse = useCallback(() => setResultsCollapsed(true), [])
  const resultsCollapsed = collapsedOverride ?? collapsedChoice
  // A layout effect, so the open sheet is drawn in the commit the step opens
  // in and the tour's spotlight, which measures before every paint, never
  // frames the bar first. Sets the state the chevron, a drag and the segment
  // set, without persisting the mode: the tour chose it, the reader did not.
  useLayoutEffect(() => {
    if (restView === null) return
    setResultsCollapsed(false)
    lastPanelRef.current = restView
    if (isDesktop) {
      setModePref((mode) => (mode === 'both' ? mode : restView))
      return
    }
    setHeightsChosen(false)
    setTableHeight(DEFAULT_TABLE_HEIGHT)
    setChartHeight(DEFAULT_CHART_HEIGHT)
    setModePref(restView)
  }, [restView, isDesktop])
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
  // Whether the reader has dragged a phone's Chart since it opened (#696;
  // record 0155). Chart alone rests at the sheet's full stop on a phone,
  // because the rest stop is the table's and leaves the plot a 68px band at
  // 390x844; a drag is the reader's and wins until Chart is left.
  const [chartDragged, setChartDragged] = useState(false)

  // A desktop-width window widens to Both when an analysis lands, so the first
  // report arrives with its chart — unless the user has ever explicitly picked
  // a mode, which always wins. A phone stays on Table: the stacked pair leaves
  // the map a sliver there. So does a desk whose column is too short for Both
  // to open with the table above its floor (#687, `bothOpensWithRoom`), which
  // at 1024x768 left a 375px map over three rows. Checked per analysis rather
  // than on mount so the pre-analysis screen still opens on the plain table.
  // The first rows widen it as they arrive, before any commit, so a first run
  // that does not commit narrows it back: the screen it returns to is the
  // pre-analysis one (#560).
  useEffect(() => {
    if (modeChosenRef.current) return
    if (response === null) {
      if (analysisSeq === 0) setModePref('table')
      return
    }
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    if (!bothOpensWithRoom(window.innerHeight - bannerPx, DEFAULT_PANEL_HEIGHT, dockedMapFloorPx(2))) return
    setModePref('both')
  }, [response, analysisSeq, bannerPx])

  // Applied panel heights, re-derived every render from the desired (state)
  // heights and the live viewport. Chart-priority: enabling the chart shrinks an
  // over-tall table to fit rather than pushing the map's legends off-screen, and
  // the map always keeps its floor. Drives both breakpoints — mobile is resizable
  // too, so it can no longer rely on Tailwind's fixed panel heights.
  const viewportH = useViewportHeight()
  // A phone's sheet pads its foot by the home indicator's band (record 0145),
  // so the panels inside it have that much less screen: every height below is
  // worked out on the screen above the band, and the reserve each grip takes
  // counts the band beside the preview banner.
  const footPx = isDesktop ? 0 : safeBottomPx
  const usableH = viewportH - bannerPx - footPx
  const reservedPx = bannerPx + footPx
  // Whether Both is on offer at all: under two panel floors plus the map's own,
  // the pair can only be drawn pinned with both grips inert, so the segment
  // disables it and the sheet draws one panel instead (#430).
  //
  // The floor is Both mode's, spelled rather than read off `gripCount` below,
  // which is derived from the mode this answer decides. A desktop passes
  // nothing: the results are docked there and the drag keeps the plain map
  // floor `clampPanelHeight` defaults to.
  const bothHasRoom = bothFits(usableH, {
    mapMinPx: isDesktop ? undefined : draggedMapFloorPx(2, playerOn),
  })
  const resultsMode = heldResultsMode(resolveResultsMode(modePref, lastPanelRef.current, bothHasRoom), {
    pendingOnly: response === null,
    pressed: pressedRef.current,
    isDesktop,
  })
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
  const dragFloorPx = isDesktop ? undefined : draggedMapFloorPx(gripCount, playerOn)
  // Leaving Chart forgets its drag, so the next pick lifts it again.
  if (resultsMode !== 'chart' && chartDragged) setChartDragged(false)
  // A phone's Chart alone at its full stop: the drag cap with every panel
  // asking for the whole screen. The reader's own heights wait underneath, so
  // Table comes back at the height it had before Chart was picked.
  const chartLifted = !isDesktop && resultsMode === 'chart' && !chartDragged
  // The tutorial's Chart step holds it there whatever the reader did before.
  const heldFull = !isDesktop && (fullOverride || chartLifted)
  const mapFloorPx = isDesktop
    ? heightsChosen
      ? undefined
      : dockedMapFloorPx(gripCount)
    : heightsChosen || heldFull
      ? dragFloorPx
      : restingMapFloorPx(gripCount)
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    heldFull ? usableH : chartHeight,
    heldFull ? usableH : tableHeight,
    {
      chartShown: chartShowing,
      tableShown: tableShowing && showTable,
      availPx: usableH,
      mapMinPx: mapFloorPx,
    },
  )
  // What the map│chart grip may not drag the chart over. The table's height
  // counts only while the table is rendered, which is the one thing that
  // differs between Both and chart-only mode.
  const chartReservedPx = (resultsMode === 'both' ? tablePanelPx : 0) + reservedPx
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
    estimatePx:
      sheetHeightPx({
        collapsed: resultsCollapsed,
        gripCount,
        panelsPx: chartPanelPx + tablePanelPx,
      }) + footPx,
    footPx,
  })
  // Both of the library's bottom corners ride the same lift as the app's own
  // chrome, at every width: the scale bar bottom-left and the attribution
  // bottom-right sit in the band between the forecast player and the top of the
  // results, which is the one place on that edge nothing else stands.
  const mapCornerLift = mapCornerLiftPx(sheetLiftPx)
  // What the map's camera must keep clear of the sheet. The RESTING lift, not
  // the live one above: a fit re-framed mid-drag would move the map under the
  // hand that is dragging it.
  //
  // Two numbers, because a searched place is framed for a sheet that is not
  // there yet (#696): the search opens the results in the render after the
  // camera starts moving, so padding for the sheet on screen centred the place
  // in the whole map and the sheet then opened over its label. Nothing above
  // reads `showTable` (the mode, the chevron and the grips decide the sheet's
  // shape), so the lift it will rest at is known before it opens.
  const sheetPadBottomPx = isDesktop
    ? 0
    : chartLifted
      ? // A phone's Chart rests at its full stop, which is a fixed height
        // rather than a live one, so the camera frames above it.
        sheetHeightPx({ collapsed: resultsCollapsed, gripCount, panelsPx: chartPanelPx + tablePanelPx }) + footPx
      : restingLiftPx({
        collapsed: resultsCollapsed,
        gripCount,
        chartShown: chartShowing,
        tableShown: tableShowing,
        chartPx: DEFAULT_CHART_HEIGHT,
        tablePx: DEFAULT_TABLE_HEIGHT,
        availPx: usableH,
      }) + footPx
  const cameraPadBottomPx = showTable ? sheetPadBottomPx : 0

  // The map│chart grip, in Both AND chart-only mode: a panel shown by itself
  // is still resizable against the map (#242 review). Only the reserved space
  // differs — the table's height counts only while it is rendered.
  // The panel heights a drag began from. A drag reports its whole distance
  // so far, and the grip calls the newest handlers (`useGripDrag`), so a
  // drag measured from the height of the render before it added every move
  // to the last: 86px down a lifted Chart took the sheet to its floor (#696).
  const dragFrom = useRef({ chart: 0, table: 0 })
  const chartGrip: GripHandlers = {
    onReset: () => {
      if (resultsMode === 'both') setTableHeight(tablePanelPx)
      setChartHeight(DEFAULT_CHART_HEIGHT)
      // "Put it back" includes the resting height a phone
      // sheet opens at, which a drag had handed over, and a phone's Chart
      // rests at its full stop.
      setHeightsChosen(false)
      setChartDragged(false)
    },
    onDragStart: () => {
      dragFrom.current = { chart: chartPanelPx, table: tablePanelPx }
      setIsDragging(true)
      setHeightsChosen(true)
      if (resultsMode === 'both') setTableHeight(tablePanelPx)
      // A drag on a lifted Chart starts from where it stands and is the
      // reader's from then on.
      if (chartLifted) {
        setChartDragged(true)
        setChartHeight(chartPanelPx)
      }
    },
    onDrag: (up) =>
      setChartHeight(
        clampPanelHeight(dragFrom.current.chart, up, chartReservedPx, window.innerHeight, dragFloorPx),
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
      dragFrom.current = { chart: chartPanelPx, table: tablePanelPx }
      setIsDragging(true)
      setHeightsChosen(true)
    },
    onDrag: (up) => {
      if (resultsMode === 'both') {
        const next = splitChartTable(dragFrom.current.chart, dragFrom.current.table, up)
        setChartHeight(next.chart)
        setTableHeight(next.table)
        return
      }
      setTableHeight(clampPanelHeight(dragFrom.current.table, up, reservedPx, window.innerHeight, dragFloorPx))
    },
    onDragEnd: () => setIsDragging(false),
  }

  // The map's whole height on a phone, which the Analyze button and the
  // player above it measure their room against (#696): the viewport less the
  // preview banner, since the sheet stands over the map rather than beside it.
  const mapPx = viewportH - bannerPx

  return {
    sheetRef,
    isDragging,
    resultsCollapsed,
    toggleCollapsed,
    collapse,
    resultsMode,
    chooseResultsMode,
    bothHasRoom,
    chartShowing,
    chartPanelPx,
    tablePanelPx,
    sheetLiftPx,
    mapCornerLift,
    cameraPadBottomPx,
    sheetPadBottomPx,
    mapPx,
    chartGrip,
    tableGrip,
  }
}

/** What `useResultsLayout` hands its callers; the results sheet reads it whole. */
export type ResultsLayout = ReturnType<typeof useResultsLayout>
