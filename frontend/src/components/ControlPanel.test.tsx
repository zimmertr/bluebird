import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ControlPanel from './ControlPanel'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from '../utils/clientAnalyze'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { DEFAULT_LIMIT } from '../utils/urlState'
import { forecastModel } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

// The panel's contract with its reader: every message renders in the one block
// under the Analyze button, and the button is disabled for each reason the
// gate in `utils/analyzeGate.ts` names. The gate's own suite pins which reason
// wins; this one pins that the panel draws what the gate decided, where the
// rule says it goes.

const MODELS = [
  forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' }),
  forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
]

type Props = ComponentProps<typeof ControlPanel>

// A panel with nothing to analyze yet: no polygon, no CSV, no pin, and every
// knob at the value a first visit lands on. Each test overrides the few props
// its case is about.
function props(over: Partial<Props> = {}): Props {
  const noop = () => {}
  return {
    drawing: false,
    onStartDrawing: noop,
    onFinishDrawing: noop,
    drawPointCount: 0,
    polygonAreaKm2: null,
    onCancelDrawing: noop,
    onClearDrawing: noop,
    onPointAtSearch: noop,
    onPointAtMapPois: noop,
    destinationTypes: ['peak'],
    setDestinationTypes: noop,
    selection: { kind: 'now' },
    setSelection: noop,
    limit: DEFAULT_LIMIT,
    setLimit: noop,
    customCsv: '',
    setCustomCsv: noop,
    onCsvPasted: noop,
    sortBy: DEFAULT_FAMILY_KEY.precip,
    setSortBy: noop,
    sortDesc: false,
    setSortDesc: noop,
    rowKeys: { ...DEFAULT_FAMILY_KEY },
    pointSample: false,
    constraints: NO_CONSTRAINTS,
    setConstraints: noop,
    onClearFilters: noop,
    includeUnnamedPeaks: false,
    setIncludeUnnamedPeaks: noop,
    forecastModel: 'gfs_seamless',
    setForecastModel: noop,
    forecastModels: MODELS,
    comparedModels: [],
    setComparedModels: noop,
    defaultForecastModel: 'gfs_seamless',
    modelClamped: false,
    windowWarning: null,
    hasPins: false,
    loading: false,
    error: null,
    refusal: null,
    onAnalyze: noop,
    onRetry: noop,
    maxLimit: 1500,
    maxAreaKm2: 100_000,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    ...over,
  }
}

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…)$/ })

/** Every notice box, in document order. */
const notices = () => screen.queryAllByRole('status')

/** The text of every message under the button, box by box. */
const messages = () => notices().map((box) => box.textContent)

describe('the Analyze button', () => {
  // One case per blocker, each the smallest panel that raises it alone. The
  // fragment is enough of the line to know which one rendered.
  const blocked: [string, Partial<Props>, RegExp][] = [
    ['no destination', {}, /at least one destination/],
    ['a polygon under three points', { drawPointCount: 2 }, /1 more point/],
    ['a polygon with no type checked', { drawPointCount: 3, destinationTypes: [] }, /destination type/],
    ['a polygon over the area cap', { drawPointCount: 4, polygonAreaKm2: 200_000 }, /polygon is too large/],
    ['a window that cannot be served', { hasPins: true, windowWarning: 'order' }, /forecast window/],
    [
      'the Dates arm with no day picked',
      { hasPins: true, selection: { kind: 'days', startDate: null, endDate: null } },
      /at least one date/,
    ],
    [
      'air quality compared across models',
      { hasPins: true, sortBy: DEFAULT_FAMILY_KEY.aqi, comparedModels: ['ecmwf_ifs025'] },
      /cannot be compared/,
    ],
    [
      'a freezing level compared on a model without one',
      { hasPins: true, sortBy: DEFAULT_FAMILY_KEY.freeze, comparedModels: ['ecmwf_ifs025'] },
      /ECMWF IFS/,
    ],
    [
      'snow depth compared across models',
      { hasPins: true, sortBy: DEFAULT_FAMILY_KEY.snow, comparedModels: ['ecmwf_ifs025'] },
      /cannot be compared/,
    ],
  ]

  it.each(blocked)('is disabled for %s, and says why under it', (_case, over, line) => {
    render(<ControlPanel {...props(over)} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    expect(messages().join(' ')).toMatch(line)
  })

  it('is enabled by a searched place alone, and analyzes on a press', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<ControlPanel {...props({ hasPins: true, onAnalyze })} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(false)
    expect(notices()).toEqual([])
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('is enabled by a finished polygon with a type checked', () => {
    render(<ControlPanel {...props({ drawPointCount: 3, polygonAreaKm2: 500 })} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(false)
  })

  it('is busy rather than blocked while an analysis runs', () => {
    render(<ControlPanel {...props({ loading: true })} />)
    expect(analyze().textContent).toBe('Analyzing…')
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    // Busy is the button's own news; there is no reason to act on.
    expect(notices()).toEqual([])
  })
})

describe('the notice block', () => {
  // A panel with something to say at every severity at once: a failed run, a
  // stale report, a blocker, and the air-quality horizon.
  const crowded = props({
    error: 'Open-Meteo request failed. Try again later.',
    commitReasons: ['model-changed', 'window-changed'],
    modelClamped: true,
    drawPointCount: 1,
  })

  it('draws every message below the Analyze button and nowhere else', () => {
    render(<ControlPanel {...crowded} />)
    const button = analyze()
    const footer = button.parentElement as HTMLElement
    expect(notices().length).toBeGreaterThan(1)
    for (const box of notices()) {
      // In the footer beside the button, and after it in reading order.
      expect(box.parentElement).toBe(footer)
      expect(button.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('boxes the messages by severity, error first', () => {
    render(<ControlPanel {...crowded} />)
    const [error, warn, info] = messages()
    expect(messages()).toHaveLength(3)
    expect(error).toMatch(/Open-Meteo request failed/)
    // Both stale-report reasons at once, the model's first, then the clamp:
    // every warning in one box.
    expect(warn).toMatch(/forecast model.*forecast range.*shortened the window/)
    // An input still to give is information rather than a warning.
    expect(info).toMatch(/2 more points/)
  })

  it('offers one retry for a failed run', async () => {
    const onRetry = vi.fn()
    const { user } = render(<ControlPanel {...crowded} onRetry={onRetry} />)
    await user.click(within(notices()[0]).getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('dismisses one message and keeps the rest', async () => {
    const { user } = render(<ControlPanel {...crowded} />)
    const before = messages()[1]
    const [first] = within(notices()[1]).getAllByRole('button', { name: 'Dismiss notice' })
    await user.click(first)
    expect(messages()[1]).not.toMatch(/forecast model/)
    expect(messages()[1]).toMatch(/forecast range/)
    expect(messages()[1]).not.toBe(before)
  })
})
