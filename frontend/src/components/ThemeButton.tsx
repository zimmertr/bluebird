import { IconMoon, IconSun } from './icons'
import { HEADER_BUTTON } from '../styles'
import type { Theme } from '../utils/viewPrefs'

/**
 * The theme switch (#706; record 0156): a round button in the panel's header
 * at a desk, beside the close button, and in the Controls sheet's title row
 * on a phone, beside Done.
 *
 * The glyph is the theme a press goes TO, a sun while dark and a moon while
 * light, and the name says the same in words. A plain button rather than a
 * pressed toggle: `aria-pressed` would announce one state as on or off, where
 * this moves between two themes, and a name that says what the press does is
 * the whole of what a screen reader needs. No visible label and no tooltip,
 * which a phone could not show.
 */
export default function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const toLight = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      className={HEADER_BUTTON}
    >
      {toLight ? <IconSun /> : <IconMoon />}
    </button>
  )
}
