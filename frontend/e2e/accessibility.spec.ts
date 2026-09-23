import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, drawRing, DESTINATION_NAMES } from './fixtures'

// Serious and critical fail the test. Minor and moderate are logged on the
// test's annotations, so they are visible in the report without gating.
const GATING = new Set(['serious', 'critical'])

// Serious violations accepted for now, each matched by its rule and the text
// of the node it lands on, so a new node failing the same rule still fails
// the test. An entry that stops matching fails the test too, so the list can
// only shrink along with a fix. Each entry names the issue that fixes it.
const KNOWN: { rule: string; html: string; why: string }[] = []

async function audit(page: Page, state: string, seen: Set<string>) {
  // Park the pointer: a hovered accent button is the one state CLAUDE.md
  // records as deliberately under AA, and a click leaves the pointer on it.
  await page.mouse.move(0, 0)
  // The accent's hover fades out over a transition, and axe reads the colour
  // mid-fade. Finite animations only: MapLibre and the spinners may loop.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).analyze()
  test.info().annotations.push({
    type: `axe: ${state}`,
    description: violations.length
      ? violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes)`).join('; ')
      : 'no violations',
  })
  const unknown: string[] = []
  for (const v of violations.filter((v) => GATING.has(v.impact ?? ''))) {
    for (const node of v.nodes) {
      const known = KNOWN.find((k) => k.rule === v.id && node.html.includes(k.html))
      if (known) seen.add(known.html)
      else unknown.push(`${v.id}: ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
    }
  }
  expect.soft(unknown, `serious or critical axe violations with the ${state}`).toEqual([])
}

test('axe finds nothing serious on the panel, the results, or a popover', async ({ page }) => {
  const seen = new Set<string>()
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await audit(page, 'panel open', seen)

  await page.getByRole('checkbox', { name: 'Peaks', exact: true }).check()
  await drawRing(page)
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.locator('table tbody tr')).toHaveCount(DESTINATION_NAMES.length)
  await audit(page, 'results open', seen)

  await page.getByRole('button', { name: 'Layers' }).click()
  await expect(page.getByText('Forecast player')).toBeVisible()
  await audit(page, 'layers popover open', seen)

  expect(KNOWN.filter((k) => !seen.has(k.html)).map((k) => k.why), 'known violations that no longer occur').toEqual([])
})
