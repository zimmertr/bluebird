import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsPanels from './ResultsPanels'
import { render } from '../testSupport/render'
import { chartMetricsOf, resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { LAYOUT_HOLD, MOTION, RESULTS_PANE } from '../styles'

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
const CHART_PAIR = chartMetricsOf()
const CHARTS_QUIET = { chart: CHART, chartMetrics: CHART_PAIR, compare: QUIET, rowChartColor: NOOP, shared: NO_SHARED }
const CHARTS_COMPARING = { chart: CHART, chartMetrics: CHART_PAIR, compare: COMPARING, rowChartColor: NOOP, shared: NO_SHARED }

function props(
  over: {
    layout?: unknown
    charts?: unknown
    tableView?: unknown
    panesMove?: boolean
    collapsed?: boolean
    layoutMotion?: 'opening' | 'closing' | 'panes' | null
    sortDesc?: boolean
  } = {},
): Props {
  return {
    panesMove: over.panesMove ?? false,
    collapsed: over.collapsed ?? false,
    layoutMotion: over.layoutMotion ?? null,
    layout: over.layout ?? BOTH,
    charts: over.charts ?? CHARTS_QUIET,
    tableView: over.tableView ?? TABLE_VIEW,
    report: REPORT,
    pending: [],
    removeResult,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    sortDesc: over.sortDesc ?? false,
    chartPhone: false,
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
  // A chart whose module has loaded draws in the render that mounts its
  // pane, with no empty fallback first (#786): React holds a boundary's
  // reveal 300 ms behind a fallback it showed, which stood the tutorial's
  // Chart card empty after its chunk had arrived. Each half on a fresh copy
  // of the module, whose lazy has never resolved.
  it('draws a loaded chart in the render that mounts it, and waits for one that is not', async () => {
    vi.resetModules()
    const cold = await import('./ResultsPanels')
    const first = render(<cold.default {...props({ layout: layout('chart') })} />)
    expect(screen.queryByTestId('chart')).toBeNull()
    await screen.findByTestId('chart')
    first.unmount()

    vi.resetModules()
    const warm = await import('./ResultsPanels')
    await warm.loadTimeSeriesChart()
    render(<warm.default {...props({ layout: layout('chart') })} />)
    expect(screen.getByTestId('chart')).toBeTruthy()
  })

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

// The frame a pane's body stands in: the body's box, then the frame.
const frameOf = (body: HTMLElement) => body.closest('[class*="grid-rows-"]') as HTMLElement

// At a desk a Table, Chart or Both press opens and closes the panes at the
// panel's speed, the same both ways (#714; record 0202), around bodies that
// stay mounted once drawn (#786; record 0216).
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

  it('keeps a shut chart mounted, inert, at the height it had, after its frame has shut', async () => {
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    const chart = await screen.findByTestId('chart')
    rerender(<ResultsPanels {...props({ panesMove: true, layout: { ...layout('table'), chartPanelPx: 0 } })} />)
    const frame = frameOf(chart)
    expect(frame.className).toContain(RESULTS_PANE.shut)
    fireEvent.transitionEnd(frame)
    expect(screen.getByTestId('chart')).toBe(chart)
    expect(frame.querySelector<HTMLElement>('[style]')!.style.height).toBe('200px')
    // Out of the reader's way: no focus, nothing a screen reader reads.
    expect(frame.firstElementChild!.hasAttribute('inert')).toBe(true)
    expect(frameOf(screen.getByTestId('table')).firstElementChild!.hasAttribute('inert')).toBe(false)
  })

  // A shut body draws nothing new until its pane opens, and then once.
  it('draws a shut pane\'s body again only when it opens', async () => {
    const tableView = (rows: unknown[]) => ({ ...TABLE_VIEW, tableRows: rows })
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    await screen.findByTestId('chart')
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('chart') })} />)
    const tableDraws = seen.table.length
    // A sort, a cut or a removal while the table is shut.
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('chart'), tableView: tableView([]) })} />)
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('chart'), tableView: tableView([ROW, ROW]) })} />)
    expect(seen.table.length).toBe(tableDraws)
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('both'), tableView: tableView([ROW, ROW]) })} />)
    expect(seen.table.length).toBe(tableDraws + 1)
    expect(last(seen.table).results).toEqual([ROW, ROW])

    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('table'), tableView: tableView([ROW, ROW]) })} />)
    const chartDraws = seen.chart.length
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('table'), sortDesc: true })} />)
    expect(seen.chart.length).toBe(chartDraws)
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('both'), sortDesc: true })} />)
    expect(seen.chart.length).toBe(chartDraws + 1)
    expect(last(seen.chart).sortDesc).toBe(true)
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

  // Each body stands on a layer of its own while the panel moves, so a frame
  // of the move shifts it rather than painting it again (record 0216). The
  // layer is the box of fixed height inside the frame, which moves whole. Not
  // while the panes move, where lifting both onto layers at the press costs
  // more than the frames save.
  it('puts each body on a layer of its own while the panel moves, and only then', async () => {
    const sized = (id: string) => screen.getByTestId(id).closest<HTMLElement>('[style]')!
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    await screen.findByTestId('chart')
    for (const layoutMotion of [null, 'panes'] as const) {
      rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion })} />)
      expect(sized('chart').className).not.toContain(LAYOUT_HOLD.layer)
      expect(sized('table').className).not.toContain(LAYOUT_HOLD.layer)
    }
    for (const layoutMotion of ['opening', 'closing'] as const) {
      rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion })} />)
      expect(sized('chart').className).toContain(LAYOUT_HOLD.layer)
      expect(sized('table').className).toContain(LAYOUT_HOLD.layer)
      expect(frameOf(sized('table')).firstElementChild!.className).not.toContain(LAYOUT_HOLD.layer)
    }
  })

  // TJ on 2026-10-21: "I think the data should be there as it extends up."
  // An opening pane mounts its body at the press, at the height the mode
  // pressed gives it, and the frame uncovers it as it opens.
  it('mounts an opening pane\'s body at the press, at its end height', async () => {
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true, layout: layout('table') })} />)
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('both'), layoutMotion: 'panes' })} />)
    const chart = await screen.findByTestId('chart')
    const frame = frameOf(chart)
    expect(frame.className).toContain(RESULTS_PANE.open)
    expect(frame.querySelector<HTMLElement>('[style]')!.style.height).toBe('200px')
  })

  it('shuts both panes on the collapse chevron, keeping their bodies, and opens them again with them', async () => {
    const { rerender } = render(<ResultsPanels {...props({ panesMove: true })} />)
    const chart = await screen.findByTestId('chart')
    const table = screen.getByTestId('table')
    rerender(<ResultsPanels {...props({ panesMove: true, collapsed: true, layoutMotion: 'panes' })} />)
    // Each body stays drawn while its frame shuts.
    expect(screen.getByTestId('chart')).toBe(chart)
    expect(screen.getByTestId('table')).toBe(table)
    expect(frameOf(chart).className).toContain(RESULTS_PANE.shut)
    expect(frameOf(table).className).toContain(RESULTS_PANE.shut)
    fireEvent.transitionEnd(frameOf(chart))
    fireEvent.transitionEnd(frameOf(table))
    rerender(<ResultsPanels {...props({ panesMove: true, collapsed: true })} />)
    // Kept, and inert, behind the shut frames.
    expect(screen.getByTestId('chart')).toBe(chart)
    expect(screen.getByTestId('table')).toBe(table)
    expect(frameOf(chart).firstElementChild!.hasAttribute('inert')).toBe(true)
    expect(frameOf(table).firstElementChild!.hasAttribute('inert')).toBe(true)
    // Expanded, both open again around the bodies they kept.
    rerender(<ResultsPanels {...props({ panesMove: true, layoutMotion: 'panes' })} />)
    expect(screen.getAllByTestId('grip')).toHaveLength(2)
    expect(screen.getByTestId('chart')).toBe(chart)
    expect(screen.getByTestId('table')).toBe(table)
    expect(frameOf(chart).firstElementChild!.hasAttribute('inert')).toBe(false)
  })

  // The chart-only legend is a pane of its own at a desk, under the chart and
  // held to the foot like the table (#795), so the chart's box holds the plot
  // alone in every mode and no press draws the chart again. Chart to Both
  // shuts the legend's frame around the strip it keeps, as the table opens.
  it('opens the legend in a pane of its own at a desk, and keeps it shut and inert in Both', async () => {
    const legend = { ...TABLE_VIEW, legend: [{ key: 'a', row: ROW, suffix: '' }] }
    const chip = () => screen.getByRole('button', { name: `Hide ${ROW.name} on the chart`, hidden: true })
    const { rerender } = render(
      <ResultsPanels {...props({ panesMove: true, layout: layout('chart'), tableView: legend })} />,
    )
    const chart = await screen.findByTestId('chart')
    const strip = chip()
    const pane = frameOf(strip)
    expect(frameOf(chart).contains(strip)).toBe(false)
    expect(pane.className).toContain(RESULTS_PANE.open)
    expect(pane.className).toContain(MOTION.pane)
    expect(pane.firstElementChild!.className).toContain(RESULTS_PANE.foot)
    expect(pane.firstElementChild!.hasAttribute('inert')).toBe(false)
    // Between the chart's frame and the table's, which Chart keeps shut.
    expect(frameOf(chart).nextElementSibling).toBe(pane)
    expect(pane.nextElementSibling!.className).toContain(RESULTS_PANE.shut)

    rerender(<ResultsPanels {...props({ panesMove: true, layout: BOTH, tableView: legend, layoutMotion: 'panes' })} />)
    expect(pane.className).toContain(RESULTS_PANE.shut)
    expect(pane.firstElementChild!.hasAttribute('inert')).toBe(true)
    expect(chip()).toBe(strip)
    expect(pane.nextElementSibling).toBe(frameOf(screen.getByTestId('table')))
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('chart'), tableView: legend, layoutMotion: 'panes' })} />)
    expect(pane.className).toContain(RESULTS_PANE.open)
    expect(chip()).toBe(strip)
    // The chevron shuts it with the chart.
    rerender(<ResultsPanels {...props({ panesMove: true, layout: layout('chart'), tableView: legend, collapsed: true })} />)
    expect(pane.className).toContain(RESULTS_PANE.shut)
  })

  it('shuts the legend\'s pane when there are no rows to list', async () => {
    render(<ResultsPanels {...props({ panesMove: true, layout: layout('chart') })} />)
    const chart = await screen.findByTestId('chart')
    const pane = frameOf(chart).nextElementSibling as HTMLElement
    expect(pane.className).toContain(RESULTS_PANE.shut)
    expect(pane.firstElementChild!.childElementCount).toBe(0)
  })

  it('holds the chart to the bar and the table to the foot', async () => {
    render(<ResultsPanels {...props({ panesMove: true })} />)
    expect(frameOf(await screen.findByTestId('chart')).firstElementChild!.className).toContain(RESULTS_PANE.top)
    expect(frameOf(screen.getByTestId('table')).firstElementChild!.className).toContain(RESULTS_PANE.foot)
  })
})

// A legend dot is its line's colour alone, which stands 3:1 off the panel by
// itself in either theme (#801).
describe('the chart legend', () => {
  const legend = { ...TABLE_VIEW, legend: [{ key: 'a', row: ROW, suffix: '' }] }
  const charts = { ...CHARTS_QUIET, rowChartColor: () => '#d25645' }
  const dot = () => screen.getByRole('button', { name: `Hide ${ROW.name} on the chart` }).firstElementChild as HTMLElement

  // A phone's panes change at once and its Chart fills the sheet, so the
  // legend stands in the chart's own box there, in Chart alone (#795).
  it('stands in the chart\'s box on a phone, in Chart alone', async () => {
    const { rerender } = render(<ResultsPanels {...props({ layout: layout('chart'), tableView: legend })} />)
    const chart = await screen.findByTestId('chart')
    const chip = screen.getByRole('button', { name: `Hide ${ROW.name} on the chart` })
    expect(chart.closest('[style*="height"]')!.contains(chip)).toBe(true)
    rerender(<ResultsPanels {...props({ layout: BOTH, tableView: legend })} />)
    expect(screen.queryByRole('button', { name: `Hide ${ROW.name} on the chart`, hidden: true })).toBeNull()
  })

  it('paints a dot in its line colour, with no outline', async () => {
    render(<ResultsPanels {...props({ layout: layout('chart'), tableView: legend, charts })} />)
    await screen.findByTestId('chart')
    expect(dot().className).not.toMatch(/(^|\s)outline/)
    expect(dot().style.backgroundColor).toBe('rgb(210, 86, 69)')
  })
})
