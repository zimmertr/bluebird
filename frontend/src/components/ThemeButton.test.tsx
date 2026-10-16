import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import ThemeButton from './ThemeButton'
import { render } from '../testSupport/render'
import { useTheme } from '../hooks/useTheme'
import { THEME_KEY } from '../utils/viewPrefs'

// The button wired to the hook the way App wires it, so a press is followed
// through the name, the glyph, the root's attribute and the stored key.
function Harness() {
  const { theme, toggleTheme } = useTheme()
  return <ThemeButton theme={theme} onToggle={toggleTheme} />
}

const glyph = (button: HTMLElement) => button.querySelector('svg')!

describe('ThemeButton (#706)', () => {
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  // The glyph and the name are both the theme a press goes to.
  it('offers light with a sun while dark, and dark with a moon while light', () => {
    const { rerender } = render(<ThemeButton theme="dark" onToggle={() => {}} />)
    let button = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(glyph(button).querySelector('circle')).not.toBeNull()
    rerender(<ThemeButton theme="light" onToggle={() => {}} />)
    button = screen.getByRole('button', { name: 'Switch to dark theme' })
    expect(glyph(button).querySelector('circle')).toBeNull()
    expect(glyph(button).querySelector('path')).not.toBeNull()
  })

  // A plain button whose name says what it does: not a pressed toggle, and
  // no tooltip a phone could not show.
  it('carries no pressed state and no title, and hides its glyph', () => {
    render(<ThemeButton theme="dark" onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: 'Switch to light theme' })
    expect(button.hasAttribute('aria-pressed')).toBe(false)
    expect(button.hasAttribute('title')).toBe(false)
    expect(glyph(button).getAttribute('aria-hidden')).toBe('true')
  })

  it('flips the root, the name and the stored choice, and a remount keeps it', async () => {
    const { user, unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
    unmount()

    const again = render(<Harness />)
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy()
    await again.user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })
})
