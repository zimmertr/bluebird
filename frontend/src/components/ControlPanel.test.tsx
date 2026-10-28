import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ControlPanel from './ControlPanel'
import { type PanelMessageState, usePanelMessages } from '../hooks/usePanelMessages'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { NO_CONSTRAINTS } from '../utils/clientAnalyze'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { DEFAULT_LIMIT } from '../utils/urlState'
import { forecastModel, refusalPanel } from '../testSupport/fixtures'
import { render } from '../testSupport/render'
import { CONTROLS_SHEET, MESSAGE_BADGE, PANEL_BODY, PANEL_RULE } from '../styles'

// The panel's contract with its reader (record 0208): the Analyze button is
// held up for each reason the gate in `utils/analyzeGate.ts` names, and
// every message, each of those reasons included, is in the list the
// button's badge opens and nowhere else in the panel. The gate's own suite pins which reason wins
// and `usePanelMessages`'s what the list holds; this one pins that the panel
// draws what they decided, where the rule says it goes.

const MODELS = [
  forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' }),
  forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
]

type Props = Omit<ComponentProps<typeof ControlPanel>, 'messages'>
type State = PanelMessageState
// One override reaches both the panel's props and the messages' state, so a
// point count or a type set is spelled once, as App spells it once.
type Over = Partial<Props> & Partial<State>

// A panel with nothing to analyze yet: no polygon, no CSV, no pin, and every
// knob at the value a first visit lands on. Each test overrides the few
// inputs its case is about.
function state(over: Partial<State> = {}): State {
  return {
    selection: { kind: 'now' },
    windowWarning: null,
    modelClamped: false,
    forecastModel: 'gfs_seamless',
    comparedModels: [],
    forecastModels: MODELS,
    polygonAreaKm2: null,
    maxAreaKm2: 100_000,
    drawPointCount: 0,
    drawing: false,
    destinationTypes: ['peak'],
    hasCustom: false,
    hasPins: false,
    sortBy: DEFAULT_FAMILY_KEY.precip,
    loading: false,
    error: null,
    refusal: null,
    failedView: null,
    failedPanel: refusalPanel(),
    customCount: 0,
    maxDestinations: 1500,
    failureSeq: 0,
    commitReasons: [],
    hasReport: false,
    aqiAllNull: false,
    wildfireCheckFailed: false,
    closureCheckFailed: false,
    basemapFailed: false,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    dismissEvent: () => {},
    ...over,
  }
}

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
    onAnalyze: noop,
    autoAnalyze: false,
    capabilitiesSettled: false,
    onAutoAnalyze: noop,
    actionWord: 'Analyze',
    maxLimit: 1500,
    maxAreaKm2: 100_000,
    archiveDays: 365,
    aqiForecastDays: 5,
    ...over,
  }
}

// The panel under the hook that feeds it, wired as App wires the two.
function Panel(over: Over) {
  const messages = usePanelMessages(state(over))
  return <ControlPanel {...props(over)} messages={messages} />
}

const analyze = () => screen.getByRole('button', { name: /^(Analyze|Analyzing…|Try again)$/ }) as HTMLButtonElement
const badge = () => screen.getByRole('button', { name: /^\d+ messages?$/ })
const noBadge = () => expect(screen.queryByRole('button', { name: /messages?$/ })).toBeNull()
const list = () => screen.getByRole('group', { name: 'Messages' })
/** The text of every message in the list, box by box. */
const boxes = () => [...list().children].map((box) => box.textContent ?? '')
/** The elements saying a line in the panel's body, the live region left out. */
const inBody = (line: RegExp) => screen.queryAllByText(line).filter((el) => !screen.getByRole('status').contains(el))

describe('the Analyze button', () => {
  // One case per blocker, each the smallest panel that raises it alone. The
  // fragment is enough of the line to know which one rendered.
  const blocked: [string, Over, RegExp][] = [
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

  // Greyed and live rather than disabled (the maintainer, 2026-10-21): the
  // count on the button in the error colour (record 0210), the reason in the
  // list alone, and a press on either the badge or the button opens it.
  it.each(blocked)('is greyed for %s, counts it in red, and lists it from the button', async (_case, over, line) => {
    const onAnalyze = vi.fn()
    const { user } = render(<Panel {...over} onAnalyze={onAnalyze} />)
    expect(analyze().disabled).toBe(false)
    expect(analyze().getAttribute('aria-disabled')).toBe('true')
    expect(Number(badge().textContent)).toBeGreaterThanOrEqual(1)
    expect(badge().className).toContain(MESSAGE_BADGE.error)
    expect(inBody(line)).toHaveLength(0)
    await user.click(analyze())
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(within(list()).getByText(line)).toBeTruthy()
  })

  // Snowfall is each model's own forecast, so unlike the snow depth it
  // replaced it compares the way precipitation does (#678).
  it('analyzes a snowfall ranking with models compared', () => {
    render(<Panel hasPins sortBy={DEFAULT_FAMILY_KEY.snowfall} comparedModels={['ecmwf_ifs025']} />)
    expect(analyze().disabled).toBe(false)
    expect(analyze().getAttribute('aria-disabled')).toBeNull()
    noBadge()
  })

  // A line pasted twice is one destination, in the count under the box too.
  it('counts a repeated pasted line once under the coordinates box', () => {
    render(<Panel customCsv={'46.85,-121.76\n46.85,-121.76\n46.2,-121.49'} hasCustom />)
    expect(screen.getByText('2 destinations parsed')).toBeTruthy()
  })

  // A finished ring with no type checked beside a pin: Analyze stays open, and
  // the types line says as information that the ring adds nothing (#579), so
  // the badge reads blue rather than a blocker's red.
  it('stays enabled beside a finished ring with no type, and says the ring adds nothing', async () => {
    const { user } = render(<Panel hasPins drawPointCount={3} destinationTypes={[]} />)
    expect(analyze().disabled).toBe(false)
    expect(analyze().getAttribute('aria-disabled')).toBeNull()
    expect(badge().textContent).toBe('1')
    expect(badge().className).toContain(MESSAGE_BADGE.info)
    await user.click(badge())
    expect(within(list()).getByText(/destination type/)).toBeTruthy()
  })

  it('says nothing about the ring while it is still being drawn', () => {
    render(<Panel hasPins drawPointCount={3} destinationTypes={[]} drawing />)
    noBadge()
  })

  it('is enabled by a searched place alone, and analyzes on a press', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<Panel hasPins onAnalyze={onAnalyze} />)
    expect(analyze().disabled).toBe(false)
    noBadge()
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('is enabled by a finished polygon with a type checked', () => {
    render(<Panel drawPointCount={3} polygonAreaKm2={500} />)
    expect(analyze().disabled).toBe(false)
    noBadge()
  })

  // Busy is the button's own news; there is no reason to act on, so it is
  // disabled outright and wears no count.
  it('is busy rather than blocked while an analysis runs', () => {
    render(<Panel hasPins loading actionWord="Analyzing…" />)
    expect(analyze().textContent).toBe('Analyzing…')
    expect(analyze().disabled).toBe(true)
    expect(analyze().getAttribute('aria-disabled')).toBeNull()
    noBadge()
  })
})

// A link carrying `analyze=1` (#511). The decision is `autoAnalyzeStep`'s and
// its suite pins it; this pins that the panel feeds it the button's own gate
// and decides once: the run, or the request dropped (#803, M3).
describe('the run on open', () => {
  const ready: Over = { hasPins: true, autoAnalyze: true, capabilitiesSettled: true }

  it('runs once when the link asked and the gate is open', () => {
    const onAutoAnalyze = vi.fn()
    const onAnalyze = vi.fn()
    const { rerender } = render(<Panel {...ready} onAutoAnalyze={onAutoAnalyze} onAnalyze={onAnalyze} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    // The run closes the gate and its end reopens it, and neither is a second
    // request, even while the flag is still up.
    rerender(<Panel {...ready} onAutoAnalyze={onAutoAnalyze} loading />)
    rerender(<Panel {...ready} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    expect(onAutoAnalyze).toHaveBeenCalledWith('run')
    expect(onAnalyze).not.toHaveBeenCalled()
  })

  it('waits for the capabilities to settle', () => {
    const onAutoAnalyze = vi.fn()
    const { rerender } = render(<Panel {...ready} capabilitiesSettled={false} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).not.toHaveBeenCalled()
    rerender(<Panel {...ready} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
  })

  it('drops the request while the gate is closed, and says why as usual', () => {
    const onAutoAnalyze = vi.fn()
    render(<Panel {...ready} hasPins={false} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    expect(onAutoAnalyze).toHaveBeenCalledWith('drop')
    expect(screen.getByRole('status').textContent).toMatch(/at least one destination/)
  })

  // The edit that opens the gate later is the reader's, not the link's: the
  // request was dropped when the limits settled, so it does not run.
  it('does not run on the edit that later opens the gate', () => {
    const onAutoAnalyze = vi.fn()
    const { rerender } = render(<Panel {...ready} hasPins={false} onAutoAnalyze={onAutoAnalyze} />)
    rerender(<Panel {...ready} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).toHaveBeenCalledOnce()
    expect(onAutoAnalyze).toHaveBeenCalledWith('drop')
  })

  it('runs nothing for a link that did not ask', () => {
    const onAutoAnalyze = vi.fn()
    render(<Panel {...ready} autoAnalyze={false} onAutoAnalyze={onAutoAnalyze} />)
    expect(onAutoAnalyze).not.toHaveBeenCalled()
  })
})

describe('the messages', () => {
  // A panel with something to say at two severities at once: a failed run
  // and a blocker in the error box, and a stale report in the warn box.
  const crowded: Over = {
    error: { message: 'Open-Meteo request failed. Try again later.', retry: true },
    actionWord: 'Try again',
    commitReasons: ['model-changed', 'window-changed'],
    modelClamped: true,
    drawPointCount: 1,
  }

  // The badge counts them all in the worst one's colour, and the list opens
  // from it boxed by severity, error first. Nothing stands under the button:
  // the list is the one menu's card over it, and a blocker is an error
  // (record 0210), so it shares the run error's box.
  it('counts every message on the button and lists them from the badge, error first', async () => {
    const { user } = render(<Panel {...crowded} />)
    expect(badge().textContent).toBe('5')
    expect(badge().className).toContain(MESSAGE_BADGE.error)
    expect(screen.queryByRole('group', { name: 'Messages' })).toBeNull()
    await user.click(badge())
    const [error, warn] = boxes()
    expect(boxes()).toHaveLength(2)
    expect(error).toMatch(/Open-Meteo request failed.*2 more points/)
    // Both stale-report reasons at once, the model's first, then the clamp:
    // every warning in one box.
    expect(warn).toMatch(/forecast model.*forecast range.*shortened the window/)
    const slot = analyze().parentElement!
    expect(slot.contains(list())).toBe(false)
    expect([...slot.children].map((el) => el.getAttribute('role') ?? el.tagName)).toEqual(['BUTTON', 'BUTTON', 'status'])
  })

  // After a failed run the Analyze button is the one retry (#736): it reads
  // the word App decided, runs the panel's own command through the panel's
  // own gate, and the error box in the list carries no button of its own.
  it('makes the Analyze button the one retry for a failed run', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(
      <Panel {...crowded} drawPointCount={3} destinationTypes={['peak']} polygonAreaKm2={10} onAnalyze={onAnalyze} />,
    )
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    expect(analyze().disabled).toBe(false)
    expect(analyze().getAttribute('aria-disabled')).toBeNull()
    await user.click(analyze())
    expect(onAnalyze).toHaveBeenCalledOnce()
    await user.click(badge())
    expect(within(list()).queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  // The gate still rules the retry: with the ring gone after the failure the
  // old box's button still fired, and this one opens the list instead.
  it('holds the retry to the gate', async () => {
    const onAnalyze = vi.fn()
    const { user } = render(<Panel {...crowded} drawPointCount={0} onAnalyze={onAnalyze} />)
    expect(analyze().textContent).toBe('Try again')
    expect(analyze().getAttribute('aria-disabled')).toBe('true')
    await user.click(analyze())
    expect(onAnalyze).not.toHaveBeenCalled()
    expect(list()).toBeTruthy()
  })

  // Dismissing the error line clears the event above rather than hiding the
  // line here, which is what lets the button read Analyze again at once.
  it('hands the dismissal of the error line up', async () => {
    const dismissEvent = vi.fn()
    const { user } = render(<Panel {...crowded} dismissEvent={dismissEvent} />)
    await user.click(badge())
    const [error] = [...list().children] as HTMLElement[]
    await user.click(within(error).getByRole('button', { name: 'Dismiss notice' }))
    expect(dismissEvent).toHaveBeenCalledExactlyOnceWith('error')
  })

  it('dismisses one message and keeps the rest', async () => {
    const { user } = render(<Panel {...crowded} />)
    await user.click(badge())
    const before = boxes()[1]
    const [first] = within([...list().children][1] as HTMLElement).getAllByRole('button', { name: 'Dismiss notice' })
    await user.click(first)
    expect(badge().textContent).toBe('4')
    expect(boxes()[1]).not.toMatch(/forecast model/)
    expect(boxes()[1]).toMatch(/forecast range/)
    expect(boxes()[1]).not.toBe(before)
  })

  // A blocker stands until the reader supplies what it asks: no × on its
  // row, where the run error beside it in the same box keeps its own.
  it('offers no dismissal for a blocker', async () => {
    const { user } = render(<Panel {...crowded} />)
    await user.click(badge())
    const row = within(list()).getByText(/2 more points/).parentElement!
    expect(within(row).queryByRole('button')).toBeNull()
    const error = within(list()).getByText(/Open-Meteo request failed/).parentElement!
    expect(within(error).getByRole('button', { name: 'Dismiss notice' })).toBeTruthy()
  })
})

// On a phone the body is the Controls sheet's scroller (#696; record 0141),
// which takes the home indicator band at its end (record 0152): the Terms
// line is its last content, and the Analyze button with its badge is the
// map's (record 0135), so the sheet draws neither.
describe('the body on a phone', () => {
  it('pads its scrolling end for the home indicator, and only on a phone', () => {
    const { unmount } = render(<Panel phone />)
    const body = screen.getByRole('link', { name: 'Terms' }).closest<HTMLElement>('[class*="overflow-y-auto"]')
    expect(body?.className).toBe(`${PANEL_BODY} ${PANEL_RULE} ${CONTROLS_SHEET.body}`)
    expect(body?.lastElementChild?.contains(screen.getByRole('link', { name: 'Terms' }))).toBe(true)
    expect(screen.queryByRole('button', { name: /^(Analyze|\d+ messages?)$/ })).toBeNull()
    unmount()
  })
})
