import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PANEL_FLOOR_PX,
  type SinglePanel,
  bothFits,
  bothOpensWithRoom,
  clampPanelHeight,
  deskRoomPx,
  heldResultsMode,
  panelOf,
  resolvePanelHeights,
  resolveResultsMode,
  splitBoth,
  splitChartTable,
} from '../utils/layout'
import {
  DEFAULT_PANEL_HEIGHT,
  DOCKED_GRIP_PX,
  dockedMapFloorPx,
  draggedMapFloorPx,
  fullScreenMapFloorPx,
  fabShiftPx,
  mapCornerLiftPx,
  restingLiftPx,
  restingMapFloorPx,
  resolveSheetLift,
  sheetHeightPx,
  sheetTopRelease,
} from '../utils/results/resultsSheet'
import { type ResultsMode, writeViewPrefs } from '../utils/viewPrefs'
import { PANEL_MS } from '../styles'

// Opening heights for the two docked panels, and where a double-click on a
// resizer puts them back. A drag is easy to overshoot and there was no way
// back short of dragging until it looked right again. One number for both,
// measured in `utils/results/resultsSheet.ts` against the docked map floor.
const DEFAULT_CHART_HEIGHT = DEFAULT_PANEL_HEIGHT
const DEFAULT_TABLE_HEIGHT = DEFAULT_PANEL_HEIGHT
// The least room a desk's results stand in from the tutorial's Results card
// through Pinned hours (#850): two resting panels' height. The chart takes
// it less its legend, so four panels in 1 over 3 stand well over their 72px
// floors and two pinned cards, one over the other, each hold all five of the
// demonstration's rows. A reader who never analyzed would reach the Chart
// card from a 220px table, a 181px chart under the legend's one 39px row of
// chips, and less its picker row of about 30px, 1 over 3 there has two rows
// of about 71px against their 72px floors and draws none. At 1280x720 the
// room is 440px and the chart 401px (720 less the legend less the drag's
// 280px map), the most that window gives.
export const TALL_RESULTS_PX = 2 * DEFAULT_PANEL_HEIGHT
// How long a press holds a desk's results at their height (#850): twice the
// panes' own `PANEL_MS`, because their move starts a frame or more after the
// press, and a hold let go at 300ms let the results stand 1.6px off for the
// move's last two frames in CI (run 41884346607, 2026-11-04). A hold longer
// than the move costs nothing: once the panes stand still, the height they
// make is the height held.
export const ROOM_HOLD_MS = 2 * PANEL_MS

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
interface GripHandlers {
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
  /**
   * The reader's own report, which the Both widening reads: `response` while
   * the tutorial runs is its demonstration, and the demonstration arriving
   * or leaving is no analysis landing (#850). `response` when not given.
   */
  ownResponse?: unknown
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
   * tap's collapse, and is left there when the step ends. A desk switches to
   * it from Both too, as a phone does, the way a press does, keeping the
   * results' height (#850); a phone also comes back to its resting height.
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
   * Hold a desk's results at one room for as long as this is true (#850):
   * the room the panes stood in when it began, `TALL_RESULTS_PX` at least,
   * and no taller than a reader's own drag could make it. The table alone
   * takes it, or the chart and its legend, so the results' top edge stays put
   * from the tutorial's Results card through Pinned hours (the maintainer,
   * 2026-11-04: "I want tutorial steps 7 and 8 to have the same results area
   * vertical size as 9, 10, and 11."). It writes no height, so the reader's
   * come back after.
   */
  tallResults?: boolean
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
 * `utils/layout.ts` or `utils/results/resultsSheet.ts`, and the grip's markup and its
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
  ownResponse = response,
  analysisSeq,
  collapsedOverride = null,
  restView = null,
  fullOverride = false,
  tallResults = false,
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
  // A desk's press on the segment keeps the results' height (#850; the
  // maintainer, 2026-11-04: "Everywhere"): the mode pressed takes the room
  // the panes stood in, its legend's included in Chart, and Both splits it
  // back the way it last split it. Read from what the last commit laid out
  // (`shownRef`), so the press handler can stay one function for the bar.
  const shownRef = useRef<{
    desk: boolean
    collapsed: boolean
    mode: ResultsMode
    chart: number
    table: number
    legend: number
  } | null>(null)
  // Both's split when it was last left, which a press back to Both shares
  // the room in. The opening heights until then.
  const bothSplitRef = useRef({ chart: DEFAULT_CHART_HEIGHT, table: DEFAULT_TABLE_HEIGHT })
  // The room a press handed a desk's Chart, the chart and its legend
  // together, so the legend's own height, measured once it is laid out,
  // comes out of the chart rather than the map. Null when Chart's height is
  // the reader's own: a grip, a double press, or no press yet.
  const [chartRoomPx, setChartRoomPx] = useState<number | null>(null)
  // Set by a press that kept the room, for the commit its mode lands in,
  // which holds the results at the height they stood at when it came, read
  // off the element at the press, before anything moves.
  const roomKeptRef = useRef(false)
  const roomHoldFromRef = useRef<number | null>(null)
  const keepRoom = useCallback((to: ResultsMode) => {
    const shown = shownRef.current
    if (!shown || !shown.desk || shown.collapsed || shown.mode === to) return
    const room = deskRoomPx(shown.mode, shown, DOCKED_GRIP_PX)
    if (shown.mode === 'both') bothSplitRef.current = { chart: shown.chart, table: shown.table }
    if (to === 'both') {
      const split = splitBoth(room, bothSplitRef.current, DOCKED_GRIP_PX)
      setChartHeight(split.chart)
      setTableHeight(split.table)
    } else if (to === 'table') {
      setTableHeight(room)
    }
    setChartRoomPx(to === 'chart' ? room : null)
    roomHoldFromRef.current = laidOutHeight(sheetRef.current)
    roomKeptRef.current = true
  }, [])
  // An intentional press on the segment: sticks for the session and persists.
  const chooseResultsMode = useCallback((mode: ResultsMode) => {
    keepRoom(mode)
    pressedRef.current = true
    modeChosenRef.current = true
    lastPanelRef.current = panelOf(mode) ?? lastPanelRef.current
    setModePref(mode)
    writeViewPrefs({ modeChosen: mode })
  }, [keepRoom])
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
  // A desk leaves Both for the step's view as a phone does (#850): in Both
  // the Chart card said to switch to the chart with the table still under
  // it. At a desk it is a press's move, keeping the room the panes stand in.
  useLayoutEffect(() => {
    if (restView === null) return
    setResultsCollapsed(false)
    lastPanelRef.current = restView
    if (isDesktop) keepRoom(restView)
    setModePref(restView)
    if (isDesktop) return
    setHeightsChosen(false)
    setFullScreen(false)
    setTableHeight(DEFAULT_TABLE_HEIGHT)
    setChartHeight(DEFAULT_CHART_HEIGHT)
  }, [restView, isDesktop, keepRoom])
  // The tutorial's held room at a desk (#850), worked out once, when the hold
  // begins, from the room the reader's panes stood in, so the table's room on
  // the Results card and the chart's after it are one height whatever the
  // legend takes. A step that begins it opens the results at that room
  // rather than holding them at the height they had, so it starts no press's
  // hold (`roomKeptRef`).
  const [tallRoomPx, setTallRoomPx] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!tallResults || !isDesktop) {
      setTallRoomPx(null)
      return
    }
    const shown = shownRef.current
    const room = shown && !shown.collapsed ? deskRoomPx(shown.mode, shown, DOCKED_GRIP_PX) : 0
    roomKeptRef.current = false
    setTallRoomPx(Math.max(room, TALL_RESULTS_PX))
  }, [tallResults, isDesktop])
  // The results' own height as rendered, which on a phone is how much map the
  // sheet covers. Observed rather than derived because everything anchored to
  // the map's bottom edge measures from this one number, and a derivation has
  // to guess a header bar whose height depends on the pointer and on what the
  // bar is carrying. `null` until the first observation, and while the results
  // are docked, where the number means nothing.
  const [sheetMeasuredPx, setSheetMeasuredPx] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  // The docked bar's own height, which the map's floor counts
  // (`dockedMapFloorPx`), measured for the sheet's reason: it depends on the
  // width and on what the bar carries. One line where the bar is 896px wide or
  // more, the title over the actions under that, and a third line where a
  // three-digit Removed count wraps the button group (#714). `null` on a
  // phone, where the sheet is measured whole, and before the bar is laid out.
  const [barMeasuredPx, setBarMeasuredPx] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // A desk's chart legend as laid out (#850), which comes out of the room a
  // press hands Chart: its chips wrap to one row or two by the names and the
  // width, so nothing can derive it. Measured on the strip, whose height
  // holds while its pane's frame opens round it. `null` until it is laid out.
  const [legendMeasuredPx, setLegendMeasuredPx] = useState<number | null>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  // The results' height while a press's panes move at a desk (#850): the
  // height they stood at before it, which the panes move inside, clipped, so
  // the map holds still. Null at rest, when the panes decide the height, and
  // while the chevron moves them. The opening pane is drawn at its end size
  // from the press, so the room it is handed overlaps the closing one's
  // until that has shut.
  const [roomHoldPx, setRoomHoldPx] = useState<number | null>(null)
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
  // Whether a phone's sheet covers the whole map (#837): a drag let go near
  // the top puts it there, and the next drag on its map grip or a double
  // press takes it back. Held as a state rather than a height, so a rotation
  // or a mode switch keeps it whole. A desk never sets it.
  const [fullScreen, setFullScreen] = useState(false)
  // A phone's drag on a map grip while it lasts (#837): no render per move,
  // and nothing on screen changes at the press (record 0259). A Table is
  // drawn at the most the drag can reach and moved under the finger by a
  // transform, which looks the same as a table of the dragged height, since
  // the screen's edge cuts the rows either way. A Chart cannot be: a plot
  // drawn tall reads as a stretched plot, and in Both it pushed the table off
  // the screen (the maintainer, 2026-11-03), so a chart's panel takes its
  // height per move straight on the element, and the chart follows its box.
  // The release commits one height. State for the two renders that begin and
  // end it, a ref for the moves between.
  const [sheetDrag, setSheetDrag] = useState<SheetDrag | null>(null)
  const sheetDragRef = useRef<SheetDrag | null>(null)
  // The map's column, whose foot (the Analyze button, the player, the scale
  // and the credit) a drag moves with the sheet through `--sheet-shift`.
  const stageRef = useRef<HTMLDivElement>(null)
  // The chart panel's box, which a chart drag sizes per move.
  const chartPaneRef = useRef<HTMLDivElement>(null)

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
  //
  // It reads the reader's own report, never the tutorial's demonstration
  // (#850): the demonstration arriving at the Results card counted as a
  // report landing and put Both back over the card's table, in the commit
  // after the card had opened it (the maintainer, 2026-11-04: "Card 7 is
  // still showing both the chart and table? Not just the table."), and its
  // leaving would have undone the chart the tour leaves open. Not a press,
  // so Both opens at the split it last had, the opening heights until then,
  // rather than in the room the panes stand in.
  useEffect(() => {
    if (modeChosenRef.current) return
    if (ownResponse === null) {
      if (analysisSeq === 0) setModePref('table')
      return
    }
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    const barPx = laidOutHeight(barRef.current) ?? undefined
    if (!bothOpensWithRoom(window.innerHeight - bannerPx, DEFAULT_PANEL_HEIGHT, dockedMapFloorPx(2, barPx))) return
    if (shownRef.current?.mode !== 'both') {
      setChartHeight(bothSplitRef.current.chart)
      setTableHeight(bothSplitRef.current.table)
      setChartRoomPx(null)
    }
    setModePref('both')
  }, [ownResponse, analysisSeq, bannerPx])

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
  // sit above the sheet" (#249). Two of them, and a sheet at rest is never
  // taller than the looser one allows: the resting reserve holds the whole
  // legend stack and lasts until the reader takes a grip, and the cap holds
  // wherever a drag is let go short of full screen (#837). It keeps the rows
  // and the Analyze button's strip, and the player's room while it is on.
  // Desktop takes the same split, from the same three constants. A docked
  // panel covers nothing, so there is no sheet to hold up — but its bar and
  // grips come out of the map's own column, so the resting floor counts them
  // (`dockedMapFloorPx`) and the map keeps the whole legend stack at the
  // default heights. The DRAG floor stays `clampPanelHeight`'s own, as it was:
  // a reader who pulls the panels up has chosen a shorter map, and the stack
  // scrolls rather than the drag stopping short.
  const dragFloorPx = isDesktop ? undefined : draggedMapFloorPx(gripCount, playerOn)
  // Past that cap a drag on a phone runs on to the top of the map (#837), and
  // its release decides whether the sheet stays there (`sheetTopRelease`).
  const fullFloorPx = isDesktop ? undefined : fullScreenMapFloorPx(gripCount)
  const atFullScreen = !isDesktop && fullScreen
  // Leaving Chart forgets its drag, so the next pick lifts it again.
  if (resultsMode !== 'chart' && chartDragged) setChartDragged(false)
  // A phone's Chart alone at its full stop: the drag cap with every panel
  // asking for the whole screen. The reader's own heights wait underneath, so
  // Table comes back at the height it had before Chart was picked.
  const chartLifted = !isDesktop && resultsMode === 'chart' && !chartDragged
  // The tutorial's Chart step holds it there whatever the reader did before.
  const heldFull = !isDesktop && (fullOverride || chartLifted)
  // At a desk Chart's legend is a pane of its own under the chart (#795),
  // inside the room the chart was handed (#850): the panel budget leaves it
  // out, so the map keeps its floor, and a press's room leaves it out of the
  // chart, so the results keep their height.
  const deskChart = isDesktop && resultsMode === 'chart'
  const legendPx = deskChart && chartShowing ? legendMeasuredPx ?? 0 : 0
  // The floor the sheet rests on before any drag, which is the one a double
  // press puts a panel back under.
  const restFloorPx = isDesktop
    ? dockedMapFloorPx(gripCount, barMeasuredPx ?? undefined)
    : heldFull
      ? dragFloorPx
      : restingMapFloorPx(gripCount)
  // A map grip's drag runs on the full-screen floor for its length; the
  // divider's does not, since it trades a fixed sum, and giving it that floor
  // at the press let both panels grow to their stored heights under a
  // finger that had not moved (the maintainer, 2026-11-03).
  const mapFloorPx = isDesktop
    ? heightsChosen
      ? undefined
      : restFloorPx
    : atFullScreen || sheetDrag !== null
      ? fullFloorPx
      : heightsChosen
        ? dragFloorPx
        : restFloorPx
  const panelOptions = {
    chartShown: chartShowing,
    tableShown: tableShowing && showTable,
    availPx: usableH - legendPx,
  }
  // The chart a desk's Chart asks for: the room a press handed it less the
  // legend, or the reader's own height.
  const chartWantPx = deskChart && chartRoomPx !== null ? chartRoomPx - legendPx : chartHeight
  // The pair's heights at first load: what a double press on either grip in
  // Both puts its own panel back to, the other keeping its height, so a
  // press before any drag changes nothing and a reset after one moves one
  // panel (the maintainer, 2026-11-03). The stored defaults are above a
  // short phone's rest clamp, so the default is the clamped pair, not the
  // stored number.
  const restPx = resolvePanelHeights(DEFAULT_CHART_HEIGHT, DEFAULT_TABLE_HEIGHT, {
    ...panelOptions,
    mapMinPx: restFloorPx,
  })
  // At full screen every panel asks for the whole screen, except Both's
  // chart, which keeps the reader's share so the table fills the rest. A
  // table under a phone's drag asks for the most the drag can reach; a chart
  // keeps the height it began at, and the layout effect below puts the
  // drag's own on its box after any render that lands mid-drag.
  // The tutorial's held room at a desk (#850) goes to whichever pane the
  // mode shows, asks the map only for the floor a reader's own drag keeps
  // (`resolvePanelHeights`' default), and writes no height, so the reader's
  // come back when the tour lets go.
  const heldRoom = isDesktop && !resultsCollapsed && resultsMode !== 'both' ? tallRoomPx : null
  const { chart: chartPanelPx, table: tablePanelPx } = resolvePanelHeights(
    heldRoom !== null
      ? heldRoom - legendPx
      : sheetDrag?.panel === 'chart' || !(heldFull || (atFullScreen && resultsMode !== 'both'))
        ? chartWantPx
        : usableH,
    heldRoom !== null
      ? heldRoom
      : sheetDrag?.panel === 'table'
        ? sheetDrag.ceilPx
        : heldFull || atFullScreen
          ? usableH
          : tableHeight,
    { ...panelOptions, mapMinPx: heldRoom !== null ? undefined : mapFloorPx },
  )
  // The heights the reader's own state gives a desk, held room or not, which
  // a press and the held room are worked out from, so a room the tour held
  // never becomes the reader's.
  const own =
    heldRoom !== null
      ? resolvePanelHeights(chartWantPx, tableHeight, { ...panelOptions, mapMinPx: mapFloorPx })
      : { chart: chartPanelPx, table: tablePanelPx }
  // What the map│chart grip may not drag the chart over: the table while it
  // is rendered, which is the one thing that differs between Both and
  // chart-only mode, and at a desk in Chart the legend under it.
  const chartReservedPx = (resultsMode === 'both' ? tablePanelPx : 0) + legendPx + reservedPx
  // A press that kept the room holds the results at their height until its
  // panes have moved; a mode that changed by itself, or the chevron, lets go.
  useLayoutEffect(() => {
    const kept = roomKeptRef.current
    roomKeptRef.current = false
    const fromPx = roomHoldFromRef.current
    if (!kept || !isDesktop || resultsCollapsed || fromPx === null) {
      setRoomHoldPx(null)
      return
    }
    setRoomHoldPx(fromPx)
    const release = window.setTimeout(() => setRoomHoldPx(null), ROOM_HOLD_MS)
    return () => window.clearTimeout(release)
  }, [resultsMode, isDesktop, resultsCollapsed])
  // Whether a phone's sheet covers the map's rows and its Analyze button,
  // which is full screen (#837): they stay where they are under it and are
  // taken out of reach (`inert`), since no finger can reach them.
  const overMapRows = showTable && !resultsCollapsed && atFullScreen
  // Whether the sheet stands over the map's controls (`LAYER.sheetRaised`):
  // at full screen, and for a whole drag, so it slides over them on its way
  // up rather than under them.
  const sheetRaised = showTable && (sheetDrag !== null || overMapRows)
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
    // What a desk's next press keeps the room from (#850).
    shownRef.current = {
      desk: isDesktop,
      collapsed: resultsCollapsed,
      mode: resultsMode,
      chart: own.chart,
      table: own.table,
      legend: legendPx,
    }
    // A render that lands mid-drag has written the chart's starting height
    // back; the drag's own goes on before the paint, and the sheet's height
    // waits for the release, since the lift holds where the drag began.
    const drag = sheetDragRef.current
    if (drag) {
      placeSheetDrag(drag, dragUp.current, sheetRef.current, stageRef.current, chartPaneRef.current)
      return
    }
    const el = sheetRef.current
    const next = !el || isDesktop ? null : el.getBoundingClientRect().height
    setSheetMeasuredPx((prev) => (prev === next ? prev : next))
    // The docked bar, on the same path: a mode switch or a Removed count that
    // changes its lines re-renders the app. Nothing it moves changes the bar's
    // own width, so this settles at once too.
    const bar = isDesktop ? laidOutHeight(barRef.current) : null
    setBarMeasuredPx((prev) => (prev === bar ? prev : bar))
    // And Chart's legend at a desk: its chips change with the rows, which
    // re-render the app too, and the chart's height does not move them.
    const legend = isDesktop ? laidOutHeight(legendRef.current) : null
    setLegendMeasuredPx((prev) => (prev === legend ? prev : legend))
  })

  // And the second path: a resize that no render caused. On a phone that is a
  // font landing, the on-screen keyboard or a scrollbar appearing inside the
  // table, which is rare; at a desk it is a window narrowed past where the bar
  // holds one line. Either is why this is not left to the render alone. One
  // observer for whichever of the two this width measures: the sheet on a
  // phone, the bar on a desk.
  useEffect(() => {
    if (isDesktop) {
      const bar = barRef.current
      if (!bar) return
      const observer = new ResizeObserver(() => {
        const next = laidOutHeight(bar)
        setBarMeasuredPx((prev) => (prev === next ? prev : next))
      })
      observer.observe(bar)
      return () => observer.disconnect()
    }
    const el = sheetRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      // A chart drag grows the sheet every move; its lift holds until the
      // release, whose render measures it.
      if (sheetDragRef.current) return
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
  //
  // A drag holds the lift it began at: the sheet is drawn at its most while
  // it lasts, and the foot follows the finger through `--sheet-shift`.
  const sheetLiftPx = sheetDrag
    ? sheetDrag.liftPx
    : resolveSheetLift({
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
  // The last distance a drag reported, which its release is decided from.
  const dragUp = useRef(0)
  // The map's whole height on a phone, which the Analyze button and the
  // player above it measure their room against (#696): the viewport less the
  // preview banner, since the sheet stands over the map rather than beside it.
  const mapPx = viewportH - bannerPx
  // A phone's drag on a map grip begins (#837): the sheet is drawn at the
  // most the drag can reach, the full-screen ceiling, from the next render.
  const beginSheetDrag = (panel: SheetDrag['panel'], fromPx: number, otherPx: number) => {
    if (isDesktop || fullFloorPx === undefined) return
    const drag: SheetDrag = {
      panel,
      fromPx,
      otherPx,
      floorPx: fullFloorPx,
      ceilPx: clampPanelHeight(0, Infinity, otherPx, window.innerHeight, fullFloorPx),
      liftPx: sheetLiftPx,
      mapPx,
    }
    sheetDragRef.current = drag
    setSheetDrag(drag)
  }
  // And ends: the panel takes the height the drag left it, and the release
  // decides whether it stays there, goes to full screen, or falls back to
  // the cap (`sheetTopRelease`).
  const endSheetDrag = () => {
    const drag = sheetDragRef.current
    sheetDragRef.current = null
    setSheetDrag(null)
    if (!drag) return
    const setHeight = drag.panel === 'chart' ? setChartHeight : setTableHeight
    const panelPx = dragPanelPx(drag, dragUp.current)
    const capPx = clampPanelHeight(0, Infinity, drag.otherPx, window.innerHeight, dragFloorPx)
    const release = sheetTopRelease(panelPx, capPx, drag.ceilPx)
    const px = release === 'cap' ? capPx : panelPx
    // The chart's box takes the committed height here, not only from the
    // render: React rewrites the style only when its own last value moved,
    // and a drag let go where it began leaves that value where it was while
    // the element still wears the last move's.
    if (drag.panel === 'chart') chartPaneRef.current?.style.setProperty('height', `${px}px`)
    setHeight(px)
    if (release === 'full') setFullScreen(true)
  }
  // The drag's placement goes on in the layout effect above, in the commit
  // that begins it; this one clears it in the commit that draws the sheet at
  // its new height, so no frame shows either without it. A table's sheet is
  // promised a transform for the drag's length.
  useLayoutEffect(() => {
    if (sheetDrag) {
      if (sheetDrag.panel === 'table') sheetRef.current?.style.setProperty('will-change', 'transform')
      return
    }
    sheetRef.current?.style.removeProperty('transform')
    sheetRef.current?.style.removeProperty('will-change')
    stageRef.current?.style.removeProperty('--sheet-shift')
  }, [sheetDrag])
  const chartGrip: GripHandlers = {
    onReset: () => {
      // In Both a double press puts the chart back alone, at its first-load
      // height, and the table keeps its own (the maintainer, 2026-11-03: it
      // put both back); the sheet's top moves by the difference, out of full
      // screen if it stood there.
      if (resultsMode === 'both') {
        setChartHeight(restPx.chart)
        setTableHeight(tablePanelPx)
        setFullScreen(false)
        return
      }
      setChartHeight(DEFAULT_CHART_HEIGHT)
      setChartRoomPx(null)
      // "Put it back" includes the resting height a phone
      // sheet opens at, which a drag had handed over, and a phone's Chart
      // rests at its full stop.
      setHeightsChosen(false)
      setChartDragged(false)
      setFullScreen(false)
    },
    onDragStart: () => {
      dragFrom.current = { chart: chartPanelPx, table: tablePanelPx }
      dragUp.current = 0
      setIsDragging(true)
      setHeightsChosen(true)
      setFullScreen(false)
      if (resultsMode === 'both') setTableHeight(tablePanelPx)
      // A drag starts from where the chart stands, which full screen and a
      // lifted Chart both put somewhere its height does not say, and a drag
      // on a lifted Chart is the reader's from then on, as is one on a desk's
      // Chart after a press handed it a room (#850).
      setChartHeight(chartPanelPx)
      setChartRoomPx(null)
      if (chartLifted) setChartDragged(true)
      beginSheetDrag('chart', chartPanelPx, chartReservedPx)
    },
    onDrag: (up) => {
      dragUp.current = up
      if (sheetDragRef.current) {
        placeSheetDrag(sheetDragRef.current, up, sheetRef.current, stageRef.current, chartPaneRef.current)
        return
      }
      setChartHeight(
        clampPanelHeight(dragFrom.current.chart, up, chartReservedPx, window.innerHeight, dragFloorPx),
      )
    },
    onDragEnd: () => {
      setIsDragging(false)
      endSheetDrag()
    },
  }
  // In Both mode this grip is the chart│table divider and preserves the pair's
  // sum; alone, there is no chart to trade with, so it resizes the table
  // against the map exactly as the chart grip above does.
  const tableGrip: GripHandlers = {
    onReset: () => {
      // In Both the grip is the divider, and a double press puts the table
      // back alone, at its first-load height (the maintainer, 2026-11-03: it
      // reset both, and then to a stored height a short phone never shows):
      // the chart keeps its height and the sheet's top moves by the
      // difference. At full screen the top cannot move, so the chart takes
      // the difference and the sheet stays full. Alone, the grip is the
      // map's, and the sheet goes back to its rest with the table.
      if (resultsMode === 'both') {
        setTableHeight(restPx.table)
        setChartHeight(
          fullScreen ? Math.max(PANEL_FLOOR_PX, chartPanelPx + tablePanelPx - restPx.table) : chartPanelPx,
        )
        return
      }
      setTableHeight(DEFAULT_TABLE_HEIGHT)
      setHeightsChosen(false)
      setFullScreen(false)
    },
    onDragStart: () => {
      dragFrom.current = { chart: chartPanelPx, table: tablePanelPx }
      dragUp.current = 0
      setIsDragging(true)
      // The divider in Both trades the pair's height and leaves the sheet's
      // top where it is, full screen included, so it leaves the floor alone
      // too: calling the heights chosen here switched a resting sheet to the
      // drag cap at the press, and both panels grew to their stored heights
      // before the finger moved (the maintainer, 2026-11-03). Alone, the
      // grip is the map's.
      if (resultsMode === 'both') return
      setHeightsChosen(true)
      setFullScreen(false)
      setTableHeight(tablePanelPx)
      beginSheetDrag('table', tablePanelPx, reservedPx)
    },
    onDrag: (up) => {
      dragUp.current = up
      if (sheetDragRef.current) {
        placeSheetDrag(sheetDragRef.current, up, sheetRef.current, stageRef.current, chartPaneRef.current)
        return
      }
      if (resultsMode === 'both') {
        const next = splitChartTable(dragFrom.current.chart, dragFrom.current.table, up)
        setChartHeight(next.chart)
        setTableHeight(next.table)
        return
      }
      setTableHeight(clampPanelHeight(dragFrom.current.table, up, reservedPx, window.innerHeight, dragFloorPx))
    },
    onDragEnd: () => {
      setIsDragging(false)
      endSheetDrag()
    },
  }

  return {
    sheetRef,
    barRef,
    legendRef,
    roomHoldPx,
    stageRef,
    chartPaneRef,
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
    overMapRows,
    sheetRaised,
    mapCornerLift,
    cameraPadBottomPx,
    sheetPadBottomPx,
    mapPx,
    chartGrip,
    tableGrip,
  }
}

/** A phone's drag on a results sheet's map grip (#837). */
interface SheetDrag {
  /** The panel the grip moves. */
  panel: 'chart' | 'table'
  /** Its height when the drag began. */
  fromPx: number
  /** The room the clamp leaves the rest: the other panel, the banner and the foot's band. */
  otherPx: number
  /** The map floor the drag runs to, full screen's. */
  floorPx: number
  /** The most the panel can have: what a table is drawn at while the drag lasts, and where a chart's growth stops. */
  ceilPx: number
  /** The lift the map's foot stood on when the drag began. */
  liftPx: number
  /** The map's height, which the Analyze button's highest place is measured from. */
  mapPx: number
}

/** The dragged panel's height `up` pixels into a drag. */
function dragPanelPx(drag: SheetDrag, up: number): number {
  return clampPanelHeight(drag.fromPx, up, drag.otherPx, window.innerHeight, drag.floorPx)
}

/**
 * One move of a phone's sheet drag, with no render (#837). A table's sheet,
 * drawn at its most, is moved down by what the panel has not yet reached; a
 * chart's box takes the panel's height, and the chart redraws to its box.
 * Either way the map's foot is moved by what the Analyze button would,
 * through `--sheet-shift` on the map's column.
 */
function placeSheetDrag(
  drag: SheetDrag,
  up: number,
  sheet: HTMLElement | null,
  stage: HTMLElement | null,
  chartPane: HTMLElement | null,
) {
  const panelPx = dragPanelPx(drag, up)
  if (drag.panel === 'table') sheet?.style.setProperty('transform', `translateY(${drag.ceilPx - panelPx}px)`)
  else chartPane?.style.setProperty('height', `${panelPx}px`)
  stage?.style.setProperty('--sheet-shift', `${fabShiftPx(drag.liftPx, panelPx - drag.fromPx, drag.mapPx)}px`)
}

/** An element's height once it is laid out; null for none, or for 0, which is no layout yet (and jsdom's every box). */
function laidOutHeight(el: HTMLElement | null): number | null {
  const height = el?.getBoundingClientRect().height ?? 0
  return height > 0 ? height : null
}

/** What `useResultsLayout` hands its callers; the results sheet reads it whole. */
export type ResultsLayout = ReturnType<typeof useResultsLayout>
