import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MapLegend from './MapLegend'
import { render } from '../testSupport/render'
import { rankedScale } from '../utils/colors'

const NONE = {
  showWildfires: false,
  showAreaClosures: false,
  showTrailClosures: false,
  showRadar: false,
  showSmoke: false,
  showSnow: false,
}
const SMOKE_AND_RADAR = { ...NONE, showSmoke: true, showRadar: true }
const NO_GRID = {
  gridPainted: false,
  gridCued: false,
  gridFailed: false,
  gridLegend: { label: 'Forecast grid', value: '', kind: 'status' as const },
}
const TEMP_SCALE = rankedScale('temp_avg_f')
const BASE = {
  sortBy: 'temp_avg_f' as const,
  markerScale: TEMP_SCALE,
  hasColoredMarkers: false,
  rankedFieldHasValue: true,
  overlays: NONE,
  grid: NO_GRID,
  sidebarOpen: true,
  sheetLiftPx: 0,
  timelineShown: false,
}
describe('MapLegend', () => {
  it('draws nothing when nothing on the map is coloured or switched on', () => {
    const { container } = render(<MapLegend {...BASE} />)
    expect(container.innerHTML).toBe('')
  })

  // Alphabetical by what each section reads, the metric key included.
  it('sorts the sections by their labels, the metric key among them', () => {
    const { container } = render(<MapLegend {...BASE} hasColoredMarkers overlays={SMOKE_AND_RADAR} />)
    const text = container.textContent ?? ''
    const at = (s: string) => text.indexOf(s)
    expect(at('Rain radar')).toBeGreaterThanOrEqual(0)
    expect(at('Rain radar')).toBeLessThan(at('Smoke'))
    expect(at('Smoke')).toBeLessThan(at('Temperature'))
  })

  // Colours over a field of N/A explain nothing, so the key stays away.
  it('leaves the metric key out when the ranked metric has no value on screen', () => {
    render(<MapLegend {...BASE} hasColoredMarkers rankedFieldHasValue={false} overlays={SMOKE_AND_RADAR} />)
    expect(screen.queryByText(/Temperature/)).toBeNull()
    expect(screen.getByText(/Smoke/)).toBeTruthy()
  })

  it('credits NIFC beside the wildfire section', () => {
    render(<MapLegend {...BASE} overlays={{ ...NONE, showWildfires: true }} />)
    expect(screen.getByRole('link', { name: 'NIFC' })).toBeTruthy()
  })

  // Either closure layer alone is something to key, and each credits the
  // Forest Service in its own section.
  it('keys each closure layer on its own, credited to the Forest Service', () => {
    const { container } = render(<MapLegend {...BASE} overlays={{ ...NONE, showTrailClosures: true }} />)
    expect(container.textContent).toContain('Trail closures')
    expect(container.textContent).not.toContain('Area closures')
    expect(screen.getByRole('link', { name: 'USFS' }).getAttribute('href')).toBe(
      'https://www.fs.usda.gov/',
    )
  })

  it('sorts the area section first and the trail section after smoke', () => {
    const { container } = render(
      <MapLegend {...BASE} overlays={{ ...NONE, showAreaClosures: true, showTrailClosures: true, showSmoke: true }} />,
    )
    const text = container.textContent ?? ''
    expect(text.indexOf('Area closures')).toBeLessThan(text.indexOf('Smoke'))
    expect(text.indexOf('Smoke')).toBeLessThan(text.indexOf('Trail closures'))
    expect(screen.getAllByRole('link', { name: 'USFS' })).toHaveLength(2)
  })
})
