import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page, Route } from '@playwright/test'

// The reliability plan's proof (docs/RELIABILITY.md, mitigation 12): a run
// still lands when a provider fails the way providers do, inside the target
// for a small run (8 s at the 95th percentile, record 0339), and a pod the
// edge answers for is named as offline (record 0343). Each handler is
// registered after the fixture's, so it is matched first, and hands what it
// does not fail on to the fixture's answer with `fallback`.

const RING = '/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55'
// A small run's ceiling past its hedge: the 5 s a request waits before its
// second copy (record 0345), and a typical batch's 2 s on top.
const LANDS_WITHIN_MS = 8_000

async function analyze(page: Page) {
  await page.goto(RING)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
}

// The forecast host's first `count` requests are failed by `fail`; the rest
// are answered as the fixture answers them.
async function failForecastHost(page: Page, count: number, fail: (route: Route) => Promise<void>) {
  let left = count
  await page.route('https://api.open-meteo.com/**', async (route) => {
    if (left <= 0) return route.fallback()
    left -= 1
    await fail(route)
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

test('a forecast batch the host answers 502 is asked again at once, and the table lands', async ({ page }) => {
  await failForecastHost(page, 1, (route) => route.fulfill({ status: 502, body: 'Bad gateway' }))
  await analyze(page)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length, { timeout: LANDS_WITHIN_MS })
  // A retry at once is no outage, so no countdown was ever started.
  await expect(page.getByText(/Open-Meteo is unavailable/)).toHaveCount(0)
})

test('a forecast request that hangs gets a second copy, and the table lands', async ({ page }) => {
  // Held well past the hedge, then handed on; the browser has aborted it by
  // then, which makes the hand-off throw, and that is the point.
  await failForecastHost(page, 1, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    await route.fallback().catch(() => {})
  })
  await analyze(page)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length, { timeout: LANDS_WITHIN_MS })
})

test('the edge answering 530 for the pod says Bluebird Forecast is offline', async ({ page }) => {
  let asked = 0
  await page.route('**/api/destinations', async (route) => {
    asked += 1
    // Cloudflare's own page for a tunnel with no origin behind it.
    await route.fulfill({ status: 530, contentType: 'text/html', body: '<html>error code: 1033</html>' })
  })
  await analyze(page)
  const list = page.getByRole('group', { name: 'Messages' })
  await expect(list.getByText('Bluebird Forecast is offline. Try again later.')).toBeVisible()
  // Asked once more at once, and no more (record 0343).
  expect(asked).toBe(2)
})
