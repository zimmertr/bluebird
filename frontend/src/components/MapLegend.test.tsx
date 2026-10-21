import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { useId, type ComponentProps } from 'react'
import MapLegend, { LegendSections, legendSections, type LegendInputs } from './MapLegend'
import { render } from '../testSupport/render'
import { rankedScale } from '../utils/colors'
import { SMOKE_DENSITIES } from '../utils/smoke'
import { legendMaxCss } from '../utils/resultsSheet'
import { readViewPrefs, writeViewPrefs } from '../utils/viewPrefs'
import { IconChevron } from './icons'
import { MENU_CHEVRON } from '../styles'

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
  sheet: false,
  sheetLiftPx: 0,
  timelineShown: false,
  initiallyOpen: true,
}
// The chip and its key from the inputs every surface reads: the sections are
// `legendSections`' since #696, which a desk's card and a phone's Legend
// sheet both draw.
function Legend(props: LegendInputs & Omit<ComponentProps<typeof MapLegend>, 'sections'>) {
  const id = useId()
  return <MapLegend {...props} sections={legendSections(props, id)} />
}

describe('MapLegend', () => {
  // The chip stays and greys (#696), so the row keeps one shape; there is no
  // card to unfold.
  it('greys its chip and draws no card when nothing on the map is coloured or switched on', () => {
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

// A desk's legend is a chip in the map's row with its card standing under it
// (#714), open until the reader folds it, and folded or open again on the
// next visit. The chip keeps its pill whole and is lit while the card is out,
// as a phone's is (TJ, 2026-10-18).
describe('the desk\'s Legend chip', () => {
  it('opens the card under the chip, open by default', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    const button = screen.getByRole('button', { name: 'Legend' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.nextElementSibling!.textContent).toContain('Smoke')
  })

  // The card hangs from the chip inside the rows, so it reads the map's
  // height off the wrapper's size container and stops at the floor the
  // player's band or the plain gap keeps (`legendMaxCss`).
  it('caps the card at the map left below the rows, and scrolls past it', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} timelineShown />)
    const card = screen.getByRole('button', { name: 'Legend' }).nextElementSibling as HTMLElement
    // Read back through a style of its own, because the DOM normalizes the
    // calc's terms into its own order.
    const want = document.createElement('div')
    want.style.maxHeight = legendMaxCss(0, true)
    expect(want.style.maxHeight).not.toBe('')
    expect(card.style.maxHeight).toBe(want.style.maxHeight)
    expect(card.className).toContain('overflow-y-auto')
  })

  it('folds and unfolds on a press, and remembers which', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.queryByText(/Smoke/)).toBeNull()
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

  // A desk's card drops from its chip, so the chip carries a chevron: up
  // while the card is open, down while it is folded (TJ, 2026-10-18).
  it('points its chevron up while the card is open and down while it is folded', () => {
    render(<Legend {...BASE} overlays={SMOKE_AND_RADAR} />)
    const chevron = () => screen.getByRole('button', { name: 'Legend' }).querySelector('svg')!
    expect(chevron().classList).toContain(MENU_CHEVRON.chip)
    expect(chevron().getAttribute('aria-hidden')).toBe('true')
    expect(chevron().querySelector('polyline')!.getAttribute('points')).toBe(chevronPoints(true))
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    expect(chevron().querySelector('polyline')!.getAttribute('points')).toBe(chevronPoints(false))
  })
})

// The points `IconChevron` draws for one direction, read off the icon itself
// so the chip's tests do not restate its geometry.
function chevronPoints(up: boolean): string | null {
  const { container, unmount } = render(<IconChevron up={up} />)
  const points = container.querySelector('polyline')!.getAttribute('points')
  unmount()
  return points
}

// A phone's key is a bottom sheet (#696; record 0136), shut until asked for
// and never remembered.
describe('the phone\'s Legend chip', () => {
  const PHONE = { ...BASE, sheet: true }

  it('opens the keys in a sheet, shut at first whatever the desk remembers', () => {
    render(<Legend {...PHONE} overlays={SMOKE_AND_RADAR} />)
    const chip = screen.getByRole('button', { name: 'Legend' })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    // A sheet rises from below, so a phone's chip carries no chevron.
    expect(chip.querySelector('svg')).toBeNull()
    fireEvent.click(chip)
    const sheet = screen.getByRole('dialog', { name: 'Legend' })
    expect(sheet.textContent).toContain('Smoke')
    expect(screen.getByRole('button', { name: 'Legend' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not write the desk\'s fold', () => {
    writeViewPrefs({ legendOpen: true })
    render(<Legend {...PHONE} overlays={SMOKE_AND_RADAR} />)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    expect(readViewPrefs().legendOpen).toBe(true)
  })

  // A key that goes while its sheet is open takes the sheet with it, and the
  // next key does not bring the sheet back by itself.
  it('closes the sheet when the last key goes', () => {
    const { rerender } = render(<Legend {...PHONE} overlays={SMOKE_AND_RADAR} />)
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }))
    rerender(<Legend {...PHONE} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((screen.getByRole('button', { name: 'Legend' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<Legend {...PHONE} overlays={SMOKE_AND_RADAR} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
