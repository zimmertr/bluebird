import { test, expect, expectRanked, resultRows } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// A popup is the panel's own surface and its button the panel's own button,
// in both themes (#786, record 0215). `styles.test.ts` holds the source to
// that, every `--popup-*` value an app token and the button's class list
// `BUTTON_ACCENT`; this reads the rendered page, where MapLibre's stylesheet
// or a rule in map.css could still dress a popup apart from the panel.

// What a button looks like, as the browser computed it, its face among it:
// the card sets none, so a popup reads in the panel's (record 0217).
const LOOK = [
  'fontFamily',
  'backgroundColor',
  'color',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopLeftRadius',
  'borderTopWidth',
  'borderTopColor',
  'width',
  'height',
] as const

const look = (el: Locator) =>
  el.evaluate((node, props) => {
    const style = getComputedStyle(node)
    return Object.fromEntries(props.map((p) => [p, style[p]]))
  }, LOOK as unknown as string[])

// The same class list on a button outside every popup: the panel's button.
const panelLook = (page: Page, className: string) =>
  page.evaluate(
    ({ className, props }) => {
      const probe = document.createElement('button')
      probe.className = className
      probe.textContent = 'Go'
      document.querySelector('aside')!.append(probe)
      const style = getComputedStyle(probe)
      const out = Object.fromEntries(props.map((p) => [p, style[p as keyof CSSStyleDeclaration]]))
      probe.remove()
      return out
    },
    { className, props: LOOK as unknown as string[] },
  )

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

for (const theme of ['dark', 'light'] as const) {
  test(`a popup is the panel's surface, with the panel's button, in the ${theme} theme`, async ({ page }) => {
    if (theme === 'light') await page.addInitScript(() => localStorage.setItem('bluebird_forecast_theme', 'light'))
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    // Dark is the default and sets no attribute.
    if (theme === 'light') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
    await page.locator('aside').getByRole('button', { name: 'Analyze', exact: true }).click()
    await expectRanked(page)
    await resultRows(page).nth(1).locator('td').nth(3).click()
    const popup = page.locator('.maplibregl-popup')
    await expect(popup).toHaveCount(1)

    // The card's surface and ink are the panel's. Polled, because the map
    // pans to fit a popup it has just opened and a read can land on the card
    // that pan replaces.
    const panel = await page.locator('aside').evaluate((el) => getComputedStyle(el).backgroundColor)
    const content = popup.locator('.maplibregl-popup-content')
    await expect.poll(() => content.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(panel)
    const ink = await paint(page, 'var(--ui-ink)')
    await expect.poll(() => popup.evaluate((el) => getComputedStyle(el).color)).toBe(ink)

    // The button looks the way the same class list does in the panel, at rest
    // and under the pointer. It stands in the title row, after the name and
    // left of the ×, as tall as the × and centred on it, 8px from it, the
    // gap under a finger too (TJ, 2026-11-04; `styles.test.ts` holds the
    // touch sum). Polled for the pan, as above.
    const button = popup.getByRole('button', { name: 'Remove from analysis' })
    await expect(button).toHaveText('Remove')
    const place = () =>
      button.evaluate((el) => {
        const own = el.getBoundingClientRect()
        const close = el.closest('.maplibregl-popup')!.querySelector('.maplibregl-popup-close-button')!.getBoundingClientRect()
        const title = el.closest('.maplibregl-popup')!.querySelector('strong')!.getBoundingClientRect()
        return {
          gap: Math.round(close.left - own.right),
          height: Math.round(own.height) === Math.round(close.height),
          centred: Math.abs(own.top + own.height / 2 - (close.top + close.height / 2)) < 1,
          afterTitle: own.left >= title.right,
        }
      })
    await expect.poll(place).toMatchObject({ height: true, centred: true, afterTitle: true })
    expect((await place()).gap).toBe(8)
    const className = await button.getAttribute('class')
    expect(className).toBeTruthy()
    await page.mouse.move(0, 0)
    const panelButton = await panelLook(page, className!)
    await expect.poll(() => look(button)).toEqual(panelButton)
    expect(panelButton.backgroundColor).toBe(await paint(page, 'var(--ui-accent)'))
    const hovered = await paint(page, 'var(--ui-accent-hover)')
    // Hovered again on each try: the map pans to fit a popup it has just
    // opened, and a pointer left where the button was is no longer over it.
    await expect(async () => {
      await button.hover()
      expect((await look(button)).backgroundColor).toBe(hovered)
    }).toPass({ timeout: 5_000 })
  })
}
