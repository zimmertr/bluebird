import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef } from 'react'
import AppDrawer from './AppDrawer'
import type { MapViewHandle } from './MapView'
import { render } from '../testSupport/render'
import { capabilities } from '../testSupport/fixtures'
import { DEFAULT_SELECTION } from '../utils/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import type { CommitReason } from '../utils/present'
import type { DestinationResult } from '../types'

vi.mock('./ControlPanel', () => ({
  default: (props: { pointSample: boolean }) => (
    <div data-testid="panel">{props.pointSample ? 'point' : 'window'}</div>
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

function drawer(open: boolean, onClose = NOOP) {
  return (
    <AppDrawer
      open={open}
      onClose={onClose}
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
      onStartTour={NOOP}
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

  // The Metrics table follows the When selection, not the report.
  it("hands the panel the selection's own point-sample flag", () => {
    render(drawer(true))
    expect(screen.getByTestId('panel').textContent).toBe('point')
  })
})
