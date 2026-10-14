import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import PageShell from './PageShell'
import { render } from '../testSupport/render'
import { BUTTON_SECONDARY } from '../styles'

// The frame /privacy, /terms and the 404 share. #687 made its way back a
// button under the card, with the words it had as a caption link.
describe('PageShell', () => {
  it('offers the way back as a secondary button under the card', () => {
    render(
      <PageShell heading="Page not found" subtitle="Bluebird Forecast">
        <p>Body</p>
      </PageShell>,
    )
    const back = screen.getByText('Back to Bluebird Forecast')
    expect(back.tagName).toBe('A')
    expect(back.getAttribute('href')).toBe('/')
    expect(back.className).toBe(BUTTON_SECONDARY)
  })
})
