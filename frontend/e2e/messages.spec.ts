import { test, expect, drawRing, expectRanked, message, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// The Analyze button counts the panel's messages in a badge at its corner and
// opens the one list that holds them (#786; record 0208): a card over the
// button at a desk, a sheet headed Messages on a phone. A blocker greys the
// button and leaves it live, so a press anywhere on it opens the list, and the
// badge reads red (record 0210). Measured on the live page, since jsdom lays
// nothing out.

const RING = '/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55'
const CUE = 'A new destination type requires a new analysis.'
const NO_DESTINATION = 'Provide at least one destination to analyze.'

const badge = (page: Page) => page.getByRole('button', { name: /^\d+ messages?$/ })
const count = async (page: Page) =>
  (await badge(page).count()) === 0 ? 0 : Number((await badge(page).getAttribute('aria-label'))!.split(' ')[0])
const list = (page: Page) => page.getByRole('group', { name: 'Messages' })

// A message's row is its line of text and its padding, × or not, so a box
// with an × stands as tall as one without (the maintainer, 2026-10-21 on PR
// #789): the × overhangs its row rather than growing it. Read off the live
// page, from the text's own box and the row's computed padding.
async function expectRowFitsItsLine(text: Locator) {
  const m = await text.evaluate((span) => {
    const row = span.parentElement!
    const style = getComputedStyle(row)
    return {
      row: row.getBoundingClientRect().height,
      line: span.getBoundingClientRect().height,
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
    }
  })
  expect(m.row).toBeCloseTo(m.line + m.padding, 1)
}

test.describe('at a desk', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a blocker greys Analyze, reads red on the badge, and opens the list from the button or the badge', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const analyze = page.getByRole('button', { name: 'Analyze', exact: true })
    // Nothing to analyze: greyed, not disabled, with the reason in the
    // badge's count and nowhere in the panel but the live region's copy.
    // Playwright reads `aria-disabled` as disabled, so the press below is
    // forced, which is what a reader's finger does.
    await expect(analyze).toHaveAttribute('aria-disabled', 'true')
    await expect(analyze).not.toHaveAttribute('disabled')
    await expect(page.getByText(NO_DESTINATION)).toHaveCount(1)
    await expect(message(page, NO_DESTINATION)).toHaveCount(1)
    expect(await count(page)).toBeGreaterThanOrEqual(1)
    // Red, whatever else the list holds: a blocker is an error. The danger
    // ink is read off a probe, so the check follows the theme's token.
    const danger = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.className = 'text-danger'
      document.body.append(probe)
      const ink = getComputedStyle(probe).color
      probe.remove()
      return ink
    })
    expect(await badge(page).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(danger)
    await expect(list(page)).toHaveCount(0)

    // A press on the greyed button opens the list over it, at least its width.
    await analyze.click({ force: true })
    await expect(list(page)).toBeVisible()
    await expect(list(page).getByText(NO_DESTINATION)).toBeVisible()
    // The blocker has no ×; a dismissable line would.
    const row = list(page).getByText(NO_DESTINATION).locator('..')
    await expect(row.getByRole('button', { name: 'Dismiss notice' })).toHaveCount(0)
    await expectRowFitsItsLine(list(page).getByText(NO_DESTINATION))
    const card = (await list(page).locator('..').boundingBox())!
    const button = (await analyze.boundingBox())!
    expect(card.width).toBeGreaterThanOrEqual(button.width - 0.5)
    console.log(`desk list: ${JSON.stringify({ card, button })}`)
    // Escape closes it and the badge says so.
    await page.keyboard.press('Escape')
    await expect(list(page)).toHaveCount(0)
    await expect(badge(page)).toHaveAttribute('aria-expanded', 'false')
    await badge(page).click()
    await expect(list(page)).toBeVisible()
    await expect(badge(page)).toHaveAttribute('aria-expanded', 'true')
    await badge(page).click()
    await expect(list(page)).toHaveCount(0)

    // A ring and a type clear the blocker: the button is live and the line
    // is gone from the live region.
    await drawRing(page)
    await page.getByRole('checkbox', { name: 'Peaks', exact: true }).check()
    await expect(analyze).not.toHaveAttribute('aria-disabled')
    await expect(page.getByText(NO_DESTINATION)).toHaveCount(0)
  })

  test('a cue after a report joins the badge, opens boxed, and its × takes it away', async ({ page }) => {
    await page.goto(RING)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const analyze = page.getByRole('button', { name: 'Analyze', exact: true })
    await analyze.click()
    await expectRanked(page)
    const before = await count(page)
    await page.getByRole('checkbox', { name: 'Lakes', exact: true }).check()
    await expect(badge(page)).toHaveAttribute('aria-label', `${before + 1} message${before + 1 === 1 ? '' : 's'}`)
    await badge(page).click()
    await expect(list(page).getByText(CUE)).toBeVisible()
    await expectRowFitsItsLine(list(page).getByText(CUE))
    await list(page).getByText(CUE).locator('..').getByRole('button', { name: 'Dismiss notice' }).click()
    await expect(list(page).getByText(CUE)).toHaveCount(0)
    if (before === 0) {
      // The list goes with its last message.
      await expect(list(page)).toHaveCount(0)
      await expect(badge(page)).toHaveCount(0)
    } else {
      await expect(badge(page)).toHaveAttribute('aria-label', `${before} message${before === 1 ? '' : 's'}`)
    }
  })
})

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test.describe(`on a phone at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true })

    test('the badge rides the map\'s Analyze button and opens the messages as a sheet', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      const fab = page.locator('[data-tour="analyze"]')
      await expect(fab).toHaveAttribute('aria-disabled', 'true')
      // The badge stands at the button's corner, inside the same slot.
      const b = (await badge(page).boundingBox())!
      const f = (await fab.boundingBox())!
      console.log(`phone badge ${width}x${height}: ${JSON.stringify({ badge: b, fab: f })}`)
      expect(b.x + b.width).toBeGreaterThan(f.x + f.width)
      expect(b.y).toBeLessThan(f.y)
      // A press on the greyed button opens the sheet, headed Messages, with
      // the blocker and no × on it; Done closes it. Forced, since Playwright
      // reads `aria-disabled` as disabled.
      await expect(fab).not.toHaveAttribute('disabled')
      await fab.tap({ force: true })
      const sheet = page.getByRole('dialog', { name: 'Messages' })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText(NO_DESTINATION)).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Dismiss notice' })).toHaveCount(0)
      await expectRowFitsItsLine(sheet.getByText(NO_DESTINATION))
      await sheet.getByRole('button', { name: 'Done' }).tap()
      await expect(sheet).toHaveCount(0)
      // And the badge itself.
      await badge(page).tap()
      await expect(sheet).toBeVisible()
      await page.touchscreen.tap(width / 2, 30)
      await expect(sheet).toHaveCount(0)
    })

    test('a dismissed cue leaves the sheet and the badge', async ({ page }) => {
      await page.goto(RING)
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
      await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
      const before = await count(page)
      await page.getByRole('button', { name: 'Open controls' }).tap()
      const controls = page.getByRole('dialog', { name: 'Controls' })
      await controls.getByRole('checkbox', { name: 'Lakes', exact: true }).check()
      await controls.getByRole('button', { name: 'Done' }).tap()
      await expect(badge(page)).toHaveAttribute('aria-label', `${before + 1} message${before + 1 === 1 ? '' : 's'}`)
      await badge(page).tap()
      const sheet = page.getByRole('dialog', { name: 'Messages' })
      await expect(sheet.getByText(CUE)).toBeVisible()
      // As tall as a blocker's row, and still a full-size target for a finger.
      await expectRowFitsItsLine(sheet.getByText(CUE))
      const dismiss = sheet.getByText(CUE).locator('..').getByRole('button', { name: 'Dismiss notice' })
      const target = (await dismiss.boundingBox())!
      expect(target.width).toBeGreaterThanOrEqual(44)
      expect(target.height).toBeGreaterThanOrEqual(44)
      await dismiss.tap()
      await expect(sheet.getByText(CUE)).toHaveCount(0)
      if (before === 0) {
        await expect(sheet).toHaveCount(0)
        await expect(badge(page)).toHaveCount(0)
      }
    })
  })
}
