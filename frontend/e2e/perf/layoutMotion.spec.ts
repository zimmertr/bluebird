import { test, expect, resultRows, peak, destinationsAnswer } from '../fixtures'
import type { Browser, Page } from '@playwright/test'

// What a desk's layout moves cost (#786; the maintainer, 2026-10-22: Table or
// Chart to Both "really laggy and slow", the panel's open "kind of sloppy and
// choppy"): the panel closing and opening, and the results panes changing on
// Table, Chart and Both, over a 200-row report with every line charted, in
// both themes. Each move is read frame by frame from the press: how long
// until the moving edge first moves (`startMs`), until it last moves
// (`endMs`), how many places it stood in between (`steps`), the longest wait
// between two frames from the press to the end (`worstMs`), and the main
// thread's work over the move by kind, from Chrome's trace (`mainMs`).

const DESTINATIONS = 200
const SAMPLES = 5
const RING = '-121.9,47.4;-121.5,47.4;-121.5,47.7;-121.9,47.7'
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 1)

function field() {
  const columns = Math.ceil(Math.sqrt(DESTINATIONS))
  return Array.from({ length: DESTINATIONS }, (_, i) =>
    peak({
      name: `Probe ${i + 1}`,
      latitude: Number((47.42 + Math.floor(i / columns) * 0.02).toFixed(5)),
      longitude: Number((-121.88 + (i % columns) * 0.025).toFixed(5)),
      elevation_ft: 3000 + ((i * 37) % 6000),
      osm_id: `node/${10_000 + i}`,
    }),
  )
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

interface Move {
  startMs: number
  endMs: number
  steps: number
  worstMs: number
}

// One press, read in every frame for `ms`: the panel's right edge, or the
// results' top for a pane move.
function press(page: Page, label: string, edge: 'panel' | 'results', ms: number): Promise<Move> {
  return page.evaluate(
    async ([name, which, windowMs]) => {
      const read =
        which === 'panel'
          ? () => document.querySelector('aside')!.getBoundingClientRect().right
          : () => document.querySelector('[data-tour="results"]')!.getBoundingClientRect().top
      const before = read()
      const t: number[] = []
      const v: number[] = []
      ;(document.querySelector(`button[aria-label="${name}"]`) as HTMLElement).click()
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          t.push(now)
          v.push(read())
          if (now - t0 < windowMs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      const first = v.findIndex((x) => Math.abs(x - before) > 0.5)
      let last = first
      for (let i = first + 1; i < v.length; i++) if (Math.abs(v[i] - v[i - 1]) > 0.5) last = i
      const gaps = [t[0] - t0, ...t.slice(1, last + 1).map((x, i) => x - t[i])]
      return {
        startMs: first < 0 ? -1 : Math.round(t[first] - t0),
        endMs: last < 0 ? -1 : Math.round(t[last] - t0),
        steps: first < 0 ? 0 : new Set(v.slice(first, last + 1).map((x) => Math.round(x))).size,
        worstMs: Math.round(Math.max(...gaps)),
      }
    },
    [label, edge, ms] as const,
  )
}

// Chrome's own account of the main thread over one press: the time each kind
// of work took, summed, for the kinds a layout move spends on.
const KINDS = ['FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit'] as const

async function traced(browser: Browser, page: Page, run: () => Promise<Move>) {
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] })
  const move = await run()
  const buffer = await browser.stopTracing()
  const events = (JSON.parse(buffer.toString()) as { traceEvents: { name: string; ph: string; dur?: number; tid: number; pid: number; args?: { name?: string } }[] }).traceEvents
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  const sums: Record<string, number> = {}
  for (const e of events) {
    if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== 'X' || !e.dur) continue
    if ((KINDS as readonly string[]).includes(e.name)) sums[e.name] = (sums[e.name] ?? 0) + e.dur / 1000
  }
  return { move, mainMs: Object.fromEntries(KINDS.map((k) => [k, Math.round(sums[k] ?? 0)])) }
}

async function sample(browser: Browser, page: Page, theme: string, label: string, edge: 'panel' | 'results', back?: string) {
  const moves: Move[] = []
  let mainMs: Record<string, number> = {}
  for (let i = 0; i < SAMPLES; i++) {
    if (i === SAMPLES - 1) {
      const r = await traced(browser, page, () => press(page, label, edge, 900))
      moves.push(r.move)
      mainMs = r.mainMs
    } else moves.push(await press(page, label, edge, 900))
    await page.waitForTimeout(500)
    if (back) {
      await page.locator(`button[aria-label="${back}"]`).click()
      await page.waitForTimeout(900)
    }
  }
  const pick = (k: keyof Move) => median(moves.map((m) => m[k]))
  const result = {
    theme,
    move: label,
    startMs: pick('startMs'),
    endMs: pick('endMs'),
    steps: pick('steps'),
    worstMs: pick('worstMs'),
    mainMs,
  }
  console.log(`layout motion x${CPU_SLOWDOWN}: ${JSON.stringify(result)}`)
  return result
}

for (const theme of ['dark', 'light'] as const) {
  test(`layout motion at a desk, ${theme}`, async ({ browser, page }, testInfo) => {
    if (theme === 'light') await page.addInitScript(() => localStorage.setItem('bluebird_forecast_theme', 'light'))
    await page.setViewportSize({ width: 1440, height: 900 })
    const destinations = field()
    await page.route('**/api/destinations', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(destinationsAnswer(destinations)) }),
    )
    await page.goto(`/?type=peak&limit=${DESTINATIONS}&poly=${RING}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.locator('aside').getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(resultRows(page)).toHaveCount(DESTINATIONS, { timeout: 300_000 })
    await page.locator('button[aria-label="Show both chart and table"]').click()
    await expect(page.locator('.recharts-line')).toHaveCount(DESTINATIONS)
    await page.waitForTimeout(1500)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

    const results = []
    // The panel, over Both.
    results.push(await sample(browser, page, theme, 'Close controls', 'panel', 'Open controls'))
    await page.locator('button[aria-label="Close controls"]').click()
    await page.waitForTimeout(900)
    results.push(await sample(browser, page, theme, 'Open controls', 'panel', 'Close controls'))
    await page.locator('button[aria-label="Open controls"]').click()
    await page.waitForTimeout(900)
    // The panes, each move and its way back.
    await page.locator('button[aria-label="Show table only"]').click()
    await page.waitForTimeout(900)
    results.push(await sample(browser, page, theme, 'Show both chart and table', 'results', 'Show table only'))
    await page.locator('button[aria-label="Show both chart and table"]').click()
    await page.waitForTimeout(900)
    results.push(await sample(browser, page, theme, 'Show table only', 'results', 'Show both chart and table'))
    await page.locator('button[aria-label="Show chart only"]').click()
    await page.waitForTimeout(900)
    results.push(await sample(browser, page, theme, 'Show both chart and table', 'results', 'Show chart only'))
    await page.locator('button[aria-label="Show both chart and table"]').click()
    await page.waitForTimeout(900)
    results.push(await sample(browser, page, theme, 'Show chart only', 'results', 'Show both chart and table'))
    await testInfo.attach(`layout-motion-${theme}.json`, {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
  })
}
