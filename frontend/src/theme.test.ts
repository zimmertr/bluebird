import { describe, expect, it } from 'vitest'
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'fs'
// @ts-expect-error node builtin, untyped in this project
import { dirname, join } from 'path'
// @ts-expect-error node builtin, untyped in this project
import { fileURLToPath } from 'url'
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

  // Light is the only value stored, and the only one the script acts on, so a
  // stray value reads as dark here as it does in `readTheme`.
  it('marks the root light on the stored light and on nothing else', () => {
    expect(script).toMatch(/=== 'light'/)
    expect(script).toMatch(/document\.documentElement\.dataset\.theme = 'light'/)
    // A storage that throws (a private window, blocked site data) leaves the
    // page dark rather than failing the load.
    expect(script).toMatch(/try \{[\s\S]*\} catch/)
  })

  // Small, because it blocks the paint it exists to get ahead of.
  it('stays a few hundred bytes with no module syntax', () => {
    expect(script.length).toBeLessThan(400)
    expect(script).not.toMatch(/\b(import|export)\b/)
  })

  // Every entry, ahead of its module script, which is where Vite puts the
  // stylesheet link. A same-origin file, because the CSP's `script-src 'self'`
  // allows that and refuses an inline script.
  it.each(PAGES)('runs in %s before anything that paints', (page) => {
    const html = readFileSync(repoFile(page), 'utf-8')
    const at = html.indexOf('<script src="/theme.js"></script>')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(html.indexOf('<script type="module"'))
    expect(at).toBeLessThan(html.indexOf('<body'))
    expect(html).not.toMatch(/<script>[^<]/)
  })
})
