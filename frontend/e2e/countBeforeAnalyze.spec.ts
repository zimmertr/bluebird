import { test, expect, discoveryFromPlaces, expectRanked, isoDay, message } from './fixtures'
import type { Page, Route } from '@playwright/test'

// #803, D1: where the pod answers rings from its places table, the browser
// counts a ring before Analyze. The reported link, a large ring with every
// kind and unnamed peaks, opens with Analyze greyed and the over-cap sentence
// in the list before any press; unticking unnamed peaks clears it, and the
// run forecasts the field the count found without asking the pod again.

const OVER_CAP = 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.'
// The pod's over-cap answer, as production sent it for the reported link.
const REFUSAL = {
  detail: OVER_CAP,
  error: { code: 'refusal', retryable: false },
  found: 2613,
  limit: 1500,
  suggested_min_elevation_ft: 5600,
  suggested_keeps: 1463,
}

// The reported link (#803), its two days moved onto the suite's clock.
const LINK =
  '/?type=peak%2Ctrailhead%2Clake%2Ccrag&sort=temp_avg_f&limit=1500&model=gfs_seamless&mode=days' +
  `&d1=${isoDay(1)}&d2=${isoDay(2)}` +
  '&poly=-121.29376%2C48.3667%3B-120.47528%2C48.38495%3B-120.16217%2C47.28245%3B-121.67828%2C47.34204' +
  '&closedareas=1&unnamed=1&view=-120.5%2C47.5%2C7'

const list = (page: Page) => page.getByRole('group', { name: 'Messages' })

test.use({ viewport: { width: 1440, height: 900 } })

test('the reported link is held before any press, and runs on the counted field once unnamed peaks are unticked', async ({ page }) => {
  await discoveryFromPlaces(page)
  // What each call to the destinations route asked about unnamed peaks. With
  // them the ring is over the cap; without, the fixture's five peaks answer.
  const asked: boolean[] = []
  await page.route('**/api/destinations', (route: Route) => {
    const unnamed = (route.request().postDataJSON() as { include_unnamed_peaks?: boolean }).include_unnamed_peaks === true
    asked.push(unnamed)
    return unnamed
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(REFUSAL) })
      : route.fallback()
  })
  const caps = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/capabilities')
  await page.goto(LINK)
  // The answer the page read carries every field the count and the spend read.
  const published = (await (await caps).json()) as {
    discovery_source: string
    limits: { open_meteo_hourly_calls?: unknown }
    forecast_models: Record<string, unknown>[]
  }
  expect(published.discovery_source).toBe('places')
  expect(typeof published.limits.open_meteo_hourly_calls).toBe('number')
  expect(published.forecast_models.every((m) => 'domain' in m)).toBe(true)

  const analyze = page.getByRole('button', { name: 'Analyze', exact: true })
  await expect(message(page, OVER_CAP)).toHaveCount(1)
  await expect(analyze).toHaveAttribute('aria-disabled', 'true')
  expect(asked).toEqual([true])

  // A press on the greyed button opens the list and asks the pod nothing.
  await analyze.click({ force: true })
  await expect(list(page).getByText(OVER_CAP)).toBeVisible()
  expect(asked).toEqual([true])
  await page.keyboard.press('Escape')

  await page.getByRole('checkbox', { name: 'Include unnamed peaks' }).uncheck()
  await expect(message(page, OVER_CAP)).toHaveCount(0)
  await expect(analyze).not.toHaveAttribute('aria-disabled')
  await expect.poll(() => asked).toEqual([true, false])

  // The run forecasts the counted field: no second discovery.
  await analyze.click()
  await expectRanked(page)
  expect(asked).toEqual([true, false])
})
