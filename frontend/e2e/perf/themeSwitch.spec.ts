import { test, expect, resultRows, peak, destinationsAnswer } from '../fixtures'
import type { Page } from '@playwright/test'

// What a theme switch costs (the maintainer, 2026-10-21: "almost 1 second"):
// the main thread from the press until two task yields later, which is
// React's synchronous work for the press; the time until the first frame
// painted after it, which adds the style recalculation and layout of the
// whole document under the new tokens; and the time until every colour
// transition the switch started has finished, which is when the page stops
// changing. Five states: no report, a 946-destination report in Table mode
// and in Both mode with every line charted, and the same cut to 200 rows in
// Both and in Table.

const DESTINATIONS = 946
const SAMPLES = 5
const RING = '-121.9,47.4;-121.5,47.4;-121.5,47.7;-121.9,47.7'

function field() {
  const columns = Math.ceil(Math.sqrt(DESTINATIONS))
  return Array.from({ length: DESTINATIONS }, (_, i) =>
    peak({
      name: `Probe ${i + 1}`,
      latitude: Number((47.42 + Math.floor(i / columns) * 0.008).toFixed(5)),
      longitude: Number((-121.88 + (i % columns) * 0.012).toFixed(5)),
      elevation_ft: 3000 + ((i * 37) % 6000),
      osm_id: `node/${10_000 + i}`,
    }),
  )
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

// One press on the theme button, timed inside the page. `syncMs` is the
// dispatch to two task yields later; `frameMs` the dispatch to the second
// animation frame after it, by which the first frame has painted; `settledMs`
// the dispatch to the end of the last CSS transition it started, and
// `transitions` how many it started; `longMs` the long tasks observed, summed.
function pressTheme(
  page: Page,
): Promise<{ syncMs: number; frameMs: number; settledMs: number; transitions: number; longMs: number; nodes: number }> {
  return page.evaluate(async () => {
    const button = document.querySelector('button[aria-label^="Switch to"]') as HTMLButtonElement
    const yieldTask = () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(null)
      })
    const frames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    let longMs = 0
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longMs += entry.duration
    })
    observer.observe({ type: 'longtask', buffered: false })
    const t0 = performance.now()
    button.click()
    await yieldTask()
    await yieldTask()
    const syncMs = performance.now() - t0
    await frames()
    const frameMs = performance.now() - t0
    const transitions = document.getAnimations().filter((a) => a instanceof CSSTransition)
    await Promise.all(transitions.map((a) => a.finished.catch(() => undefined)))
    const settledMs = performance.now() - t0
    await yieldTask()
    observer.disconnect()
    return {
      syncMs,
      frameMs,
      settledMs,
      transitions: transitions.length,
      longMs,
      nodes: document.getElementsByTagName('*').length,
    }
  })
}

async function sample(page: Page, label: string) {
  const sync: number[] = []
  const frame: number[] = []
  const settled: number[] = []
  const long: number[] = []
  let nodes = 0
  let transitions = 0
  for (let i = 0; i < SAMPLES * 2; i++) {
    const r = await pressTheme(page)
    sync.push(r.syncMs)
    frame.push(r.frameMs)
    settled.push(r.settledMs)
    long.push(r.longMs)
    nodes = r.nodes
    transitions = Math.max(transitions, r.transitions)
    await page.waitForTimeout(400)
  }
  const result = {
    label,
    nodes,
    transitions,
    syncMs: Math.round(median(sync)),
    frameMs: Math.round(median(frame)),
    settledMs: Math.round(median(settled)),
    longMs: Math.round(median(long)),
  }
  console.log(`theme switch: ${JSON.stringify(result)}`)
  return result
}

test('theme switch cost with no report, 946 rows and 200 rows, table and both', async ({ page }, testInfo) => {
  const destinations = field()
  await page.route('**/api/destinations', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(destinationsAnswer(destinations)) }),
  )
  await page.goto(`/?type=peak&limit=1500&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const results: unknown[] = []
  results.push(await sample(page, 'no report'))

  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${DESTINATIONS} of ${DESTINATIONS})` })).toHaveCount(1)
  await expect(resultRows(page)).toHaveCount(DESTINATIONS)
  await page.getByRole('button', { name: 'Show table only' }).click()
  results.push(await sample(page, '946 rows, table'))

  await page.getByRole('button', { name: 'Show both chart and table' }).click()
  await expect(page.locator('[data-tour="chart"] canvas').first()).toBeVisible() // the lines' canvas (record 0256)
  results.push(await sample(page, '946 rows, both'))

  await page.locator('#max-results').fill('200')
  await expect(resultRows(page)).toHaveCount(200)
  await expect(page.locator('[data-tour="chart"] canvas').first()).toBeVisible() // the lines' canvas (record 0256)
  results.push(await sample(page, '200 rows, both'))

  await page.getByRole('button', { name: 'Show table only' }).click()
  results.push(await sample(page, '200 rows, table'))

  await testInfo.attach('theme-switch.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
})
