import type { Page } from '@playwright/test'
import { test, expect, resultRows } from './fixtures'

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
  { title: 'Messages', anchor: 'messages' },
  { title: 'Layers', anchor: 'layers' },
  { title: 'Results', anchor: 'results' },
  { title: 'Chart', anchor: 'chart' },
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

// The Chart card shows the readout a finger resting mid-window shows: the
// cursor's line on the middle of the demonstration's thirteen hours, with a
// dot on every destination's line (#696; record 0153).
async function expectReadoutMidWindow(page: Page) {
  const chart = '[data-tour="chart"]'
  await expect(page.locator(`${chart} .recharts-tooltip-cursor`)).toBeAttached()
  await expect(async () => {
    const grid = (await box(page, `${chart} .recharts-cartesian-grid`))!
    const cursor = (await box(page, `${chart} .recharts-tooltip-cursor`))!
    expect(Math.abs((cursor.left + cursor.right) / 2 - (grid.left + grid.right) / 2)).toBeLessThan(2)
    await expect(page.locator(`${chart} .recharts-active-dot`)).toHaveCount(5)
  }).toPass({ timeout: 5_000 })
}

test('walks the nine cards from the footer link and puts the app back', async ({ page }) => {
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
    if (step.anchor === 'results') await expect(resultRows(page)).toHaveCount(5)
    if (step.anchor === 'chart') await expectReadoutMidWindow(page)
    if (step.anchor === 'marker') await expectPopupClear(page)
    await card(page).getByRole('button', { name: i === STEPS.length - 1 ? 'Done' : 'Next' }).click()
  }

  await expect(card(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/tutorial/)
  // The demonstration leaves with the tour.
  await expect(page.locator('[data-tour="marker"]')).toHaveCount(0)
  await expect(resultRows(page)).toHaveCount(0)
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
  await expect(heading(page)).toHaveText('Chart')
  await page.keyboard.press('ArrowLeft')
  await expect(heading(page)).toHaveText('Results')

  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/(\?|$)/)
})

test.describe('on a phone with a report', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  // #696: the Analyze step lights the floating button 8px out on every side,
  // its corners the button's 16px plus that pad (record 0151); the Results
  // step opens a sheet the reader lowered to rest in Table view before it
  // lights it, and the end of the tour leaves it open (record 0150).
  test('walks a lowered report: the Analyze light, the Layers sheet, the table and the chart', async ({ page }) => {
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(resultRows(page)).toHaveCount(5)
    await page.getByRole('button', { name: 'Show chart only' }).first().tap()
    await expect(resultRows(page).first()).toBeHidden()
    await page.getByRole('button', { name: 'Collapse results' }).first().tap()
    await expect(page.getByRole('button', { name: 'Expand results' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Open controls' }).tap()
    const link = page.getByRole('dialog', { name: 'Controls' }).getByRole('link', { name: 'Tutorial' })
    await link.scrollIntoViewIfNeeded()
    await link.tap()
    await expect(heading(page)).toHaveText('Destinations')

    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Analyze')
    await expect(async () => {
      const fab = (await box(page, '[data-tour="analyze"]'))!
      const light = (await box(page, SPOTLIGHT))!
      expect(fab.left - light.left).toBeCloseTo(8, 0)
      expect(light.right - fab.right).toBeCloseTo(8, 0)
      expect(fab.top - light.top).toBeCloseTo(8, 0)
      expect(light.bottom - fab.bottom).toBeCloseTo(8, 0)
      const radius = await page.locator(SPOTLIGHT).first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)
      const own = await page.locator('[data-tour="analyze"]').evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
      expect(radius).toBe(`${own + 8}px`)
    }).toPass({ timeout: 5_000 })

    await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Layers')
    // A phone's Layers card opens the sheet and switches Wildfires on
    // (record 0153), and the next card puts both back.
    const layers = page.locator('[data-tour="layers-menu"]')
    await expect(layers).toBeVisible()
    await expect(layers.getByRole('checkbox', { name: 'Wildfires' })).toBeChecked()
    // Its card stands in the map between the chip and the sheet, over
    // neither, and the light holds both (#696).
    await expectSpotlightOn(page, 'layers')
    await expectSpotlightOn(page, 'layers-menu')
    await expect(async () => {
      const chip = (await box(page, '[data-tour="layers"]'))!
      const sheet = (await box(page, '[data-tour="layers-menu"]'))!
      const tourCard = (await box(page, '[data-tour-card]'))!
      expect(tourCard.top).toBeGreaterThan(chip.bottom)
      expect(tourCard.bottom).toBeLessThan(sheet.top)
    }).toPass({ timeout: 5_000 })
    await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Results')
    await expect(layers).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Collapse results' }).first()).toBeVisible()
    await expect(resultRows(page).first()).toBeVisible()
    await expectSpotlightOn(page, 'results')

    // The Chart card turns the sheet to its chart, with the readout on the
    // window's middle hour (record 0153).
    await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Chart')
    await expectReadoutMidWindow(page)
    await page.keyboard.press('ArrowRight')
    await expect(heading(page)).toHaveText('Markers')
    // Back to the Chart card, which opens the sheet the marker card
    // collapsed, and the tour ended there.
    await page.keyboard.press('Backspace')
    await expect(heading(page)).toHaveText('Chart')
    await expectReadoutMidWindow(page)
    await page.keyboard.press('Escape')
    await expect(card(page)).toHaveCount(0)
    // The sheet is left open in the chart with the reader's own lines and
    // no readout over them, and Wildfires off again.
    await expect(page.getByRole('button', { name: 'Collapse results' }).first()).toBeVisible()
    await expect(page.locator('[data-tour="chart"] .recharts-line')).toHaveCount(5)
    await expect(page.locator('[data-tour="chart"] .recharts-tooltip-cursor')).toHaveCount(0)
    await expect(page.locator('[data-tour="chart"] .recharts-active-dot')).toHaveCount(0)
    // The tour started from the Controls sheet and gives it back open, modal
    // over the map (record 0207), so Done comes before the Layers chip.
    const controls = page.getByRole('dialog', { name: 'Controls' })
    await expect(controls).not.toHaveAttribute('inert')
    await controls.getByRole('button', { name: 'Done' }).tap()
    await page.getByRole('button', { name: 'Layers', exact: true }).first().tap()
    await expect(page.getByRole('dialog', { name: 'Layers', exact: true }).getByRole('checkbox', { name: 'Wildfires' })).not.toBeChecked()
  })
})
