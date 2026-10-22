import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { type ComponentProps, createRef } from 'react'
import AppDrawer from './AppDrawer'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { capabilities, panelMessages } from '../testSupport/fixtures'
import { DEFAULT_SELECTION } from '../utils/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import type { PanelMessages } from '../hooks/usePanelMessages'
import { DESK_PANEL } from '../styles'

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
      sheetPx={600}
      sheetRestPx={600}
      sheetFullPx={700}
      onSheetPx={NOOP}
      onClose={onClose}
      theme="dark"
      onToggleTheme={NOOP}
      onTutorial={NOOP}
      drawMode={DRAW}
      destinationInputs={INPUTS}
      forecastSelection={SELECTION}
      rankingKnobs={KNOBS}
      caps={CAPS}
      mapRef={MAP}
      onPointAtSearch={NOOP}
      onPointAtMapPois={NOOP}
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
  // The theme switch at a desk (#706): in the header, beside the close
  // button and in its box, offering the theme it goes to.
  it('carries the theme switch beside its close button at a desk', () => {
    const onToggleTheme = vi.fn()
    render(drawer(true, NOOP, { onToggleTheme }))
    const toLight = screen.getByRole('button', { name: 'Switch to light theme' })
    const close = screen.getByRole('button', { name: 'Close controls' })
    expect(toLight.parentElement).toBe(close.parentElement)
    expect(toLight.nextElementSibling).toBe(close)
    expect(toLight.className).toBe(close.className)
    fireEvent.click(toLight)
    expect(onToggleTheme).toHaveBeenCalledOnce()
  })

  it('offers the dark theme while light', () => {
    render(drawer(true, NOOP, { theme: 'light' }))
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Switch to light theme' })).toBeNull()
  })

  it('closes from its own button', () => {
    const onClose = vi.fn()
    render(drawer(true, onClose))
    fireEvent.click(screen.getByRole('button', { name: 'Close controls' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // A desk docks the panel beside the map and draws nothing behind it.
  it('docks at a desk with no backdrop and no sheet', () => {
    const { container } = render(drawer(true))
    expect(container.querySelector('aside')?.previousElementSibling).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Controls' })).toBeNull()
    expect(screen.getByTestId('panel').dataset.phone).toBe('false')
  })

  // Shut, it stays in the row and its margin takes its width back, so the
  // map's edge moves with the panel's both ways (record 0202).
  it('pushes off the left edge when closed and stays mounted', () => {
    const { container, rerender } = render(drawer(true))
    const shut = DESK_PANEL.shut
    expect(container.querySelector('aside')?.className).toContain(DESK_PANEL.card)
    expect(container.querySelector('aside')?.className.split(' ')).not.toContain(shut)
    rerender(drawer(false))
    expect(container.querySelector('aside')?.className).toContain(DESK_PANEL.card)
    expect(container.querySelector('aside')?.className.split(' ')).toContain(shut)
    expect(screen.getByTestId('panel')).toBeTruthy()
  })

  // Off screen is not out of the Tab order: closed, the drawer kept some 45
  // stops a keyboard walked through blind (#576).
  it('leaves the Tab order while closed', () => {
    const { container, rerender } = render(drawer(true))
    expect(container.querySelector('aside')?.hasAttribute('inert')).toBe(false)
    rerender(drawer(false))
    expect(container.querySelector('aside')?.hasAttribute('inert')).toBe(true)
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
      drawer(open, onClose, { isDesktop: false, sheetPx: 540, ...over })
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

    // On a phone the switch is the Controls sheet's alone, in its title row
    // beside Done (#706).
    it('carries the theme switch in its title row, beside Done', () => {
      const onToggleTheme = vi.fn()
      render(drawer(true, NOOP, { isDesktop: false, sheetPx: 540, onToggleTheme }))
      const toLight = screen.getByRole('button', { name: 'Switch to light theme' })
      const done = screen.getByRole('button', { name: 'Done' })
      expect(toLight.nextElementSibling).toBe(done)
      expect(screen.queryByRole('button', { name: 'Close controls' })).toBeNull()
      fireEvent.click(toLight)
      expect(onToggleTheme).toHaveBeenCalledOnce()
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
      const onSheetPx = vi.fn()
      render(drawer(true, NOOP, { isDesktop: false, sheetPx: 540, sheetRestPx: 540, sheetFullPx: 700, onSheetPx }))
      const title = screen.getByRole('heading', { name: 'Controls' })
      fireEvent.pointerDown(title, { clientY: 500, pointerId: 1 })
      fireEvent.pointerMove(document, { clientY: 400, pointerId: 1 })
      expect(onSheetPx).toHaveBeenLastCalledWith(640)
      fireEvent.pointerMove(document, { clientY: 200, pointerId: 1 })
      expect(onSheetPx).toHaveBeenLastCalledWith(700)
      fireEvent.pointerCancel(document, { pointerId: 1 })
      fireEvent.pointerDown(title, { clientY: 500, pointerId: 1 })
      expect(onSheetPx).toHaveBeenLastCalledWith(null)
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
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Switch to light theme' }))
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
