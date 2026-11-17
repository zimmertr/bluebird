import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { type ComponentProps, type ReactNode, createRef } from 'react'
import AppDrawer from './AppDrawer'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { capabilities, chartMetricsOf, panelMessages, place } from '../testSupport/fixtures'
import { DEFAULT_SELECTION } from '../utils/calendar/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import type { PanelMessages } from '../hooks/usePanelMessages'
import { DESK_CARD, MAP_ROWS, PANEL_HEADER } from '../styles'

vi.mock('./ControlPanel', () => ({
  default: (props: {
    pointSample: boolean
    messages: PanelMessages
    phone?: boolean
    pickedCount?: number
    card?: { open: boolean; search: ReactNode; section: string | null; onSection: (id: string) => void }
  }) => (
    <div
      data-testid="panel"
      data-phone={String(props.phone)}
      data-messages={String(props.messages.count)}
      data-card={props.card ? `${props.card.open ? 'open' : 'shut'}:${props.card.section}` : 'none'}
      data-picked={String(props.pickedCount)}
    >
      {props.pointSample ? 'point' : 'window'}
      {props.card?.search}
      {props.card && <button onClick={() => props.card?.onSection('metrics')}>open metrics</button>}
    </div>
  ),
}))

const NOOP = () => {}
const DRAW = {
  drawing: false,
  startDrawing: NOOP,
  finishDrawing: NOOP,
  drawPointCount: 0,
  handleCancelDrawing: NOOP,
  handleClearDrawing: NOOP,
}
const INPUTS = {
  polygonAreaKm2: null,
  destinationTypes: [],
  setDestinationTypes: NOOP,
  customCsv: '',
  setCustomCsv: NOOP,
  includeUnnamedPeaks: false,
  setIncludeUnnamedPeaks: NOOP,
  places: [],
}
const SELECTION = {
  selection: DEFAULT_SELECTION,
  changeSelection: NOOP,
  forecastModel: 'gfs_seamless',
  changeForecastModel: NOOP,
  comparedModels: [],
  setComparedModels: NOOP,
  panelPointSample: true,
}
const KNOBS = {
  sortBy: 'temp_avg_f' as const,
  setSortBy: NOOP,
  sortDesc: false,
  setSortDesc: NOOP,
  rowKeys: DEFAULT_FAMILY_KEY,
  constraints: NO_CONSTRAINTS,
  setConstraints: NOOP,
  limit: 200,
  setLimit: NOOP,
  clearFilters: NOOP,
}
const CAPS = { ...capabilities(), settled: true }
const MAP = createRef<MapViewHandle>()
const MESSAGES = panelMessages()

function drawer(open: boolean, onClose = NOOP, over: Partial<ComponentProps<typeof AppDrawer>> = {}) {
  return (
    <AppDrawer
      open={open}
      isDesktop={true}
      sheetHeld={null}
      sheetRestPx={600}
      onSheetHeld={NOOP}
      onClose={onClose}
      themeChoice="system"
      onThemeChoice={NOOP}
      onTutorial={NOOP}
      drawMode={DRAW}
      destinationInputs={INPUTS}
      forecastSelection={SELECTION}
      rankingKnobs={KNOBS}
      chartMetrics={chartMetricsOf()}
      caps={CAPS}
      mapRef={MAP}
      onPointAtSearch={NOOP}
      onPointAtMapPois={NOOP}
      onPresetListFailed={NOOP}
      messages={MESSAGES}
      onAnalyze={NOOP}
      autoAnalyze={false}
      capabilitiesSettled
      onAutoAnalyze={NOOP}
      actionWord="Analyze"
      {...over}
    />
  )
}

describe('AppDrawer', () => {
  // The theme menu at a desk (#843): in the header, beside the close button
  // and in its box, named by the choice it holds, and a pick reaches App.
  it('carries the theme menu beside its close button at a desk', () => {
    const onThemeChoice = vi.fn()
    render(drawer(true, NOOP, { onThemeChoice }))
    const theme = screen.getByRole('button', { name: 'Theme System' })
    const close = screen.getByRole('button', { name: 'Close controls' })
    expect(theme.parentElement).toBe(close.parentElement)
    expect(theme.nextElementSibling).toBe(close)
    fireEvent.click(theme)
    fireEvent.click(screen.getByRole('option', { name: 'Light' }))
    expect(onThemeChoice).toHaveBeenCalledExactlyOnceWith('light')
  })

  it('names the theme menu by the choice it holds', () => {
    render(drawer(true, NOOP, { themeChoice: 'dark' }))
    expect(screen.getByRole('button', { name: 'Theme Dark' })).toBeTruthy()
  })

  it('closes from its own button', () => {
    const onClose = vi.fn()
    render(drawer(true, onClose))
    fireEvent.click(screen.getByRole('button', { name: 'Close controls' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // A desk's controls are a card (record 0305) with nothing drawn behind it.
  it('stands as a card at a desk with no backdrop and no sheet', () => {
    const { container } = render(drawer(true))
    expect(container.querySelector('aside')?.previousElementSibling).toBeNull()
    expect(container.querySelector('aside')?.className).toBe(DESK_CARD.card)
    expect(screen.queryByRole('dialog', { name: 'Controls' })).toBeNull()
    expect(screen.getByTestId('panel').dataset.phone).toBe('false')
  })

  // Shut, the card is the search pill's row, and the panel stays mounted so
  // its state and a link's run on open outlive a close.
  it('is the search row alone when closed and stays mounted', () => {
    const { container, rerender } = render(drawer(true))
    rerender(drawer(false))
    expect(container.querySelector('aside')?.className).toBe(MAP_ROWS.row)
    expect(screen.getByTestId('panel')).toBeTruthy()
  })

  // Hidden is out of the Tab order: closed, the drawer once kept some 45
  // stops a keyboard walked through blind (#576).
  it('hides its header buttons while closed', () => {
    const { rerender } = render(drawer(true))
    const actions = () => screen.getByRole('button', { name: 'Close controls', hidden: true }).parentElement
    expect(actions()?.className).toBe(PANEL_HEADER.actions)
    rerender(drawer(false))
    expect(actions()?.className).toBe('hidden')
  })

  // The card hands the panel the search field it holds, whether it is open,
  // the section that is, and the press that opens another (record 0305).
  it('hands a desk\'s panel its card: the search field, the open section and the press', () => {
    const onSection = vi.fn()
    const { rerender } = render(
      drawer(true, NOOP, { onSection, section: 'forecast', search: <input aria-label="Search" /> }),
    )
    expect(screen.getByTestId('panel').dataset.card).toBe('open:forecast')
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'open metrics' }))
    expect(onSection).toHaveBeenCalledExactlyOnceWith('metrics')
    rerender(drawer(false, NOOP, { onSection, section: null }))
    expect(screen.getByTestId('panel').dataset.card).toBe('shut:null')
  })

  // A phone's sheet shows every section whole, so its panel gets no card.
  it('hands a phone\'s panel no card', () => {
    render(drawer(true, NOOP, { isDesktop: false, onSection: NOOP }))
    expect(screen.getByTestId('panel').dataset.card).toBe('none')
  })

  // The places picked on the map or by name, which the Destinations
  // section's summary counts.
  it('counts the picked places for the panel', () => {
    render(drawer(true, NOOP, { destinationInputs: { ...INPUTS, places: [place(), place()] } }))
    expect(screen.getByTestId('panel').dataset.picked).toBe('2')
  })

  // The map's Controls button unmounts as the drawer opens, so the drawer's
  // own Close button takes the keyboard rather than the body (#576).
  it('takes the keyboard when the button that opened it goes', () => {
    const page = (open: boolean) => (
      <>
        {drawer(open)}
        {!open && <button>Open controls</button>}
      </>
    )
    const { rerender } = render(page(false))
    screen.getByRole('button', { name: 'Open controls' }).focus()
    rerender(page(true))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close controls' }))
  })

  // The Metrics table follows the When selection, not the report.
  it("hands the panel the selection's own point-sample flag", () => {
    render(drawer(true))
    expect(screen.getByTestId('panel').textContent).toBe('point')
  })

  // The messages are App's (record 0208), derived once for the panel and the
  // phone's map: the drawer hands them through untouched.
  it('hands the panel the messages it is given', () => {
    const { rerender } = render(drawer(true))
    expect(screen.getByTestId('panel').dataset.messages).toBe('0')
    const two = panelMessages({
      messages: [
        { key: 'map:style', text: 'Map failed.', severity: 'error' },
        { key: 'blocker:dates', text: 'Pick a date.', severity: 'info' },
      ],
    })
    rerender(drawer(true, NOOP, { messages: two }))
    expect(screen.getByTestId('panel').dataset.messages).toBe('2')
  })

  // A phone raises the panel as the Controls sheet (#696; record 0141): the
  // bottom sheet every phone menu is, modal over the dim (record 0207), its
  // height set from where it stands, and mounted for good so the panel keeps
  // its state.
  describe('on a phone', () => {
    const phone = (open: boolean, onClose = NOOP, over: Partial<ComponentProps<typeof AppDrawer>> = {}) =>
      drawer(open, onClose, { isDesktop: false, sheetRestPx: 540, ...over })
    const sheet = () => screen.getByRole('dialog', { name: 'Controls' })
    const dim = () => sheet().previousElementSibling as HTMLElement | null

    it('is a modal sheet titled Controls, the given height, with the phone panel in it', () => {
      const { container } = render(phone(true))
      expect(sheet().getAttribute('aria-modal')).toBe('true')
      expect(sheet().style.height).toBe('540px')
      expect(screen.getByTestId('panel').dataset.phone).toBe('true')
      expect(container.querySelector('aside')).toBeNull()
      // In place rather than portalled, under a sheet opened from inside it.
      expect(container.contains(sheet())).toBe(true)
    })

    // On a phone the menu is the Controls sheet's alone, in its title row
    // beside Done (#706), and its rows open in a sheet headed Theme (#843).
    it('carries the theme menu in its title row, beside Done', () => {
      const onThemeChoice = vi.fn()
      render(drawer(true, NOOP, { isDesktop: false, sheetRestPx: 540, onThemeChoice }))
      const theme = screen.getByRole('button', { name: 'Theme System' })
      const done = screen.getByRole('button', { name: 'Done' })
      expect(theme.nextElementSibling).toBe(done)
      expect(theme.getAttribute('aria-haspopup')).toBe('dialog')
      expect(screen.queryByRole('button', { name: 'Close controls' })).toBeNull()
      fireEvent.click(theme)
      expect(screen.getByRole('dialog', { name: 'Theme' })).toBeTruthy()
      fireEvent.click(screen.getByRole('option', { name: 'Dark' }))
      expect(onThemeChoice).toHaveBeenCalledExactlyOnceWith('dark')
    })

    it('closes from Done, from Escape and from a press on the dim', () => {
      const onClose = vi.fn()
      render(phone(true, onClose))
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(dim()!.getAttribute('aria-hidden')).toBe('true')
      fireEvent.click(dim()!)
      expect(onClose).toHaveBeenCalledTimes(3)
    })

    it('slides below the map, drops its dim and goes inert when shut, and stays mounted', () => {
      const { rerender } = render(phone(true))
      expect(sheet().hasAttribute('inert')).toBe(false)
      expect(sheet().className).not.toContain('translate-y-full')
      expect(dim()).not.toBeNull()
      rerender(phone(false))
      expect(sheet().hasAttribute('inert')).toBe(true)
      expect(sheet().className).toContain('translate-y-full')
      expect(dim()).toBeNull()
      expect(screen.getByTestId('panel')).toBeTruthy()
    })

    // Its grip and title drag it the way a menu's do (record 0146), with the
    // heights App holds.
    it('hands App the height a drag on its title holds it at, and its own back on a double press', () => {
      // The gesture reads each press's timeStamp, which jsdom stamps from the
      // clock: frozen, the two presses are a double press by construction
      // rather than by how fast the steps between them ran.
      vi.useFakeTimers({ toFake: ['Date', 'performance'] })
      onTestFinished(() => void vi.useRealTimers())
      // The ceiling is the screen's (record 0291), which jsdom leaves at 768.
      const screenPx = window.innerHeight
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
      onTestFinished(() => void Object.defineProperty(window, 'innerHeight', { configurable: true, value: screenPx }))
      const onSheetHeld = vi.fn()
      render(drawer(true, NOOP, { isDesktop: false, sheetRestPx: 540, onSheetHeld }))
      const title = screen.getByRole('heading', { name: 'Controls' })
      fireEvent.pointerDown(title, { clientY: 500, pointerId: 1 })
      fireEvent.pointerMove(document, { clientY: 400, pointerId: 1 })
      expect(onSheetHeld).toHaveBeenLastCalledWith({ share: 640 / 700 })
      fireEvent.pointerMove(document, { clientY: 200, pointerId: 1 })
      expect(onSheetHeld).toHaveBeenLastCalledWith({ share: 1 })
      fireEvent.pointerCancel(document, { pointerId: 1 })
      fireEvent.pointerDown(title, { clientY: 500, pointerId: 1 })
      expect(onSheetHeld).toHaveBeenLastCalledWith(null)
    })

    // As a menu sheet does: the keyboard goes into the sheet as it opens,
    // stays inside it, and goes back to the chip that raised it on Done.
    it('takes the keyboard in as it opens, keeps Tab inside, and hands it back as it shuts', () => {
      const onClose = vi.fn()
      const page = (open: boolean) => (
        <>
          <button>Open controls</button>
          {phone(open, onClose)}
        </>
      )
      const { rerender } = render(page(false))
      const chip = screen.getByRole('button', { name: 'Open controls' })
      chip.focus()
      rerender(page(true))
      expect(document.activeElement).toBe(sheet())
      const done = screen.getByRole('button', { name: 'Done' })
      done.focus()
      expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Theme System' }))
      rerender(page(false))
      expect(document.activeElement).toBe(chip)
      expect(onClose).not.toHaveBeenCalled()
    })

    // A panel step of the tutorial holds the sheet open behind its card,
    // which keeps the keyboard and its own Escape (#536).
    it('leaves the keyboard to the tutorial while it runs', () => {
      const onClose = vi.fn()
      const page = (tourRuns: boolean) => (
        <>
          <button>Next</button>
          {phone(true, onClose, { tourRuns })}
        </>
      )
      const { rerender } = render(page(true))
      const next = screen.getByRole('button', { name: 'Next' })
      next.focus()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(next)
      // The tour ends with the sheet up: it is modal again.
      rerender(page(false))
      expect(document.activeElement).toBe(sheet())
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
