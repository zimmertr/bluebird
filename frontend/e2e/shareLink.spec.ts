import { test, expect, DESTINATION_NAMES } from './fixtures'

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

  // The model is the deployment's default, whatever it is today, so it is
  // read as a shape and the rest of the query compared exactly.
  const readable = `?type=peak&model=M&mode=days&d1=${d1}&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&pins=${pin}`
  const shape = (search: string) => search.replace(/model=[a-z0-9_]+/, 'model=M')
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
