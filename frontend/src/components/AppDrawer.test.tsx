import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { type ComponentProps, createRef } from 'react'
import AppDrawer from './AppDrawer'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { capabilities, chartMetricsOf, panelMessages } from '../testSupport/fixtures'
import { DEFAULT_SELECTION } from '../utils/calendar/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import type { PanelMessages } from '../hooks/usePanelMessages'

vi.mock('./ControlPanel', () => ({
  default: (props: { pointSample: boolean; messages: PanelMessages; phone?: boolean }) => (
    <div data-testid="panel" data-phone={String(props.phone)} data-messages={String(props.messages.count)}>
      {props.pointSample ? 'point' : 'window'}
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
      card="destinations"
      autoAnalyze={false}
      capabilitiesSettled
      onAutoAnalyze={NOOP}
      {...over}
    />
  )
}

describe('AppDrawer', () => {
  // The place search heads the Where card and no other (record 0313).
  it('heads a desk\'s Where card with the search, and no other card', () => {
    const search = <input aria-label="Place search" />
    const { rerender } = render(drawer(true, NOOP, { isDesktop: true, card: 'destinations', search }))
    const where = screen.getByRole('region', { name: 'Where' })
    expect(where.querySelector('input[aria-label="Place search"]')).not.toBeNull()
    rerender(drawer(true, NOOP, { isDesktop: true, card: 'forecast', search }))
    expect(screen.queryByLabelText('Place search')).toBeNull()
  })

  // At a desk the panel is the one card a sentence-bar chip opened (record
  // 0309), with nothing behind it, and nothing at all with no card open
  // (record 0334).
  it('draws the one card at a desk, and nothing with none open', () => {
    const { container, rerender } = render(drawer(true))
    expect(screen.getByRole('region', { name: 'Where' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Controls' })).toBeNull()
    expect(screen.getByTestId('panel').dataset.phone).toBe('false')
    rerender(drawer(false, NOOP, { card: null }))
    expect(container.innerHTML).toBe('')
  })

  it('closes the card from its own button', () => {
    const onCardClose = vi.fn()
    render(drawer(true, NOOP, { onCardClose }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCardClose).toHaveBeenCalledOnce()
  })

  // The chip that opened the card keeps the keyboard; when nothing holds it,
  // the card's own Close takes it rather than the body (#576).
  it('takes the keyboard when the button that opened it goes', () => {
    const page = (open: boolean) => (
      <>
        {drawer(open, NOOP, { card: open ? 'destinations' : null })}
        {!open && <button>Where</button>}
      </>
    )
    const { rerender } = render(page(false))
    screen.getByRole('button', { name: 'Where' }).focus()
    rerender(page(true))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
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

    // The place search heads the sheet now that the sentence bar stands where
    // its pill stood (record 0328), over the panel rather than in it.
    it('heads the sheet with the place search it is handed', () => {
      render(phone(true, NOOP, { search: <input aria-label="Search for a place" /> }))
      const search = screen.getByRole('textbox', { name: 'Search for a place' })
      expect(sheet().contains(search)).toBe(true)
      expect(search.compareDocumentPosition(screen.getByTestId('panel')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    // On a phone the menu is the Controls sheet's alone, in its title row
    // beside Done (#706), and its rows open in a sheet headed Theme (#843).
    it('names the theme menu by the choice it holds', () => {
      render(phone(true, NOOP, { themeChoice: 'dark' }))
      expect(screen.getByRole('button', { name: 'Theme Dark' })).toBeTruthy()
    })

    it('carries the theme menu in its title row, beside Done', () => {
      const onThemeChoice = vi.fn()
      render(drawer(true, NOOP, { isDesktop: false, sheetRestPx: 540, onThemeChoice }))
      const theme = screen.getByRole('button', { name: 'Theme System' })
      const done = screen.getByRole('button', { name: 'Done' })
      expect(theme.nextElementSibling).toBe(done)
      expect(theme.getAttribute('aria-haspopup')).toBe('dialog')
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
