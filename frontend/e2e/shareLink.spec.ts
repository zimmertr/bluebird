import { test, expect, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

test('a share link restores the ring, the types, the window and the model', async ({ page, request }) => {
  // The model and its label come from the image, so the test follows the
  // published list rather than a copy of it. Not the first entry, which is
  // the default today: the picker must show what the link asked for, not
  // what it would have shown anyway.
  const caps = (await (await request.get('/api/capabilities')).json()) as {
    forecast_models: { id: string; label: string }[]
  }
  const model = caps.forecast_models[1]
  const d1 = isoDay(1)
  const d2 = isoDay(2)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d2}&model=${model.id}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)

  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Peaks', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: `Forecast model: ${model.label}`, exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('d1')).toBe(d1)
  await expect.poll(() => new URL(page.url()).searchParams.get('d2')).toBe(d2)
  await expect.poll(() => new URL(page.url()).searchParams.get('model')).toBe(model.id)
  await expect(page.getByRole('button', { name: 'Analyze' })).toBeEnabled()
})

test('a link that runs on open fills the table and drops its flag', async ({ page }) => {
  // The run waits for the live limits, then the address bar loses the flag,
  // so a reload is an ordinary restore rather than a second spend (#511).
  const d1 = isoDay(1)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&analyze=1`)

  await expect(page.locator('table tbody tr')).toHaveCount(DESTINATION_NAMES.length)
  await expect.poll(() => new URL(page.url()).searchParams.has('analyze')).toBe(false)
  await expect.poll(() => new URL(page.url()).searchParams.get('d1')).toBe(d1)
})

test('the address bar keeps the readable link the app writes, and writes it once', async ({ page }) => {
  // Count every history write, so a query the browser rewrote on its own
  // (and the sync effect then chased forever) shows as writes that keep coming.
  await page.addInitScript(() => {
    const counted = window as unknown as { urlWrites: number }
    counted.urlWrites = 0
    const replace = history.replaceState.bind(history)
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      counted.urlWrites += 1
      replace(...args)
    }
  })
  const writes = () => page.evaluate(() => (window as unknown as { urlWrites: number }).urlWrites)

  // Opened in the fully escaped form URLSearchParams used to write, with a
  // default ranking and results cap spelled out, so the app has one rewrite
  // to make: the delimiters readable, the defaults dropped.
  const d1 = isoDay(1)
  const pin = '-121.94734,47.48844,peak,2995,node/349018340,East+Tiger+Mountain'
  await page.goto(
    `/?type=peak&sort=aqi_avg&limit=200&mode=days&d1=${d1}` +
      `&poly=-121.9%2C47.4%3B-121.7%2C47.4%3B-121.7%2C47.55&pins=${pin}`,
  )
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()

  // The model is the deployment's default, whatever it is today, and the
  // camera is where the opening fit left it, so both are read as a shape and
  // the rest of the query compared exactly.
  const readable = `?type=peak&model=M&mode=days&d1=${d1}&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&pins=${pin}&view=V`
  const shape = (search: string) =>
    search.replace(/model=[a-z0-9_]+/, 'model=M').replace(/&view=-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?$/, '&view=V')
  await expect.poll(async () => shape(await page.evaluate(() => location.search))).toBe(readable)
  expect(shape(new URL(page.url()).search)).toBe(readable)

  // Settled: the debounce is 400 ms, so a second write would land well inside
  // this wait if the bar and the writer disagreed.
  const settled = await writes()
  await page.waitForTimeout(1500)
  expect(await writes()).toBe(settled)
})

test('a model the deployment does not offer falls back to the default, in the panel and the link', async ({
  page,
  request,
}) => {
  const caps = (await (await request.get('/api/capabilities')).json()) as {
    forecast_models: { id: string; label: string; default?: boolean }[]
  }
  const fallback = caps.forecast_models.find((m) => m.default) ?? caps.forecast_models[0]
  const compared = caps.forecast_models.find((m) => m.id !== fallback.id)!
  const d1 = isoDay(1)
  await page.goto(
    `/?type=peak&model=not_a_model&compare=also_not,${compared.id}&mode=days&d1=${d1}` +
      '&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55',
  )

  await expect(page.getByRole('button', { name: `Forecast model: ${fallback.label} +1`, exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('model')).toBe(fallback.id)
  await expect.poll(() => new URL(page.url()).searchParams.get('compare')).toBe(compared.id)
})

// The link writer's debounce (`debounceUrlWrite`), and a margin past it.
const PAST_DEBOUNCE_MS = 600

// Hold that `read` keeps answering `want` until the writer's debounce has run
// out, so a write queued a moment ago would have landed and failed it.
async function holdsPastDebounce(page: Page, read: () => string | null, want: string | null) {
  const until = Date.now() + PAST_DEBOUNCE_MS
  while (Date.now() < until) {
    expect(read()).toBe(want)
    await page.waitForTimeout(100)
  }
  expect(read()).toBe(want)
}

test('a link reopens at its camera, with its removals and its table order', async ({ page }) => {
  // The fixture places its five destinations around the ring's centroid; the
  // third, Gamma Butte, stands at (-121.792, 47.4375) for this ring.
  const d1 = isoDay(1)
  const view = '-121.75,47.45,10.25'
  // The wildfire overlay asks for the perimeters in the viewport once the map
  // has loaded, so its first request is the camera the map opened on, read
  // after the opening frame had its chance to fit the ring.
  const fires = page.waitForRequest((r) => r.url().includes('/api/wildfires'))
  await page.goto(
    `/?type=peak&mode=days&d1=${d1}&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&fires=1` +
      `&removed=-121.792,47.4375&tsort=name&tdesc=1&view=${view}&analyze=1`,
  )
  const [west, south, east, north] = new URL((await fires).url()).searchParams.get('bbox')!.split(',').map(Number)
  // A fit to the ring would centre on (-121.8, 47.475).
  expect(Math.abs((west + east) / 2 - -121.75)).toBeLessThan(0.005)
  expect(Math.abs((south + north) / 2 - 47.45)).toBeLessThan(0.005)

  // The removal survives the link's own first Analyze, and the header sort
  // survives the report it arrives with.
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(DESTINATION_NAMES.length - 1)
  const names = [...DESTINATION_NAMES].filter((n) => n !== 'Gamma Butte').sort().reverse()
  for (const [i, name] of names.entries()) await expect(rows.nth(i)).toContainText(name)

  const search = () => new URL(page.url()).searchParams
  await expect.poll(() => search().has('analyze')).toBe(false)
  await holdsPastDebounce(page, () => search().get('view'), view)
  expect(search().get('removed')).toBe('-121.792,47.4375')
  expect(search().get('tsort')).toBe('name')
  expect(search().get('tdesc')).toBe('1')
})

// A click places a vertex only once MapLibre has fired `load` and the draw
// handler is attached, so the first vertex the panel counts says the map has
// loaded. Escape then cancels draw mode and leaves no ring behind.
async function waitForMapLoad(page: Page) {
  await page.getByRole('button', { name: 'Draw polygon' }).click()
  const counted = page.getByText('Add at least 2 more points')
  await expect(async () => {
    if (!(await counted.isVisible())) await page.locator('.maplibregl-canvas').click({ position: { x: 520, y: 260 } })
    await expect(counted).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })
  await page.keyboard.press('Escape')
}

test('a fresh session writes no link until the reader moves the map', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  // The camera reports itself on load, as the app's move, which writes nothing.
  await waitForMapLoad(page)
  await holdsPastDebounce(page, () => new URL(page.url()).search, '')

  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?$/)
})

// A link's camera was the sender's own move, so a link carrying nothing else
// keeps it rather than being stripped to the bare path.
test('a link that carries a camera alone keeps it', async ({ page }) => {
  const view = '-121.75,47.45,10.25'
  await page.goto(`/?view=${view}`)
  await waitForMapLoad(page)
  await holdsPastDebounce(page, () => new URL(page.url()).searchParams.get('view'), view)
})
