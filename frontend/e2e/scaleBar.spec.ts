import { test, expect } from './fixtures'

// The scale bar's label never runs past the bar's end (#739; record 0161).
// MapLibre draws the bar at `SCALE_MAX_WIDTH_PX` times the ratio of a round
// distance to the distance that width spans, and the round distance's leading
// digit bounds that ratio from below: just over 1/2 for a 1 or a 5, 2/3 for a
// 2 and 3/5 for a 3 (`getRoundNum` in the library's scale control). So every
// label the map can draw is tried here at the narrowest width it can be drawn
// at, on the live control, in the app's own CSS, rather than by panning the
// map until a bad case turns up. The label cannot wrap (the library joins the
// number and the unit with a no-break space), so what this measures is the
// label against the bar's inner edge, and the box's height.
//
// This is what holds the label at the vendor's 10px, under the app's 11px
// floor: at 11px `1000 km` on its 50px bar ran 1.2px past the end here.

const SCALE_MAX_WIDTH_PX = 100 // map/controls.ts; styles.test.ts pins it there
const LEAST_RATIO: Record<number, number> = { 1: 1 / 2, 2: 2 / 3, 3: 3 / 5, 5: 1 / 2 }
// A 512px world at zoom 0 spans about 7,800 km in 100px at the equator, so
// `5000 km` is never drawn under 64px; the other labels can reach their least.
const WIDEST_KM = 7_800

const LABELS: { label: string; width: number }[] = []
const add = (distance: number, unit: string, leading: number, span = Infinity) =>
  LABELS.push({
    label: `${distance} ${unit}`,
    width: SCALE_MAX_WIDTH_PX * Math.max(LEAST_RATIO[leading], distance / span),
  })
// Metres below a kilometre, kilometres up to that span, and the decimals a
// zoom-22 map rounds to near the poles.
for (const pow of [1, 10, 100]) for (const d of [1, 2, 3, 5]) add(d * pow, 'm', d)
for (const pow of [1, 10, 100, 1000]) for (const d of [1, 2, 3, 5]) add(d * pow, 'km', d, WIDEST_KM)
for (const d of [1, 2, 3, 5]) add(Number(`0.${d}`), 'm', d)

for (const theme of ['dark', 'light']) {
  test(`every scale label stays inside its narrowest bar in the ${theme} theme`, async ({ page }) => {
    if (theme === 'light') await page.addInitScript(() => localStorage.setItem('bluebird_forecast_theme', 'light'))
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    const scale = page.locator('.maplibregl-ctrl-scale')
    await expect(scale).toBeVisible()
    expect(await scale.evaluate((el) => getComputedStyle(el).fontSize)).toBe('10px')

    const fits = await scale.evaluate((el, cases) => {
      const box = el as HTMLElement
      const padLeft = parseFloat(getComputedStyle(box).paddingLeft)
      const range = document.createRange()
      return cases.map(({ label, width }) => {
        box.style.width = `${width}px`
        box.textContent = label
        range.selectNodeContents(box)
        const text = range.getBoundingClientRect().width
        return {
          label,
          width: Math.round(width),
          // From the label's end to the inside of the bar's right edge.
          room: Math.round((box.clientWidth - padLeft - text) * 10) / 10,
          height: box.offsetHeight,
        }
      })
    }, LABELS)
    console.log(`scale labels, ${theme}`, JSON.stringify(fits))
    for (const { label, room, height } of fits) {
      expect(room, label).toBeGreaterThanOrEqual(0)
      // The vendor's 20px line and its 2px bottom edge: one line.
      expect(height, label).toBe(22)
    }
  })
}
