import { deflateSync } from 'node:zlib'
import { test, expect } from './fixtures'
import type { Locator } from '@playwright/test'

// An open radar card renames itself as the forecast player changes frames, and
// it keeps one width while it does (#752): a card as wide as its name grew and
// shrank around its tip, carrying the close button sideways, 129px on `No
// radar echo` and 181px on `Moderate precipitation` (measured 2026-10-16).

test.use({ viewport: { width: 1280, height: 800 } })

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

// A radar tile of one colour at every pixel, which the card reads as the
// palette value that colour encodes. Encoded here rather than drawn on a
// canvas, which could blend the exact colour the card has to match.
function solidTile(rgba: readonly [number, number, number, number], size = 256): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const line = Buffer.alloc(1 + size * 4)
  for (let x = 0; x < size; x++) line.set(rgba, 1 + x * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => line)))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// Where a card stands once the map has stopped moving: opening one pans the
// map by the card's fit, and the card rides along.
async function settled(card: Locator) {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await card.boundingBox())
        const still = now === last
        last = now
        return still
      },
      { intervals: [400] },
    )
    .toBe(true)
  return JSON.parse(last) as { x: number; width: number }
}

// N0Q palette colours, each an exact entry so the card reads its value:
// index 170 is 52.5 dBZ, `Very heavy precipitation`, the longest name the
// radar gives, and index 135 is 35 dBZ, `Moderate precipitation`.
const VERY_HEAVY = solidTile([0xcd, 0x00, 0x00, 255])
const MODERATE = solidTile([0x32, 0x73, 0x08, 255])
const NO_ECHO = solidTile([0, 0, 0, 0])

// The newest frame is the bare product id (`radarTileUrl`), the one before it
// is ten minutes older, and every frame older still paints nothing.
function frameTile(url: string): Buffer {
  if (url.includes('/nexrad-n0q-900913/')) return VERY_HEAVY
  if (url.includes('/nexrad-n0q-900913-m10m/')) return MODERATE
  return NO_ECHO
}

test('an open radar card follows the player at one width', async ({ page }) => {
  await page.route('https://mesonet.agron.iastate.edu/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: frameTile(route.request().url()) }),
  )
  await page.goto('/?radar=1')
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  // Clicked as soon as the newest frame paints, before the warm-up has
  // loaded the older frames there: the playhead then lands on a frame whose
  // tiles are still on their way, which read `No radar echo` over a painted
  // storm until each tile arriving read the card again (#752).
  await expect
    .poll(async () => {
      await page.mouse.move(at.x, at.y)
      await page.mouse.move(at.x + 2, at.y + 2)
      return canvas.evaluate((el) => (el as HTMLElement).style.cursor)
    })
    .toBe('pointer')
  await page.mouse.click(at.x + 2, at.y + 2)
  const card = page.locator('.maplibregl-popup')
  await expect(card.getByText('Very heavy precipitation')).toBeVisible()
  const first = await settled(card)

  const slider = page.getByRole('slider', { name: 'Radar time' })
  for (const name of ['Moderate precipitation', 'No radar echo']) {
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(card.getByText(name)).toBeVisible()
    const now = await settled(card)
    expect(Math.abs(now.width - first.width), name).toBeLessThan(0.5)
    expect(Math.abs(now.x - first.x), name).toBeLessThan(0.5)
  }
  // The names not shown are neither seen nor read.
  await expect(card.getByText('Very heavy precipitation')).toBeHidden()
})
