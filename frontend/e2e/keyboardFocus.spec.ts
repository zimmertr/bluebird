import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'

// Where the keyboard goes in a real browser (#575, #576). The unit suites hold
// each rule in jsdom, which implements neither `inert` nor a hidden element's
// refusal of focus, so the two that rest on those are proven here.

const MAX_TABS = 250

async function tabUntil(page: Page, name: string) {
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab')
    const here = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
    if (here === name) return
  }
  throw new Error(`Tab never reached "${name}" in ${MAX_TABS} presses`)
}

async function analyzeFromTheKeyboard(page: Page) {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const analyze = page.getByRole('button', { name: 'Analyze' })
  await analyze.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('table tbody tr')).toHaveCount(DESTINATION_NAMES.length)
  return analyze
}

test('the keyboard comes back to Analyze, and reaches a row remove and a value by its name', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const analyze = await analyzeFromTheKeyboard(page)
  // Disabled under the press while the run was up, and handed back after.
  await expect(analyze).toBeFocused()

  // The value is the link's name, and the sentence its description.
  const value = page.locator('table tbody tr').first().locator('a[href*="windy.com"]').first()
  await expect(value).toHaveAccessibleName((await value.textContent()) ?? '')
  await expect(value).toHaveAccessibleDescription(/ on Windy\. Opens in a new tab\.$/)

  // Hidden with `invisible`, the remove was never a Tab stop.
  const remove = `Remove ${DESTINATION_NAMES[0]}`
  await tabUntil(page, remove)
  const button = page.getByRole('button', { name: remove })
  await expect(button).toBeFocused()
  expect(await button.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
})

test('the drawer leaves the Tab order when it closes, and each way through hands the keyboard on', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const close = page.getByRole('button', { name: 'Close controls' })
  await close.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('aside')).toHaveAttribute('inert', '')
  const open = page.getByRole('button', { name: 'Open controls' })
  await expect(open).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('aside')).not.toHaveAttribute('inert')
  await expect(close).toBeFocused()
})

test('the first Tab offers the skip link, which shows and lands on the main landmark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const skip = page.getByRole('link', { name: 'Skip to map' })
  expect(await skip.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  await page.locator('body').focus()
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  expect(await skip.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  expect(new URL(page.url()).hash).toBe('')
})

test('a results bar popover takes the keyboard in and gives it back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await analyzeFromTheKeyboard(page)
  const columns = page.getByRole('button', { name: 'Choose which columns to display' })
  await columns.focus()
  await page.keyboard.press('Enter')
  await expect(columns).toHaveAttribute('aria-expanded', 'true')
  const inside = await page.evaluate(() => document.activeElement?.closest('[style*="position: fixed"]') !== null)
  expect(inside).toBe(true)
  await page.keyboard.press('Escape')
  await expect(columns).toHaveAttribute('aria-expanded', 'false')
  await expect(columns).toBeFocused()
})
