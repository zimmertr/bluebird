import { test, expect, DESTINATION_NAMES, resultRows } from './fixtures'
import type { Locator } from '@playwright/test'

// A result popup is built from the report it opened over, so a new report
// must not leave one standing (#577). Within one report it follows the
// ranking and the columns, the way the table does. And where the results are
// docked below the map, the forecast player's bar stands inside the part of
// the map a card can be seen in, so a card's placement steps around it.

// The window the readiness review saw the bar cover a card's last rows at.
test.use({ viewport: { width: 1478, height: 812 } })

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return { left: b!.x, top: b!.y, right: b!.x + b!.width, bottom: b!.y + b!.height }
}

test('a popup clears the forecast player, and the next analysis closes it', async ({ page }) => {
  // A window of days, because one hour gives the player nothing to play.
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const analyze = page.getByRole('button', { name: 'Analyze' })
  await analyze.click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
  // Table alone, which leaves the map the height a desktop reader works at.
  await page.getByRole('button', { name: 'Show table only' }).click()

  // The player is on by default at a desktop width; its root holds the play
  // button, found through the button so the test follows the bar rather
  // than the attribute under test.
  const bar = page.getByRole('button', { name: 'Play the timeline' }).locator('xpath=..')
  await expect(bar).toBeVisible()

  await page.getByRole('button', { name: /^Center map on / }).first().click()
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toHaveCount(1)
  // The camera flies and then pans for the card, so the boxes are read once
  // they have settled.
  await expect(async () => {
    const card = await box(popup)
    const player = await box(bar)
    const apart =
      card.bottom <= player.top || card.top >= player.bottom || card.right <= player.left || card.left >= player.right
    expect(apart, JSON.stringify({ card, player })).toBe(true)
  }).toPass({ timeout: 10_000 })

  await analyze.click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
  await expect(popup).toHaveCount(0)
})

// An open card follows the ranking the way the table does (TJ, 2026-10-08):
// the bold number moves when the panel ranks by another metric or another
// aggregate, without the card being reopened, and focus stays in the panel.
test('an open popup marks whichever number the panel ranks by', async ({ page }) => {
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
  await page.getByRole('button', { name: /^Center map on / }).first().click()
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toHaveCount(1)

  // Which family and which column the bold number stands in.
  const marked = () =>
    popup.evaluate((el) => {
      const bold = [...el.querySelectorAll<HTMLElement>('[data-popup-body] span')].filter(
        (s) => s.style.fontWeight === '700',
      )
      return bold.map((s) => {
        const tr = s.closest('tr')!
        const td = s.closest('td')!
        const head = el.querySelectorAll('[data-popup-body] th[scope="col"]')[[...tr.querySelectorAll('td')].indexOf(td)]
        return `${tr.querySelector('th')!.textContent} ${head?.textContent ?? ''}`.trim()
      })
    })
  await expect.poll(marked).toEqual(['AQI Avg'])

  await page.getByRole('radio', { name: 'Temperature' }).check()
  await expect.poll(marked).toEqual([expect.stringMatching(/^Temperature \(°F\) (Min|Max|Avg)$/)])

  const aggregate = page.getByRole('combobox', { name: 'Temperature aggregate' })
  await aggregate.focus()
  await aggregate.selectOption({ label: 'Min' })
  await expect.poll(marked).toEqual(['Temperature (°F) Min'])
  // The same card, redrawn in place, and the reader's focus where they left it.
  await expect(popup).toHaveCount(1)
  await expect(aggregate).toBeFocused()
})
