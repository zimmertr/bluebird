import type { ReactNode } from 'react'
import { IconMoon, IconSun, IconSunMoon } from './icons'
import { MenuSelect } from './Menu'
import type { ThemeChoice } from '../utils/viewPrefs'

// The words, approved by the maintainer on 2026-11-16 (#843): the control's
// name, which is also a phone sheet's heading, and the three rows, the
// default first.
const THEME_LABEL = 'Theme'
const CHOICES = [
  { value: 'system', label: 'System', icon: <IconSunMoon /> },
  { value: 'light', label: 'Light', icon: <IconSun /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon /> },
] as const satisfies readonly { value: ThemeChoice; label: string; icon: ReactNode }[]

/**
 * The theme menu (#843; record 0302): the round button in the panel's header
 * at a desk, beside the close button, and in the Controls sheet's title row
 * on a phone, beside Done. It wears the glyph of the current choice, a sun
 * and a moon split by a diagonal for System, a sun for Light and a moon for
 * Dark, and opens the
 * app's one menu with the three, each row leading with its glyph so a reader
 * learns what the button shows. On a phone the rows stand in a bottom sheet
 * headed Theme, as every phone menu does.
 *
 * A menu rather than the toggle it replaced (#706): three choices do not fit
 * one press, and a cycle would hide what the next press does. It is
 * `MenuSelect` in the `header` shape, so it keeps the listbox's keyboard and
 * names itself by the label and the current choice, `Theme System`. No
 * visible label and no tooltip, which a phone could not show.
 */
export default function ThemeMenu({
  choice,
  onChoice,
  sheet = false,
}: {
  choice: ThemeChoice
  onChoice: (choice: ThemeChoice) => void
  /** A phone, whose rows open in a bottom sheet. */
  sheet?: boolean
}) {
  return (
    <MenuSelect
      label={THEME_LABEL}
      value={choice}
      options={CHOICES}
      onChange={onChoice}
      shape="header"
      className=""
      sheet={sheet}
    />
  )
}
