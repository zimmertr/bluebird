import { test, expect, resultRows, isoDay } from './fixtures'

// In light the chart's lines are pastels drawn over a dark rim (PR #733),
// which is one SVG filter that `index.css` applies to the group Recharts
// draws the lines into. That group is Recharts' own, named by a class it
// writes, so only a browser can say the rule still reaches it: a Recharts
// release that renamed it would leave every pastel under 2:1 on the panel
// with every unit test green. The hover dot's rim is a rule on Recharts' own
// classes too. Dark lines carry no rim: the filter stays defined and goes
// unapplied, and the rim every mark wears is transparent, so a switch changes
// no element of the chart (record 0211).

test.use({ viewport: { width: 1280, height: 900 } })

test('rims the light chart lines and the ticked chart boxes, and nothing in dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bluebird_forecast_theme', 'light'))
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page).first()).toBeAttached()

  // The group holding the series lines, and the filter it is drawn through.
  const layer = page.locator('svg.recharts-surface g[class^="recharts-zIndex-layer_"]', {
    has: page.locator('.recharts-line'),
  })
  await expect(layer).toHaveCount(1)
  await expect.poll(() => layer.evaluate((g) => getComputedStyle(g).filter)).toBe('url("#chart-line-rim")')
  await expect(page.locator('#chart-line-rim')).toHaveCount(1)
  const box = resultRows(page).first().getByRole('checkbox')
  await expect(box).toBeChecked()
  // The light `ink-soft`, #42474e.
  const rim = 'rgb(66, 71, 78)'
  expect(await box.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(rim)
  const dot = page.locator('.recharts-active-dot .recharts-dot').first()
  await page.locator('svg.recharts-surface').first().hover()
  await expect(dot).toBeAttached()
  expect(await dot.evaluate((el) => getComputedStyle(el).stroke)).toBe(rim)

  await page.getByRole('button', { name: 'Switch to dark theme' }).first().click()
  await expect.poll(() => layer.evaluate((g) => getComputedStyle(g).filter)).toBe('none')
  expect(await box.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgba(0, 0, 0, 0)')
  await page.locator('svg.recharts-surface').first().hover({ position: { x: 200, y: 60 } })
  await expect(dot).toBeAttached()
  // Recharts' own white ring, which is the dark theme's.
  expect(await dot.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(255, 255, 255)')
})
