import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// Every menu at a desk is the one menu (#714, record 0200): a card 4px under
// its trigger, never joined to it, lined up with the trigger's left edge or,
// where that runs off the panel or the window, its right edge, and never
// narrower than the trigger. The trigger is lit while its menu is out.
// Measured on the live page, since jsdom lays nothing out.

test.use({ viewport: { width: 1440, height: 900 } })

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
}

// A card slides 4px in as it opens (`MOTION.menu`), so it is measured once
// its entrance has finished, where it stands.
async function rect(locator: Locator): Promise<Rect> {
  await locator.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return { left: b!.x, top: b!.y, right: b!.x + b!.width, bottom: b!.y + b!.height, width: b!.width }
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5)

// The card every portalled menu stands on, which says which side it opened to.
const card = (page: Page) => page.locator('body > [data-side]')

// A menu's place against its trigger: 4px off whichever side it opened on, and
// one of the trigger's two edges shared.
async function standsOff(trigger: Rect, menu: Rect, side: string | null) {
  if (side === 'above') near(trigger.top - menu.bottom, 4)
  else near(menu.top - trigger.bottom, 4)
  expect(menu.width).toBeGreaterThanOrEqual(trigger.width - 0.5)
  const left = Math.abs(menu.left - trigger.left) <= 0.5
  const right = Math.abs(menu.right - trigger.right) <= 0.5
  expect(left || right).toBe(true)
  return left ? 'left' : 'right'
}

const fillOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor)
const edgeOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).borderTopColor)

async function analyzed(page: Page, query = '') {
  await page.goto(`/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55${query}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
}

test('the Layers chip and the results bar open their menus under themselves, lit', async ({ page }) => {
  await analyzed(page)

  const layers = page.getByRole('button', { name: 'Layers', exact: true })
  const shutFill = await fillOf(layers)
  await layers.click()
  await expect(layers).toHaveAttribute('aria-expanded', 'true')
  const layersMenu = page.locator('[data-tour="layers-menu"]')
  const chip = await rect(layers)
  expect(await standsOff(chip, await rect(layersMenu), 'below')).toBe('left')
  await expect.poll(() => fillOf(layers)).not.toBe(shutFill)
  const litFill = await fillOf(layers)
  await layers.click()
  await expect(layers).toHaveAttribute('aria-expanded', 'false')

  // The bar's buttons: each card under its own button rather than under the
  // group, and the button lit in the chip's own accent fill.
  for (const name of ['Choose which columns to display', 'Models']) {
    const button = page.getByRole('button', { name, exact: true })
    const rest = await fillOf(button)
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    const menu = card(page)
    await expect(menu).toHaveCount(1)
    const at = await rect(button)
    const box = await rect(menu)
    const edge = await standsOff(at, box, await menu.getAttribute('data-side'))
    // Left-aligned unless that would run the card off the window.
    expect(edge).toBe(at.left + box.width <= 1440 - 8 + 0.5 ? 'left' : 'right')
    // Its rows' width, not the whole group's: the card is max-content.
    expect(await menu.evaluate((el) => el.style.width)).toBe('max-content')
    await expect.poll(() => fillOf(button)).toBe(litFill)
    expect(litFill).not.toBe(rest)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(button).toHaveAttribute('aria-expanded', 'false')
  }

  // Removed opens the same way once a row is gone.
  await page.getByRole('button', { name: `Remove ${DESTINATION_NAMES[0]}` }).click()
  const removed = page.getByRole('button', { name: 'Removed (1)' })
  await removed.click()
  const box = await rect(card(page))
  await standsOff(await rect(removed), box, await card(page).getAttribute('data-side'))
})

test('the model list takes its row and lines up with the field\'s right edge', async ({ page }) => {
  await analyzed(page)
  const field = page.getByRole('button', { name: /^Forecast model:/ })
  const rest = await edgeOf(field)
  await field.click()
  const menu = card(page)
  await expect(menu.getByRole('listbox', { name: 'Forecast model' })).toBeVisible()
  const trigger = await rect(field)
  const box = await rect(menu)
  // The field stands on the panel's right edge, so its card runs back from
  // there across the Model row.
  expect(await standsOff(trigger, box, await menu.getAttribute('data-side'))).toBe('right')
  expect(box.width).toBeGreaterThan(trigger.width + 100)
  // A field keeps its accent edge while its menu is out, with the pointer
  // gone from it.
  await page.mouse.move(900, 450)
  await expect.poll(() => edgeOf(field)).not.toBe(rest)
})

test('the calendar stands 4px under its field at the field\'s width', async ({ page }) => {
  await analyzed(page, `&mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}`)
  const field = page.getByRole('button', { name: /^When\b/ })
  await field.click()
  await expect(page.getByRole('grid', { name: 'Forecast day' })).toBeVisible()
  const menu = card(page)
  const trigger = await rect(field)
  const box = await rect(menu)
  await standsOff(trigger, box, await menu.getAttribute('data-side'))
  near(box.left, trigger.left)
  near(box.width, trigger.width)
  await expect(field).toHaveAttribute('aria-expanded', 'true')
})

test('the chart metric and an aggregate pick from the one menu', async ({ page }) => {
  // A window of days, because a single hour has no aggregate to choose.
  await analyzed(page, `&mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}`)

  const metric = page.getByRole('button', { name: /^Chart metric / })
  await metric.click()
  const list = page.getByRole('listbox', { name: 'Chart metric' })
  await expect(list).toBeVisible()
  const options = list.getByRole('option')
  const current = await list.getByRole('option', { selected: true }).textContent()
  const labels = await options.allTextContents()
  const other = labels.find((l) => l !== current)!
  const at = await rect(metric)
  await standsOff(at, await rect(card(page)), await card(page).getAttribute('data-side'))
  await list.getByRole('option', { name: other, exact: true }).click()
  await expect(list).toHaveCount(0)
  // The field's second span is the value it shows; the first names it.
  await expect(metric.locator('span').nth(1)).toHaveText(other)
  await expect(metric).toBeFocused()

  // The keyboard: the arrows open and walk the list, Enter picks, and the
  // keyboard is back on the field.
  const aggregate = page.getByRole('button', { name: /^Temperature aggregate / })
  const shown = aggregate.locator('span').nth(1)
  const before = (await shown.textContent())!
  await aggregate.focus()
  await page.keyboard.press('ArrowDown')
  const rows = page.getByRole('listbox', { name: 'Temperature aggregate' })
  await expect(rows).toBeVisible()
  await standsOff(await rect(aggregate), await rect(card(page)), await card(page).getAttribute('data-side'))
  const words = await rows.getByRole('option').allTextContents()
  // One step away from the current value, whichever way there is room.
  const here = words.indexOf(before)
  const last = here === words.length - 1
  await page.keyboard.press(last ? 'ArrowUp' : 'ArrowDown')
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(0)
  await expect(shown).toHaveText(words[last ? here - 1 : here + 1])
  await expect(aggregate).toBeFocused()
})
