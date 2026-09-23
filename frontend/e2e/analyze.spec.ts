import { test, expect, drawRing, DESTINATION_NAMES } from './fixtures'

test('draw a ring, analyze, and see the rows and the chart', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Peaks', exact: true }).check()
  await drawRing(page)

  const analyze = page.getByRole('button', { name: 'Analyze' })
  await expect(analyze).toBeEnabled()
  await analyze.click()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  await expect(rows.first()).toContainText(new RegExp(DESTINATION_NAMES.join('|')))

  await page.getByRole('button', { name: 'Show chart and table' }).click()
  await expect(page.locator('svg.recharts-surface').first()).toBeVisible()
})
