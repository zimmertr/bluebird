import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { type Theme, readTheme, writeTheme } from '../utils/viewPrefs'

/**
 * The root's class while a theme switch lands, which `index.css` turns every
 * transition off under (#786).
 */
export const THEME_SWITCHING_CLASS = 'theme-switching'

/**
 * The theme the app paints in (#706; record 0158): dark unless this browser
 * chose light, and the one switch that changes it.
 *
 * The theme itself is CSS: `index.css` gives every token a light value under
 * `data-theme="light"` on the root, so writing that attribute repaints every
 * class in one style recalculation with no component re-rendering for it. The
 * chart's colours and the ranked cells' ink, which are SVG attributes and
 * inline styles rather than classes, carry both themes' values at once and
 * let the root's colour scheme pick (`themed`, #786), so they re-render for
 * a switch no more than a class does. The value is still React state for the
 * one thing that must: the button's own glyph and name, which say which
 * theme a press goes to.
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
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readTheme)
  // Whether the effect below has run, so the first run, which agrees with
  // `theme.js` rather than switching, holds nothing off.
  const mounted = useRef(false)

  useLayoutEffect(() => {
    const root = document.documentElement
    const switching = mounted.current
    mounted.current = true
    if (switching) root.classList.add(THEME_SWITCHING_CLASS)
    // Removed rather than set to `dark`: the absence is the default, which is
    // also all `theme.js` ever leaves on a dark load.
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

  // Written on the press rather than from the effect, so a mount that merely
  // read the stored theme writes nothing back. Stable, because the button it
  // is handed to sits in the panel header beside props that are.
  const toggleTheme = useCallback(() => {
    setTheme((was) => {
      const next: Theme = was === 'dark' ? 'light' : 'dark'
      writeTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
