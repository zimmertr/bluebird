import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// The guided tutorial (#536), walked the way a reader walks it. The unit
// suites pin the steps, the placement arithmetic and the source anchors; this
// is the one place the whole thing runs in a browser: the card, the spotlight
// over each control, the demonstration report, the marker popup standing
// clear of what covers the map, the keys, the address bar and the way out.

const STEPS = [
  { title: 'Destinations', anchor: 'destinations' },
  { title: 'Forecast', anchor: 'forecast' },
  { title: 'Metrics', anchor: 'metrics' },
  { title: 'Analyze', anchor: 'analyze' },
  { title: 'Layers', anchor: 'layers' },
  { title: 'Results', anchor: 'results' },
  { title: 'Markers', anchor: 'marker' },
]

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const card = (page: Page) => page.locator('[data-tour-card]')
const heading = (page: Page) => card(page).getByRole('heading')

async function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }, selector)
}

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

// The spotlight is the one element that throws the dim: a shadow of 200vmax.
const SPOTLIGHT = '[aria-hidden="true"].pointer-events-none'

async function expectSpotlightOn(page: Page, anchor: string) {
  await expect(async () => {
    const light = await box(page, SPOTLIGHT)
    const target = await box(page, `[data-tour="${anchor}"]`)
    expect(light).not.toBeNull()
    expect(target).not.toBeNull()
    const cx = (target!.left + target!.right) / 2
    const cy = (target!.top + Math.min(target!.bottom, light!.bottom)) / 2
    expect(cx).toBeGreaterThan(light!.left)
    expect(cx).toBeLessThan(light!.right)
    expect(cy).toBeGreaterThan(light!.top)
    expect(cy).toBeLessThan(light!.bottom)
  }).toPass({ timeout: 5_000 })
}

// A section the panel has room for stands whole inside the panel's scroll box,
// rather than under its footer.
async function expectSectionInPanel(page: Page, anchor: string) {
  await expect(async () => {
    const fit = await page.evaluate((a) => {
      const el = document.querySelector(`[data-tour="${a}"]`)
      let box = el?.parentElement ?? null
      while (box && !(['auto', 'scroll'].includes(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) {
        box = box.parentElement
      }
      if (!el || !box) return null
      const s = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      return { fits: s.height <= b.height, inside: s.top >= b.top - 1 && s.bottom <= b.bottom + 1 }
    }, anchor)
    expect(fit).not.toBeNull()
    expect(fit!.fits).toBe(true)
    expect(fit!.inside).toBe(true)
  }).toPass({ timeout: 5_000 })
}

// The popup stands whole in the part of the map the reader can see: above
// the sheet, and clear of the button column, the legend and the card.
async function expectPopupClear(page: Page) {
  await expect(page.locator('[data-tour="marker"]')).toBeVisible()
  await expect(async () => {
    const popup = await box(page, '[data-tour="marker"]')
    const sheet = await box(page, '[data-tour="results"]')
    const tourCard = await box(page, '[data-tour-card]')
    const overlays = await page.evaluate(() =>
      [...document.querySelectorAll('[data-map-overlay]')].map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }),
    )
    expect(popup).not.toBeNull()
    expect(popup!.top).toBeGreaterThanOrEqual(0)
    expect(popup!.bottom).toBeLessThanOrEqual(sheet!.top)
    for (const o of [...overlays, tourCard!]) expect(overlaps(popup!, o), JSON.stringify(o)).toBe(false)
  }).toPass({ timeout: 5_000 })
}

test('walks the seven cards from the footer link and puts the app back', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const before = await page.evaluate(() => history.length)

  const link = page.getByRole('link', { name: 'Tutorial' })
  await expect(link).toHaveAttribute('href', '/tutorial')
  await link.click()
  await expect(page).toHaveURL(/\/tutorial(\?|$)/)
  expect(await page.evaluate(() => history.length)).toBe(before + 1)

  for (const [i, step] of STEPS.entries()) {
    await expect(heading(page)).toHaveText(step.title)
    await expect(card(page)).toContainText(`${i + 1} of ${STEPS.length}`)
    await expectSpotlightOn(page, step.anchor)
    if (step.anchor === 'metrics') await expectSectionInPanel(page, 'metrics')
    if (step.anchor === 'layers') await expect(page.locator('[data-tour="layers-menu"]')).toBeVisible()
    if (step.anchor === 'results') await expect(page.locator('table tbody tr')).toHaveCount(5)
    if (step.anchor === 'marker') await expectPopupClear(page)
    await card(page).getByRole('button', { name: i === STEPS.length - 1 ? 'Done' : 'Next' }).click()
  }

  await expect(card(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/tutorial/)
  // The demonstration leaves with the tour.
  await expect(page.locator('[data-tour="marker"]')).toHaveCount(0)
  await expect(page.locator('table tbody tr')).toHaveCount(0)
})

test('the browser\'s Back leaves the tour the way it leaves a page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('link', { name: 'Tutorial' }).click()
  await expect(heading(page)).toHaveText('Destinations')
  await page.goBack()
  await expect(card(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/tutorial/)
})

test('a link to /tutorial opens the tour on a phone, and the keys walk it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/tutorial')
  await expect(heading(page)).toHaveText('Destinations')
  // The card is the drawer's, so the panel step opened the drawer.
  await expectSpotlightOn(page, 'destinations')

  for (let i = 0; i < STEPS.length - 1; i++) await page.keyboard.press('ArrowRight')
  await expect(heading(page)).toHaveText('Markers')
  await expectPopupClear(page)

  await page.keyboard.press('Backspace')
  await expect(heading(page)).toHaveText('Results')
  await page.keyboard.press('ArrowLeft')
  await expect(heading(page)).toHaveText('Layers')

  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/(\?|$)/)
})
