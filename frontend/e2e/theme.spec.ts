import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The app follows the device's light or dark setting until the reader picks
// one in the theme menu (#843, record 0302). Only a browser can say that
// `theme.js` paints the device's theme before the first frame, and that the
// open page follows the device as it changes, with no reload.

test.use({ colorScheme: 'light' })

// The root's theme as the body first arrives, before anything has painted:
// `theme.js` runs in the head, so by then it has had its say and the app's
// module has not.
async function themeAtFirstBody(page: Page) {
  await page.addInitScript(() => {
    const seen = new MutationObserver(() => {
      if (!document.body) return
      ;(window as { firstTheme?: string }).firstTheme = document.documentElement.dataset.theme ?? 'dark'
      seen.disconnect()
    })
    seen.observe(document, { childList: true, subtree: true })
  })
}

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')

test('opens on a light device light before the first paint, and follows the device as it changes', async ({ page }) => {
  await themeAtFirstBody(page)
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  expect(await page.evaluate(() => (window as { firstTheme?: string }).firstTheme)).toBe('light')
  await expect(page.getByRole('button', { name: 'Theme System' }).first()).toBeVisible()

  // The sunset case: no reload, the root follows, both ways.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => theme(page)).toBe('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => theme(page)).toBe('light')
})

test('holds a chosen theme over the device across a reload, and System follows it again', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Theme System' }).first().click()
  await page.getByRole('option', { name: 'Dark' }).click()
  await expect.poll(() => theme(page)).toBe('dark')

  // The device changing says nothing to a chosen theme.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await theme(page)).toBe('dark')

  await themeAtFirstBody(page)
  await page.reload()
  expect(await page.evaluate(() => (window as { firstTheme?: string }).firstTheme)).toBe('dark')
  await page.getByRole('button', { name: 'Theme Dark' }).first().click()
  await page.getByRole('option', { name: 'System' }).click()
  await expect.poll(() => theme(page)).toBe('light')
})

// The three pages outside the app load `theme.js` too, and follow the same rule.
for (const path of ['/privacy', '/terms', '/no-such-page']) {
  test(`${path} follows the device, and a stored choice over it`, async ({ page }) => {
    await themeAtFirstBody(page)
    await page.goto(path)
    expect(await page.evaluate(() => (window as { firstTheme?: string }).firstTheme)).toBe('light')
    await page.evaluate(() => localStorage.setItem('bluebird_forecast_theme', 'dark'))
    await page.reload()
    expect(await page.evaluate(() => (window as { firstTheme?: string }).firstTheme)).toBe('dark')
  })
}
