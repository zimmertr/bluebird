import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MapLegend from './MapLegend'
import { render } from '../testSupport/render'
import { rankedScale } from '../utils/colors'
import { NOUN, UNIT, WIND_GUST } from '../metrics'
import { SMOKE_DENSITIES } from '../utils/smoke'

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

  // A chip shows a letter, and the word it stands for was its title alone,
  // which reaches a pointer and nobody else (#576). The word is in the chip
  // as hidden text too.
  it('names each smoke density to a screen reader as well as on hover', () => {
    render(<MapLegend {...BASE} overlays={SMOKE_AND_RADAR} />)
    for (const density of SMOKE_DENSITIES) {
      const chip = screen.getByTitle(density)
      expect(chip.textContent).toBe(`${density[0]}${density}`)
      expect(document.getElementById(chip.getAttribute('aria-describedby')!)!.textContent).toBe(density)
    }
  })

  // Colours over a field of N/A explain nothing, so the key stays away.
  it('leaves the metric key out when the ranked metric has no value on screen', () => {
    render(<MapLegend {...BASE} hasColoredMarkers rankedFieldHasValue={false} overlays={SMOKE_AND_RADAR} />)
    expect(screen.queryByText(/Temperature/)).toBeNull()
    expect(screen.getByText(/Smoke/)).toBeTruthy()
  })

  // The markers alone are no reason for a box when their key is the one
  // section they would have brought: an empty box reads as a fault.
  it('draws nothing when the ranked metric has no value and no layer is on', () => {
    const { container } = render(<MapLegend {...BASE} hasColoredMarkers rankedFieldHasValue={false} />)
    expect(container.innerHTML).toBe('')
  })

  // Every ranking paints since snowfall replaced snow depth (#678), the one
  // the grid could not (#579), so the grid row stands under a snowfall ranking.
  it('keeps the grid row under a snowfall ranking', () => {
    const PAINTED = { ...NO_GRID, gridPainted: true, gridLegend: { label: 'Forecast grid', value: '3 km', kind: 'pitch' as const } }
    const snowfall = render(
      <MapLegend {...BASE} sortBy="snowfall_total_in" markerScale={rankedScale('snowfall_total_in')} grid={PAINTED} />,
    )
    expect(snowfall.container.textContent).toContain('Forecast grid')
    expect(snowfall.container.textContent).toContain('Snowfall (in)')
  })

  // The gust's bands are its own, so the key names the gust rather than its
  // family (TJ, #584), and every other wind ranking still reads the wind.
  it('names a gust ranking Wind gust (mph)', () => {
    const gust = render(
      <MapLegend {...BASE} sortBy="wind_gust_mph" markerScale={rankedScale('wind_gust_mph')} hasColoredMarkers />,
    )
    expect(gust.container.textContent).toContain(`${WIND_GUST} (${UNIT.wind})`)
    gust.unmount()
    const wind = render(
      <MapLegend {...BASE} sortBy="wind_max_mph" markerScale={rankedScale('wind_max_mph')} hasColoredMarkers />,
    )
    expect(wind.container.textContent).toContain(`${NOUN.wind} (${UNIT.wind})`)
    expect(wind.container.textContent).not.toContain(WIND_GUST)
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
