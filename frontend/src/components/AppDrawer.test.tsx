import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { type ComponentProps, createRef } from 'react'
import AppDrawer from './AppDrawer'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { capabilities, resultRow } from '../testSupport/fixtures'
import { DEFAULT_SELECTION } from '../utils/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import type { CommitReason } from '../utils/present'
import type { DestinationResult } from '../types'
import { DESK_PANEL } from '../styles'

vi.mock('./ControlPanel', () => ({
  default: (props: {
    pointSample: boolean
    basemapFailed?: boolean
    wildfireCheckFailed?: boolean
    closureCheckFailed?: boolean
    phone?: boolean
  }) => (
    <div
      data-testid="panel"
      data-phone={String(props.phone)}
      data-basemap-failed={String(props.basemapFailed)}
      data-wildfire-failed={String(props.wildfireCheckFailed)}
      data-closure-failed={String(props.closureCheckFailed)}
    >
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
  places: [],
}
const SELECTION = {
  selection: DEFAULT_SELECTION,
  changeSelection: NOOP,
  windowWarning: null,
  forecastModel: 'gfs_seamless',
  changeForecastModel: NOOP,
  comparedModels: [],
  setComparedModels: NOOP,
  modelClamped: false,
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
const NO_REASONS: CommitReason[] = []
const NO_ROWS: DestinationResult[] = []

function drawer(
  open: boolean,
  onClose = NOOP,
  basemapFailed = false,
  over: Partial<ComponentProps<typeof AppDrawer>> = {},
) {
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
      commitReasons={NO_REASONS}
      onAnalyze={NOOP}
      autoAnalyze={false}
      capabilitiesSettled
      onAutoAnalyze={NOOP}
      loading={false}
      error={null}
      refusal={null}
      actionWord="Analyze"
      onDismissEvent={NOOP}
      response={null}
      results={NO_ROWS}
      fireStatus="idle"
      closureStatus="idle"
      showWildfires={false}
      showAreaClosures={false}
      basemapFailed={basemapFailed}
      {...over}
    />
  )
}

describe('AppDrawer', () => {
  // The theme switch at a desk (#706): in the header, beside the close
  // button and in its box, offering the theme it goes to.
  it('carries the theme switch beside its close button at a desk', () => {
    const onToggleTheme = vi.fn()
    render(drawer(true, NOOP, false, { onToggleTheme }))
    const toLight = screen.getByRole('button', { name: 'Switch to light theme' })
    const close = screen.getByRole('button', { name: 'Close controls' })
    expect(toLight.parentElement).toBe(close.parentElement)
    expect(toLight.nextElementSibling).toBe(close)
    expect(toLight.className).toBe(close.className)
    fireEvent.click(toLight)
    expect(onToggleTheme).toHaveBeenCalledOnce()
  })

  it('offers the dark theme while light', () => {
    render(drawer(true, NOOP, false, { theme: 'light' }))
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
    expect(screen.queryByRole('region', { name: 'Controls' })).toBeNull()
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

  // #580: the map's failure reaches the panel's one notice block.
  it('hands the panel whether the basemap is failing', () => {
    const { rerender } = render(drawer(true))
    expect(screen.getByTestId('panel').dataset.basemapFailed).toBe('false')
    rerender(drawer(true, NOOP, true))
    expect(screen.getByTestId('panel').dataset.basemapFailed).toBe('true')
  })

  // A failed check's note follows its own layer (#642): the wildfire one the
  // Wildfires layer, the closure one the area closures layer, neither the other's.
  it('passes a failed check on to the panel only while its layer is on', () => {
    const failed: Partial<ComponentProps<typeof AppDrawer>> = {
      results: [resultRow()],
      fireStatus: 'unavailable',
      closureStatus: 'unavailable',
    }
    const { rerender } = render(drawer(true, NOOP, false, failed))
    expect(screen.getByTestId('panel').dataset.wildfireFailed).toBe('false')
    expect(screen.getByTestId('panel').dataset.closureFailed).toBe('false')
    rerender(drawer(true, NOOP, false, { ...failed, showWildfires: true }))
    expect(screen.getByTestId('panel').dataset.wildfireFailed).toBe('true')
    expect(screen.getByTestId('panel').dataset.closureFailed).toBe('false')
    rerender(drawer(true, NOOP, false, { ...failed, showAreaClosures: true }))
    expect(screen.getByTestId('panel').dataset.wildfireFailed).toBe('false')
    expect(screen.getByTestId('panel').dataset.closureFailed).toBe('true')
  })

  // A phone raises the panel as the Controls sheet (#696; record 0141): not a
  // dialog, no backdrop, its height set from where it stands, and mounted for
  // good so the panel keeps its state and the notice portal its home.
  describe('on a phone', () => {
    const phone = (open: boolean, onClose = NOOP) => drawer(open, onClose, false, { isDesktop: false, sheetPx: 540 })

    it('is a region titled Controls, the given height, with the phone panel in it', () => {
      const { container } = render(phone(true))
      const sheet = screen.getByRole('region', { name: 'Controls' })
      expect(sheet.style.height).toBe('540px')
      expect(screen.getByTestId('panel').dataset.phone).toBe('true')
      expect(container.querySelector('aside')).toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // On a phone the switch is the Controls sheet's alone, in its title row
    // beside Done (#706).
    it('carries the theme switch in its title row, beside Done', () => {
      const onToggleTheme = vi.fn()
      render(drawer(true, NOOP, false, { isDesktop: false, sheetPx: 540, onToggleTheme }))
      const toLight = screen.getByRole('button', { name: 'Switch to light theme' })
      const done = screen.getByRole('button', { name: 'Done' })
      expect(toLight.nextElementSibling).toBe(done)
      expect(screen.queryByRole('button', { name: 'Close controls' })).toBeNull()
      fireEvent.click(toLight)
      expect(onToggleTheme).toHaveBeenCalledOnce()
    })

    it('closes from Done and from Escape', () => {
      const onClose = vi.fn()
      render(phone(true, onClose))
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      fireEvent.keyDown(screen.getByRole('region', { name: 'Controls' }), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(2)
    })

    it('slides below the map and goes inert when shut, and stays mounted', () => {
      const { container, rerender } = render(phone(true))
      const sheet = () => container.querySelector('section') as HTMLElement
      expect(sheet().hasAttribute('inert')).toBe(false)
      expect(sheet().className).not.toContain('translate-y-full')
      rerender(phone(false))
      expect(sheet().hasAttribute('inert')).toBe(true)
      expect(sheet().className).toContain('translate-y-full')
      expect(screen.getByTestId('panel')).toBeTruthy()
    })

    // Its grip and title drag it the way a menu's do (record 0146), with the
    // heights App holds: the button and the band ride its edge.
    it('hands App the height a drag on its title holds it at, and its own back on a double press', () => {
      // The gesture reads each press's timeStamp, which jsdom stamps from the
      // clock: frozen, the two presses are a double press by construction
      // rather than by how fast the steps between them ran.
      vi.useFakeTimers({ toFake: ['Date', 'performance'] })
      onTestFinished(() => void vi.useRealTimers())
      const onSheetPx = vi.fn()
      render(drawer(true, NOOP, false, { isDesktop: false, sheetPx: 540, sheetRestPx: 540, sheetFullPx: 700, onSheetPx }))
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

    // The summary chip that raised it can go inert under it, so Done takes
    // the keyboard rather than the body (#576).
    it('hands the keyboard to Done when the control that raised it goes', () => {
      const page = (open: boolean) => (
        <>
          {phone(open)}
          {!open && <button>Open controls</button>}
        </>
      )
      const { rerender } = render(page(false))
      screen.getByRole('button', { name: 'Open controls' }).focus()
      rerender(page(true))
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }))
    })
  })
})
