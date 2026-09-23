import { test, expect } from './fixtures'

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
