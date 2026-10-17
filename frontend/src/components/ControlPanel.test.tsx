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
import { CONTROLS_SHEET, PANEL_BODY, PANEL_RULE } from '../styles'

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
    onTutorial: noop,
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
    autoAnalyze: false,
    capabilitiesSettled: false,
    onAutoAnalyze: noop,
    actionWord: 'Analyze',
    onDismissEvent: noop,
    maxLimit: 1500,
    maxAreaKm2: 100_000,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    ...over,
  }
}

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…|Try again)$/ })

/** Every notice box, in document order. */
// The boxes stand inside the footer's one live region, which is mounted for
// good so a box that arrives is announced.
const notices = () => [...screen.getByRole('status').children] as HTMLElement[]

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
  ]

  it.each(blocked)('is disabled for %s, and says why under it', (_case, over, line) => {
    render(<ControlPanel {...props(over)} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    expect(messages().join(' ')).toMatch(line)
  })

  // Snowfall is each model's own forecast, so unlike the snow depth it
  // replaced it compares the way precipitation does (#678).
  it('analyzes a snowfall ranking with models compared', () => {
    const over: Partial<Props> = { hasPins: true, sortBy: DEFAULT_FAMILY_KEY.snowfall, comparedModels: ['ecmwf_ifs025'] }
    render(<ControlPanel {...props(over)} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(false)
    expect(messages().join(' ')).not.toMatch(/cannot be compared/)
  })

  // A line pasted twice is one destination, in the count under the box too.
  it('counts a repeated pasted line once under the coordinates box', () => {
    render(<ControlPanel {...props({ customCsv: '46.85,-121.76\n46.85,-121.76\n46.2,-121.49' })} />)
    expect(screen.getByText('2 destinations parsed')).toBeTruthy()
  })

  // A finished ring with no type checked beside a pin: Analyze stays open, and
  // the types line says as information that the ring adds nothing (#579).
  it('stays enabled beside a finished ring with no type, and says the ring adds nothing', () => {
    render(<ControlPanel {...props({ hasPins: true, drawPointCount: 3, destinationTypes: [] })} />)
    expect((analyze() as HTMLButtonElement).disabled).toBe(false)
    expect(messages().join(' ')).toMatch(/destination type/)
  })

  it('says nothing about the ring while it is still being drawn', () => {
    render(<ControlPanel {...props({ hasPins: true, drawPointCount: 3, destinationTypes: [], drawing: true })} />)
    expect(messages().join(' ')).not.toMatch(/destination type/)
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
    render(<ControlPanel {...props({ loading: true, actionWord: 'Analyzing…' })} />)
    expect(analyze().textContent).toBe('Analyzing…')
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
    // Busy is the button's own news; there is no reason to act on.
    expect(notices()).toEqual([])
  })
})

// A link carrying `analyze=1` (#511). The decision is `shouldAutoAnalyze`'s and
// its suite pins it; this pins that the panel feeds it the button's own gate
// and fires the run once.
describe('the run on open', () => {
  const ready = { hasPins: true, autoAnalyze: true, capabilitiesSettled: true }

  it('runs once when the link asked and the gate is open', () => {
    const onAutoAnalyze = vi.fn()
    const onAnalyze = vi.fn()
    const { rerender } = render(<ControlPanel {...props({ ...ready, onAutoAnalyze, onAnalyze })} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    // The run closes the gate and its end reopens it, and neither is a second
    // request, even while the flag is still up.
    rerender(<ControlPanel {...props({ ...ready, onAutoAnalyze, loading: true })} />)
    rerender(<ControlPanel {...props({ ...ready, onAutoAnalyze })} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    expect(onAnalyze).not.toHaveBeenCalled()
  })

  it('waits for the capabilities to settle', () => {
    const onAutoAnalyze = vi.fn()
    const { rerender } = render(
      <ControlPanel {...props({ ...ready, capabilitiesSettled: false, onAutoAnalyze })} />,
    )
    expect(onAutoAnalyze).not.toHaveBeenCalled()
    rerender(<ControlPanel {...props({ ...ready, onAutoAnalyze })} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
  })

  it('runs nothing while the gate is closed, and says why as usual', () => {
    const onAutoAnalyze = vi.fn()
    render(<ControlPanel {...props({ ...ready, hasPins: false, onAutoAnalyze })} />)
    expect(onAutoAnalyze).not.toHaveBeenCalled()
    expect(messages().join(' ')).toMatch(/at least one destination/)
  })

  it('runs nothing for a link that did not ask', () => {
    const onAutoAnalyze = vi.fn()
    render(<ControlPanel {...props({ ...ready, autoAnalyze: false, onAutoAnalyze })} />)
    expect(onAutoAnalyze).not.toHaveBeenCalled()
  })
})

describe('the notice block', () => {
  // A panel with something to say at every severity at once: a failed run, a
  // stale report, a blocker, and the air-quality horizon.
  const crowded = props({
    error: { message: 'Open-Meteo request failed. Try again later.', retry: true },
    actionWord: 'Try again',
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
      // In the footer beside the button, inside its one live region, and
      // after it in reading order.
      expect(box.parentElement?.parentElement).toBe(footer)
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

  // After a failed run the Analyze button is the one retry (#736): it reads
  // the word App decided, runs the panel's own command through the panel's
  // own gate, and the error box under it carries no button of its own.
  it('makes the Analyze button the one retry for a failed run', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<ControlPanel {...crowded} drawPointCount={3} destinationTypes={['peak']} polygonAreaKm2={10} onAnalyze={onAnalyze} />)
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    expect(within(notices()[0]).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect((analyze() as HTMLButtonElement).disabled).toBe(false)
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  // The gate still rules the retry: with the ring gone after the failure the
  // old box's button still fired, and this one does not.
  it('holds the retry to the gate', () => {
    render(<ControlPanel {...crowded} drawPointCount={0} />)
    expect(analyze().textContent).toBe('Try again')
    expect((analyze() as HTMLButtonElement).disabled).toBe(true)
  })

  // Dismissing the error line clears the event above rather than hiding the
  // line here, which is what lets the button read Analyze again at once.
  it('hands the dismissal of the error line up', async () => {
    const onDismissEvent = vi.fn()
    const { user } = render(<ControlPanel {...crowded} onDismissEvent={onDismissEvent} />)
    await user.click(within(notices()[0]).getByRole('button', { name: 'Dismiss notice' }))
    expect(onDismissEvent).toHaveBeenCalledExactlyOnceWith('error')
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

// On a phone the body is the Controls sheet's scroller (#696; record 0141),
// which takes the home indicator band at its end (record 0152): the Terms
// line is its last content.
describe('the body on a phone', () => {
  it('pads its scrolling end for the home indicator, and only on a phone', () => {
    const { unmount } = render(<ControlPanel {...props()} phone />)
    const body = screen.getByRole('link', { name: 'Terms' }).closest<HTMLElement>('[class*="overflow-y-auto"]')
    expect(body?.className).toBe(`${PANEL_BODY} ${PANEL_RULE} ${CONTROLS_SHEET.body}`)
    expect(body?.lastElementChild?.contains(screen.getByRole('link', { name: 'Terms' }))).toBe(true)
    unmount()
  })
})
