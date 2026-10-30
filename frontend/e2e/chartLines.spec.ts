import { test, expect, resultRows, isoDay } from './fixtures'

// Up to twenty lines, every chart line is a ColorBrewer Set1 colour of its
// own, with nothing drawn round it (#801): in light each clears 3:1 against
// the panel. Dark asserts no ratio: four of its twenty stand under 3:1 by
// decision (record 0228), Brewer's purple among the fixture's five, and
// `chartColors.test.ts` pins every one. The lines are a canvas (record 0244),
// so a line's colour is read off its pixels: the five most common opaque
// colours are the five lines, since anti-aliasing blends only their edges.
// Only a browser can say a line paints its colour in each theme and that no
// filter stands over the lines. The fixture's five lines are Brewer's first
// five.

test.use({ viewport: { width: 1280, height: 900 } })

// The panel under the plot in light, `CHART_CHROME.light.surface`.
const LIGHT_PANEL = 'rgb(238, 242, 249)'

function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((v) => {
    const c = Number(v) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('draws each chart line in a colour of its own, at 3:1 in light, under no filter', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bluebird_forecast_theme', 'light'))
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page).first()).toBeAttached()

  const strokes = () =>
    page.locator('[data-tour="chart"] canvas').first().evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      const count = new Map<string, number>()
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] !== 255) continue
        const rgb = `rgb(${d[k]}, ${d[k + 1]}, ${d[k + 2]})`
        count.set(rgb, (count.get(rgb) ?? 0) + 1)
      }
      return [...count].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rgb]) => rgb).sort()
    })
  const filtered = () =>
    page
      .locator('svg.recharts-surface g, [data-tour="chart"] canvas')
      .evaluateAll((els) => els.filter((g) => getComputedStyle(g).filter !== 'none').length)
  const holds = (seen: string[], panel?: string) => {
    expect(new Set(seen).size).toBe(seen.length)
    if (panel) for (const stroke of seen) expect(contrast(stroke, panel), stroke).toBeGreaterThanOrEqual(3)
  }

  await expect.poll(async () => (await strokes()).length).toBe(5)
  const light = await strokes()
  holds(light, LIGHT_PANEL)
  expect(await filtered()).toBe(0)

  await page.getByRole('button', { name: 'Switch to dark theme' }).first().click()
  await expect.poll(strokes).not.toEqual(light)
  const dark = await strokes()
  expect(dark).toHaveLength(light.length)
  holds(dark)
  expect(await filtered()).toBe(0)
})
