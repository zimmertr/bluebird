import { describe, expect, it } from 'vitest'
// @ts-expect-error node builtin, untyped in this project
import { readFileSync } from 'fs'
// @ts-expect-error node builtin, untyped in this project
import { dirname, join } from 'path'
// @ts-expect-error node builtin, untyped in this project
import { fileURLToPath } from 'url'

// `public/viewport.js` takes `viewport-fit=cover` back off the app's page on
// Android before the first layout (#837; record 0262): a classic script
// outside the bundle, so this test runs it with stand-ins for the browser,
// the way theme.test.ts runs theme.js.
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoFile = (...parts: string[]) => join(__dirname, '..', ...parts)
const script = readFileSync(repoFile('public', 'viewport.js'), 'utf-8')
const html = readFileSync(repoFile('index.html'), 'utf-8')
const CONTENT = html.match(/<meta name="viewport" content="([^"]+)"/)![1]

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const DESK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function run(userAgent: string): string {
  let content = CONTENT
  const meta = { getAttribute: () => content, setAttribute: (_: string, value: string) => (content = value) }
  const doc = { querySelector: (selector: string) => (selector === 'meta[name="viewport"]' ? meta : null) }
  new Function('navigator', 'document', script)({ userAgent }, doc)
  return content
}

describe('the viewport on Android (#837)', () => {
  it('asks for the whole screen in the page itself, for an iPhone', () => {
    expect(CONTENT).toContain('viewport-fit=cover')
  })

  it('takes cover off on Android and leaves every other part', () => {
    for (const ua of [FIREFOX_ANDROID, CHROME_ANDROID]) {
      expect(run(ua)).toBe(CONTENT.replace(', viewport-fit=cover', ''))
      expect(run(ua)).toContain('width=device-width')
    }
  })

  it('leaves an iPhone and a desk as the page says', () => {
    expect(run(IPHONE)).toBe(CONTENT)
    expect(run(DESK)).toBe(CONTENT)
  })

  // Small and classic, because it blocks the parse; right under the tag it
  // edits, so no layout can read the tag before it does.
  it('runs right under the viewport tag, small, with no module syntax', () => {
    expect(script.length).toBeLessThan(600)
    expect(script).not.toMatch(/\b(import|export)\b/)
    const meta = html.indexOf('<meta name="viewport"')
    const at = html.indexOf('<script src="/viewport.js"></script>')
    expect(at).toBeGreaterThan(meta)
    expect(html.slice(meta, at)).not.toMatch(/<(link|style|script)\b/)
    expect(at).toBeLessThan(html.indexOf('<script type="module"'))
  })
})
