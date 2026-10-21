import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// On a phone the Controls sheet opens the way Legend and Layers do (TJ,
// 2026-10-21; record 0207): a modal sheet over the dimmed map that pushes
// nothing. The Analyze button, the scale and the (i) stand where they stood,
// under the dim and out of reach, and the notice band alone rides the sheet's
// edge, over the dim, so a cue that arrives while a control changes reads.

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
    const hit = (el: Element | null) => {
      const r = el?.getBoundingClientRect()
      if (!r) return null
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return top ? el!.contains(top) : false
    }
    return {
      fab: box(fab),
      scale: box(document.querySelector('.maplibregl-ctrl-scale')),
      info: box(document.querySelector('.maplibregl-ctrl-attrib-button')),
      band: box(band),
      sheet: box(sheet),
      fabTakesPress: hit(fab),
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
      await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
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
      // Analyze takes no press: inert, and under the sheet or its dim.
      await expect(fab).toHaveAttribute('inert', '')
      expect(open.fabTakesPress).toBe(false)

      // A press on the dim closes it, as Done does, and the button comes
      // back into reach.
      await page.touchscreen.tap(width / 2, 30)
      await expect(sheet).toHaveAttribute('inert', '')
      await expect(fab).not.toHaveAttribute('inert')
      await expect(fab).toBeEnabled()
    })
  })
}
