import { useCallback, useLayoutEffect, useState } from 'react'
import { type Theme, readTheme, writeTheme } from '../utils/viewPrefs'

/**
 * The theme the app paints in (#706; record 0156): dark unless this browser
 * chose light, and the one switch that changes it.
 *
 * The theme itself is CSS: `index.css` gives every token a light value under
 * `data-theme="light"` on the root, so writing that attribute repaints every
 * class in one style recalculation with no component re-rendering for it. The
 * value is still React state, because three things cannot read a variable:
 * the chart's lines and chrome are SVG presentation attributes, the ranked
 * cells' ink is an inline style computed per number, and the button's own
 * glyph and name say which theme a press goes to.
 *
 * A layout effect rather than an effect, so the attribute and the components
 * that read the value change in the same frame: a passive effect would paint
 * one frame of light chrome around a dark chart. On the first render the
 * attribute is already right, because `public/theme.js` wrote it before the
 * stylesheet loaded; the effect agrees with it rather than racing it.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useLayoutEffect(() => {
    // Removed rather than set to `dark`: the absence is the default, which is
    // also all `theme.js` ever leaves on a dark load.
    if (theme === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
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
