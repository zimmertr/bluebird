import { describe, expect, it, vi } from 'vitest'
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

vi.mock('./ControlPanel', () => ({
  default: (props: {
    pointSample: boolean
    basemapFailed?: boolean
    wildfireCheckFailed?: boolean
    closureCheckFailed?: boolean
  }) => (
    <div
      data-testid="panel"
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
      onClose={onClose}
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
      onRetry={NOOP}
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
  it('closes from its own button', () => {
    const onClose = vi.fn()
    render(drawer(true, onClose))
    fireEvent.click(screen.getByRole('button', { name: 'Close controls' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // The backdrop exists only while the drawer is open, and a press on it closes it.
  it('draws a backdrop only while open, and closes on a press on it', () => {
    const onClose = vi.fn()
    const { container, rerender } = render(drawer(true, onClose))
    const scrim = container.querySelector('aside')?.previousElementSibling as HTMLElement
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalledOnce()
    rerender(drawer(false, onClose))
    expect(container.querySelector('aside')?.previousElementSibling).toBeNull()
  })

  it('slides off screen when closed and stays mounted', () => {
    const { container, rerender } = render(drawer(true))
    expect(container.querySelector('aside')?.className).toContain('translate-x-0')
    rerender(drawer(false))
    expect(container.querySelector('aside')?.className).toContain('-translate-x-full')
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
})
