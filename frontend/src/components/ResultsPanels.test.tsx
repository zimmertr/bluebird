import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsPanels from './ResultsPanels'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { LAYOUT_HOLD, LINE_EDGE, MOTION, RESULTS_PANE } from '../styles'

// The table and the chart are memoized and have suites of their own. What
// this one is about is what the panels hand them, so both are replaced by
// stand-ins that keep the props of every render.
const seen = vi.hoisted(() => ({ table: [] as Record<string, unknown>[], chart: [] as Record<string, unknown>[] }))
vi.mock('./ResultsTable', () => ({
  default: (props: Record<string, unknown>) => {
    seen.table.push(props)
    return <div data-testid="table" />
  },
}))
vi.mock('./TimeSeriesChart', () => ({
  default: (props: Record<string, unknown>) => {
    seen.chart.push(props)
    return <div data-testid="chart" />
  },
}))
vi.mock('./ResizeGrip', () => ({ default: () => <div data-testid="grip" /> }))
vi.mock('./ModelCompare', () => ({ default: () => <div data-testid="compare" /> }))

type Props = ComponentProps<typeof ResultsPanels>
const NOOP = () => {}
const GRIP = { onReset: NOOP, onDragStart: NOOP, onDrag: NOOP, onDragEnd: NOOP }
const ROW = resultRow()
const SHOWN = [{ id: 'icon_seamless', label: 'DWD ICON' }]
const CHART = {
  selectedRows: [ROW],
  metric: 'temp',
  setMetric: NOOP,
  colorFor: NOOP,
  toggle: NOOP,
  isSelected: () => true,
  setRange: NOOP,
}
const QUIET = { active: false, shown: [], paceRemainingS: null, lines: [], endLines: [] }
const COMPARING = { active: true, shown: SHOWN, paceRemainingS: null, lines: [], endLines: [] }
const TABLE_VIEW = {
  tableRows: [ROW],
  tableColumns: [],
  tableColWidths: {},
  setTableColWidths: NOOP,
  analysisModelLabel: 'NOAA GFS',
  partialNote: null,
  legend: [],
  handleColumnMove: NOOP,
}
const REPORT = { detailSort: { key: 'name', dir: 'asc' }, sortDetail: NOOP, emptyReason: null }
const FIRE = { status: 'ready', warnings: new Map(), uncovered: new Set() }
const CLOSURE = { status: 'ready', warnings: new Map(), uncovered: new Set() }
const TIMES = [0, 3_600_000]
const onRemovePending = () => {}
const onFocusResult = () => {}
const onFocusPending = () => {}
const removeResult = () => {}

function layout(resultsMode: 'table' | 'chart' | 'both') {
  return { resultsMode, chartGrip: GRIP, chartPanelPx: 200, tableGrip: GRIP, tablePanelPx: 300 }
}
const BOTH = layout('both')
const NO_SHARED: ReadonlySet<string> = new Set()
const CHARTS_QUIET = { chart: CHART, compare: QUIET, rowChartColor: NOOP, shared: NO_SHARED }
const CHARTS_COMPARING = { chart: CHART, compare: COMPARING, rowChartColor: NOOP, shared: NO_SHARED }

function props(
  over: {
    layout?: unknown
    charts?: unknown
    tableView?: unknown
    theme?: string
    panesMove?: boolean
    layoutMotion?: 'opening' | 'closing' | 'panes' | null
  } = {},
): Props {
  return {
    panesMove: over.panesMove ?? false,
    layoutMotion: over.layoutMotion ?? null,
    layout: over.layout ?? BOTH,
    charts: over.charts ?? CHARTS_QUIET,
    tableView: over.tableView ?? TABLE_VIEW,
    theme: over.theme ?? 'dark',
    report: REPORT,
    pending: [],
    removeResult,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    sortDesc: false,
    chartTitled: false,
    pointSample: false,
    forecastTimes: TIMES,
    playbackIndex: null,
    timelineAxes: [],
    movePlayheadTo: NOOP,
    fire: FIRE,
    closure: CLOSURE,
    modelId: 'gfs_seamless',
    onRemovePending,
    onFocusResult,
    onFocusPending,
  } as unknown as Props
}

const last = (list: Record<string, unknown>[]) => list[list.length - 1]

describe('ResultsPanels', () => {
  it('draws each panel behind its own grip, by mode', async () => {
    const { rerender } = render(<ResultsPanels {...props()} />)
    await screen.findByTestId('chart')
    expect(screen.getByTestId('table')).toBeTruthy()
    expect(screen.getAllByTestId('grip')).toHaveLength(2)
    rerender(<ResultsPanels {...props({ layout: layout('table') })} />)
    expect(screen.queryByTestId('chart')).toBeNull()
    expect(screen.getAllByTestId('grip')).toHaveLength(1)
    rerender(<ResultsPanels {...props({ layout: layout('chart') })} />)
    await screen.findByTestId('chart')
    expect(screen.queryByTestId('table')).toBeNull()
    expect(screen.getAllByTestId('grip')).toHaveLength(1)
  })

  // The Open-Meteo credit is the map's (#687): no results mode draws one.
  it('draws no Open-Meteo credit in any mode', async () => {
    for (const mode of ['table', 'chart', 'both'] as const) {
      const { unmount } = render(<ResultsPanels {...props({ layout: layout(mode) })} />)
      if (mode !== 'table') await screen.findByTestId('chart')
      expect(screen.queryByRole('link', { name: 'Open-Meteo.com' }), mode).toBeNull()
      unmount()
    }
  })

  // The rows' screen-reader notes are positioned absolutely, so the box that
  // scrolls the table has to be their containing block, or every row past the
  // fold stands in the app root's coordinates and makes the whole page
  // scrollable (2026-10-06).
  it('scrolls the table inside a positioned box', () => {
    render(<ResultsPanels {...props({ layout: layout('table') })} />)
    const scroller = screen.getByTestId('table').parentElement!
    expect(scroller.className.split(' ')).toEqual(expect.arrayContaining(['relative', 'overflow-auto']))
  })

  it('hands the table the members it is given', () => {
    seen.table.length = 0
    render(<ResultsPanels {...props({ layout: layout('table') })} />)
    const got = last(seen.table)
    expect(got.results).toBe(TABLE_VIEW.tableRows)
    expect(got.columns).toBe(TABLE_VIEW.tableColumns)
    expect(got.fireWarnings).toBe(FIRE.warnings)
    expect(got.closureWarnings).toBe(CLOSURE.warnings)
    expect(got.closureUncovered).toBe(CLOSURE.uncovered)
    expect(got.closureStatus).toBe('ready')
    expect(got.onRemove).toBe(removeResult)
    expect(got.onRemovePending).toBe(onRemovePending)
    expect(got.onFocusResult).toBe(onFocusResult)
    expect(got.onFocusPending).toBe(onFocusPending)
    expect(got.onToggleChart).toBe(CHART.toggle)
    expect(got.times).toBe(TIMES)
  })

  // While a comparison is up the chart draws the composed pairs, not rows.
  it('hands the chart its rows, or none while a comparison is up', async () => {
    seen.chart.length = 0
    const { rerender } = render(<ResultsPanels {...props()} />)
    await screen.findByTestId('chart')
    expect(last(seen.chart).rows).toBe(CHART.selectedRows)
    expect(last(seen.chart).controls).toBeUndefined()
    rerender(<ResultsPanels {...props({ charts: CHARTS_COMPARING })} />)
    expect(last(seen.chart).rows).toEqual([])
    expect(last(seen.chart).controls).toBeTruthy()
  })

  // Both children are memoized, so a second render from the same inputs must
  // hand each of them the same value for every prop, the comparison's
  // controls element included.
  it('hands the table and the chart the same props across renders', async () => {
    seen.chart.length = 0
    seen.table.length = 0
    const given = props({ charts: CHARTS_COMPARING })
    const { rerender } = render(<ResultsPanels {...given} />)
    await screen.findByTestId('chart')
    const chartBefore = last(seen.chart)
    const tableBefore = last(seen.table)
    rerender(<ResultsPanels {...given} />)
    const chartAfter = last(seen.chart)
    const tableAfter = last(seen.table)
    expect(chartAfter).not.toBe(chartBefore)
    for (const key of Object.keys(chartBefore)) {
      expect(Object.is(chartAfter[key], chartBefore[key]), `chart ${key}`).toBe(true)
    }
    for (const key of Object.keys(tableBefore)) {
      expect(Object.is(tableAfter[key], tableBefore[key]), `table ${key}`).toBe(true)
    }
  })
})

// The chart-only legend's dot is a mark in its line's colour, so in light it
// wears the rim the line is drawn over (PR #733), and in dark none.
// The frame a pane's body stands in: the body's box, then the frame.
const frameOf = (body: HTMLElement) => body.closest('[class*="grid-rows-"]') as HTMLElement

// At a desk a Table, Chart or Both press opens and closes the panes at the
// panel's speed, the same both ways (#714; record 0201).
describe('the panes at a desk', () => {
  it('moves the panes at a desk and nowhere else', async () => {
    const { unmount } = render(<ResultsPanels {...props({ panesMove: true })} />)
    for (const id of ['chart', 'table']) {
      const frame = frameOf(await screen.findByTestId(id))
      expect(frame.className).toContain(MOTION.pane)
      expect(frame.className).toContain(RESULTS_PANE.open)
    }
    unmount()
    render(<ResultsPanels {...props({ panesMove: false })} />)
    expect(frameOf(await screen.findByTestId('chart')).className).not.toContain(MOTION.pane)
  })

  it('keeps a closing chart drawn, at its height, until its frame has shut', async () => {
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    const chart = await screen.findByTestId('chart')
    rerender(<ResultsPanels {...props({ panesMove: true, layout: { ...layout('table'), chartPanelPx: 0 } })} />)
    expect(screen.getByTestId('chart')).toBe(chart)
    const frame = frameOf(chart)
    expect(frame.className).toContain(RESULTS_PANE.shut)
    expect(frame.querySelector<HTMLElement>('[style]')!.style.height).toBe('200px')
    fireEvent.transitionEnd(frame)
    expect(screen.queryByTestId('chart')).toBeNull()
    expect(screen.getByTestId('table')).toBeTruthy()
  })

  // While the panel moves the chart keeps the width it had and the table's
  // box takes the window's, so neither is drawn again in every frame.
  it('holds the chart and the table to a width while the panel moves, and only then', async () => {
    const body = (id: string) => frameOf(screen.getByTestId(id)).firstElementChild!.className
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    await screen.findByTestId('chart')
    expect(body('chart')).toBe(`${RESULTS_PANE.top} `)
    rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion: 'closing' })} />)
    expect(body('chart')).toContain(LAYOUT_HOLD.chartClosing)
    expect(body('table')).toContain(LAYOUT_HOLD.table)
    rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion: 'opening' })} />)
    expect(body('chart')).toContain(LAYOUT_HOLD.chartOpening)
    expect(body('table')).toContain(LAYOUT_HOLD.table)
    rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion: 'panes' })} />)
    expect(body('chart')).toBe(`${RESULTS_PANE.top} `)
    expect(body('table')).toBe(`${RESULTS_PANE.foot} `)
  })

  it('holds the chart to the bar and the table to the foot', async () => {
    render(<ResultsPanels {...props({ panesMove: true })} />)
    expect(frameOf(await screen.findByTestId('chart')).firstElementChild!.className).toContain(RESULTS_PANE.top)
    expect(frameOf(screen.getByTestId('table')).firstElementChild!.className).toContain(RESULTS_PANE.foot)
  })
})

describe('the chart legend in each theme', () => {
  const legend = { ...TABLE_VIEW, legend: [{ key: 'a', row: ROW, suffix: '' }] }
  const charts = { ...CHARTS_QUIET, rowChartColor: () => '#fda5d5' }
  const dot = () => screen.getByRole('button', { name: `Hide ${ROW.name} on the chart` }).firstElementChild as HTMLElement

  it('rims a light dot', async () => {
    render(<ResultsPanels {...props({ layout: layout('chart'), tableView: legend, charts, theme: 'light' })} />)
    await screen.findByTestId('chart')
    expect(dot().className).toContain(LINE_EDGE.swatch)
  })

  it('leaves a dark dot bare', async () => {
    render(<ResultsPanels {...props({ layout: layout('chart'), tableView: legend, charts, theme: 'dark' })} />)
    await screen.findByTestId('chart')
    expect(dot().className).not.toContain(LINE_EDGE.swatch)
  })
})
