import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

// The two probes the memo rule in the root CLAUDE.md was measured with: an
// overlay toggle, which cannot change a row, a ranking or a chart line, and a
// keystroke in the coordinates box, which re-derives the pending list. Beside
// them, the three live knobs a reader drives most (#409): a flip of the
// ranking's direction, which reorders every row, and a cut of the results cap
// to 100 and its restore, which unmount and remount most of the table. All at
// 946 destinations, every one displayed before a cut, so the table, the chart
// and the map each carry the whole field.
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

// The results cap the cut probe sets, and the one the page opens on.
const CUT_LIMIT = 100
const FULL_LIMIT = 1500

// Timed inside the page, so no round trip to the runner is counted. A flip
// presses whichever of the matched buttons is not pressed, so every sample
// changes the direction. A set writes `value` into a number input.
function timeIn(
  page: Page,
  act: 'toggle' | 'type' | 'flip' | 'set',
  selector: string,
  value = '',
): Promise<number> {
  return page.evaluate(
    async ([what, sel, next]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement
      const idle = document.querySelector(`${sel}[aria-pressed="false"]`) as HTMLButtonElement | null
      const yieldTask = () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel()
          channel.port1.onmessage = () => resolve()
          channel.port2.postMessage(null)
        })
      const t0 = performance.now()
      if (what === 'toggle') {
        el.click()
      } else if (what === 'flip') {
        idle!.click()
      } else if (what === 'set') {
        // A controlled input reads the native setter's value on `input`.
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(el, next)
        el.dispatchEvent(new Event('input', { bubbles: true }))
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
    [act, selector, value] as const,
  )
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

test('render cost of an overlay toggle, a keystroke and the live knobs at 946 destinations', async ({ page }, testInfo) => {
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
  for (const name of ['Lowest', 'Highest']) {
    await page.getByRole('button', { name, exact: true }).evaluate((el) => el.setAttribute('data-probe', 'direction'))
  }
  await page.locator('#max-results').evaluate((el) => el.setAttribute('data-probe', 'limit'))
  await page.getByRole('button', { name: 'Layers' }).click()
  const smoke = page.getByRole('checkbox', { name: 'Smoke' })
  await expect(smoke).toBeVisible()
  await smoke.evaluate((el) => el.setAttribute('data-probe', 'overlay'))

  const overlay: number[] = []
  const keystroke: number[] = []
  const sortFlip: number[] = []
  const limitCut: number[] = []
  const limitRestore: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    overlay.push(await timeIn(page, 'toggle', '[data-probe="overlay"]'))
    await page.waitForTimeout(300)
    keystroke.push(await timeIn(page, 'type', '[data-probe="keystroke"]'))
    await page.waitForTimeout(300)
    sortFlip.push(await timeIn(page, 'flip', '[data-probe="direction"]'))
    await page.waitForTimeout(300)
    limitCut.push(await timeIn(page, 'set', '[data-probe="limit"]', String(CUT_LIMIT)))
    await page.waitForTimeout(300)
    limitRestore.push(await timeIn(page, 'set', '[data-probe="limit"]', String(FULL_LIMIT)))
    await page.waitForTimeout(300)
  }
  // Each knob moved: the last restore brought every row back.
  await expect(page.locator('table tbody tr')).toHaveCount(DESTINATIONS)
  const result = {
    destinations: DESTINATIONS,
    overlayToggleMs: Math.round(median(overlay)),
    keystrokeMs: Math.round(median(keystroke)),
    sortFlipMs: Math.round(median(sortFlip)),
    limitCutMs: Math.round(median(limitCut)),
    limitRestoreMs: Math.round(median(limitRestore)),
    overlaySamples: overlay.map(Math.round),
    keystrokeSamples: keystroke.map(Math.round),
    sortFlipSamples: sortFlip.map(Math.round),
    limitCutSamples: limitCut.map(Math.round),
    limitRestoreSamples: limitRestore.map(Math.round),
  }
  console.log(`render cost: ${JSON.stringify(result)}`)
  testInfo.annotations.push({ type: 'render cost', description: JSON.stringify(result) })
})
