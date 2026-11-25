import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Theme, type ThemeChoice, readThemeChoice, writeThemeChoice } from '../utils/viewPrefs'

/**
 * The root's class while a theme switch lands, which `index.css` turns every
 * transition off under (#786).
 */
export const THEME_SWITCHING_CLASS = 'theme-switching'

/**
 * The device's own setting, which `System` follows (#843). This module is the
 * one place in `src/` that asks for it: the linter's `style-no-os-theme`
 * check fails the query anywhere else, so every colour still keys on the
 * root's `data-theme` and nothing paints by the device behind the menu's back.
 * `public/theme.js` spells it again, outside the bundle, for the first paint.
 */
export const LIGHT_QUERY = '(prefers-color-scheme: light)'

const deviceLight = () => matchMedia(LIGHT_QUERY).matches

/**
 * The theme the app paints in (#706, #843; records 0158 and 0303): the one
 * this browser chose in the theme menu, or the device's own while it chose
 * none or chose `System`, and the setter the menu calls.
 *
 * The theme itself is CSS: `index.css` gives every token a light value under
 * `data-theme="light"` on the root, so writing that attribute repaints every
 * class in one style recalculation with no component re-rendering for it. The
 * chart's colours and the ranked cells' ink, which are SVG attributes and
 * inline styles rather than classes, carry both themes' values at once and
 * let the root's colour scheme pick (`themed`, #786), so they re-render for
 * a switch no more than a class does. The choice is React state for the one
 * thing that must: the menu's own glyph and its current row.
 *
 * While the choice is `System` the hook listens to the query's `change`, so a
 * device that turns dark at sunset repaints the open app, through the same
 * layout effect and the same held transitions as a press. It listens only
 * then: a chosen theme ignores the device.
 *
 * A switch holds every CSS transition off for the frame it lands in
 * (`THEME_SWITCHING_CLASS`, #786): a colour that changed with the theme
 * would otherwise start a fade on every row, nearly 5,000 transitions at 946
 * rows, and starting them nearly doubled the switch: the first frame after
 * the press came 552 ms after it with them and 307 ms without (measured
 * 2026-10-21, record 0211).
 *
 * A layout effect rather than an effect, so the attribute and the components
 * that read the value change in the same frame: a passive effect would paint
 * one frame of light chrome around a dark chart. On the first render the
 * attribute is already right, because `public/theme.js` wrote it before the
 * stylesheet loaded; the effect agrees with it rather than racing it.
 */
export function useTheme(): { choice: ThemeChoice; theme: Theme; setChoice: (choice: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(readThemeChoice)
  const [systemLight, setSystemLight] = useState(deviceLight)
  const theme: Theme = choice === 'system' ? (systemLight ? 'light' : 'dark') : choice
  // Whether the effect below has run, so the first run, which agrees with
  // `theme.js` rather than switching, holds nothing off.
  const mounted = useRef(false)

  // Read again on the way into `System`, since the device may have changed
  // while a chosen theme was not listening.
  useEffect(() => {
    if (choice !== 'system') return
    const query = matchMedia(LIGHT_QUERY)
    const follow = () => setSystemLight(query.matches)
    follow()
    query.addEventListener('change', follow)
    return () => query.removeEventListener('change', follow)
  }, [choice])

  useLayoutEffect(() => {
    const root = document.documentElement
    const switching = mounted.current
    mounted.current = true
    if (switching) root.classList.add(THEME_SWITCHING_CLASS)
    // Removed rather than set to `dark`: the absence is dark, which is also
    // all `theme.js` ever leaves on a dark load.
    if (theme === 'light') root.dataset.theme = 'light'
    else delete root.dataset.theme
    if (!switching) return
    // Resolve the page's style under the new tokens now, while transitions
    // are held off, so every colour lands changed rather than starting a
    // fade. The class comes off in the next frame, when nothing is changing.
    void getComputedStyle(root).color
    const frame = requestAnimationFrame(() => root.classList.remove(THEME_SWITCHING_CLASS))
    return () => {
      cancelAnimationFrame(frame)
      root.classList.remove(THEME_SWITCHING_CLASS)
    }
  }, [theme])

  // Written on the pick rather than from an effect, so a mount that merely
  // read the stored choice writes nothing back. Stable, because the menu it
  // is handed to sits in the panel header beside props that are.
  const setChoice = useCallback((next: ThemeChoice) => {
    writeThemeChoice(next)
    setChoiceState(next)
  }, [])

  return { choice, theme, setChoice }
}
