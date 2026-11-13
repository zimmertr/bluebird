import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// A phone sheet's grip and title drag it (#696; record 0146), the way the
// results sheet's grips drag the results: up to a held height, and down to
// shut, and every one of them to the top of the screen (record 0290). Driven
// by a pointer moving slowly, so no release reads as a flick.

async function drag(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  // Still before letting go, so the release has no speed.
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the Layers sheet rises under its grip, holds, and shuts dragged down from its title', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Layers' })
    await expect(sheet).toBeVisible()
    const before = (await sheet.boundingBox())!
    const grip = (await sheet.locator(':scope > div').first().boundingBox())!

    // Up a third of the room over it, between its own height and the top:
    // it stays there. A fixed distance would reach the top as the menu grows.
    const rise = Math.round(before.y / 3)
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -rise)
    const held = (await sheet.boundingBox())!
    expect(Math.round(held.height - before.height)).toBe(rise)
    expect(Math.round(held.y + held.height)).toBe(Math.round(before.y + before.height))

    // Down from the title, past its own height to the foot: it shuts.
    const title = (await sheet.getByRole('heading', { name: 'Layers' }).boundingBox())!
    await drag(page, { x: title.x + 4, y: title.y + title.height / 2 }, held.height - 20)
    await expect(sheet).toHaveCount(0)
  })
  // Every sheet rises to the same ceiling, the screen's top (record 0290):
  // the Controls sheet used to stop under the chips and the Analyze button's
  // strip, the menu sheets one inset under the chips. Let go there, each
  // stands over the search box and the Analyze button.
  for (const [opener, name] of [
    ['Open controls', 'Controls'],
    ['Layers', 'Layers'],
  ] as const) {
    test(`the ${name} sheet rises to the top of the screen, over the search box and Analyze`, async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      await page.getByRole('button', { name: opener, exact: true }).click()
      const sheet = page.getByRole('dialog', { name })
      await expect(sheet).toBeVisible()
      // Once a slide has landed, so the drag starts where the sheet stands.
      let last = -1
      await expect
        .poll(async () => {
          const y = Math.round((await sheet.boundingBox())!.y)
          const still = y === last
          last = y
          return still
        })
        .toBe(true)
      const grip = (await sheet.locator(':scope > div').first().boundingBox())!
      // To the screen's first row of pixels: the card's top would pass it,
      // and the ceiling holds it there.
      const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
      await drag(page, from, 1 - from.y)
      const top = (await sheet.boundingBox())!
      expect(Math.round(top.y)).toBe(0)
      expect(Math.round(top.y + top.height)).toBe(844)
      // What stands at the search box's and the Analyze button's places is
      // the sheet now.
      const covered = await page.evaluate(
        (heading) => {
          const card = [...document.querySelectorAll('[role="dialog"]')].find(
            (d) => d.querySelector('h2')?.textContent === heading,
          )!
          const fab = document.querySelector('[data-tour="analyze"]')!.getBoundingClientRect()
          const search = document.querySelector('[aria-label="Search for a place"]')!.getBoundingClientRect()
          return [fab, search].map((r) => card.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)))
        },
        name,
      )
      expect(covered).toEqual([true, true])

      // Turned on its side, a full sheet stays full on the shorter screen,
      // its grip on it, and drags down again from there.
      await page.setViewportSize({ width: 844, height: 390 })
      await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(0)
      expect(Math.round((await sheet.boundingBox())!.height)).toBe(390)
      const turned = (await sheet.locator(':scope > div').first().boundingBox())!
      expect(turned.y).toBeGreaterThanOrEqual(0)
      await drag(page, { x: turned.x + turned.width / 2, y: turned.y + turned.height / 2 }, 120)
      expect(Math.round((await sheet.boundingBox())!.y)).toBe(120)
    })
  }

  // A sheet held between its own height and the top keeps its share of the
  // room the screen gives it when the phone turns, rather than going full or
  // shrinking to a share of the strip a sideways map leaves it, and has the
  // same height again when it turns back (record 0290).
  test('the Controls sheet keeps its share of the screen through a turn and back', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Open controls', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Controls' })
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(256)
    const grip = (await sheet.locator(':scope > div').first().boundingBox())!
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -100)
    const held = Math.round((await sheet.boundingBox())!.height)
    expect(held).toBe(844 - 256 + 100)
    const height = async () => (await sheet.boundingBox())!.height

    await page.setViewportSize({ width: 844, height: 390 })
    await expect.poll(async () => Math.abs((await height()) - (held / 844) * 390)).toBeLessThan(1)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(async () => Math.round(await height())).toBe(held)
  })
})
