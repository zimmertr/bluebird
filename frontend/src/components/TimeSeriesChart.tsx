import { type CSSProperties, Fragment, type PointerEvent, ReactNode, type RefObject, memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DestinationResult, SortBy } from '../types'
import { CHART_CARD, CHART_METRIC_W, CHART_PANEL_BUTTON, CHART_PICKER, CHART_PLOT_TOUCH, RADIUS, TEXT } from '../styles'
import { IconClose, IconGrip, IconPlus } from './icons'
import { MenuSelect } from './Menu'
import ResizeGrip, { GridGutter } from './ResizeGrip'
import ChartLines from './ChartLines'
import { lineStrokes } from '../utils/chart/chartCanvas'
import { BOX_ATTR, type DragLayout, type Rect, STAGE_ATTR, useStretchDrag } from '../hooks/useStretchDrag'
import {
  CHART_METRICS,
  ChartLine,
  ChartMetric,
  type ChartMetrics,
  MAX_CHART_PANELS,
  cardCells,
  alignRowToGrid,
  axisTimeLabel,
  nowWithinGrid,
  buildChartData,
  chartKey,
  computeYDomain,
  extremeLabel,
  extremeLabelPosition,
  extremeValue,
  formatMetricValue,
  metricForSort,
  nearestKey,
  pixelToValue,
  tracksCursor,
  valueAt,
  tooltipCapacity,
  collidingType,
  lineNamed,
} from '../utils/chart/chartData'
import type { ModelEndLine } from '../utils/model/modelCompare'
import {
  PHONE_PLOT_MARGIN,
  PLOT_MARGIN,
  type PlotMargin,
  Y_AXIS_WIDTH_PX,
  fingerReading,
  hourIndexAt,
  panelFloorPx,
  plotBand,
  evenStack,
  stackAfterDrag,
  xAxisPx,
  CARD_CURSOR_OFFSET_PX,
  cardPlacement,
  EVEN_GRID,
  type GridShares,
  gridAfterDrag,
  panelWidthFloorPx,
} from '../utils/chart/chartPointer'
import { CHART_TICK_PX, CHROME } from '../utils/chart/chartColors'

// Explicit geometry so the hover handler can invert pixels → data values: the
// plotting band is the container minus these margins and the x-axis strip.
// The numbers are `utils/chart/chartPointer.ts`', which a finger's reading and a
// click's hour invert through too. In a stack only the bottom panel draws
// the x axis (#499), so each panel asks `xAxisPx` for its own strip.
// Hoisted so both axes hand Recharts one object rather than a new one a render.
const AXIS_TICK = { fontSize: CHART_TICK_PX }
// Named rather than spelled on the YAxis alone, because a click is inverted to an
// hour through the plotting band's left edge, which sits after this strip.
const Y_AXIS_WIDTH = Y_AXIS_WIDTH_PX

// The chart's chrome lines: the Now seam, a compared model's end and the
// extreme value (#699). One stroke and one label style for all of them, so
// they read as one kind of mark and cannot drift apart. Dashed so none can be
// mistaken for a series, and in the axis colour because each marks a fact
// about the data rather than a warning. Both themes' axis colour at once
// (#786), hoisted, so Recharts is handed one object rather than a new one a
// render.
const CHROME_LINE = { stroke: CHROME.axis, strokeDasharray: '4 3' }

// Every label wears a halo in the panel's own colour: the stroke is painted
// first (`paintOrder`), so it erases whatever line runs under the letters and
// the fill stands on the surface, where the bare text was lost wherever a
// series crossed it. 3px is a pixel and a half either side of an 11px glyph's
// strokes, enough to clear a 2.5px focused line without fattening the type.
type ChromeLabelPosition = 'insideTopLeft' | 'insideTopRight' | 'insideBottomRight'
function chromeLabel(value: string, position: ChromeLabelPosition) {
  return {
    value,
    position,
    fill: CHROME.axis,
    fontSize: CHART_TICK_PX,
    stroke: CHROME.surface,
    strokeWidth: 3,
    strokeLinejoin: 'round' as const,
    paintOrder: 'stroke',
  }
}

/**
 * The extreme line's label, placed once Recharts knows where the line is: at
 * its right end, above it, or below it when the line runs through the top
 * headroom (`extremeLabelPosition`). Everything else is the chrome label as
 * given; the computed x and y are dropped so the inner Label places itself
 * for the position chosen here rather than the one it was handed.
 */
function headroomLabel(plotTop: number) {
  return function HeadroomLabel({ viewBox, x: _x, y: _y, content: _content, ...rest }: any) {
    return <Label {...rest} viewBox={viewBox} position={extremeLabelPosition(viewBox.y, plotTop)} />
  }
}
// Hoisted, so the label's component is the same between renders and
// Recharts never remounts it.
const HEADROOM_LABEL = headroomLabel(PLOT_MARGIN.top)
const PHONE_HEADROOM_LABEL = headroomLabel(PHONE_PLOT_MARGIN.top)

// The chart's words (#499), each one constant so a change is one edit. The
// pickers, the + and the × were confirmed by the maintainer on 2026-10-29:
// the first picker keeps the name #348 gave it, every other is named for its
// slot's number, and the + and the × are named for what they do. The three
// gutters are named for the split each one moves (approved 2026-10-29).
const PICKER_LABELS = ['Chart metric', 'Metric 2', 'Metric 3', 'Metric 4'] as const
const ADD_PANEL_LABEL = 'Add a panel'
const removePanelLabel = (metricLabel: string) => `Remove ${metricLabel}`
const movePanelLabel = (metricLabel: string) => `Move ${metricLabel}`
const RESIZE_COLUMNS_LABEL = 'Resize the columns'
const RESIZE_ROWS_LABEL = 'Resize the rows'
const RESIZE_PANELS_LABEL = 'Resize the panels'

// Which rows are plotted is the table's job: the checkbox column is the one
// series picker (#242 review dropped the chart's own legend strip), so this
// component only receives the rows already chosen.
interface Props {
  /**
   * An hour index the tooltip stands on without a mouse, or null to follow
   * one. The tutorial's results steps set it so the card can be read beside
   * what a hover shows (#536), and the readout goes when the tour does.
   */
  tooltipIndex?: number | null

  times: number[]
  rows: DestinationResult[]
  /**
   * The metrics in the chart's slots (#499), first panel first: one to four,
   * at a desk and on a phone alike. One list held in state by
   * `useChartMetrics`, so the memo compares one identity that moves only
   * when a slot does.
   */
  metrics: ChartMetrics
  /** Put a metric in slot `index`; one another slot holds swaps the two. */
  onPick: (index: number, m: ChartMetric) => void
  /** Add a panel, holding the first metric not drawn yet. */
  onAdd: () => void
  /** Take slot `index` away. Never the first. */
  onRemove: (index: number) => void
  /** Move the panel in slot `from` to slot `to`. Never into or out of the first. */
  onMove: (from: number, to: number) => void
  /**
   * The ranking and its direction, which decide which end of the charted
   * family the extreme line marks. Primitives, so the memo compares them by
   * value; the direction is resolved in here rather than by the caller.
   */
  sortBy: SortBy
  sortDesc: boolean
  colorFor: (row: DestinationResult) => string
  /**
   * The names two places on screen share (`sharedNames`, #715). A plain line
   * of one of them names its type, `The Tooth (Crag)`, so the line, the hover
   * box and the chip beside it read alike. Absent means none is shared.
   */
  sharedNames?: ReadonlySet<string>
  // The map timeline's playhead, when it is scrubbing this same grid (#121).
  // Null whenever it is not — no analysis, or the transport sitting on the
  // radar axis — so the line appears exactly when there is a moment on the map
  // it corresponds to.
  playheadMs?: number | null
  // Move that playhead by clicking the chart. Absent when no forecast axis
  // exists, which is what makes a click on a chart with no timeline behind it
  // do nothing rather than something invisible.
  onPlayheadChange?: (ms: number) => void
  /**
   * Lines that are not plain destinations: one per (destination, model) pair
   * while a comparison is up (#232). They arrive ready to draw — aligned to
   * `times`, coloured and named, because what a comparison
   * covers is a decision about spend rather than about drawing. Every line is
   * solid: colour is the one channel, the destination's on the ranking model's
   * lines and the model's on every other, and `chartColors.ts` is what keeps
   * the two sets apart.
   *
   * A comparison supplies the ranking model's lines here too, and `rows` then
   * arrives empty: every entry has to read alike, so all of them are composed
   * in one place rather than half here and half there.
   */
  extraLines?: readonly ChartLine[]
  /**
   * Where a compared model's forecast ends inside the window, one entry per
   * instant (#493). Every line runs to its own model's reach, so a shorter
   * model's lines simply stop; this is what says where and why.
   */
  modelEnds?: readonly ModelEndLine[]
  /** The comparison control, rendered beside the metric select. */
  controls?: ReactNode
  /**
   * A phone (#499; TJ 2026-10-30): the same picker row and panels as a
   * desk, but three or four panels stack in one column, because a column
   * of a 2×2 grid is narrower than a panel's width floor at a phone's width.
   */
  phone?: boolean
}

// A stable empty default: a fresh `[]` per render would rebuild every line, and
// with it every path Recharts strokes, on every hover.
// The metric menu's rows at a desk, once: the chart's own list in its order
// and words, as the select's options read them (record 0201).
const METRIC_OPTIONS = CHART_METRICS.map((m) => ({ value: m.key, label: m.label }))
const NO_EXTRA_LINES: readonly ChartLine[] = []
const NO_MODEL_ENDS: readonly ModelEndLine[] = []
const NO_SHARED_NAMES: ReadonlySet<string> = new Set()

function TimeSeriesChart({
  tooltipIndex = null,
  times,
  rows,
  metrics,
  onPick,
  onAdd,
  onRemove,
  onMove,
  sortBy,
  sortDesc,
  colorFor,
  sharedNames = NO_SHARED_NAMES,
  playheadMs = null,
  onPlayheadChange,
  extraLines = NO_EXTRA_LINES,
  modelEnds = NO_MODEL_ENDS,
  controls,
  phone = false,
}: Props) {
  const MARGIN = phone ? PHONE_PLOT_MARGIN : PLOT_MARGIN
  const drawn = metrics
  const count = drawn.length
  // Three or four panels stand in a grid at a desk; otherwise the panels
  // stack on one time axis, the bottom one printing it.
  const gridded = !phone && count > 2
  const atCeiling = metrics.length >= MAX_CHART_PANELS
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  // The cursor's value in the hovered panel's own units, which orders the card.
  const [cursorValue, setCursorValue] = useState<number | null>(null)
  // Which panel the pointer is over (#499): the one that shows the card, and
  // whose domain the nearest line is read through. Null before any hover,
  // which puts a tutorial's or a finger's card on the first panel.
  const [hoveredPanel, setHoveredPanel] = useState<number | null>(null)
  // The hour a finger reads (#336; record 0144), which the tooltip shows as
  // it shows a hovered one. A touch sends no hover, so Recharts never learns
  // the hour from it; this is the hour handed to it instead. Kept when the
  // finger lifts, so the reading can be read without a finger over it.
  const [fingerIndex, setFingerIndex] = useState<number | null>(null)
  // A finger lifted, until a real mouse moves (TJ 2026-10-30). A tap also
  // sends the browser's compatibility mouse events, which Recharts reads as a
  // hover and keeps showing after the lift, so the card is held shut until a
  // pointer event says a mouse is back.
  const [lifted, setLifted] = useState(false)
  // The hour a mouse rests on, in whichever panel (TJ 2026-10-30): with the
  // finger's, the one hour every panel's dots stand on and the one switch
  // that shows or hides them all. Recharts' own hover state was per panel
  // and outlived a lift, so one panel's dots came back at the old hour.
  const [mouseIndex, setMouseIndex] = useState<number | null>(null)
  // The top panel's share of two stacked panels' height, and a grid's column
  // and row splits (#499). Session state: a split is how this reader likes
  // this chart today, which no link or storage has reason to carry. Even by
  // default and after a double press.
  // Each stacked panel's share of the stack's height, top first (#499).
  // Null is an even stack, which a double press puts back.
  const [stackShares, setStackShares] = useState<readonly number[] | null>(null)
  const shares = useMemo(
    () => (stackShares && stackShares.length === count ? stackShares : evenStack(count)),
    [stackShares, count],
  )
  const [drag, setDrag] = useState<PickerDrag | null>(null)
  const [gridShares, setGridShares] = useState<GridShares>(EVEN_GRID)
  const box0 = useRef<HTMLDivElement>(null)
  const box1 = useRef<HTMLDivElement>(null)
  const box2 = useRef<HTMLDivElement>(null)
  const box3 = useRef<HTMLDivElement>(null)
  const row0 = useRef<HTMLDivElement>(null)
  const row1 = useRef<HTMLDivElement>(null)
  // The split as dragged, ahead of the state, which a drag commits once on
  // release (#499): the live layout is written to the DOM, not rendered.
  const liveSharesRef = useRef(shares)
  const liveGridRef = useRef(gridShares)
  const gridRef = useRef<HTMLDivElement>(null)
  // The panels' area when there is more than one (#499): the hover card's
  // width and rows are budgeted on it, and it is clamped inside it.
  const stackRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ shares: readonly number[]; grip: number; totalPx: number } | null>(null)
  const areaRef = gridded ? gridRef : stackRef
  const gutterStartRef = useRef<{ shares: GridShares; w: number; h: number } | null>(null)
  // One sync group per chart, so every panel's cursor stands on the hour the
  // hovered one is at.
  const syncId = useId()

  // Align each series onto the active grid by timestamp — a no-op for ranked
  // rows; a pinned row may have been fetched for a different window.
  const aligned = useMemo(() => rows.map((r) => alignRowToGrid(r, times)), [rows, times])

  // Everything plotted, as lines rather than rows: under a comparison a line is
  // a destination AND a model (#232), and nothing below this point has any
  // reason to know which kind it is drawing.
  //
  // `colorFor` is deliberately not a dependency. It is a fresh closure every
  // render by construction, so including it would rebuild every line on every
  // hover — the exact cost the `data` memo below exists to avoid — and it
  // cannot answer differently for a row that has not changed: a colour is
  // assigned once per coordinate and never reassigned.
  const lines: ChartLine[] = useMemo(
    () => [
      ...aligned.map((row) => ({
        key: chartKey(row),
        label: lineNamed(row.name, collidingType(row, sharedNames)),
        color: colorFor(row),
        series: row.series,
        // A plain row is a destination as the field ranked it, so it may set
        // the extreme line; a comparison marks its own lines.
        ranked: true,
      })),
      ...extraLines,
    ],
    // Kept: `colorFor` is the omission, and the paragraph above says why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aligned, extraLines, sharedNames],
  )
  // A point-sample analysis has a one-timestamp grid: there are no segments to
  // stroke, so each series must render as a dot or the chart would come up blank.
  const pointGrid = times.length === 1
  // The grid's whole extent, which decides whether a tick names an hour or a
  // day. Zero for a point sample, where the single tick is a date either way.
  const spanMs = times.length > 1 ? times[times.length - 1] - times[0] : 0
  // The seam between recorded and expected, when the window spans it. Read once
  // per render rather than memoized: the grid is fixed for the analysis, so this
  // only moves when the clock crosses an hour the chart is already drawing.
  const nowMs = nowWithinGrid(times, Date.now())
  // Whether hovering may emphasize the nearest line. Past the budget it may not:
  // the re-render rebuilds every line's path from every point, and the chart ends
  // up lagging seconds behind the pointer. It falls back to a plain shared
  // tooltip, and comes back on as soon as fewer lines are charted. See tracksCursor.
  // Counted over every drawn panel's paths (#499): the emphasis dims a
  // destination in each, so a hover re-renders every line once per panel.
  const followCursor = tracksCursor(times.length, lines.length * count)

  // Render the focused line last (on top) with siblings dimmed. One nearest-line
  // computation feeds both the line emphasis and the tooltip ordering, in every
  // panel: a destination is one colour in each, so it is one emphasis too.
  const ordered = useMemo(
    () =>
      focusedKey
        ? [...lines.filter((l) => l.key !== focusedKey), ...lines.filter((l) => l.key === focusedKey)]
        : lines,
    [lines, focusedKey],
  )

  const onHover = useCallback((panel: number, key: string | null, value: number | null, idx: number | null) => {
    setMouseIndex(idx)
    // A mouse takes the reading back from a finger that left one.
    setFingerIndex(null)
    setHoveredPanel(panel)
    setFocusedKey(key)
    setCursorValue(value)
  }, [])
  const onEnter = useCallback((panel: number) => setHoveredPanel(panel), [])
  const onLeave = useCallback(() => {
    setMouseIndex(null)
    setFocusedKey(null)
    setCursorValue(null)
  }, [])
  const onFinger = useCallback((panel: number, index: number, key: string | null | undefined, value: number | null) => {
    setLifted(false)
    setHoveredPanel(panel)
    setFingerIndex(index)
    if (key !== undefined) {
      setFocusedKey(key)
      setCursorValue(value)
    }
  }, [])
  const onMouse = useCallback(() => setLifted(false), [])
  const onLift = useCallback(() => {
    setLifted(true)
    setFingerIndex(null)
    setFocusedKey(null)
    setCursorValue(null)
  }, [])
  const onDropFinger = useCallback(() => {
    setFingerIndex(null)
    setFocusedKey(null)
    setCursorValue(null)
  }, [])

  // The grip between two stacked panels moves height from one to the other.
  // Each keeps a floor, from the plot geometry (`panelFloorPx`), so neither
  // can be dragged to nothing; only the bottom one has an axis strip to keep.
  const stackFloors = useMemo(
    () => Array.from({ length: count }, (_, i) => panelFloorPx(MARGIN, i === count - 1)),
    [count, MARGIN],
  )
  // A split drag runs on the compositor (#499; TJ 2026-10-30): each frame
  // moves the boxes and handles with transforms and stretches each panel's
  // last drawing, from arithmetic over the area measured when the drag
  // began, and writes no layout. A rest commits the split and redraws; a
  // release commits it and hands the panels back one a frame
  // (`useStretchDrag`).
  const committedSharesRef = useRef(shares)
  const committedGridRef = useRef(gridShares)
  const stackGeomRef = useRef({ w: 0, total: 0, grip: 0 })
  const boxes = useMemo(() => [box0, box1, box2, box3], [])
  const gridGeomRef = useRef({ w: 0, h: 0 })
  const settlingRef = useRef(false)
  const stackStretch = useStretchDrag(stackRef, () => setStackShares(liveSharesRef.current))
  const gridStretch = useStretchDrag(gridRef, () => setGridShares(liveGridRef.current))
  // After a commit: mid-drag the layout is measured afresh; after a release
  // the panels are handed back.
  useLayoutEffect(() => {
    committedSharesRef.current = shares
    committedGridRef.current = gridShares
    if (dragStartRef.current) stackStretch.rebase()
    if (gutterStartRef.current) gridStretch.rebase()
    if (settlingRef.current) {
      settlingRef.current = false
      stackStretch.settle()
      gridStretch.settle()
    }
  }, [shares, gridShares, stackStretch, gridStretch])

  const stackLayout = useCallback((): DragLayout => {
    const { w, total, grip } = stackGeomRef.current
    const live = liveSharesRef.current
    const done = committedSharesRef.current
    const placed: Rect[] = []
    const handles: { dx: number; dy: number }[] = []
    let y = 0
    let doneY = 0
    live.forEach((share, i) => {
      if (i > 0) {
        // Each grip stands under the panel above it, so it moves as far as
        // that panel's foot has.
        handles.push({ dx: 0, dy: y - doneY })
        y += grip
        doneY += grip
      }
      placed.push({ x: 0, y, w, h: share * total })
      y += share * total
      doneY += (done[i] ?? share) * total
    })
    return { boxes: placed, handles }
  }, [])
  const onSplitStart = useCallback(
    (grip: number) => {
      const heights = boxes.slice(0, count).map((b) => b.current?.clientHeight ?? 0)
      const total = heights.reduce((a, b) => a + b, 0)
      const area = stackRef.current
      const gaps = Math.max(1, count - 1)
      stackGeomRef.current = { w: area?.clientWidth ?? 0, total, grip: ((area?.clientHeight ?? 0) - total) / gaps }
      liveSharesRef.current = shares
      dragStartRef.current = { shares, grip, totalPx: total }
      stackStretch.begin()
    },
    [boxes, shares, count, stackStretch],
  )
  const onSplitDrag = useCallback(
    (dragUpPx: number) => {
      const start = dragStartRef.current
      if (!start) return
      liveSharesRef.current = stackAfterDrag(start.shares, start.grip, dragUpPx, start.totalPx, stackFloors)
      stackStretch.frame(stackLayout)
    },
    [stackFloors, stackStretch, stackLayout],
  )
  const onSplitEnd = useCallback(() => {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    stackStretch.end()
    if (liveSharesRef.current === committedSharesRef.current) stackStretch.settle()
    else {
      settlingRef.current = true
      setStackShares(liveSharesRef.current)
    }
  }, [stackStretch])
  const onSplitReset = useCallback(() => setStackShares(null), [])

  // The grid's gutters move the splits with no floor: dragged into a
  // corner, one panel takes the area, and a panel under its floor is not
  // drawn (#499; TJ 2026-10-29).
  const gridW = Math.max(0, (gridRef.current?.clientWidth ?? 0) - GUTTER_PX)
  const gridH = Math.max(0, (gridRef.current?.clientHeight ?? 0) - GUTTER_PX)
  const gridLayout = useCallback((): DragLayout => {
    const { w, h } = gridGeomRef.current
    const { x: gx, y: gy } = liveGridRef.current
    const { x: cx, y: cy } = committedGridRef.current
    const left = gx * w
    const top = gy * h
    const right = { x: left + GUTTER_PX, w: w - left }
    const four = count === 4
    return {
      boxes: [
        { x: 0, y: 0, w: left, h: top },
        { ...right, y: 0, h: top },
        four ? { x: 0, y: top + GUTTER_PX, w: left, h: h - top } : { x: 0, y: top + GUTTER_PX, w: w + GUTTER_PX, h: h - top },
        { ...right, y: top + GUTTER_PX, h: h - top },
      ],
      handles: [
        // The vertical gutter, which with three panels stops at the top row.
        { dx: (gx - cx) * w, dy: 0, sy: four || cy <= 0 ? undefined : gy / cy },
        { dx: 0, dy: (gy - cy) * h },
        { dx: (gx - cx) * w, dy: (gy - cy) * h },
      ],
    }
  }, [count])
  const onGutterStart = useCallback(() => {
    const w = Math.max(0, (gridRef.current?.clientWidth ?? 0) - GUTTER_PX)
    const h = Math.max(0, (gridRef.current?.clientHeight ?? 0) - GUTTER_PX)
    gridGeomRef.current = { w, h }
    liveGridRef.current = gridShares
    gutterStartRef.current = { shares: gridShares, w, h }
    gridStretch.begin()
  }, [gridShares, gridStretch])
  const onGutterDrag = useCallback(
    (dx: number, dy: number) => {
      const start = gutterStartRef.current
      if (!start) return
      liveGridRef.current = gridAfterDrag(start.shares, dx, dy, start.w, start.h)
      gridStretch.frame(gridLayout)
    },
    [gridStretch, gridLayout],
  )
  const onGutterEnd = useCallback(() => {
    if (!gutterStartRef.current) return
    gutterStartRef.current = null
    gridStretch.end()
    const live = liveGridRef.current
    const done = committedGridRef.current
    if (live.x === done.x && live.y === done.y) gridStretch.settle()
    else {
      settlingRef.current = true
      setGridShares(live)
    }
  }, [gridStretch])
  // A double press evens its own axis; at the crossing, both.
  const onColumnsReset = useCallback(() => setGridShares((g) => ({ x: EVEN_GRID.x, y: g.y })), [])
  const onRowsReset = useCallback(() => setGridShares((g) => ({ x: g.x, y: EVEN_GRID.y })), [])
  const onBothReset = useCallback(() => setGridShares(EVEN_GRID), [])

  // The tutorial's hour wins over a finger's; an hour past a grid that has
  // since shrunk is no reading at all.
  const shownIndex = tooltipIndex ?? (fingerIndex !== null && fingerIndex < times.length ? fingerIndex : null)
  const dotIndex = shownIndex ?? (lifted || mouseIndex === null || mouseIndex >= times.length ? null : mouseIndex)
  const dotAt = dotIndex === null ? null : times[dotIndex]
  // The panel that shows the card (#499): the hovered one, or the first
  // before any hover. One card for every panel, reading each value a row.
  const cardPanel = hoveredPanel !== null && hoveredPanel < count ? hoveredPanel : 0

  const pickers = metrics.map((metric, i) => ({
    index: i,
    label: PICKER_LABELS[i],
    metric,
    metricLabel: metricLabelOf(metric),
  }))

  // One slot's picker: its field, with a grip and an × after the first.
  const picker = (p: (typeof pickers)[number]) => (
    // flex, not block, for the reason the ranking rows' dropdown
    // gives: an inline-level select in a block wrapper reserves
    // descender space below itself and sits a pixel low against what
    // is beside it.
    // Keyed by metric, so a moved picker keeps its element and its
    // grip keeps the keyboard focus across the move.
    <div
      key={p.metric}
      data-picker-slot={p.index}
      className={`relative flex flex-shrink-0 items-center ${RADIUS.control} ${drag?.from === p.index ? CHART_PICKER.dragged : ''} ${phone && drag && drag.to === p.index && drag.to !== drag.from ? CHART_PICKER.target : ''}`}
    >
      {!phone && drag && drag.to === p.index && drag.to !== drag.from && (
        <span aria-hidden="true" className={`${CHART_PICKER.drop} ${drag.to < drag.from ? CHART_PICKER.before : CHART_PICKER.after}`} />
      )}
      {segmented(
        p.index,
        <MenuSelect
          label={p.label}
          value={p.metric}
          options={METRIC_OPTIONS}
          onChange={(m: ChartMetric) => onPick(p.index, m)}
          className={`${CHART_METRIC_W} px-2 py-0.5`}
          shape={p.index === 0 ? 'field' : 'segment'}
        />,
        <RemoveButton index={p.index} metricLabel={p.metricLabel} onRemove={onRemove} width={CHART_PICKER.x} />,
        <MoveGrip
          index={p.index}
          count={metrics.length}
          metricLabel={p.metricLabel}
          onMove={onMove}
          onDragTo={setDrag}
        />,
      )}
    </div>
  )

  function panel(i: number, flexGrow: number | null, drawsAxis: boolean, boxRef?: RefObject<HTMLDivElement | null>, hidden = false) {
    return (
      <ChartPanel
        key={`panel-${i}`}
        index={i}
        boxRef={boxRef}
        hidden={hidden}
        flexGrow={flexGrow}
        metric={drawn[i]}
        metrics={drawn}
        lines={lines}
        ordered={ordered}
        focusedKey={focusedKey}
        cursorValue={cursorValue}
        drawsAxis={drawsAxis}
        labelsChrome={i === 0}
        syncId={count > 1 ? syncId : undefined}
        times={times}
        spanMs={spanMs}
        nowMs={nowMs}
        pointGrid={pointGrid}
        modelEnds={modelEnds}
        playheadMs={playheadMs}
        sortBy={sortBy}
        sortDesc={sortDesc}
        margin={MARGIN}
        followCursor={followCursor}
        showsCard={i === cardPanel}
        shownIndex={i === cardPanel ? shownIndex : null}
        onHover={onHover}
        onEnter={onEnter}
        onLeave={onLeave}
        onFinger={onFinger}
        onDropFinger={onDropFinger}
        onLift={onLift}
        onMouse={onMouse}
        lifted={lifted}
        dotAt={dotAt}
        onPlayheadChange={onPlayheadChange}
        areaRef={areaRef}
        heading={
          phone ? (
            <div className={CHART_PICKER.bar}>
              {picker(pickers[i])}
              {i === 0 && <AddButton disabled={atCeiling} onAdd={onAdd} square={CHART_PANEL_BUTTON.square} />}
            </div>
          ) : null
        }
      />
    )
  }

  // A grid panel too small for a plot is not drawn (#499); its box stays, so
  // the gutters stay where the reader put them.
  const widthFloor = panelWidthFloorPx(MARGIN)
  const heightFloor = panelFloorPx(MARGIN, true)
  const tooSmall = (w: number, h: number) => gridW > 0 && gridH > 0 && (w < widthFloor || h < heightFloor)
  const { x, y } = gridShares

  return (
    // The tour's Chart step lights the chart, its picker and plot (#696).
    <div className="flex h-full flex-col" data-tour="chart" data-picker-root="">
      {/* The metrics, one per panel; the first opens on the ranked metric.

          A select rather than one radio per metric (#348). The labels carry
          their units, and five of them at the panel's 12px type need 584px of
          row, where a phone's results sheet is the phone's width: at 402px the
          radios wrapped and AQI sat alone on a second line. The select is
          CHART_METRIC_W wide whatever its labels say, so a sixth metric costs
          the row nothing. It is the panel's old 144px rather than the 118px
          column the sidebar came down to: this control lines up with nothing
          above it, and `Freezing level (ft)` needs the wider one. The
          comparison note beside the controls shrinks (`min-w-0`). At a desk
          each opens the one menu rather than the platform's list (record
          0201). */}
      {/* At a desk the selects stand in a row above the plots, one per slot
          in slot order, each but the first with a grip before it and an ×
          after it, and the last with a + (#499). On a phone each stands at
          its own panel's top left, because four in a row wrapped onto a
          second line at a phone's width (TJ 2026-10-30), and the row stands
          only to hold a comparison's note. */}
      {(!phone || controls) && (
        // One gap through the row, the + included (TJ's review, 2026-10-30):
        // the + used to ride inside the last picker's wrapper at 4px while
        // the pickers stood 16px apart, two spacings for one row of peers.
        // 8px is the grid's gutter.
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 px-3 py-1">
          {!phone && pickers.map(picker)}
          {!phone && <AddButton disabled={atCeiling} onAdd={onAdd} square={CHART_PANEL_BUTTON.square} />}
          {controls}
        </div>
      )}

      {!gridded && (
        // One panel, two at any width, and three or four on a phone stand in
        // one column on one time axis, with a grip between each pair (#499).
        // One panel stands in it too, so every card keeps to the same area.
        <div ref={stackRef} className="relative flex min-h-0 flex-1 flex-col">
          {drawn.map((_, i) => (
            <Fragment key={`stack-${i}`}>
              {i > 0 && (
                <ResizeGrip
                  onReset={onSplitReset}
                  onDragStart={() => onSplitStart(i - 1)}
                  onDrag={onSplitDrag}
                  onDragEnd={onSplitEnd}
                />
              )}
              {panel(i, shares[i], i === count - 1, boxes[i])}
            </Fragment>
          ))}
        </div>
      )}
      {gridded && (
        // Three panels are a row of two over one full width; four, two rows
        // of two (#499). Every panel draws its own axes, since a column
        // cannot share another's, and all share the sync group.
        <div
          ref={gridRef}
          className="relative flex min-h-0 flex-1 flex-col gap-2"
          style={{ '--gx': x, '--gy': y } as CSSProperties}
        >
          <div ref={row0} className="flex min-h-0 gap-2" style={{ flexGrow: y, flexBasis: 0 }}>
            {panel(0, x, true, box0, tooSmall(x * gridW, y * gridH))}
            {panel(1, 1 - x, true, box1, tooSmall((1 - x) * gridW, y * gridH))}
          </div>
          <div ref={row1} className="flex min-h-0 gap-2" style={{ flexGrow: 1 - y, flexBasis: 0 }}>
            {panel(2, count === 4 ? x : 1, true, box2, tooSmall(count === 4 ? x * gridW : gridW + GUTTER_PX, (1 - y) * gridH))}
            {count === 4 && panel(3, 1 - x, true, box3, tooSmall((1 - x) * gridW, (1 - y) * gridH))}
          </div>
          {/* The gutters are the handles (#499; TJ 2026-10-29): the
              vertical one the columns, the horizontal one the rows, the
              square where they cross both. With three panels the vertical
              gutter stops at the top row. */}
          <GridGutter
            axis="col"
            place={{
              left: `calc(var(--gx) * (100% - ${GUTTER_PX}px))`,
              top: 0,
              height: count === 4 ? '100%' : `calc(var(--gy) * (100% - ${GUTTER_PX}px))`,
            }}
            label={RESIZE_COLUMNS_LABEL}
            onReset={onColumnsReset}
            onDragStart={onGutterStart}
            onDrag={onGutterDrag}
            onDragEnd={onGutterEnd}
          />
          <GridGutter
            axis="row"
            place={{ top: `calc(var(--gy) * (100% - ${GUTTER_PX}px))`, left: 0, width: '100%' }}
            label={RESIZE_ROWS_LABEL}
            onReset={onRowsReset}
            onDragStart={onGutterStart}
            onDrag={onGutterDrag}
            onDragEnd={onGutterEnd}
          />
          <GridGutter
            axis="both"
            place={{
              left: `calc(var(--gx) * (100% - ${GUTTER_PX}px) + ${GUTTER_PX / 2}px)`,
              top: `calc(var(--gy) * (100% - ${GUTTER_PX}px) + ${GUTTER_PX / 2}px)`,
            }}
            label={RESIZE_PANELS_LABEL}
            onReset={onBothReset}
            onDragStart={onGutterStart}
            onDrag={onGutterDrag}
            onDragEnd={onGutterEnd}
          />
        </div>
      )}
    </div>
  )
}

// The gutter between a grid's panels, `gap-2`, which the gutters' handles stand in.
const GUTTER_PX = 8

const metricLabelOf = (m: ChartMetric) => CHART_METRICS.find((c) => c.key === m)?.label ?? ''

// Every picker but the first and its × are one field in two segments
// (#499; TJ 2026-10-29); the first stands alone.
const segmented = (index: number, picker: ReactNode, remove: ReactNode, grip?: ReactNode) =>
  index === 0 ? (
    picker
  ) : (
    <div className={CHART_PICKER.group}>
      {grip}
      {picker}
      {remove}
    </div>
  )

/** A picker drag in flight: the slot it left and the slot it would land in. */
interface PickerDrag {
  from: number
  to: number
}

/**
 * The slot a picker dragged to this point would land in (#499): the movable
 * slot whose centre is nearest, read from the row's own boxes, so a row
 * that wrapped onto two lines answers as well as one that did not.
 */
function slotAt(row: Element | null, x: number, y: number): number | null {
  if (!row) return null
  let best: number | null = null
  let bestD = Infinity
  for (const el of Array.from(row.querySelectorAll<HTMLElement>('[data-picker-slot]'))) {
    const slot = Number(el.dataset.pickerSlot)
    if (!(slot > 0)) continue
    const r = el.getBoundingClientRect()
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
    if (d < bestD) {
      bestD = d
      best = slot
    }
  }
  return best
}

/**
 * The grip that moves a panel (#499; TJ 2026-10-30): the left segment of
 * every picker but the first. A pointer drags it over the row, an accent bar
 * showing where it lands, and the release moves it there; Left and Right
 * move it one place. The first slot is the ranking's, so nothing moves into
 * or out of it.
 */
function MoveGrip({
  index,
  count,
  metricLabel,
  onMove,
  onDragTo,
}: {
  index: number
  count: number
  metricLabel: string
  onMove: (from: number, to: number) => void
  onDragTo: (drag: PickerDrag | null) => void
}) {
  const toRef = useRef(index)
  return (
    <button
      type="button"
      aria-label={movePanelLabel(metricLabel)}
      className={`${CHART_PICKER.grip} ${CHART_PICKER.x}`}
      onKeyDown={(e) => {
        // Up and Down too, for a phone's pickers, which stand one panel over another.
        const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        const on = e.key === 'ArrowRight' || e.key === 'ArrowDown'
        const to = back ? index - 1 : on ? index + 1 : null
        if (to === null) return
        e.preventDefault()
        if (to >= 1 && to < count) onMove(index, to)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        const grip = e.currentTarget
        grip.setPointerCapture?.(e.pointerId)
        const row = grip.closest('[data-picker-root]')
        toRef.current = index
        onDragTo({ from: index, to: index })
        const move = (ev: globalThis.PointerEvent) => {
          const to = slotAt(row, ev.clientX, ev.clientY)
          if (to === null || to === toRef.current) return
          toRef.current = to
          onDragTo({ from: index, to })
        }
        const up = () => {
          grip.removeEventListener('pointermove', move)
          grip.removeEventListener('pointerup', up)
          grip.removeEventListener('pointercancel', cancel)
          onDragTo(null)
          if (toRef.current !== index) onMove(index, toRef.current)
        }
        const cancel = () => {
          toRef.current = index
          up()
        }
        grip.addEventListener('pointermove', move)
        grip.addEventListener('pointerup', up)
        grip.addEventListener('pointercancel', cancel)
      }}
    >
      <IconGrip />
    </button>
  )
}

/** The × that takes a panel away (#499): the right segment of its picker's field. */
function RemoveButton({
  index,
  metricLabel,
  onRemove,
  width,
}: {
  index: number
  metricLabel: string
  onRemove: (i: number) => void
  /** The segment's width: the picker's height. */
  width: string
}) {
  return (
    <button
      type="button"
      onClick={() => onRemove(index)}
      aria-label={removePanelLabel(metricLabel)}
      className={`${CHART_PICKER.remove} ${width}`}
    >
      <IconClose size="chip" />
    </button>
  )
}

/** The + that adds a panel (#499), greyed at the ceiling. */
function AddButton({ disabled, onAdd, square }: { disabled: boolean; onAdd: () => void; square: string }) {
  return (
    <button type="button" onClick={onAdd} disabled={disabled} aria-label={ADD_PANEL_LABEL} className={`${CHART_PANEL_BUTTON.add} ${square}`}>
      <IconPlus size="chip" />
    </button>
  )
}

interface PanelProps {
  index: number
  boxRef?: RefObject<HTMLDivElement | null>
  /** The panel's share of its stack or grid row, or null for the one panel, which fills. */
  flexGrow: number | null
  /** Too small for a plot (#499): the box keeps its place and draws nothing. */
  hidden: boolean
  metric: ChartMetric
  /** Every metric drawn, first panel first, which the card reads a row in. */
  metrics: ChartMetrics
  lines: readonly ChartLine[]
  ordered: readonly ChartLine[]
  focusedKey: string | null
  cursorValue: number | null
  /** The bottom panel draws the time axis; the top one's strip is zero tall. */
  drawsAxis: boolean
  /** The top panel names the Now seam and each model's end; the lines stand in both. */
  labelsChrome: boolean
  syncId: string | undefined
  times: number[]
  spanMs: number
  nowMs: number | null
  pointGrid: boolean
  modelEnds: readonly ModelEndLine[]
  playheadMs: number | null
  sortBy: SortBy
  sortDesc: boolean
  margin: PlotMargin
  followCursor: boolean
  /** Whether this panel's tooltip draws the card; the other panel's draws nothing. */
  showsCard: boolean
  shownIndex: number | null
  onHover: (panel: number, key: string | null, value: number | null, idx: number | null) => void
  /** The hour every panel's dots stand on, or null for none. */
  dotAt: number | null
  onEnter: (panel: number) => void
  onLeave: () => void
  onFinger: (panel: number, index: number, key: string | null | undefined, value: number | null) => void
  onDropFinger: () => void
  /** A finger left the plot: the card stays shut until a mouse moves. */
  onLift: () => void
  onMouse: () => void
  lifted: boolean
  onPlayheadChange?: (ms: number) => void
  /**
   * The panels' area at a desk with more than one panel (#499): the card's
   * width and rows are budgeted on it rather than on this panel, and the card
   * may leave the panel but stays inside it, at a desk and on a phone alike,
   * one panel included (TJ 2026-10-30).
   */
  areaRef: RefObject<HTMLDivElement | null>
  /** A phone panel's own picker, over its top left, or null at a desk. */
  heading: ReactNode
}

// The card over several panels (#499): free to leave the hovered panel, and
// over its neighbours and the grid's gutters. Hoisted, so Recharts is handed one
// object.
const ESCAPE_PANEL = { x: true, y: true }
const CARD_OVER_PANELS = { zIndex: 3 }

// Marks a panel box for a split drag, which moves it by transform (#499).
const BOX_MARK = { [BOX_ATTR]: '' }
const boxStyle = (flexGrow: number | null) => (flexGrow === null ? undefined : { flexGrow, flexBasis: 0 })

// The card stands inside the chart less this much, so it never meets the
// plot's edge however long a name runs (#499).
const CARD_INSET_PX = 8

/**
 * One metric's plot (#499): its own y axis, domain, data and extreme line.
 * The chart draws one, a stack of them on one time axis, or a grid.
 */
function ChartPanel({
  index,
  boxRef,
  flexGrow,
  hidden,
  metric,
  metrics,
  lines,
  ordered,
  focusedKey,
  cursorValue,
  drawsAxis,
  labelsChrome,
  syncId,
  times,
  spanMs,
  nowMs,
  pointGrid,
  modelEnds,
  playheadMs,
  sortBy,
  sortDesc,
  margin,
  followCursor,
  showsCard,
  shownIndex,
  onHover,
  onEnter,
  onLeave,
  onFinger,
  onDropFinger,
  onLift,
  onMouse,
  lifted,
  dotAt,
  onPlayheadChange,
  areaRef,
  heading,
}: PanelProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  // Where the last finger went down on the plot, for the click its tap makes.
  const tapXRef = useRef<number | null>(null)
  const axisPx = xAxisPx(drawsAxis)

  // Memoized because hovering re-renders: handleMove below stores the cursor's
  // value and the nearest line in state, so every mouse movement that changes
  // either one lands here again. Neither of these depends on that state, and
  // both are O(times x rows) — for 100 destinations over the full 106-day span
  // that is ~254,000 object writes plus ~254,000 comparisons, re-done per
  // mousemove. Measured before this memo: ~20ms of blocked main thread per
  // hover against a 16.7ms frame budget, and a continuous mousemove stream
  // queued faster than it could be serviced until the renderer stopped
  // answering. Both keys are already stable — `aligned` is itself memoized.
  const data = useMemo(() => buildChartData(times, lines, metric), [times, lines, metric])
  const yDomain = useMemo(() => computeYDomain(lines, metric), [lines, metric])
  const [yMin, yMax] = yDomain
  // Which end of the family the extreme line marks: the ranking's own
  // direction while the chart shows the ranked family, and the largest value
  // on any other, where no direction was ever chosen.
  const highest = metric === metricForSort(sortBy) ? sortDesc : true
  // Memoized beside the y domain for the same reason: it is a walk over every
  // drawn value, and a hover re-renders without changing any of its inputs.
  const extreme = useMemo(() => extremeValue(lines, metric, highest), [lines, metric, highest])
  // How each line is drawn, kept until the focus or the lines change, so a
  // hover that moves only the cursor leaves the canvas alone.
  const strokes = useMemo(() => lineStrokes(ordered, focusedKey, pointGrid), [ordered, focusedKey, pointGrid])

  // The nearest line is read through THIS panel's domain (#499): the cursor's
  // height means a value only on the axis it stands against.
  function nearestAt(idx: number, value: number): string | null {
    const valuesByKey: Record<string, number | null> = {}
    for (const line of lines) valuesByKey[line.key] = valueAt(line, metric, idx)
    return nearestKey(valuesByKey, value)
  }

  function handleMove(state: any) {
    tapXRef.current = null
    const idx = state?.activeTooltipIndex
    const py = typeof state?.chartY === 'number' ? state.chartY : state?.activeCoordinate?.y
    const h = plotRef.current?.clientHeight ?? 0
    const plotHeight = plotBand(0, h, margin, drawsAxis).height
    if (idx == null || typeof py !== 'number' || plotHeight <= 0) {
      onHover(index, null, null, null)
      return
    }
    const cv = pixelToValue(py, margin.top, plotHeight, yMin, yMax)
    onHover(index, nearestAt(idx, cv), cv, idx)
  }

  // A finger (or a pen) on the chart reads the hour under it, as a resting
  // mouse does: the tooltip at that hour and, where the chart may follow a
  // cursor, the nearest line drawn over the rest. A horizontal drag keeps
  // reading, because the plot leaves only vertical panning to the browser
  // (`touch-pan-y` below); a vertical drag is the sheet's scroll, and the
  // browser cancels the pointer, which drops the reading. A lift drops it too
  // (TJ 2026-10-30, reversing record 0144's reading that stayed): on a phone
  // the chart fills the sheet, so a tap meant to close a standing card moved
  // the hour instead, and a reading held only under the finger leaves nothing
  // to close. The tap's own click still seeks the map's playhead.
  function readFinger(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse') {
      if (lifted) onMouse()
      return
    }
    if (e.type === 'pointerdown') {
      tapXRef.current = e.clientX
      // No compatibility mouse events after a finger (TJ 2026-10-30): Recharts
      // read them as a hover that never ended, which re-rendered every synced
      // panel after the lift and held its dots up. The tap's click still
      // fires, and `touch-pan-y` still hands the browser the vertical pan.
      e.preventDefault()
    }
    const el = plotRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const reading = fingerReading(e.clientX - box.left, e.clientY - box.top, box, times, yMin, yMax, margin, drawsAxis)
    if (reading === null) return
    if (!followCursor) {
      onFinger(index, reading.index, undefined, null)
      return
    }
    onFinger(index, reading.index, nearestAt(reading.index, reading.value), reading.value)
  }

  function dropFinger() {
    tapXRef.current = null
    onDropFinger()
  }

  // Keeps `tapXRef`, which the click that follows a lift reads.
  function liftFinger(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') onLift()
  }


  // A click puts the map's playhead on the hour under the pointer. The chart
  // and the map are two views of one hourly grid, so a reader who has found the
  // bad afternoon on the chart should be able to see it on the map without
  // hunting for it again on a 200px scrubber.
  //
  // The hour is read from the click's own `clientX`, inverted through the
  // plotting band and snapped to the grid, which is the hour a hover at that
  // pixel names. Recharts' `activeLabel` is not trusted first because it comes
  // from the hover state: a touch tap sends no hover before its click, so the
  // first tap carries no label, and each later tap carries the hour the tap
  // BEFORE it left behind. The label stays as the fallback for a click that
  // arrives with no position.
  //
  // A tap's own click is not trusted for its pixel either: Chrome moves the
  // click it makes from a tap toward a clickable node near the finger (touch
  // adjustment), 7px left of the finger in the browser suite (#696), which
  // named the hour before the one the finger read. So a tap names the hour
  // where the finger went down (`tapXRef`), the one its reading shows.
  //
  // Either panel moves it (#499): both span the same pixels left to right.
  function handleClick(state: any, event?: { clientX?: unknown }) {
    if (!onPlayheadChange) return
    const x = tapXRef.current ?? event?.clientX
    tapXRef.current = null
    const el = plotRef.current
    if (typeof x === 'number' && el) {
      const box = el.getBoundingClientRect()
      const i = hourIndexAt(x - box.left, box.width, times)
      if (i !== null) {
        onPlayheadChange(times[i])
        return
      }
    }
    const t = state?.activeLabel
    if (typeof t === 'number') onPlayheadChange(t)
  }

  if (hidden) return <div ref={boxRef} {...BOX_MARK} className="min-h-0 min-w-0" style={boxStyle(flexGrow)} />

  return (
    <div
      ref={boxRef}
      {...BOX_MARK}
      className={`relative flex min-h-0 min-w-0 flex-col ${flexGrow === null ? 'flex-1' : ''}`}
      // A share of the stack or the row rather than pixels, so a sheet that
      // grows keeps the split the reader set (#499).
      style={boxStyle(flexGrow)}
      onMouseEnter={() => onEnter(index)}
    >
      {heading}
      <div
        ref={plotRef}
        onPointerDown={readFinger}
        onPointerMove={readFinger}
        onPointerUp={liftFinger}
        onPointerCancel={dropFinger}
        // A card over several panels leaves this one (#499).
        className={`relative min-h-0 flex-1 ${areaRef ? 'overflow-visible' : 'overflow-hidden'} ${CHART_PLOT_TOUCH}`}
      >
        {/* The stage a drag freezes and stretches (`useStretchDrag`, #499). */}
        <div {...{ [STAGE_ATTR]: '' }} className="absolute inset-0 origin-top-left">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={margin}
            syncId={syncId}
            onMouseMove={followCursor ? handleMove : undefined}
            onMouseLeave={followCursor ? onLeave : undefined}
            onClick={onPlayheadChange ? handleClick : undefined}
            className={onPlayheadChange ? 'cursor-pointer' : undefined}
          >
            <CartesianGrid stroke={CHROME.grid} strokeDasharray="3 3" />
            {/* The top of two panels keeps its axis for the scale, hidden
                and zero tall, so both plot bands span the same pixels (#499). */}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              hide={!drawsAxis}
              height={axisPx}
              stroke={CHROME.axis}
              tick={AXIS_TICK}
              tickFormatter={(t: any) => axisTimeLabel(t, spanMs)}
            />
            <YAxis
              domain={[yMin, yMax]}
              width={Y_AXIS_WIDTH}
              stroke={CHROME.axis}
              tick={AXIS_TICK}
              tickFormatter={(v: any) => formatMetricValue(v, metric)}
            />
            {/* Wears the axis's own color rather than a semantic one: it is
                chrome marking where the x-axis changes meaning, not a warning.
                Dashed so it cannot be mistaken for a series. Named in the top
                panel alone (#499): one label says it for both lines. */}
            {nowMs !== null && (
              <ReferenceLine
                x={nowMs}
                {...CHROME_LINE}
                label={labelsChrome ? chromeLabel('Now', 'insideTopLeft') : undefined}
              />
            )}
            {/* Where a compared model's forecast ends. Chrome marking where
                one model's data stops, not a warning, so it wears the axis
                colour and the "Now" seam's dash rather than a status hue: a
                shorter reach is a fact about the model, not a fault. The label
                is the whole signal, which is why there is no hover entry. */}
            {modelEnds.map((end) => (
              <ReferenceLine
                key={end.endMs}
                x={end.endMs}
                {...CHROME_LINE}
                label={labelsChrome ? chromeLabel(end.label, 'insideTopLeft') : undefined}
              />
            ))}
            {/* The map's playhead. Solid and in the accent where the "Now"
                seam above is dashed and in the axis colour, because this one
                is a control's position and that one is a fact about the data.
                No label: the transport's own readout already states the hour,
                and a second copy of it would move with the line across a chart
                that is mostly line already. */}
            {playheadMs !== null && <ReferenceLine x={playheadMs} stroke={CHROME.playhead} strokeWidth={1.5} />}
            <Tooltip
              isAnimationActive={false}
              defaultIndex={shownIndex ?? undefined}
              active={shownIndex !== null ? true : lifted ? false : undefined}
              offset={CARD_CURSOR_OFFSET_PX}
              allowEscapeViewBox={areaRef ? ESCAPE_PANEL : undefined}
              wrapperStyle={areaRef ? CARD_OVER_PANELS : undefined}
              content={(props: any) =>
                // One card for both panels (#499): the other panel's tooltip
                // draws nothing while the sync cursor still stands in it.
                showsCard ? (
                  <ChartTooltip
                    {...props}
                    times={times}
                    lines={lines}
                    metric={metric}
                    metrics={metrics}
                    focusedKey={focusedKey}
                    maxWidthPx={((areaRef ?? plotRef).current?.clientWidth ?? 0) - CARD_INSET_PX}
                    areaRef={areaRef}
                    cursorValue={cursorValue}
                    // Read at render rather than observed: this component
                    // re-renders on every hover move, which is the only time
                    // the value is used.
                    maxRows={tooltipCapacity((areaRef ?? plotRef).current?.clientHeight ?? 0)}
                  />
                ) : null
              }
            />
            {/* Every series on one canvas between the grid and the reference
                lines (#499; record 0244): 200 SVG lines cost Recharts a
                redraw of every point on every size change. */}
            <ChartLines data={data} strokes={strokes} yDomain={yDomain} at={dotAt} />
            {/* One unpainted Recharts line, the anchor a tooltip opened by
                `defaultIndex` (a finger, the tour) needs to stand: with no
                graphical item Recharts places it nowhere and keeps it hidden
                (2026-10-30). One line of points rather than two hundred. */}
            {ordered.length > 0 && (
              <Line
                dataKey={ordered[0].key}
                stroke="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
            {/* The most extreme value among the ranked lines drawn (#699),
                as one dashed line across the plot in the Now seam's style,
                labelled with the value. A line rather than a mark on a point,
                because it covers every hour that ties it and never sits on
                the axis. After the lines, so it stays whole while the hover
                dims them; a reference line has no hover entry. A point sample
                gets the same line through its extreme dot. */}
            {extreme !== null && (
              <ReferenceLine
                y={extreme}
                {...CHROME_LINE}
                label={{
                  ...chromeLabel(extremeLabel(extreme, metric), 'insideBottomRight'),
                  content: margin.top === PLOT_MARGIN.top ? HEADROOM_LABEL : PHONE_HEADROOM_LABEL,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function fmtTooltipTime(t: number): string {
  return new Date(t).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface TooltipItem {
  key: string
  /** The hovered panel's value, which orders the card. */
  value: number | null
  cells: string[]
  line: ChartLine
}

interface ChartTooltipProps {
  active?: boolean
  payload?: { dataKey?: string; value?: number | null }[]
  label?: number
  times: readonly number[]
  lines: readonly ChartLine[]
  /** The hovered panel's metric. */
  metric: ChartMetric
  /** Every metric drawn, first panel first: the card's columns. */
  metrics: ChartMetrics
  focusedKey: string | null
  cursorValue: number | null
  // How many series the card has room to list, from the plot area's current
  // height rather than a constant — see tooltipCapacity.
  maxRows: number
  /** The widest the card may stand: the chart's width less `CARD_INSET_PX`. */
  maxWidthPx: number
  /** The area the card is clamped inside, with more than one panel at a desk. */
  areaRef?: RefObject<HTMLDivElement | null>
}

/**
 * Keeps the card inside the panels' area (#499). Recharts puts an escaping
 * card at the cursor plus the offset; this reads where it landed, works out
 * the cursor from it, and moves the card by `cardPlacement`'s answer. Written
 * to the element after layout rather than through state, so a hover renders
 * nothing more.
 */
function useCardInArea(cardRef: RefObject<HTMLDivElement | null>, areaRef: RefObject<HTMLDivElement | null> | undefined) {
  useLayoutEffect(() => {
    const el = cardRef.current
    const area = areaRef?.current
    if (!el || !area) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    const a = area.getBoundingClientRect()
    const at = { x: r.left - a.left, y: r.top - a.top }
    const cursor = { x: at.x - CARD_CURSOR_OFFSET_PX, y: at.y - CARD_CURSOR_OFFSET_PX }
    const p = cardPlacement(cursor, { w: r.width, h: r.height }, { w: a.width, h: a.height })
    if (p.x !== at.x || p.y !== at.y) el.style.transform = `translate(${p.x - at.x}px, ${p.y - at.y}px)`
  })
}

// Shared X-locked tooltip: all lines at the hovered instant, ordered by nearness
// to the cursor (focused line bold and first), capped so a big overlay stays
// readable. With more than one panel it is one card on the hovered panel, a
// column per metric under a header naming each with its unit, so the cells
// print bare numbers (#499; TJ 2026-10-29). One metric's card has no header:
// its picker already names the unit.
function ChartTooltip({
  active,
  label,
  times,
  lines,
  metric,
  metrics,
  focusedKey,
  cursorValue,
  maxRows,
  maxWidthPx,
  areaRef,
}: ChartTooltipProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  useCardInArea(cardRef, areaRef)
  // The lines are a canvas (record 0244), so Recharts hands no payload; the
  // hour is the label and every value is read from the lines.
  if (!active || label == null) return null
  const index = times.indexOf(label)
  if (index < 0) return null

  const items: TooltipItem[] = []
  for (const line of lines) {
    const cells = cardCells(line, metrics, index)
    if (cells.every((c) => c === '')) continue
    items.push({ key: line.key, value: valueAt(line, metric, index), cells, line })
  }
  items.sort((a, b) => {
    if (a.key === focusedKey) return -1
    if (b.key === focusedKey) return 1
    // A row with no value on the hovered axis reads after every row with one.
    if (a.value === null || b.value === null) return a.value === null ? (b.value === null ? 0 : 1) : -1
    if (cursorValue == null) return b.value - a.value
    return Math.abs(a.value - cursorValue) - Math.abs(b.value - cursorValue)
  })

  const shown = items.slice(0, maxRows)
  const rest = items.length - shown.length
  const headed = metrics.length > 1

  return (
    <div
      ref={cardRef}
      // Over several panels the card is as wide as its content (`w-max`):
      // Recharts' wrapper is absolutely positioned inside the hovered panel,
      // so a shrink-to-fit width stops at that panel's edge and the name
      // column takes the whole squeeze (`Moun…` in a 2×2 grid, 2026-10-29).
      // `maxWidth`, the area's width, still caps it.
      className={`${CHART_CARD.card} ${TEXT.control} ${areaRef ? 'w-max' : ''}`}
      style={maxWidthPx > 0 ? { maxWidth: maxWidthPx } : undefined}
    >
      <div className={CHART_CARD.head}>{fmtTooltipTime(label)}</div>
      <div className={CHART_CARD.body}>
      {/* One grid, so each column is as wide as its widest cell or header. */}
      <div
        className="grid items-center gap-x-3.5"
        style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${metrics.length}, auto)` }}
      >
        {headed && (
          <>
            <span />
            {metrics.map((m) => (
              <span key={m} className={CHART_CARD.heads}>
                {CHART_METRICS.find((c) => c.key === m)?.label}
              </span>
            ))}
            {/* One rule under the heads, across every column. */}
            <span className={CHART_CARD.rule} data-card-rule="" />
          </>
        )}
        {shown.map((it) => {
          const strong = it.key === focusedKey ? 'font-semibold text-ink-strong' : ''
          return (
            <Fragment key={it.key}>
              <span className={`flex min-w-0 items-center gap-1.5 ${strong}`}>
                <span
                  className={`h-2 w-2 flex-shrink-0 ${RADIUS.control}`}
                  style={{ backgroundColor: it.line.color }}
                />
                <span className={CHART_CARD.name}>{it.line.label}</span>
              </span>
              {it.cells.map((c, k) => (
                <span key={k} className={`${CHART_CARD.value} ${strong}`}>
                  {c}
                </span>
              ))}
            </Fragment>
          )
        })}
      </div>
      </div>
      {rest > 0 && <div className={CHART_CARD.foot}>+{rest} more</div>}
    </div>
  )
}

// Memoized because App.tsx re-renders on any of its 50-odd pieces of state, and
// most of them cannot change what this component draws. Measured 2026-09-14 on
// a 946-destination analysis: toggling a map overlay, which touches neither the
// ranking nor the rows, cost 311 to 392 ms of synchronous React work, because
// the table and the chart both re-rendered for it. Every function prop this
// takes is wrapped in `useCallback` at the call site or in its hook; a fresh
// identity there puts the whole cost straight back (#337, finding 8).
export default memo(TimeSeriesChart)
