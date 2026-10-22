import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// On a phone the Controls sheet opens the way Legend and Layers do (TJ,
// 2026-10-21; record 0207): a modal sheet over the dimmed map that pushes
// nothing. The Analyze button, the scale and the (i) stand where they stood,
// under the dim and out of reach. A cue that arrives while a control changes
// goes to the badge on the Analyze button (record 0208), which is under the
// dim too, so it reads once the sheet closes: the band that used to carry it
// on the sheet's edge is gone. Every sheet leaves the button the same way:
// mounted where it stands, and kept from a press by the sheet's dim and
// modality alone.

const RING = '/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55'

const CUE = 'A new destination type requires a new analysis.'

// Where each piece of the foot stands.
async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    const fab = document.querySelector('[data-tour="analyze"]')
    // What a finger lands on at the middle of each.
    const topAt = (el: Element | null) => {
      const r = el?.getBoundingClientRect()
      return r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    }
    const hit = (el: Element | null) => {
      if (!el) return null
      const top = topAt(el)
      return top ? el.contains(top) : false
    }
    // What stands over the button's middle: a sheet's card, or the dim.
    const over = topAt(fab)
    const fabUnder = !over || fab?.contains(over) ? null : over.closest('[role="dialog"]') ? 'card' : 'dim'
    return {
      fab: box(fab),
      scale: box(document.querySelector('.maplibregl-ctrl-scale')),
      info: box(document.querySelector('.maplibregl-ctrl-attrib-button')),
      fabTakesPress: hit(fab),
      fabUnder,
    }
  })
}

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test.describe(`at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true })

    test('the Controls sheet opens over the dim, moves nothing under it, and leaves the cue to the badge', async ({ page }) => {
      await page.goto(RING)
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
      await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
      const fab = page.locator('[data-tour="analyze"]')
      await expect(fab).toBeVisible()
      const shut = await geometry(page)
      const badge = page.getByRole('button', { name: /^\d+ messages?$/ })
      const before = (await badge.count()) === 0 ? 0 : Number((await badge.getAttribute('aria-label'))!.split(' ')[0])

      await page.getByRole('button', { name: 'Open controls' }).tap()
      // Hidden ones included, so the same locator finds it shut and inert.
      const sheet = page.getByRole('dialog', { name: 'Controls', includeHidden: true })
      await expect(sheet).toHaveAttribute('aria-modal', 'true')
      await expect(sheet).not.toHaveAttribute('inert')
      // Once the slide has landed: its top where its share of the map puts it.
      await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(256)

      // A cue arriving while a control changes joins the live region at once
      // and the badge's count, with no list open and nothing on the sheet.
      await sheet.getByRole('checkbox', { name: 'Lakes', exact: true }).check()
      await expect(page.locator('[role="status"]', { hasText: CUE })).toHaveCount(1)
      await expect(page.getByRole('dialog', { name: 'Messages' })).toHaveCount(0)
      await expect(badge).toHaveAttribute('aria-label', `${before + 1} message${before + 1 === 1 ? '' : 's'}`)
      const open = await geometry(page)
      console.log(`controls sheet ${width}x${height}: ${JSON.stringify({ shut, open, before })}`)

      // Nothing under the sheet moved.
      expect(open.fab).toEqual(shut.fab)
      expect(open.scale).toEqual(shut.scale)
      expect(open.info).toEqual(shut.info)
      // Analyze takes no press: the sheet or its dim stands over it. The
      // button itself is as it was, neither inert nor greyed.
      expect(open.fabTakesPress).toBe(false)
      await expect(fab).not.toHaveAttribute('inert')
      await expect(fab).toBeEnabled()

      // A press on the dim closes it, as Done does, and the button is back
      // in reach with the badge at its corner; a tap on the badge opens the
      // messages as a sheet holding the cue.
      await page.touchscreen.tap(width / 2, 30)
      await expect(sheet).toHaveAttribute('inert', '')
      await expect.poll(async () => (await geometry(page)).fabTakesPress).toBe(true)
      const back = await geometry(page)
      expect(back.fab).toEqual(shut.fab)
      await badge.tap()
      const messages = page.getByRole('dialog', { name: 'Messages' })
      await expect(messages).toBeVisible()
      await expect(messages.getByText(CUE)).toBeVisible()
      await messages.getByRole('button', { name: 'Done' }).tap()
      await expect(messages).toHaveCount(0)
    })

    // A menu sheet follows the same rule (TJ, 2026-10-21): the button stays
    // mounted where it stood, under the dim, and Done gives it back.
    test('the Layers sheet opens over the button, the scale and the (i), and moves none of them', async ({ page }) => {
      await page.goto(RING)
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
      await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
      const fab = page.locator('[data-tour="analyze"]')
      await expect(fab).toBeVisible()
      const shut = await geometry(page)
      expect(shut.fabTakesPress).toBe(true)

      await page.getByRole('button', { name: 'Layers', exact: true }).tap()
      const sheet = page.getByRole('dialog', { name: 'Layers' })
      await expect(sheet).toBeVisible()
      // Once the card has landed, so the probe reads where it rests.
      await expect
        .poll(async () => {
          const card = (await sheet.boundingBox())!
          return Math.round(card.y + card.height)
        })
        .toBe(height)
      const open = await geometry(page)
      const sheetTop = Math.round((await sheet.boundingBox())!.y)
      console.log(`layers sheet ${width}x${height}: ${JSON.stringify({ shut, open, sheetTop })}`)

      // Nothing under the sheet moved, and the button is the one it was.
      await expect(fab).toHaveCount(1)
      expect(open.fab).toEqual(shut.fab)
      expect(open.scale).toEqual(shut.scale)
      expect(open.info).toEqual(shut.info)
      await expect(fab).not.toHaveAttribute('inert')
      await expect(fab).toBeEnabled()
      // A finger at its middle lands on the sheet or its dim.
      expect(open.fabTakesPress).toBe(false)
      expect(open.fabUnder).not.toBeNull()

      // Done gives it back, where it stood.
      await sheet.getByRole('button', { name: 'Done' }).tap()
      await expect(sheet).toHaveCount(0)
      const back = await geometry(page)
      expect(back.fab).toEqual(shut.fab)
      expect(back.scale).toEqual(shut.scale)
      expect(back.info).toEqual(shut.info)
      expect(back.fabTakesPress).toBe(true)
    })
  })
}
