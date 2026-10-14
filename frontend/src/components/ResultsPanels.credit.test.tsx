import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import ResultsPanels from './ResultsPanels'
import { render } from '../testSupport/render'
import { resultRow } from '../testSupport/fixtures'
import { DEFAULT_FAMILY_KEY } from '../metrics'

// The Open-Meteo credit stands wherever its data is drawn, and once (#687):
// the table's foot carries it, and the chart's foot only while the table is
// not drawn. Apart from `ResultsPanels.test.tsx` because that suite replaces
// the table with a stand-in, and the credit in its foot is the point here.
vi.mock('./TimeSeriesChart', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('./ResizeGrip', () => ({ default: () => <div /> }))

type Props = ComponentProps<typeof ResultsPanels>
const NOOP = () => {}
const GRIP = { onReset: NOOP, onDragStart: NOOP, onDrag: NOOP, onDragEnd: NOOP }
const ROW = resultRow()
const CHART = { selectedRows: [ROW], metric: 'temp', setMetric: NOOP, colorFor: NOOP, toggle: NOOP, isSelected: () => true, setRange: NOOP }
const QUIET = { active: false, shown: [], paceRemainingS: null, lines: [], endLines: [] }
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
const STATUS_READY = { status: 'ready', warnings: new Map(), uncovered: new Set() }

function props(resultsMode: 'table' | 'chart' | 'both'): Props {
  return {
    layout: { resultsMode, chartGrip: GRIP, chartPanelPx: 200, tableGrip: GRIP, tablePanelPx: 300 },
    charts: { chart: CHART, compare: QUIET, rowChartColor: NOOP },
    tableView: TABLE_VIEW,
    report: { detailSort: { key: 'name', dir: 'asc' }, sortDetail: NOOP, emptyReason: null },
    pending: [],
    pendingHeights: new Set(),
    removeResult: NOOP,
    sortBy: DEFAULT_FAMILY_KEY.temp,
    sortDesc: false,
    pointSample: false,
    forecastTimes: [0, 3_600_000],
    playbackIndex: null,
    timelineAxes: [],
    movePlayheadTo: NOOP,
    fire: STATUS_READY,
    closure: STATUS_READY,
    modelId: 'gfs_seamless',
    onRemovePending: NOOP,
    onFocusResult: NOOP,
    onFocusPending: NOOP,
  } as unknown as Props
}

const credits = () => screen.queryAllByRole('link', { name: 'Open-Meteo.com' })

describe('the Open-Meteo credit across the results modes', () => {
  it('is the table foot in Table', () => {
    render(<ResultsPanels {...props('table')} />)
    expect(credits()).toHaveLength(1)
    expect(credits()[0].closest('tfoot')).not.toBeNull()
  })

  it('is the table foot in Both, and not under the chart as well', async () => {
    render(<ResultsPanels {...props('both')} />)
    await screen.findByTestId('chart')
    expect(credits()).toHaveLength(1)
    expect(credits()[0].closest('tfoot')).not.toBeNull()
  })

  it('stands under the chart in Chart, where no table is drawn', async () => {
    render(<ResultsPanels {...props('chart')} />)
    await screen.findByTestId('chart')
    expect(credits()).toHaveLength(1)
    expect(credits()[0].closest('tfoot')).toBeNull()
    expect(credits()[0].getAttribute('href')).toBe('https://open-meteo.com/')
  })

  it('is never drawn twice as the mode changes', async () => {
    const { rerender } = render(<ResultsPanels {...props('both')} />)
    await screen.findByTestId('chart')
    for (const mode of ['chart', 'table', 'both', 'chart'] as const) {
      rerender(<ResultsPanels {...props(mode)} />)
      if (mode !== 'table') await screen.findByTestId('chart')
      expect(credits(), mode).toHaveLength(1)
    }
  })
})
