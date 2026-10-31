import { test, expect, resultRows, peak, destinationsAnswer } from '../fixtures'
import type { Browser, Page } from '@playwright/test'

// What a drag on a phone's results sheet costs (#837; the maintainer,
// 2026-10-31: "the performance of sliding up and down is pretty poor on
// mobile"): one move of the pointer per animation frame, up the screen and
// back, on the grip of a 200-row report in Table and in Chart. Read frame by
// frame: the gaps between frames (`medianMs`, `p95Ms`, `worstMs`), how many
// missed a 60 Hz frame (`missed`, a gap over 20 ms), and Chrome's account of
// the main thread's work per move by kind (`perMoveMs`), which is the number
// to hold to a 120 Hz frame's 8.3 ms. `CPU_SLOWDOWN=4` runs it at roughly a
// mid phone's speed.

const DESTINATIONS = 200
const RING = '-121.9,47.4;-121.5,47.4;-121.5,47.7;-121.9,47.7'
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 1)
const MOVES = 60
const STEP_PX = 8

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

interface Drag {
  frames: number
  missed: number
  medianMs: number
  p95Ms: number
  worstMs: number
}

// A drag driven inside the page, one pointermove each frame: up by STEP_PX for
// half the moves and back down for the rest, so it ends where it began and
// stays under the cap, where every build holds the sheet the same way.
function drag(page: Page): Promise<Drag> {
  return page.evaluate(
    async ([moves, step]) => {
      const grip = [...document.querySelectorAll('[data-tour="results"] .cursor-ns-resize')].pop() as HTMLElement
      const box = grip.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y0 = box.top + box.height / 2
      const init = (y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch' })
      grip.dispatchEvent(new PointerEvent('pointerdown', init(y0)))
      const t: number[] = []
      await new Promise<void>((resolve) => {
        let k = 0
        const tick = (now: number) => {
          t.push(now)
          if (k >= moves) return resolve()
          const up = k < moves / 2 ? (k + 1) * step : (moves - k - 1) * step
          document.dispatchEvent(new PointerEvent('pointermove', init(y0 - up)))
          k++
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      document.dispatchEvent(new PointerEvent('pointerup', init(y0)))
      const gaps = t.slice(1).map((v, i) => v - t[i])
      const sorted = [...gaps].sort((a, b) => a - b)
      const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
      return {
        frames: gaps.length,
        missed: gaps.filter((g) => g > 20).length,
        medianMs: Math.round(at(0.5) * 10) / 10,
        p95Ms: Math.round(at(0.95) * 10) / 10,
        worstMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
      }
    },
    [MOVES, STEP_PX] as const,
  )
}

const KINDS = ['FunctionCall', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit'] as const

async function traced(browser: Browser, page: Page) {
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] })
  const result = await drag(page)
  const buffer = await browser.stopTracing()
  const events = (JSON.parse(buffer.toString()) as { traceEvents: { name: string; ph: string; dur?: number; tid: number; pid: number; args?: { name?: string } }[] }).traceEvents
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  const sums: Record<string, number> = {}
  for (const e of events) {
    if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== 'X' || !e.dur) continue
    if ((KINDS as readonly string[]).includes(e.name)) sums[e.name] = (sums[e.name] ?? 0) + e.dur / 1000
  }
  const total = KINDS.reduce((s, k) => s + (sums[k] ?? 0), 0)
  return {
    ...result,
    perMoveMs: Math.round((total / MOVES) * 10) / 10,
    byKind: Object.fromEntries(KINDS.map((k) => [k, Math.round(((sums[k] ?? 0) / MOVES) * 10) / 10])),
  }
}

test('a drag on a phone results sheet', async ({ browser, page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const destinations = field()
  await page.route('**/api/destinations', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(destinationsAnswer(destinations)) }),
  )
  await page.goto(`/?type=peak&limit=${DESTINATIONS}&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATIONS, { timeout: 300_000 })
  await page.waitForTimeout(1500)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

  const results = []
  for (const mode of ['Show table only', 'Show chart only'] as const) {
    await page.locator(`button[aria-label="${mode}"]`).click()
    await page.waitForTimeout(1200)
    await drag(page) // warm
    await page.waitForTimeout(600)
    const r = { mode, ...(await traced(browser, page)) }
    console.log(`sheet drag x${CPU_SLOWDOWN}: ${JSON.stringify(r)}`)
    results.push(r)
    await page.waitForTimeout(600)
  }
  await testInfo.attach('sheet-drag.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
})
