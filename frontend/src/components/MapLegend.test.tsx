import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { useId, type ComponentProps } from 'react'
import MapLegend, { LegendSections, legendSections, type LegendInputs } from './MapLegend'
import { render } from '../testSupport/render'
import { rankedScale } from '../utils/colors'
import { SMOKE_DENSITIES } from '../utils/smoke'
import { readViewPrefs } from '../utils/viewPrefs'

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
  initiallyOpen: true,
}
// The box as a desk draws it, from the inputs every surface reads: the
// sections are `legendSections`' since #696, which a phone's Legend sheet
// draws too.
function Legend(props: LegendInputs & Omit<ComponentProps<typeof MapLegend>, 'sections'>) {
  const id = useId()
  return <MapLegend {...props} sections={legendSections(props, id)} />
}

describe('MapLegend', () => {
  // The button stays and greys, the way a phone's chip does (#696), so the
  // column keeps one shape; there is no card to unfold.
  it('greys its button and draws no card when nothing on the map is coloured or switched on', () => {
    const { container } = render(<Legend {...BASE} />)
    const button = screen.getByRole('button', { name: 'Legend' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).toBe('Legend')
  })

  // Alphabetical by what each section reads, the metric key included.
  it('sorts the sections by their labels, the metric key among them', () => {
    const { container } = render(<Legend {...BASE} hasColoredMarkers overlays={SMOKE_AND_RADAR} />)
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
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    for (const density of SMOKE_DENSITIES) {
      const chip = screen.getByTitle(density)
      expect(chip.textContent).toBe(`${density[0]}${density}`)
      expect(document.getElementById(chip.getAttribute('aria-describedby')!)!.textContent).toBe(density)
    }
  })

  // Colours over a field of N/A explain nothing, so the key stays away.
  it('leaves the metric key out when the ranked metric has no value on screen', () => {
    render(<Legend {...BASE} hasColoredMarkers rankedFieldHasValue={false} overlays={SMOKE_AND_RADAR} />)
    expect(screen.queryByText(/Temperature/)).toBeNull()
    expect(screen.getByText(/Smoke/)).toBeTruthy()
  })

  // The markers alone are no reason for a box when their key is the one
  // section they would have brought: an empty box reads as a fault.
  it('draws no card when the ranked metric has no value and no layer is on', () => {
    const { container } = render(<Legend {...BASE} hasColoredMarkers rankedFieldHasValue={false} />)
    expect(container.textContent).toBe('Legend')
  })

  // Every ranking paints since snowfall replaced snow depth (#678), the one
  // the grid could not (#579), so the grid row stands under a snowfall ranking.
  it('keeps the grid row under a snowfall ranking', () => {
    const PAINTED = { ...NO_GRID, gridPainted: true, gridLegend: { label: 'Forecast grid', value: '3 km', kind: 'pitch' as const } }
    const snowfall = render(
      <Legend {...BASE} sortBy="snowfall_total_in" markerScale={rankedScale('snowfall_total_in')} grid={PAINTED} />,
    )
    expect(snowfall.container.textContent).toContain('Forecast grid')
    expect(snowfall.container.textContent).toContain('Snowfall (in)')
  })

  it('credits NIFC beside the wildfire section', () => {
    render(<Legend {...BASE} overlays={{ ...NONE, showWildfires: true }} />)
    expect(screen.getByRole('link', { name: 'NIFC' })).toBeTruthy()
  })

  // Either closure layer alone is something to key, and each credits the
  // Forest Service in its own section.
  it('keys each closure layer on its own, credited to the Forest Service', () => {
    const { container } = render(<Legend {...BASE} overlays={{ ...NONE, showTrailClosures: true }} />)
    expect(container.textContent).toContain('Trail closures')
    expect(container.textContent).not.toContain('Area closures')
    expect(screen.getByRole('link', { name: 'USFS' }).getAttribute('href')).toBe(
      'https://www.fs.usda.gov/',
    )
  })

  it('sorts the area section first and the trail section after smoke', () => {
    const { container } = render(
      <Legend {...BASE} overlays={{ ...NONE, showAreaClosures: true, showTrailClosures: true, showSmoke: true }} />,
    )
    const text = container.textContent ?? ''
    expect(text.indexOf('Area closures')).toBeLessThan(text.indexOf('Smoke'))
    expect(text.indexOf('Smoke')).toBeLessThan(text.indexOf('Trail closures'))
    expect(screen.getAllByRole('link', { name: 'USFS' })).toHaveLength(2)
  })
})

// A phone's Legend sheet (#696) draws the same sections with no box around
// them, so a sheet and a desk cannot disagree about what is keyed.
describe('legendSections', () => {
  it('answers none when nothing is coloured or switched on, which greys the phone\'s chip', () => {
    expect(legendSections(BASE, 'id')).toEqual([])
  })

  it('draws the sections bare and in the box\'s order for the sheet', () => {
    const sections = legendSections({ ...BASE, hasColoredMarkers: true, overlays: SMOKE_AND_RADAR }, 'id')
    expect(sections.map((s) => s.label)).toEqual(['Rain radar', 'Smoke', 'Temperature (°F)'])
    const { container } = render(<LegendSections sections={sections} />)
    expect(container.children).toHaveLength(3)
    expect(container.textContent).toContain('Smoke')
  })
})

// A desk's legend is a button in the map's column with its card unfurled out
// of it (#696; record 0134's join), open until the reader folds it, and
// folded or open again on the next visit.
describe('the desk\'s Legend button', () => {
  it('unfurls the card out of the button, open by default', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    const button = screen.getByRole('button', { name: 'Legend' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('data-unfurled')).toBe('below')
    expect(button.nextElementSibling!.textContent).toContain('Smoke')
  })

  it('folds and unfolds on a press, and remembers which', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.queryByText(/Smoke/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Legend' }).getAttribute('data-unfurled')).toBeNull()
    expect(readViewPrefs().legendOpen).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.getByText(/Smoke/)).toBeTruthy()
    expect(readViewPrefs().legendOpen).toBe(true)
  })

  it('opens folded when the reader left it folded', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} initiallyOpen={false} />)
    expect(screen.getByRole('button', { name: 'Legend' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/Smoke/)).toBeNull()
  })
})
