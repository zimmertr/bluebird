import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import SkipLink from './SkipLink'
import { render } from '../testSupport/render'
import appSource from '../App.tsx?raw'

// The page's first Tab stop jumps the keyboard past the panel to the map (#576).
describe('SkipLink', () => {
  it('is the first Tab stop and moves the keyboard to its target', async () => {
    const { user } = render(
      <>
        <SkipLink targetId="target" />
        <button>Panel control</button>
        <main id="target" tabIndex={-1} />
      </>,
    )
    await user.tab()
    const link = screen.getByRole('link', { name: 'Skip to map' })
    expect(document.activeElement).toBe(link)
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('main'))
    // The fragment is not followed, so no `#` rides into a copied link.
    expect(window.location.hash).toBe('')
  })

  // The app renders it before anything else that can take focus, aimed at the
  // main landmark.
  it('stands first in the app and points at the main landmark', () => {
    const skip = appSource.indexOf('<SkipLink targetId={MAIN_ID} />')
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(appSource.indexOf('<PreviewBanner'))
    expect(appSource).toMatch(/<main\s+id=\{MAIN_ID\}/)
  })
})
