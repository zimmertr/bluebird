import { test, expect, expectRanked, DESTINATION_NAMES } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// Every map popup opens on a click, never on a hover, and the smaller target
// under a click takes it (TJ, 2026-10-08, record 0125): a destination inside
// a fire opens its own card, a click on the fire around it describes the fire
// rather than leaving for NIFC, and a cursor resting on the fire opens nothing.

test.use({ viewport: { width: 1280, height: 800 } })

const RING = '-121.9,47.4;-121.7,47.4;-121.7,47.55'
// One perimeter far wider than the ring, so every point of the map in view is
// inside the fire, markers included.
const FIRE = {
  type: 'FeatureCollection',
  fetched_at: new Date().toISOString(),
  features: [
    {
      type: 'Feature',
      properties: { poly_IncidentName: 'Probe Fire', poly_GISAcres: 1200 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-123, 46.5],
            [-120.5, 46.5],
            [-120.5, 48.5],
            [-123, 48.5],
            [-123, 46.5],
          ],
        ],
      },
    },
  ],
}

// Where a result card's marker stands on screen: the point its tip touches,
// on whichever side of the marker the card opened. Read once the map has
// stopped moving, because centring a row flies the map and then pans it for
// the card, and the card rides along.
async function markerUnder(card: Locator) {
  const read = async () => {
    const below = await card.evaluate((el) => el.classList.contains('maplibregl-popup-anchor-top'))
    const tip = await card.locator('.maplibregl-popup-tip').boundingBox()
    expect(tip).not.toBeNull()
    return { x: Math.round(tip!.x + tip!.width / 2), y: Math.round(below ? tip!.y : tip!.y + tip!.height) }
  }
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await read())
        const still = now === last
        last = now
        return still
      },
      { intervals: [400] },
    )
    .toBe(true)
  return JSON.parse(last) as { x: number; y: number }
}

// At a desk the first report's panes open over the foot of the map, and the
// map's canvas takes its shorter height only once they have, about half a
// second after the ranking lands (record 0202). A row centred before then
// aims its marker at the middle of the taller canvas, which the shorter one
// leaves under the results bar, and a hover beside the marker lands on the
// bar rather than the fire. So a centring waits for the canvas to stand on
// the results' top.
async function resultsOpened(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
        const results = document.querySelector('[data-tour="results"]')?.getBoundingClientRect()
        return canvas !== undefined && results !== undefined && Math.round(canvas.bottom) === Math.round(results.top)
      }),
    )
    .toBe(true)
}

// Whether the page's own element at a point is the map's canvas: a marker
// drawn there, or the fire.
const onMap = (page: Page, at: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas') ?? false, at)

test('a fire opens its popup on a click and never on a hover, and a marker inside it takes its own click', async ({
  page,
  context,
}) => {
  await page.route('**/api/wildfires**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIRE) }),
  )
  const tabs: string[] = []
  context.on('page', (p) => tabs.push(p.url()))
  await page.goto(`/?type=peak&poly=${RING}&fires=1`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  // A pending row's centring opens no card, so not before the row is ranked.
  await expectRanked(page)
  await resultsOpened(page)

  // Centring a row opens its card on the marker, which says where the marker is.
  await page.getByRole('button', { name: `Center map on ${DESTINATION_NAMES[0]}` }).click()
  const popups = page.locator('.maplibregl-popup')
  // Every popup is a card since #738, so the destination's is the one that
  // names it.
  const card = popups.filter({ hasText: DESTINATION_NAMES[0] })
  await expect(card).toHaveCount(1)
  const marker = await markerUnder(card)
  await card.locator('.maplibregl-popup-close-button').click()
  await expect(popups).toHaveCount(0)
  // Clear of every marker: they stand within a kilometre of the ring's middle.
  const bare = { x: marker.x + 220, y: marker.y }
  const canvas = page.locator('.maplibregl-canvas')
  // Both points are on the map, or everything below reads something else.
  expect(await onMap(page, marker)).toBe(true)
  expect(await onMap(page, bare)).toBe(true)

  // A hover opens nothing, over the fire or over the marker inside it, and the
  // pointer still says the fire can be clicked.
  await page.mouse.move(bare.x, bare.y)
  await page.mouse.move(bare.x + 4, bare.y + 4)
  await expect.poll(() => canvas.evaluate((el) => (el as HTMLElement).style.cursor)).toBe('pointer')
  await page.mouse.move(marker.x, marker.y)
  await page.waitForTimeout(800)
  await expect(popups).toHaveCount(0)

  // The marker inside the fire takes the click.
  await page.mouse.click(marker.x, marker.y)
  await expect(card).toHaveCount(1)
  await expect(card).toContainText(DESTINATION_NAMES[0])
  await expect(popups).toHaveCount(1)

  // The fire around it describes the fire, in place of the card, and no tab opens.
  await page.mouse.click(bare.x, bare.y)
  await expect(card).toHaveCount(0)
  await expect(popups).toHaveCount(1)
  await expect(popups).toContainText('Probe Fire')
  await expect(popups.getByRole('link', { name: /NIFC/ })).toBeVisible()
  expect(tabs).toEqual([])
})

// A phone has no hover, so a closure's popup opened on nothing there until a
// tap opened it. A closed trail outranks the closed ground it crosses, and
// answers a tap a few pixels off its line.
test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  const collection = (features: unknown[]) => ({ type: 'FeatureCollection', fetched_at: 1, features })
  const AREA = collection([
    {
      type: 'Feature',
      properties: { OBJECTID: 1, ClosureOrderName: 'Probe Area Closure' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-123, 46.5],
            [-120.5, 46.5],
            [-120.5, 48.5],
            [-123, 48.5],
            [-123, 46.5],
          ],
        ],
      },
    },
  ])
  // Along the latitude the map opens centred on, so it crosses the canvas's
  // middle row.
  const TRAIL = collection([
    {
      type: 'Feature',
      properties: { OBJECTID: 2, ClosureOrderName: 'Probe Trail Closure' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-123, 47.5],
          [-120.5, 47.5],
        ],
      },
    },
  ])

  test('a tap opens a closure’s popup, the trail’s within a few pixels of its line', async ({ page }) => {
    await page.route('**/api/closures**', (r) => {
      const kind = new URL(r.request().url()).searchParams.get('kind')
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kind === 'trail' ? TRAIL : AREA) })
    })
    await page.goto('/?view=-121.5,47.5,12&closedareas=1&closedtrails=1')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    // A phone opens on the map, with the Controls sheet shut (#696).
    await expect(page.getByRole('dialog', { name: 'Controls', includeHidden: true })).toHaveAttribute('inert', '')

    const canvas = await page.locator('.maplibregl-canvas').boundingBox()
    expect(canvas).not.toBeNull()
    const middle = { x: canvas!.x + canvas!.width / 2, y: canvas!.y + canvas!.height / 2 }
    const popups = page.locator('.maplibregl-popup')

    // Off the line, on the closed ground. Retried, because a tap counts only
    // once both layers have drawn, which nothing on the page announces.
    await expect(async () => {
      await page.touchscreen.tap(middle.x, middle.y + 120)
      await expect(popups).toContainText('Probe Area Closure', { timeout: 1_500 })
    }).toPass({ timeout: 20_000 })

    // Four pixels off the 2.5px line: the trail, in place of the area.
    await page.touchscreen.tap(middle.x, middle.y + 4)
    await expect(popups).toHaveCount(1)
    await expect(popups).toContainText('Probe Trail Closure')
  })

  // A card is placed as every card is (#738): a tap just under the chip rows
  // would have stood a closure's card over them, where only a destination's
  // card used to be fitted, so its name opened under the search pill.
  test('a closure card tapped under the search pill stands clear of every button over the map', async ({ page }) => {
    await page.route('**/api/closures**', (r) => {
      const kind = new URL(r.request().url()).searchParams.get('kind')
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kind === 'trail' ? collection([]) : AREA) })
    })
    await page.goto('/?view=-121.5,47.5,12&closedareas=1')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const canvas = (await page.locator('.maplibregl-canvas').boundingBox())!
    const overlays = await page.locator('[data-map-overlay]').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
    )
    const rows = Math.max(...overlays.filter((r) => r.top < canvas.y + canvas.height / 2).map((r) => r.bottom))
    const popups = page.locator('.maplibregl-popup')

    await expect(async () => {
      await page.touchscreen.tap(canvas.x + canvas.width / 2, rows + 30)
      await expect(popups).toContainText('Probe Area Closure', { timeout: 1_500 })
    }).toPass({ timeout: 20_000 })

    // Read once the pan has settled.
    await page.waitForTimeout(600)
    const card = (await popups.locator('.maplibregl-popup-content').boundingBox())!
    for (const r of overlays) {
      const overlaps = card.x < r.right && card.x + card.width > r.left && card.y < r.bottom && card.y + card.height > r.top
      expect(overlaps).toBe(false)
    }
  })
})
