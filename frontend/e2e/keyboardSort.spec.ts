import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'

// A sortable header has to be reached and operated with the keyboard alone
// (WCAG 2.1.1). Axe cannot see this: a header cell with only a click handler
// breaks no rule it checks, so the accessibility spec passes either way.

// Far more stops than the page has before the table, so a header that is
// never reached fails here rather than looping.
const MAX_TABS = 250

const ASCENDING = DESTINATION_NAMES.toSorted()
const DESCENDING = ASCENDING.toReversed()

async function tabTo(page: Page, key: string) {
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab')
    const here = await page.evaluate(() => document.activeElement?.getAttribute('data-col') ?? null)
    if (here === key) return
  }
  throw new Error(`Tab never reached the ${key} header in ${MAX_TABS} presses`)
}

const firstRow = (page: Page) => page.locator('table tbody tr').first()

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 360, height: 740 },
]) {
  test(`a results header sorts from the keyboard at ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    // The ring comes from the share link, so the phone needs no map clicks.
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Analyze' }).click()
    await expect(page.locator('table tbody tr')).toHaveCount(DESTINATION_NAMES.length)

    const name = page.locator('th[data-col="name"]')
    await page.locator('body').focus()
    await tabTo(page, 'name')
    await expect(name).toBeFocused()
    // Keyboard focus shows the ring.
    expect(await name.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')

    await page.keyboard.press('Enter')
    await expect(name).toHaveAttribute('aria-sort', 'ascending')
    await expect(firstRow(page)).toContainText(ASCENDING[0])

    await page.keyboard.press('Space')
    await expect(name).toHaveAttribute('aria-sort', 'descending')
    await expect(firstRow(page)).toContainText(DESCENDING[0])
    // The sort is the key's only effect: focus stays on the header.
    await expect(name).toBeFocused()
  })
}
