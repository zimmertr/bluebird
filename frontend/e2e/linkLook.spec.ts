import { test, expect, expectRanked, resultRows, typeCell } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// A link in the results table or a popup reads in its text's colour (#786;
// record 0212): at a desk no underline until a hover, and on a touch screen,
// which never hovers, a thin underline at rest in the secondary ink. Read off
// the live page, since jsdom answers no media query and computes no hover.

async function analyze(page: Page, phone: boolean) {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const where = phone ? page.getByRole('main') : page.locator('aside')
  await where.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expectRanked(page)
}

// The ground under the marker lands after its card opens and redraws it
// (#832), replacing every node in it: wait until no bar stands for it
// (`pendingValue` in popupChrome.ts, whatever width it keeps) before holding
// on to a link.
const groundLanded = (page: Page) =>
  expect(page.locator('.maplibregl-popup [data-pending]')).toHaveCount(0)

const look = (el: Locator) =>
  el.evaluate((node) => {
    const style = getComputedStyle(node)
    return { line: style.textDecorationLine, color: style.color, decoration: style.textDecorationColor }
  })

// What a colour value paints, read off a probe so the check follows the
// theme's tokens rather than a copy of them.
const paint = (page: Page, value: string) =>
  page.evaluate((v) => {
    const probe = document.createElement('span')
    probe.style.color = v
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, value)

test('at a desk a link is its text\'s colour and underlines on hover alone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await analyze(page, false)
  const row = resultRows(page).nth(1)
  const name = row.getByRole('button', { name: /^Center map on / })
  const rest = await look(name)
  expect(rest.line).toBe('none')
  // The row's ink rather than the accent.
  expect(rest.color).toBe(await name.evaluate((el) => getComputedStyle(el.closest('td')!).color))
  await name.hover()
  await expect.poll(async () => (await look(name)).line).toBe('underline')

  // The popup the row opens says it the same way, and its link-out glyph
  // rests in a grey and takes the accent under the pointer, as its forecast
  // section's fold does (#832).
  await row.locator('td').nth(3).click()
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toHaveCount(1)
  await groundLanded(page)
  const link = popup.locator('[data-popup-link]').first()
  expect((await look(link)).line).toBe('none')
  // Hovered again on each try: the map pans to fit a popup it has just
  // opened, and a pointer left where the link was is no longer over it.
  await expect(async () => {
    await link.hover()
    expect((await look(link)).line).toBe('underline')
  }).toPass({ timeout: 5_000 })
  // The band's glyph is the first; the fold is a button that wears the same.
  const glyph = popup.locator('a[data-popup-glyph]').first()
  const fold = popup.getByRole('button', { name: 'Forecast', exact: true })
  await expect(fold).toHaveAttribute('data-popup-glyph', '')
  // The forecast's heading stands on the band the header wears (TJ,
  // 2026-11-03), and its fold rests in the same grey there.
  const backdrop = (el: Locator) => el.evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(await backdrop(fold.locator('..'))).toBe(await backdrop(popup.locator('.maplibregl-popup-content > div > div').first()))
  await page.mouse.move(0, 0)
  const grey = await paint(page, 'var(--popup-label)')
  expect((await look(glyph)).color).toBe(grey)
  await expect.poll(async () => (await look(fold)).color).toBe(grey)
  const accent = await paint(page, 'var(--popup-glyph-hover)')
  for (const el of [glyph, fold]) {
    await expect(async () => {
      await el.hover()
      expect((await look(el)).color).toBe(accent)
    }).toPass({ timeout: 5_000 })
  }
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('every link wears a thin underline at rest in the secondary ink', async ({ page }) => {
    await analyze(page, true)
    const row = resultRows(page).nth(1)
    const name = row.getByRole('button', { name: /^Center map on / })
    expect(await look(name)).toMatchObject({ line: 'underline', decoration: await paint(page, 'var(--ui-ink-soft)') })
    await (await typeCell(page, row)).tap()
    await groundLanded(page)
    const link = page.locator('.maplibregl-popup [data-popup-link]').first()
    await expect(link).toBeAttached()
    expect(await look(link)).toMatchObject({ line: 'underline', decoration: await paint(page, 'var(--popup-label)') })
  })
})
