import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsPanels from './ResultsPanels'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'

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
const TIMES = [0, 3_600_000]
const onRemovePending = () => {}
const onFocusResult = () => {}
const onFocusPending = () => {}
const removeResult = () => {}

function layout(resultsMode: 'table' | 'chart' | 'both') {
  return { resultsMode, chartGrip: GRIP, chartPanelPx: 200, tableGrip: GRIP, tablePanelPx: 300 }
}
const BOTH = layout('both')
const CHARTS_QUIET = { chart: CHART, compare: QUIET, rowChartColor: NOOP }
const CHARTS_COMPARING = { chart: CHART, compare: COMPARING, rowChartColor: NOOP }

function props(over: { layout?: unknown; charts?: unknown } = {}): Props {
  return {
    layout: over.layout ?? BOTH,
    charts: over.charts ?? CHARTS_QUIET,
    tableView: TABLE_VIEW,
    report: REPORT,
    pending: [],
    removeResult,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    pointSample: false,
    forecastTimes: TIMES,
    playbackIndex: null,
    timelineAxes: [],
    movePlayheadTo: NOOP,
    fire: FIRE,
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

  it('hands the table the members it is given', () => {
    seen.table.length = 0
    render(<ResultsPanels {...props({ layout: layout('table') })} />)
    const got = last(seen.table)
    expect(got.results).toBe(TABLE_VIEW.tableRows)
    expect(got.columns).toBe(TABLE_VIEW.tableColumns)
    expect(got.fireWarnings).toBe(FIRE.warnings)
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
