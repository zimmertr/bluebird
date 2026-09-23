import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

// The two probes the memo rule in the root CLAUDE.md was measured with: an
// overlay toggle, which cannot change a row, a ranking or a chart line, and a
// keystroke in the coordinates box, which re-derives the pending list. Both
// at 946 destinations, every one displayed, so the table, the chart and the
// map each carry the whole field.
//
// What is timed is the main thread from the dispatch until two task yields
// later. React flushes a discrete event's render and its passive effects in
// that span, and a render an effect schedules lands in the first yield, so the
// span is the synchronous work the reader waits through. The overhead of the
// yields themselves is well under a millisecond.

const DESTINATIONS = 946
const SAMPLES = 7
// Wide enough that the grid below reads as a field on the map, and inside the
// published polygon cap.
const RING = '-121.9,47.4;-121.5,47.4;-121.5,47.7;-121.9,47.7'

function field() {
  const columns = Math.ceil(Math.sqrt(DESTINATIONS))
  return Array.from({ length: DESTINATIONS }, (_, i) => ({
    name: `Probe ${i + 1}`,
    type: 'peak',
    latitude: Number((47.42 + Math.floor(i / columns) * 0.008).toFixed(5)),
    longitude: Number((-121.88 + (i % columns) * 0.012).toFixed(5)),
    elevation_ft: 3000 + ((i * 37) % 6000),
    osm_id: `node/${10_000 + i}`,
  }))
}

// Timed inside the page, so no round trip to the runner is counted.
function timeIn(page: Page, act: 'toggle' | 'type', selector: string): Promise<number> {
  return page.evaluate(
    async ([what, sel]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement
      const yieldTask = () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel()
          channel.port1.onmessage = () => resolve()
          channel.port2.postMessage(null)
        })
      const t0 = performance.now()
      if (what === 'toggle') {
        el.click()
      } else {
        // A controlled textarea reads the native setter's value on `input`.
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(el, `${el.value}4`)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await yieldTask()
      await yieldTask()
      return performance.now() - t0
    },
    [act, selector] as const,
  )
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

test('render cost of an overlay toggle and a keystroke at 946 destinations', async ({ page }, testInfo) => {
  const destinations = field()
  await page.route('**/api/destinations', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ destinations, total: destinations.length, total_found: null, truncated: false }),
    }),
  )
  await page.goto(`/?type=peak&limit=1500&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText(`${DESTINATIONS} of ${DESTINATIONS})`, { exact: false })).toBeVisible()
  await expect(page.locator('table tbody tr')).toHaveCount(DESTINATIONS)

  const box = page.getByRole('textbox', { name: /Custom destination coordinates/ })
  await box.evaluate((el) => el.setAttribute('data-probe', 'keystroke'))
  // A partial line that never parses, so every keystroke re-derives the
  // pending list without adding a destination to it. Typed before the Layers
  // popover opens, because the press on the box would close it.
  await box.fill('47.5')
  await page.getByRole('button', { name: 'Layers' }).click()
  const smoke = page.getByRole('checkbox', { name: 'Smoke' })
  await expect(smoke).toBeVisible()
  await smoke.evaluate((el) => el.setAttribute('data-probe', 'overlay'))

  const overlay: number[] = []
  const keystroke: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    overlay.push(await timeIn(page, 'toggle', '[data-probe="overlay"]'))
    await page.waitForTimeout(300)
    keystroke.push(await timeIn(page, 'type', '[data-probe="keystroke"]'))
    await page.waitForTimeout(300)
  }
  const result = {
    destinations: DESTINATIONS,
    overlayToggleMs: Math.round(median(overlay)),
    keystrokeMs: Math.round(median(keystroke)),
    overlaySamples: overlay.map(Math.round),
    keystrokeSamples: keystroke.map(Math.round),
  }
  console.log(`render cost: ${JSON.stringify(result)}`)
  testInfo.annotations.push({ type: 'render cost', description: JSON.stringify(result) })
})
