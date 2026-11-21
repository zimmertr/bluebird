import { test, expect, forecastButton, openCard } from './fixtures'
import type { Page, Route } from '@playwright/test'

// #803: a run that fails opens the message list itself (M1), at a desk and on
// a phone. A desk's list hangs from the sentence bar's button, which is always
// on the map (record 0309), so there is no shut panel to open. A refused run is a blocker: Analyze greys, and a
// second press opens the list rather than asking the pod the same question.

const RING = '/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55'
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

const list = (page: Page) => page.getByRole('group', { name: 'Messages' })

// Registered after the fixture's own answer, so it is the one matched. The
// answer waits on `gate`, so a test can act while the run is up.
async function refuseDiscovery(page: Page, gate: Promise<void> = Promise.resolve()) {
  const calls = { count: 0 }
  await page.route('**/api/destinations', async (route: Route) => {
    calls.count += 1
    await gate
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(REFUSAL) })
  })
  return calls
}

test.describe('at a desk', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a refused run opens the list with its sentence, and greys Analyze until the panel changes', async ({ page }) => {
    const calls = await refuseDiscovery(page)
    await page.goto(RING)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const analyze = forecastButton(page)
    await analyze.click()

    await expect(list(page)).toBeVisible()
    await expect(list(page).getByText(OVER_CAP)).toBeVisible()
    // A blocker: no × on its line, and a greyed button that stays live.
    await expect(list(page).getByText(OVER_CAP).locator('..').getByRole('button', { name: 'Dismiss notice' })).toHaveCount(0)
    await expect(analyze).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)

    // A second press opens the list again and asks the pod nothing.
    await page.keyboard.press('Escape')
    await expect(list(page)).toHaveCount(0)
    await analyze.click({ force: true })
    await expect(list(page).getByText(OVER_CAP)).toBeVisible()
    expect(calls.count).toBe(1)

    // A changed discovery input lifts it: Lakes, in the Where card.
    await page.keyboard.press('Escape')
    await openCard(page, 'Where')
    await page.getByRole('checkbox', { name: 'Lakes', exact: true }).check()
    await expect(analyze).not.toHaveAttribute('aria-disabled')
  })

  test('a run that fails while it is up opens the list under the bar’s button', async ({ page }) => {
    let answer!: () => void
    await refuseDiscovery(page, new Promise<void>((resolve) => (answer = resolve)))
    await page.goto(RING)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await forecastButton(page).click()
    answer()

    await expect(list(page).getByText(OVER_CAP)).toBeVisible()
    // The card stands under the button it opened from, on the screen.
    await expect
      .poll(async () => {
        const card = (await list(page).locator('..').boundingBox())!
        const button = (await forecastButton(page).boundingBox())!
        return card.x >= 0 && card.y >= button.y + button.height - 1
      })
      .toBe(true)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a refused run opens the Messages sheet with its sentence', async ({ page }) => {
    await refuseDiscovery(page)
    await page.goto(RING)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const fab = page.locator('[data-tour="analyze"]')
    await fab.tap()
    const sheet = page.getByRole('dialog', { name: 'Messages' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText(OVER_CAP)).toBeVisible()
    await expect(fab).toHaveAttribute('aria-disabled', 'true')
  })
})
