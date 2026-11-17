import { describe, expect, it } from 'vitest'
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'fs'
// @ts-expect-error node builtin, untyped in this project
import { dirname, join } from 'path'
// @ts-expect-error node builtin, untyped in this project
import { fileURLToPath } from 'url'
import { LIGHT_QUERY } from './hooks/useTheme'
import { THEME_KEY } from './utils/viewPrefs'

// `public/theme.js` is the one script that runs before the first paint
// (#706): a classic script, outside the bundle, so nothing but this test ties
// it to the module the app writes the theme through. Read as text, the way
// coldLoad.test.ts reads index.html.
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoFile = (...parts: string[]) => join(__dirname, '..', ...parts)
const script = readFileSync(repoFile('public', 'theme.js'), 'utf-8')
const PAGES = ['index.html', 'privacy/index.html', 'terms/index.html', '404.html']

describe('the theme before the first paint (#706)', () => {
  it('reads the key the app writes', () => {
    const keys = [...script.matchAll(/['"](bluebird_forecast_[a-z_]+)['"]/g)].map((m) => m[1])
    expect(keys).toEqual([THEME_KEY])
  })

  // The stored choice wins, and with none stored (or a value no build wrote)
  // the device's own setting decides, as `readThemeChoice` and `useTheme` do
  // (#843). The script is run, with a stand-in storage, root and media query,
  // rather than read: a pattern over its text cannot tell `=== 'light'` from
  // `=== 'light' || true`.
  it('marks the root light on a stored light, or on a light device with no choice stored', () => {
    const run = (getItem: (key: string) => string | null, deviceLight = false) => {
      const doc = { documentElement: { dataset: {} as Record<string, string> } }
      const asked: string[] = []
      const matchMedia = (query: string) => {
        asked.push(query)
        return { matches: deviceLight && query === LIGHT_QUERY }
      }
      new Function('localStorage', 'document', 'matchMedia', script)({ getItem }, doc, matchMedia)
      return { theme: doc.documentElement.dataset.theme, asked }
    }
    const stored = (value: string | null) => (key: string) => (key === THEME_KEY ? value : null)
    expect(run(stored('light')).theme).toBe('light')
    expect(run(stored('light'), true).theme).toBe('light')
    expect(run(stored('dark')).theme).toBeUndefined()
    // A chosen dark holds on a light device, without asking it.
    expect(run(stored('dark'), true)).toEqual({ theme: undefined, asked: [] })
    expect(run(stored(null)).theme).toBeUndefined()
    expect(run(stored(null), true)).toEqual({ theme: 'light', asked: [LIGHT_QUERY] })
    expect(run(stored('sepia'), true).theme).toBe('light')
    // A storage that throws (a private window, blocked site data) leaves the
    // page dark rather than failing the load.
    let theme: string | undefined = 'unset'
    expect(() => {
      theme = run(() => {
        throw new Error('blocked')
      }, true).theme
    }).not.toThrow()
    expect(theme).toBeUndefined()
  })

  // Small, because it blocks the paint it exists to get ahead of.
  it('stays a few hundred bytes with no module syntax', () => {
    expect(script.length).toBeLessThan(400)
    expect(script).not.toMatch(/\b(import|export)\b/)
  })

  // Every entry, ahead of its module script, which is where Vite puts the
  // stylesheet link. A same-origin file, because the CSP's `script-src 'self'`
  // allows that and refuses an inline script.
  // Every <script> opening tag without a src, found by walking the lowercased
  // document rather than by a pattern, because a pattern written for one
  // spelling misses `<SCRIPT>` or a tag carrying attributes, and an inline
  // script is exactly what the CSP would refuse (CodeQL's bad-tag-filter
  // finding on #733).
  function inlineScripts(html: string): string[] {
    const lower = html.toLowerCase()
    const found: string[] = []
    for (let at = lower.indexOf('<script'); at !== -1; at = lower.indexOf('<script', at + 1)) {
      const end = lower.indexOf('>', at)
      const tag = lower.slice(at, end === -1 ? undefined : end + 1)
      if (!/\ssrc\s*=/.test(tag)) found.push(tag)
    }
    return found
  }

  it.each(PAGES)('runs in %s before anything that paints', (page) => {
    const html = readFileSync(repoFile(page), 'utf-8')
    const at = html.indexOf('<script src="/theme.js"></script>')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(html.indexOf('<script type="module"'))
    expect(at).toBeLessThan(html.indexOf('<body'))
    expect(inlineScripts(html)).toEqual([])
  })
})
