import { describe, expect, it } from 'vitest'
// @ts-expect-error node builtin, untyped in this project
import { readFileSync, statSync } from 'fs'
// @ts-expect-error node builtin, untyped in this project
import { dirname, join } from 'path'
// @ts-expect-error node builtin, untyped in this project
import { fileURLToPath } from 'url'

// Same `?raw` idiom legal.test.ts and styles.test.ts use: the files are read as
// text, so this stays a pure node test with no DOM.
import app from './App.tsx?raw'
import mapView from './components/MapView.tsx?raw'
import { AIR_QUALITY_URL, FORECAST_URL } from './utils/openMeteo'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoFile = (...parts: string[]) => join(__dirname, '..', ...parts)
const indexHtml = readFileSync(repoFile('index.html'), 'utf-8')

// What the entry document promises to warm. Pulled out of the sources rather
// than spelled here, so moving an endpoint fails this test instead of quietly
// leaving a hint pointed at a host nothing calls (issue #337, finding 1).
const styleUrl = /const STYLE = '([^']+)'/.exec(mapView)?.[1]

describe('preconnect hints', () => {
  it('warms every host the first screen and the first analysis need', () => {
    expect(styleUrl).toBeTruthy()
    const hosts = [styleUrl!, FORECAST_URL, AIR_QUALITY_URL].map((u) => new URL(u).origin)
    for (const origin of hosts) {
      // crossorigin is not decoration: all three are read with `fetch`, which
      // opens an anonymous CORS connection, and a preconnect without the
      // attribute warms a connection those fetches cannot reuse.
      expect(indexHtml).toContain(`<link rel="preconnect" href="${origin}" crossorigin />`)
    }
  })

  it('warms nothing the first screen does not call', () => {
    // A preconnect costs a socket and a TLS handshake whether or not the host
    // is ever used, so the archive endpoint (only a window that reaches the
    // past) and the radar tiles (only an overlay the reader switches on) stay
    // out. Read the hints themselves rather than the document, because the
    // comment beside them names the hosts it explains.
    const hinted = [...indexHtml.matchAll(/rel="preconnect" href="([^"]+)"/g)].map((m) => m[1])
    expect(hinted).toHaveLength(3)
    expect(hinted).not.toContain('https://archive-api.open-meteo.com')
    expect(hinted).not.toContain('https://mesonet.agron.iastate.edu')
  })
})

describe('the chart is not in the entry chunk', () => {
  it('imports TimeSeriesChart lazily', () => {
    // recharts is ~105 KB gzip. The map is the first thing on screen and the
    // chart is not, so a reader who never opens one must not pay for it.
    expect(app).toContain("lazy(() => import('./components/TimeSeriesChart'))")
    expect(app).not.toContain("import TimeSeriesChart from './components/TimeSeriesChart'")
  })
})

// Byte budgets, not exact sizes: a re-export of an image is allowed to move a
// few hundred bytes, and a rewrite that puts the 1.4 MB original back is not.
// The numbers are the measured sizes plus room (issue #337).
const budgets: [string, number][] = [
  // Drawn at 80px in the panel header. 256px covers a 3x screen.
  ['src/assets/logo.webp', 16_000],
  // The Open Graph card and the iOS home-screen icon: 1024px, and no part of
  // a page load. It was 1,474,730 bytes before pngquant.
  ['public/icon.png', 200_000],
  ['public/favicon-32.png', 4_000],
  // The 404 page's picture, the one image a reader sees at full width.
  ['public/not-found.webp', 60_000],
]

describe('image budgets', () => {
  it.each(budgets)('%s stays under its budget', (path, limit) => {
    expect(statSync(repoFile(path)).size).toBeLessThanOrEqual(limit)
  })

  it('draws the logo from the hashed asset, never from public/', () => {
    // `public/icon.png` keeps a stable unhashed name so a scraper can find it,
    // and the cache-header middleware answers `no-cache` for exactly that
    // reason (#354). Anything the app draws should carry a content hash.
    const sources = import.meta.glob(['./components/*.tsx', '!./components/*.test.tsx'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    for (const [name, source] of Object.entries({ './App.tsx': app, ...sources })) {
      expect(source, name).not.toContain('"/icon.png"')
    }
    // The entry documents are the exception: og:image needs an absolute URL.
    expect(indexHtml).toContain('href="/icon.png"')
  })
})
