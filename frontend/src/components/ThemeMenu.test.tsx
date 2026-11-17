import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import ThemeMenu from './ThemeMenu'
import { IconMonitor, IconMoon, IconSun } from './icons'
import { render } from '../testSupport/render'
import { mediaList } from '../testSupport/mediaList'
import { useTheme } from '../hooks/useTheme'
import { THEME_KEY, type ThemeChoice } from '../utils/viewPrefs'
import { MENU_TRIGGER } from '../styles'

// The menu wired to the hook the way App wires it, so a pick is followed
// through the name, the glyph, the root's attribute and the stored key.
function Harness() {
  const { choice, setChoice } = useTheme()
  return <ThemeMenu choice={choice} onChoice={setChoice} />
}

const glyph = (el: HTMLElement) => el.querySelector('svg')!

describe('ThemeMenu (#843)', () => {
  beforeEach(() => {
    mediaList(false)
  })
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    vi.unstubAllGlobals()
  })

  // The trigger wears the current choice's glyph and is named by the label
  // and the choice. Each glyph is compared with its icon drawn on its own, so
  // a redrawn one still passes and a swapped pair does not.
  it.each([
    ['system', 'Theme System', IconMonitor],
    ['light', 'Theme Light', IconSun],
    ['dark', 'Theme Dark', IconMoon],
  ] as const)('wears the %s glyph and says so in its name', (choice, name, Icon) => {
    const drawn = render(<Icon />).container.firstElementChild!
    render(<ThemeMenu choice={choice as ThemeChoice} onChoice={() => {}} />)
    const button = screen.getByRole('button', { name })
    expect(glyph(button).isEqualNode(drawn)).toBe(true)
    expect(glyph(button).getAttribute('aria-hidden')).toBe('true')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
  })

  // The header's round button in the one trigger's shape, with no chevron
  // and no tooltip a phone could not show.
  it('is the header trigger, with no chevron and no title', () => {
    render(<ThemeMenu choice="system" onChoice={() => {}} />)
    const button = screen.getByRole('button', { name: 'Theme System' })
    expect(button.className).toContain(MENU_TRIGGER.header)
    expect(button.getAttribute('aria-haspopup')).toBe('listbox')
    expect(button.hasAttribute('title')).toBe(false)
  })

  it('offers System, Light and Dark in that order, each leading with its glyph, the current one selected', async () => {
    const { user } = render(<ThemeMenu choice="light" onChoice={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Theme Light' }))
    const list = screen.getByRole('listbox', { name: 'Theme' })
    const rows = within(list).getAllByRole('option')
    expect(rows.map((r) => r.textContent)).toEqual(['System', 'Light', 'Dark'])
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    for (const row of rows) expect(row.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('stores a pick, paints it, closes, and a remount keeps it', async () => {
    const { user, unmount } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Theme System' }))
    await user.click(screen.getByRole('option', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(screen.queryByRole('listbox')).toBeNull()
    unmount()

    const again = render(<Harness />)
    await again.user.click(screen.getByRole('button', { name: 'Theme Light' }))
    await again.user.click(screen.getByRole('option', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: 'Theme System' })).toBeTruthy()
  })

  // A phone's rows stand in a bottom sheet headed Theme (record 0136).
  it('opens a sheet headed Theme on a phone', async () => {
    const onChoice = vi.fn()
    const { user } = render(<ThemeMenu choice="system" onChoice={onChoice} sheet />)
    const button = screen.getByRole('button', { name: 'Theme System' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    await user.click(button)
    const sheet = screen.getByRole('dialog', { name: 'Theme' })
    await user.click(within(sheet).getByRole('option', { name: 'Dark' }))
    expect(onChoice).toHaveBeenCalledExactlyOnceWith('dark')
  })
})
