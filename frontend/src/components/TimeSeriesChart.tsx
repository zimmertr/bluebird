import { type PointerEvent, ReactNode, type RefObject, memo, useCallback, useId, useMemo, useRef, useState } from 'react'
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
import { CHART_METRIC_W, CHART_PLOT_TOUCH, CHART_TITLE, ICON_ADORNMENT, RADIUS, SURFACE_FLOATING, TEXT } from '../styles'
import { IconChevron } from './icons'
import { MenuSelect } from './Menu'
import ResizeGrip from './ResizeGrip'
import {
  CHART_METRICS,
  ChartLine,
  ChartMetric,
  type ChartMetricPair,
  cardValues,
  pairMetrics,
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
  PLOT_MARGIN,
  type PlotMargin,
  READOUT_ROOM_GAP_PX,
  TITLED_PLOT_MARGIN,
  Y_AXIS_WIDTH_PX,
  fingerReading,
  hourIndexAt,
  panelFloorPx,
  plotBand,
  readoutPlace,
  splitAfterDrag,
  xAxisPx,
} from '../utils/chart/chartPointer'
import { CHART_TICK_PX, CHROME, CROWDED_PAST, LINE_DRAW } from '../utils/chart/chartColors'

// Explicit geometry so the hover handler can invert pixels → data values: the
// plotting band is the container minus these margins and the x-axis strip.
// The numbers are `utils/chart/chartPointer.ts`', which a finger's reading and a
// click's hour invert through too. A phone's plot takes the titled margins,
// its picker standing as a title over the plot (#696). With two panels only
// the bottom one draws the x axis (#499), so each panel asks `xAxisPx` for
// its own strip.
// The readout over the picker, whose box stands at z 1 (`CHART_TITLE`), when a
// phone's card rises above the plot into the sheet (#696). Hoisted so Recharts
// is handed one object.
const READOUT_OVER_TITLE = { zIndex: 2 }
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
// One per margin, hoisted, so the label's component is the same between
// renders and Recharts never remounts it.
const HEADROOM_LABEL = headroomLabel(PLOT_MARGIN.top)
const TITLED_HEADROOM_LABEL = headroomLabel(TITLED_PLOT_MARGIN.top)

// The pickers' words (#499), each one constant so a change is one edit. The
// maintainer confirmed all three on 2026-10-28: the first picker keeps the
// name #348 gave it, the second is named for its slot, and its empty option
// reads the same word the closed picker shows while the slot is empty.
const PRIMARY_PICKER_LABEL = 'Chart metric'
const SECOND_PICKER_LABEL = 'Second metric'
const SECOND_NONE_LABEL = 'None'

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
   * The metrics drawn (#499): the primary in the top panel, and the second,
   * when there is one, in a panel of its own under it on the same time axis.
   * One value held in state by `useChartPair`, so the memo compares one
   * identity that moves only when a slot does.
   */
  pair: ChartMetricPair
  onPrimaryChange: (m: ChartMetric) => void
  /** A metric for the second panel, or null to take it away. */
  onSecondChange: (m: ChartMetric | null) => void
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
   * A phone (#696; record 0149): the metric select is the plot's title rather
   * than a row above it, and the plot is inset under the title's line.
   */
  titled?: boolean
}

// A stable empty default: a fresh `[]` per render would rebuild every line, and
// with it every path Recharts strokes, on every hover.
// The metric menu's rows at a desk, once: the chart's own list in its order
// and words, as the select's options read them (record 0201).
const METRIC_OPTIONS = CHART_METRICS.map((m) => ({ value: m.key, label: m.label }))
// The second picker's rows: the empty slot first, so the one press that put a
// panel there is the one that takes it away (#499). The empty string is the
// slot's value because a select's value is text.
type SecondValue = ChartMetric | ''
const SECOND_OPTIONS: readonly { value: SecondValue; label: string }[] = [
  { value: '', label: SECOND_NONE_LABEL },
  ...METRIC_OPTIONS,
]

const NO_EXTRA_LINES: readonly ChartLine[] = []
const NO_MODEL_ENDS: readonly ModelEndLine[] = []
const NO_SHARED_NAMES: ReadonlySet<string> = new Set()

const toSecond = (v: SecondValue): ChartMetric | null => (v === '' ? null : v)

function TimeSeriesChart({
  tooltipIndex = null,
  times,
  rows,
  pair,
  onPrimaryChange,
  onSecondChange,
  sortBy,
  sortDesc,
  colorFor,
  sharedNames = NO_SHARED_NAMES,
  playheadMs = null,
  onPlayheadChange,
  extraLines = NO_EXTRA_LINES,
  modelEnds = NO_MODEL_ENDS,
  controls,
  titled = false,
}: Props) {
  // A phone's picker is the plot's title rather than a row above it (#696),
  // and the plot is inset under it.
  const MARGIN = titled ? TITLED_PLOT_MARGIN : PLOT_MARGIN
  const metrics = useMemo(() => pairMetrics(pair), [pair])
  const stacked = metrics.length > 1
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  // The cursor's value in the hovered panel's own units, which orders the card.
  const [cursorValue, setCursorValue] = useState<number | null>(null)
  // Which panel the pointer is over (#499): the one that shows the card, and
  // whose domain the nearest line is read through. Null before any hover,
  // which puts a tutorial's or a finger's card on the top panel.
  const [hoveredPanel, setHoveredPanel] = useState<number | null>(null)
  // The hour a finger reads (#336; record 0144), which the tooltip shows as
  // it shows a hovered one. A touch sends no hover, so Recharts never learns
  // the hour from it; this is the hour handed to it instead. Kept when the
  // finger lifts, so the reading can be read without a finger over it.
  const [fingerIndex, setFingerIndex] = useState<number | null>(null)
  // The top panel's share of the two panels' height (#499). Session state:
  // a split is how this reader likes this chart today, which no link or
  // storage has reason to carry. Even by default and after a double press.
  const [share, setShare] = useState(0.5)
  const topBoxRef = useRef<HTMLDivElement>(null)
  const bottomBoxRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ share: number; totalPx: number } | null>(null)
  // One sync group per chart, so the second panel's cursor stands on the hour
  // the first is hovered at.
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
  // Counted over both panels' paths (#499): the emphasis dims a destination in
  // each, so a hover re-renders every line twice when two metrics are drawn.
  const followCursor = tracksCursor(times.length, lines.length * metrics.length)

  // Render the focused line last (on top) with siblings dimmed. One nearest-line
  // computation feeds both the line emphasis and the tooltip ordering, in both
  // panels: a destination is one colour in each, so it is one emphasis too.
  const ordered = useMemo(
    () =>
      focusedKey
        ? [...lines.filter((l) => l.key !== focusedKey), ...lines.filter((l) => l.key === focusedKey)]
        : lines,
    [lines, focusedKey],
  )

  const onHover = useCallback((panel: number, key: string | null, value: number | null) => {
    // A mouse takes the reading back from a finger that left one.
    setFingerIndex(null)
    setHoveredPanel(panel)
    setFocusedKey(key)
    setCursorValue(value)
  }, [])
  const onEnter = useCallback((panel: number) => setHoveredPanel(panel), [])
  const onLeave = useCallback(() => {
    setFocusedKey(null)
    setCursorValue(null)
  }, [])
  const onFinger = useCallback((panel: number, index: number, key: string | null | undefined, value: number | null) => {
    setHoveredPanel(panel)
    setFingerIndex(index)
    if (key !== undefined) {
      setFocusedKey(key)
      setCursorValue(value)
    }
  }, [])
  const onDropFinger = useCallback(() => {
    setFingerIndex(null)
    setFocusedKey(null)
    setCursorValue(null)
  }, [])

  // The grip between the panels moves height from one to the other (#499).
  // Each keeps a floor, from the plot geometry (`panelFloorPx`), so neither
  // can be dragged to nothing; the top one has no axis strip to keep.
  const topFloor = panelFloorPx(MARGIN, false)
  const bottomFloor = panelFloorPx(MARGIN, true)
  const onSplitStart = useCallback(() => {
    const totalPx = (topBoxRef.current?.clientHeight ?? 0) + (bottomBoxRef.current?.clientHeight ?? 0)
    setShare((current) => {
      dragStartRef.current = { share: current, totalPx }
      return current
    })
  }, [])
  const onSplitDrag = useCallback(
    (dragUpPx: number) => {
      const start = dragStartRef.current
      if (!start) return
      setShare(splitAfterDrag(start.share, dragUpPx, start.totalPx, topFloor, bottomFloor))
    },
    [topFloor, bottomFloor],
  )
  const onSplitEnd = useCallback(() => {
    dragStartRef.current = null
  }, [])
  const onSplitReset = useCallback(() => setShare(0.5), [])

  // The tutorial's hour wins over a finger's; an hour past a grid that has
  // since shrunk is no reading at all.
  const shownIndex = tooltipIndex ?? (fingerIndex !== null && fingerIndex < times.length ? fingerIndex : null)
  // The panel that shows the card (#499): the hovered one, or the top one
  // before any hover. One card for both panels, reading both values a row.
  const cardPanel = hoveredPanel !== null && hoveredPanel < metrics.length ? hoveredPanel : 0

  const metricLabel = (m: ChartMetric) => CHART_METRICS.find((c) => c.key === m)?.label ?? ''
  const onSecondPick = useCallback((v: SecondValue) => onSecondChange(toSecond(v)), [onSecondChange])
  const onPrimaryPick = useCallback((v: SecondValue) => v !== '' && onPrimaryChange(v), [onPrimaryChange])
  // The desk's two pickers, one beside the other at one width (#499). One
  // menu shape drawn twice from a list, so the two cannot drift apart.
  const deskPickers = [
    { label: PRIMARY_PICKER_LABEL, value: pair.primary as SecondValue, options: METRIC_OPTIONS, onChange: onPrimaryPick },
    { label: SECOND_PICKER_LABEL, value: (pair.second ?? '') as SecondValue, options: SECOND_OPTIONS, onChange: onSecondPick },
  ]

  return (
    // The tour's Chart step lights the chart, its picker and plot (#696).
    <div className="flex h-full flex-col" data-tour="chart">
      {/* The metric, one series at a time; opens on the ranked metric.

          A select rather than one radio per metric (#348). The labels carry
          their units, and five of them at the panel's 12px type need 584px of
          row, where a phone's results sheet is the phone's width: at 402px the
          radios wrapped and AQI sat alone on a second line. The select is
          CHART_METRIC_W wide whatever its labels say, so this row cannot wrap
          and a sixth metric costs it nothing. It is the panel's old 144px
          rather than the 118px column the sidebar came down to: this control
          lines up with nothing above it, and `Freezing level (ft)` needs the
          wider one. The row itself does not wrap either:
          the comparison note beside the control shrinks (`min-w-0`) rather
          than dropping under it. At a desk it opens the one menu rather
          than the platform's list (record 0201). */}
      {/* At a desk the select stands in a row above the plot; on a phone it
          is the plot's title (below), and the row stands only to hold a
          comparison's note. The second metric's picker stands beside the
          first in the same row and at the same width (#499), its first
          option the empty slot. */}
      {(!titled || controls) && (
        <div className="flex flex-shrink-0 items-center gap-x-4 px-3 py-1">
          {!titled &&
            deskPickers.map((picker) => (
              // flex, not block, for the reason the ranking rows' dropdown
              // gives: an inline-level select in a block wrapper reserves
              // descender space below itself and sits a pixel low against what
              // is beside it.
              <div key={picker.label} className="relative flex flex-shrink-0">
                <MenuSelect<SecondValue>
                  label={picker.label}
                  value={picker.value}
                  options={picker.options}
                  onChange={picker.onChange}
                  className={`${CHART_METRIC_W} px-2 py-0.5`}
                />
              </div>
            ))}
          {controls}
        </div>
      )}

      {metrics.map((metric, i) => {
        const panel = (
          <ChartPanel
            key={`panel-${i}`}
            index={i}
            boxRef={i === 0 ? topBoxRef : bottomBoxRef}
            grow={stacked ? (i === 0 ? share : 1 - share) : null}
            metric={metric}
            metrics={metrics}
            lines={lines}
            ordered={ordered}
            focusedKey={focusedKey}
            cursorValue={cursorValue}
            drawsAxis={i === metrics.length - 1}
            labelsChrome={i === 0}
            syncId={stacked ? syncId : undefined}
            times={times}
            spanMs={spanMs}
            nowMs={nowMs}
            pointGrid={pointGrid}
            modelEnds={modelEnds}
            playheadMs={playheadMs}
            sortBy={sortBy}
            sortDesc={sortDesc}
            titled={titled}
            margin={MARGIN}
            followCursor={followCursor}
            showsCard={i === cardPanel}
            shownIndex={i === cardPanel ? shownIndex : null}
            onHover={onHover}
            onEnter={onEnter}
            onLeave={onLeave}
            onFinger={onFinger}
            onDropFinger={onDropFinger}
            onPlayheadChange={onPlayheadChange}
            heading={
              titled ? (
                !stacked ? (
                  // The empty second slot on a phone (#499; TJ 2026-10-28):
                  // its own title box 8px right of the primary's, reading
                  // None, whose pick opens the second panel.
                  <div className={CHART_TITLE.row}>
                    <MetricTitle
                      className={CHART_TITLE.inRow}
                      label={PRIMARY_PICKER_LABEL}
                      shown={metricLabel(metric)}
                      value={metric}
                      options={METRIC_OPTIONS}
                      onChange={onPrimaryChange}
                    />
                    <MetricTitle<SecondValue>
                      className={`${CHART_TITLE.inRow} flex-shrink-0`}
                      label={SECOND_PICKER_LABEL}
                      shown={SECOND_NONE_LABEL}
                      value=""
                      options={SECOND_OPTIONS}
                      onChange={onSecondPick}
                    />
                  </div>
                ) : i === 0 ? (
                  <MetricTitle
                    label={PRIMARY_PICKER_LABEL}
                    shown={metricLabel(metric)}
                    value={metric}
                    options={METRIC_OPTIONS}
                    onChange={onPrimaryChange}
                  />
                ) : (
                  <MetricTitle
                    label={SECOND_PICKER_LABEL}
                    shown={metricLabel(metric)}
                    value={metric}
                    options={SECOND_OPTIONS}
                    onChange={onSecondPick}
                  />
                )
              ) : null
            }
          />
        )
        return i === 0 ? (
          panel
        ) : (
          <SplitGrip
            key={`grip-${i}`}
            onReset={onSplitReset}
            onDragStart={onSplitStart}
            onDrag={onSplitDrag}
            onDragEnd={onSplitEnd}
          >
            {panel}
          </SplitGrip>
        )
      })}
    </div>
  )
}

// The grip and the panel under it, as one fragment so the panels stay
// siblings of the picker row in one flex column.
function SplitGrip({
  children,
  onReset,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  children: ReactNode
  onReset: () => void
  onDragStart: () => void
  onDrag: (dragUpPx: number) => void
  onDragEnd: () => void
}) {
  return (
    <>
      <ResizeGrip onReset={onReset} onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd} />
      {children}
    </>
  )
}

/**
 * A phone's picker (#696, record 0149): the app's select at the metric's
 * width as the plot's title, the native select laid over it so a tap opens the
 * phone's own picker. Outside the plot's box, so a press on it is the select's
 * and not a finger reading the plot. Each panel wears one (#499): the top the
 * primary's, the bottom the second's.
 */
function MetricTitle<V extends string>({
  className = CHART_TITLE.box,
  label,
  shown,
  value,
  options,
  onChange,
}: {
  /** `CHART_TITLE.box` alone, or `inRow` beside a second title. */
  className?: string
  label: string
  shown: string
  value: V
  options: readonly { value: V; label: string }[]
  onChange: (v: V) => void
}) {
  return (
    <div className={className}>
      <span aria-hidden="true" className={CHART_TITLE.text}>
        {shown}
      </span>
      <IconChevron up={false} className={ICON_ADORNMENT} />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className={CHART_TITLE.select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface PanelProps {
  index: number
  boxRef: RefObject<HTMLDivElement | null>
  /** The panel's share of the stacked height, or null for the one panel, which fills. */
  grow: number | null
  metric: ChartMetric
  /** Every metric drawn, top first, which the combined card reads a row in. */
  metrics: readonly ChartMetric[]
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
  titled: boolean
  margin: PlotMargin
  followCursor: boolean
  /** Whether this panel's tooltip draws the card; the other panel's draws nothing. */
  showsCard: boolean
  shownIndex: number | null
  onHover: (panel: number, key: string | null, value: number | null) => void
  onEnter: (panel: number) => void
  onLeave: () => void
  onFinger: (panel: number, index: number, key: string | null | undefined, value: number | null) => void
  onDropFinger: () => void
  onPlayheadChange?: (ms: number) => void
  /** A phone's title box or boxes over the plot, or null at a desk. */
  heading: ReactNode
}

/**
 * One metric's plot (#499): its own y axis, domain, data and extreme line.
 * The chart draws one, or two stacked on one time axis.
 */
function ChartPanel({
  index,
  boxRef,
  grow,
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
  titled,
  margin,
  followCursor,
  showsCard,
  shownIndex,
  onHover,
  onEnter,
  onLeave,
  onFinger,
  onDropFinger,
  onPlayheadChange,
  heading,
}: PanelProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  // Where the last finger went down on the plot, for the click its tap makes.
  const tapXRef = useRef<number | null>(null)
  // A phone plot's height, reported by the container as it changes (#696), so
  // the readout's place follows a sheet that grows under a reading already
  // standing: the tutorial's Chart step raises the sheet in the commit that
  // stands its hour, and a height read at that render was the resting one.
  const [plotPx, setPlotPx] = useState(0)
  const onPlotResize = useCallback((_width: number, height: number) => setPlotPx(height), [])
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
  const [yMin, yMax] = useMemo(() => computeYDomain(lines, metric), [lines, metric])
  // Which end of the family the extreme line marks: the ranking's own
  // direction while the chart shows the ranked family, and the largest value
  // on any other, where no direction was ever chosen.
  const highest = metric === metricForSort(sortBy) ? sortDesc : true
  // Memoized beside the y domain for the same reason: it is a walk over every
  // drawn value, and a hover re-renders without changing any of its inputs.
  const extreme = useMemo(() => extremeValue(lines, metric, highest), [lines, metric, highest])

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
      onHover(index, null, null)
      return
    }
    const cv = pixelToValue(py, margin.top, plotHeight, yMin, yMax)
    onHover(index, nearestAt(idx, cv), cv)
  }

  // A finger (or a pen) on the chart reads the hour under it, as a resting
  // mouse does: the tooltip at that hour and, where the chart may follow a
  // cursor, the nearest line drawn over the rest. A horizontal drag keeps
  // reading, because the plot leaves only vertical panning to the browser
  // (`touch-pan-y` below); a vertical drag is the sheet's scroll, and the
  // browser cancels the pointer, which drops the reading.
  function readFinger(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse') return
    if (e.type === 'pointerdown') tapXRef.current = e.clientX
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

  // Where a phone's readout stands and how many lines it lists (#696): a card
  // the plotting band cannot hold rises into the sheet above the chart, as
  // far as the sheet's top (`data-readout-room` on `ResultsSheet`), rather
  // than being cut off at the band's foot. Read at render, as the desk's
  // capacity is: the reading that shows the card is a render.
  const plotEl = plotRef.current
  const roomEl = titled ? plotEl?.closest('[data-readout-room]') : null
  const roomAbovePx =
    plotEl && roomEl
      ? Math.max(0, plotEl.getBoundingClientRect().top - roomEl.getBoundingClientRect().top - READOUT_ROOM_GAP_PX)
      : 0
  const readout = titled
    ? readoutPlace(plotPx || (plotEl?.clientHeight ?? 0), margin, roomAbovePx, lines.length, drawsAxis)
    : null

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

  return (
    <div
      ref={boxRef}
      className={`relative flex min-h-0 flex-col ${grow === null ? 'flex-1' : ''}`}
      // A share of the stacked height rather than pixels, so a sheet that
      // grows keeps the split the reader set (#499).
      style={grow === null ? undefined : { flexGrow: grow, flexBasis: 0 }}
      onMouseEnter={() => onEnter(index)}
    >
      {heading}
      <div
        ref={plotRef}
        onPointerDown={readFinger}
        onPointerMove={readFinger}
        onPointerCancel={dropFinger}
        // A phone's plot lets its readout out over the picker and the
        // results bar above it (#696); the sheet itself still clips.
        className={`min-h-0 flex-1 ${titled ? 'overflow-visible' : 'overflow-hidden'} ${CHART_PLOT_TOUCH}`}
      >
        <ResponsiveContainer width="100%" height="100%" onResize={titled ? onPlotResize : undefined}>
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
              active={shownIndex === null ? undefined : true}
              position={readout?.top != null ? { y: readout.top } : undefined}
              wrapperStyle={titled ? READOUT_OVER_TITLE : undefined}
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
                    cursorValue={cursorValue}
                    // Read at render rather than observed: this component
                    // re-renders on every hover move, which is the only time
                    // the value is used.
                    maxRows={readout?.rows ?? tooltipCapacity(plotRef.current?.clientHeight ?? 0)}
                  />
                ) : null
              }
            />
            {ordered.map((line) => {
              const key = line.key
              const focused = focusedKey === key
              const dimmed = focusedKey != null && !focused
              const crowded = ordered.length > CROWDED_PAST
              const width = focused ? LINE_DRAW.focusedWidth : crowded ? LINE_DRAW.crowdedWidth : LINE_DRAW.width
              const opacity = dimmed ? LINE_DRAW.dimmedOpacity : 1
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={line.label}
                  stroke={line.color}
                  dot={
                    pointGrid
                      ? {
                          r: focusedKey === key ? 4.5 : 3.5,
                          // The fill alone: a dot in the line's colour
                          // stands 3:1 off the panel by itself (#801).
                          stroke: 'none',
                          fill: line.color,
                          fillOpacity: opacity,
                        }
                      : false
                  }
                  connectNulls={false}
                  isAnimationActive={false}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                />
              )
            })}
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
                  content: titled ? TITLED_HEADROOM_LABEL : HEADROOM_LABEL,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
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
  text: string
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
  /** Every metric drawn, top panel first: the order a row reads its values in. */
  metrics: readonly ChartMetric[]
  focusedKey: string | null
  cursorValue: number | null
  // How many series the card has room to list, from the plot area's current
  // height rather than a constant — see tooltipCapacity.
  maxRows: number
}

// Shared X-locked tooltip: all lines at the hovered instant, ordered by nearness
// to the cursor (focused line bold and first), capped so a big overlay stays
// readable. With two panels it is one card on the hovered panel, each row
// reading both metrics (#499).
function ChartTooltip({
  active,
  payload,
  label,
  times,
  lines,
  metric,
  metrics,
  focusedKey,
  cursorValue,
  maxRows,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0 || label == null) return null
  const index = times.indexOf(label)
  if (index < 0) return null

  const items: TooltipItem[] = []
  for (const line of lines) {
    const text = cardValues(line, metrics, index)
    if (text === '') continue
    items.push({ key: line.key, value: valueAt(line, metric, index), text, line })
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

  return (
    <div className={`${SURFACE_FLOATING} ${TEXT.control} px-2.5 py-1.5`}>
      <div className={`${TEXT.micro} mb-1 font-mono`}>{fmtTooltipTime(label)}</div>
      {shown.map((it) => (
        <div
          key={it.key}
          className={`flex items-center justify-between gap-3 ${
            it.key === focusedKey ? 'font-semibold text-ink-strong' : ''
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 ${RADIUS.control}`}
              style={{ backgroundColor: it.line.color }}
            />
            {it.line.label}
          </span>
          <span className="font-mono">{it.text}</span>
        </div>
      ))}
      {rest > 0 && <div className={`${TEXT.micro} mt-0.5`}>+{rest} more</div>}
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
