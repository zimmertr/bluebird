import { test, expect, DESTINATION_NAMES, resultRows } from './fixtures'
import type { Locator } from '@playwright/test'

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
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)

  // Centring a row opens its card on the marker, which says where the marker is.
  await page.getByRole('button', { name: `Center map on ${DESTINATION_NAMES[0]}` }).click()
  const popups = page.locator('.maplibregl-popup')
  const card = page.locator('.maplibregl-popup.result-popup')
  await expect(card).toHaveCount(1)
  const marker = await markerUnder(card)
  await card.locator('.maplibregl-popup-close-button').click()
  await expect(popups).toHaveCount(0)
  // Clear of every marker: they stand within a kilometre of the ring's middle.
  const bare = { x: marker.x + 220, y: marker.y }
  const canvas = page.locator('.maplibregl-canvas')

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
