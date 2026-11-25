import { test, expect, resultRows, DESTINATION_NAMES, answerWeather, answerAirQuality } from './fixtures'
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

async function analyze(page: Page, ready?: Promise<unknown>) {
  await page.goto(RING)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await ready
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

// A deployment's own copy of Open-Meteo, published ahead of the public hosts
// (record 0345). The image under test is started with no `OPEN_METEO_MIRRORS`,
// so the capabilities body is rewritten here, and the page's connect-src, which
// the pod builds from the same variable, would refuse the made-up host; the
// backend's own tests hold that header to the list.
const MIRROR = 'https://open-meteo.mirror.test'

// Resolves once the page holds the rewritten list, so Analyze asks the mirror
// rather than racing the capabilities answer.
async function publishMirror(page: Page): Promise<{ published: Promise<unknown> }> {
  const published = page.waitForResponse('**/api/capabilities')
  await page.route('**/api/capabilities', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { open_meteo_sources: unknown[] }
    const mirror = {
      name: 'mirror',
      forecast_url: `${MIRROR}/v1/forecast`,
      archive_url: null,
      air_quality_url: `${MIRROR}/v1/air-quality`,
      paced: false,
    }
    await route.fulfill({ response, json: { ...body, open_meteo_sources: [mirror, ...body.open_meteo_sources] } })
  })
  // Wrapped, because an async function returning the promise would wait on it.
  return { published }
}

test.describe('with a mirror published', () => {
  test.use({ bypassCSP: true })

  test('a mirror that answers keeps the run off the public hosts', async ({ page, traffic }) => {
    const { published } = await publishMirror(page)
    let asked = 0
    await page.route(`${MIRROR}/**`, (route) => {
      asked += 1
      return new URL(route.request().url()).pathname === '/v1/air-quality' ? answerAirQuality(route) : answerWeather(route)
    })
    await analyze(page, published)
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length, { timeout: LANDS_WITHIN_MS })
    expect(asked).toBeGreaterThan(0)
    expect(traffic.answered['api.open-meteo.com'] ?? 0).toBe(0)
    expect(traffic.answered['air-quality-api.open-meteo.com'] ?? 0).toBe(0)
  })

  test('a mirror that refuses hands the run to the public hosts, and the table lands', async ({ page, traffic }) => {
    const { published } = await publishMirror(page)
    await page.route(`${MIRROR}/**`, (route) => route.fulfill({ status: 503, body: 'Service unavailable' }))
    await analyze(page, published)
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length, { timeout: LANDS_WITHIN_MS })
    expect(traffic.answered['api.open-meteo.com'] ?? 0).toBeGreaterThan(0)
    await expect(page.getByText(/Open-Meteo is unavailable/)).toHaveCount(0)
  })
})
