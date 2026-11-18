import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import PanelSection from './PanelSection'
import { render } from '../testSupport/render'
import { CARD_SECTION, TEXT } from '../styles'

// One of the controls' three sections under its heading (#825; record 0305):
// plain on a phone, and in a desk's card a button that opens the section and
// collapses it to a line saying what it is set to.
describe('PanelSection', () => {
  it('is a heading over its controls where it is handed no fold', () => {
    render(
      <PanelSection data-tour="forecast" heading="Forecast" summary="Current · NOAA GFS">
        <input aria-label="Model" />
      </PanelSection>,
    )
    const heading = screen.getByRole('heading', { name: 'Forecast' })
    expect(heading.className).toBe(`${TEXT.section} mb-2.5`)
    expect(heading.closest('section')?.getAttribute('data-tour')).toBe('forecast')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Current · NOAA GFS')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Model' })).toBeTruthy()
  })

  it('collapses to its summary line under a heading that opens it', async () => {
    const onToggle = vi.fn()
    const { user } = render(
      <PanelSection data-tour="forecast" heading="Forecast" summary="Current · NOAA GFS" fold={{ open: false, onToggle }}>
        <input aria-label="Model" />
      </PanelSection>,
    )
    const head = screen.getByRole('button', { name: 'Forecast Current · NOAA GFS' })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(head.className).toBe(CARD_SECTION.head)
    expect(head.parentElement?.tagName).toBe('H2')
    // The controls stay mounted, hidden, under the id the button names.
    const body = document.getElementById(head.getAttribute('aria-controls')!)!
    expect(body.className).toBe('hidden')
    expect(body.querySelector('input')).toBeTruthy()
    await user.click(head)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows its controls and no summary while open', () => {
    render(
      <PanelSection
        data-tour="metrics"
        heading="Metrics"
        summary="AQI · Lowest · 200"
        fold={{ open: true, onToggle: () => {} }}
      >
        <input aria-label="Rows" />
      </PanelSection>,
    )
    const head = screen.getByRole('button', { name: 'Metrics' })
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText('AQI · Lowest · 200')).toBeNull()
    expect(document.getElementById(head.getAttribute('aria-controls')!)?.className).toBe(CARD_SECTION.body)
    expect(screen.getByRole('textbox', { name: 'Rows' })).toBeTruthy()
  })
})
