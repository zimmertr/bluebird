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
  // rests in a grey and takes the accent under the pointer.
  await row.locator('td').nth(3).click()
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toHaveCount(1)
  const link = popup.locator('[data-popup-link]').first()
  expect((await look(link)).line).toBe('none')
  // Hovered again on each try: the map pans to fit a popup it has just
  // opened, and a pointer left where the link was is no longer over it.
  await expect(async () => {
    await link.hover()
    expect((await look(link)).line).toBe('underline')
  }).toPass({ timeout: 5_000 })
  const glyph = popup.locator('[data-popup-glyph]')
  await page.mouse.move(0, 0)
  expect((await look(glyph)).color).toBe(await paint(page, 'var(--popup-label)'))
  const accent = await paint(page, 'var(--popup-glyph-hover)')
  await expect(async () => {
    await glyph.hover()
    expect((await look(glyph)).color).toBe(accent)
  }).toPass({ timeout: 5_000 })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('every link wears a thin underline at rest in the secondary ink', async ({ page }) => {
    await analyze(page, true)
    const row = resultRows(page).nth(1)
    const name = row.getByRole('button', { name: /^Center map on / })
    expect(await look(name)).toMatchObject({ line: 'underline', decoration: await paint(page, 'var(--ui-ink-soft)') })
    await (await typeCell(page, row)).tap()
    const link = page.locator('.maplibregl-popup [data-popup-link]').first()
    await expect(link).toBeAttached()
    expect(await look(link)).toMatchObject({ line: 'underline', decoration: await paint(page, 'var(--popup-label)') })
  })
})
