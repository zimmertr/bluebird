import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// On a phone the Controls sheet opens the way Legend and Layers do (TJ,
// 2026-10-21; record 0207): a modal sheet over the dimmed map that pushes
// nothing. The Analyze button, the scale and the (i) stand where they stood,
// under the dim and out of reach, and the notice band alone rides the sheet's
// edge, over the dim, so a cue that arrives while a control changes reads.
// Every sheet leaves the button the same way: mounted where it stands, and
// kept from a press by the sheet's dim and modality alone.

const RING = '/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55'

const CUE = 'A new destination type requires a new analysis.'

// Where each piece of the foot stands, and the band holding the cue.
async function geometry(page: Page) {
  return page.evaluate((cue) => {
    const box = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    const fab = document.querySelector('[data-tour="analyze"]')
    const status = [...document.querySelectorAll('[role="status"]')].find((el) => el.textContent?.includes(cue))
    const band = status?.parentElement ?? null
    const sheet = document.querySelector('[role="dialog"][aria-modal="true"]')
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
      band: box(band),
      sheet: box(sheet),
      fabTakesPress: hit(fab),
      fabUnder,
      bandTakesPress: hit(band),
    }
  }, CUE)
}

for (const [width, height] of [
  [360, 740],
  [390, 844],
] as const) {
  test.describe(`at ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true, isMobile: true })

    test('the Controls sheet opens over the dim, moves nothing under it, and carries the band on its edge', async ({ page }) => {
      await page.goto(RING)
      await expect(page.locator('.maplibregl-canvas')).toBeVisible()
      await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
      await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
      const fab = page.locator('[data-tour="analyze"]')
      await expect(fab).toBeVisible()
      const shut = await geometry(page)

      await page.getByRole('button', { name: 'Open controls' }).tap()
      // Hidden ones included, so the same locator finds it shut and inert.
      const sheet = page.getByRole('dialog', { name: 'Controls', includeHidden: true })
      await expect(sheet).toHaveAttribute('aria-modal', 'true')
      await expect(sheet).not.toHaveAttribute('inert')
      // Once the slide has landed: its top where its share of the map puts it.
      await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(256)

      // A cue arriving while a control changes stands on the sheet's edge,
      // 10px over it, and on top of the dim.
      await sheet.getByRole('checkbox', { name: 'Lakes', exact: true }).check()
      await expect(page.getByText(CUE)).toBeVisible()
      const open = await geometry(page)
      console.log(`controls sheet ${width}x${height}: ${JSON.stringify({ shut, open })}`)

      // Nothing under the sheet moved.
      expect(open.fab).toEqual(shut.fab)
      expect(open.scale).toEqual(shut.scale)
      expect(open.info).toEqual(shut.info)
      // The band rides the edge, over the dim.
      expect(Math.round(open.sheet!.top - open.band!.bottom)).toBe(10)
      expect(open.bandTakesPress).toBe(true)
      // Analyze takes no press: the sheet or its dim stands over it. The
      // button itself is as it was, neither inert nor greyed.
      expect(open.fabTakesPress).toBe(false)
      await expect(fab).not.toHaveAttribute('inert')
      await expect(fab).toBeEnabled()

      // A press on the dim closes it, as Done does, and the button is back
      // in reach. The cue comes down to the foot with the band, and the
      // button rises over it as it does over any notice (record 0140).
      await page.touchscreen.tap(width / 2, 30)
      await expect(sheet).toHaveAttribute('inert', '')
      await expect.poll(async () => (await geometry(page)).fabTakesPress).toBe(true)
      const back = await geometry(page)
      expect(back.fab!.bottom).toBeLessThan(back.band!.top)
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
