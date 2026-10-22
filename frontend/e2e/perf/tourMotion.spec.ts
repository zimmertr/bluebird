import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'

// What each card of the tutorial costs to arrive (#786; the maintainer,
// 2026-10-21: "plays really slowly and choppy on mobile"): from the key that
// moves to it until the spotlight stands still, the frames that missed a
// 60 Hz budget, and the largest share of its whole path the spotlight covered
// in one frame. At a desk a glide spreads its path over a quarter second of
// frames, so a share near 100 is a snap; on a phone every card is a cut, so
// a share of 100 is the design and the number to read is how soon it lands.
// `CPU_SLOWDOWN=4` runs it at roughly a mid phone's speed.

const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 1)

interface Arrival {
  card: string
  settleMs: number
  frames: number
  janky: number
  worstMs: number
  pathPx: number
  snapPct: number
}

async function walk(page: Page, label: string): Promise<Arrival[]> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  await page.goto('/tutorial')
  const heading = page.locator('[data-tour-card]').getByRole('heading')
  await expect(heading).toHaveText('Destinations')
  await page.waitForTimeout(1500)
  const count = Number((await page.locator('[data-tour-card]').innerText()).match(/of (\d+)/)![1])
  const arrivals: Arrival[] = []
  for (let i = 1; i < count; i++) {
    await page.evaluate(() => {
      const w = window as unknown as { __rec: { t: number[]; r: number[][]; on: boolean }; __t0: number }
      w.__rec = { t: [], r: [], on: true }
      const spot = () => document.querySelector('[data-tour-card]')?.previousElementSibling
      const tick = (t: number) => {
        if (!w.__rec.on) return
        const b = spot()?.getBoundingClientRect()
        w.__rec.t.push(t)
        w.__rec.r.push(b ? [b.left, b.top, b.right, b.bottom] : [0, 0, 0, 0])
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      w.__t0 = performance.now()
    })
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(2000)
    const r = await page.evaluate(() => {
      const w = window as unknown as { __rec: { t: number[]; r: number[][]; on: boolean }; __t0: number }
      w.__rec.on = false
      const { t, r } = w.__rec
      const step = r.slice(1).map((b, k) => Math.max(...b.map((v, j) => Math.abs(v - r[k][j]))))
      const moved = step.map((d) => d > 0.5)
      const first = moved.indexOf(true)
      const last = moved.lastIndexOf(true)
      const span = first < 0 ? [] : step.slice(first, last + 1)
      const intervals = t.slice(1).map((x, k) => x - t[k]).slice(Math.max(first, 0), last + 1)
      return {
        settleMs: Math.round((last < 0 ? w.__t0 : t[last + 1]) - w.__t0),
        frames: span.length,
        janky: intervals.filter((d) => d > 25).length,
        worstMs: Math.round(Math.max(0, ...intervals)),
        pathPx: Math.round(span.reduce((a, d) => a + d, 0)),
        snapPct: Math.round((100 * Math.max(0, ...span)) / Math.max(1, span.reduce((a, d) => a + d, 0))),
      }
    })
    const card = await heading.innerText()
    arrivals.push({ card, ...r })
  }
  for (const a of arrivals) console.log(`tour motion ${label} x${CPU_SLOWDOWN}: ${JSON.stringify(a)}`)
  return arrivals
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('tour motion, phone', async ({ page }) => {
    await walk(page, 'phone')
  })
})

test.describe('at a desk', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test('tour motion, desk', async ({ page }) => {
    await walk(page, 'desk')
  })
})
