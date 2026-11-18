import { test, expect, expectRanked, resultRows, DESTINATION_NAMES, forecastButton } from './fixtures'
import type { Page } from '@playwright/test'

// A press on Table, Chart or Both opens and closes the results panes at the
// speed the desk panel moved at (record 0202). The panel itself is gone since
// the sentence bar (record 0308), and its own tests with it.
// Measured on the live layout, frame by frame, since jsdom lays nothing out.

test.use({ viewport: { width: 1440, height: 900 } })

test('a press on Both opens the chart pane at the panel speed, holding the map still', async ({ page }) => {
  // Read once the press to Table has finished moving: the chart's pane is
  // inert from the press, so its shut body says nothing about where the map
  // stands.
  await analyzedAt(page, 'Show table only')
  await expect(shutChart(page)).toHaveCount(1)
  const mapBottom = () => page.locator('main > div').first().evaluate((el) => el.getBoundingClientRect().bottom)
  const before = await mapBottom()

  const opening = await paneFramesAfter(page, 'Show both chart and table', 900)
  for (const f of opening) {
    expect(Math.abs(f.mapBottom - f.resultsTop)).toBeLessThan(1)
    expect(Math.abs(f.mapBottom - before)).toBeLessThan(1)
  }
  // The chart's pane opened over more than one frame.
  expect(partOpen(opening, 'chartFrame')).toBeGreaterThan(0)

  const closing = await paneFramesAfter(page, 'Show table only', 900)
  for (const f of closing) expect(Math.abs(f.mapBottom - before)).toBeLessThan(1)
  expect(partOpen(closing, 'chartFrame')).toBeGreaterThan(0)
  // The chart kept, inert, behind its shut pane.
  await expect(shutChart(page)).toHaveCount(1)
})


// Every frame for `ms` after a press on a results control, read in the frame:
// the map's foot and the results' top, the map's canvas size, the heights of
// the chart's, the legend's and the table's frames, the chart's drawn size,
// and whether the table is mounted.
function paneFramesAfter(page: Page, label: string, ms: number) {
  return page.evaluate(
    async ([name, windowMs]) => {
      const map = document.querySelector('main')!.firstElementChild!
      const results = document.querySelector('[data-tour="results"]')!
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement
      const frames: {
        mapBottom: number
        resultsTop: number
        canvas: string
        chartFrame: number
        legendFrame: number
        tableFrame: number
        chartSize: string | null
        table: boolean
      }[] = []
      // The collapse chevron has a twin for a folded bar; either one acts.
      ;(document.querySelector(`button[aria-label="${name}"]`) as HTMLElement).click()
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          const svg = results.querySelector('.recharts-surface')
          frames.push({
            mapBottom: map.getBoundingClientRect().bottom,
            resultsTop: results.getBoundingClientRect().top,
            canvas: `${canvas.width}x${canvas.height}`,
            chartFrame: results.children[1].getBoundingClientRect().height,
            legendFrame: results.children[2].getBoundingClientRect().height,
            tableFrame: results.children[3].getBoundingClientRect().height,
            chartSize: svg ? `${svg.getAttribute('width')}x${svg.getAttribute('height')}` : null,
            table: results.querySelector('[data-results-table]') !== null,
          })
          if (performance.now() - t0 < windowMs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return frames
    },
    [label, ms] as const,
  )
}

// Every count of moving frames below asks for more than one paint, never for
// a number of them: how many frames a 300ms move paints is the runner's frame
// rate, and CI's painted two where a Mac paints fifteen (run 39684864494,
// 2026-10-21). What the design promises is pinned per frame, and its speed by
// `MOTION.pane` in styles.test.ts.
const distinct = <T,>(values: T[]) => new Set(values).size

async function analyzedAt(page: Page, mode: 'Show both chart and table' | 'Show chart only' | 'Show table only') {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await forecastButton(page).click()
  await expectRanked(page)
  await page.getByRole('button', { name: mode }).click()
  await page.waitForTimeout(600)
}

// Whether every pane standing part open in a frame has its body in it: the
// data is on screen as a pane grows and as it shrinks (TJ, 2026-10-21).
const blankFrames = (frames: { chartFrame: number; tableFrame: number; chartSize: string | null; table: boolean }[]) =>
  frames.filter((f) => (f.chartFrame > 0.5 && f.chartSize === null) || (f.tableFrame > 0.5 && !f.table)).length
type Frame = 'chartFrame' | 'legendFrame' | 'tableFrame'
const partOpen = (frames: Record<Frame, number>[], key: Frame) => {
  const end = frames[frames.length - 1][key]
  return frames.filter((f) => f[key] > 0.5 && Math.abs(f[key] - end) > 0.5).length
}

// The chevron shuts and opens the panes through the same frames a press
// moves, at the same speed both ways, with the chart and the table in them
// the whole way, and the map's box holds through it, so its canvas is resized
// where the move starts and where it ends, and in no frame between.
test('the collapse chevron shuts and opens the results at the panel speed', async ({ page }) => {
  await analyzedAt(page, 'Show both chart and table')
  await expect(page.locator('[data-tour="results"] .recharts-wrapper')).toHaveCount(1)
  const resting = await page.locator('main > div').first().evaluate((el) => el.getBoundingClientRect().bottom)

  const collapsing = await paneFramesAfter(page, 'Collapse results', 900)
  for (const f of collapsing) expect(Math.abs(f.mapBottom - f.resultsTop)).toBeLessThan(1)
  expect(distinct(collapsing.map((f) => Math.round(f.mapBottom)))).toBeGreaterThan(1)
  expect(distinct(collapsing.map((f) => f.canvas))).toBeLessThanOrEqual(3)
  // The chart and the table stay drawn, the chart at the one size, until
  // their frames have shut.
  expect(partOpen(collapsing, 'chartFrame')).toBeGreaterThan(0)
  expect(partOpen(collapsing, 'tableFrame')).toBeGreaterThan(0)
  expect(blankFrames(collapsing)).toBe(0)
  expect(distinct(collapsing.flatMap((f) => (f.chartSize ? [f.chartSize] : [])))).toBe(1)
  expect(collapsing[collapsing.length - 1].chartFrame).toBe(0)
  await expect(shutChart(page)).toHaveCount(1)
  await expect(shutTable(page)).toHaveCount(1)

  const expanding = await paneFramesAfter(page, 'Expand results', 900)
  for (const f of expanding) expect(Math.abs(f.mapBottom - f.resultsTop)).toBeLessThan(1)
  expect(distinct(expanding.map((f) => Math.round(f.mapBottom)))).toBeGreaterThan(1)
  expect(distinct(expanding.map((f) => f.canvas))).toBeLessThanOrEqual(3)
  expect(expanding[expanding.length - 1].mapBottom).toBeCloseTo(resting, 0)
  // Both come back with their data as they open.
  expect(partOpen(expanding, 'chartFrame')).toBeGreaterThan(0)
  expect(partOpen(expanding, 'tableFrame')).toBeGreaterThan(0)
  expect(blankFrames(expanding)).toBe(0)
  await expect(page.locator('[data-tour="results"] .recharts-wrapper')).toHaveCount(1)
  await expect(shutChart(page)).toHaveCount(0)
  await expect(shutTable(page)).toHaveCount(0)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
})

// An opening pane brings its data with it (TJ, 2026-10-21: "I think the data
// should be there as it extends up"): the chart is mounted at the press and
// drawn at the size it will stand at, and its frame uncovers it.
test('an opening pane\'s chart is mounted and drawn at its end size in every moving frame', async ({ page }) => {
  await analyzedAt(page, 'Show table only')
  const opening = await paneFramesAfter(page, 'Show both chart and table', 900)
  const end = opening[opening.length - 1]
  const moving = opening.filter((f) => f.chartFrame > 0.5 && f.chartFrame < end.chartFrame - 1)
  expect(moving.length).toBeGreaterThan(0)
  for (const f of moving) expect(f.chartSize).toBe(end.chartSize)
  // The table stays mounted throughout.
  for (const f of opening) expect(f.table).toBe(true)
})

// The results keep one height through every press (#850; the maintainer,
// 2026-11-04: "Can we also make sure that when we switch to Chart-only the
// vertical size of the results area doesn't change?"), which reverses the
// chart's one size in every mode (#795): the chart grows into the table's
// room with its legend under it, and Both splits the room back. The legend
// is a pane of its own, which opens as the table's frame shuts and shuts as
// it opens.
test('the results keep one height through every press, and the chart grows into the table\'s room', async ({ page }) => {
  await analyzedAt(page, 'Show both chart and table')
  const top = await page.locator('[data-tour="results"]').evaluate((el) => el.getBoundingClientRect().top)
  const size = await page
    .locator('[data-tour="results"] .recharts-surface')
    .evaluate((el) => `${el.getAttribute('width')}x${el.getAttribute('height')}`)
  const heightOf = (drawn: string | null) => Number(drawn!.split('x')[1])
  const end = <T,>(frames: T[]) => frames[frames.length - 1]
  const held = (frames: { resultsTop: number }[]) => {
    for (const f of frames) expect(Math.abs(f.resultsTop - top)).toBeLessThan(1)
  }

  const toChart = await paneFramesAfter(page, 'Show chart only', 900)
  held(toChart)
  expect(partOpen(toChart, 'legendFrame')).toBeGreaterThan(0)
  expect(partOpen(toChart, 'tableFrame')).toBeGreaterThan(0)
  expect(end(toChart).legendFrame).toBeGreaterThan(0)
  expect(end(toChart).tableFrame).toBe(0)
  const chartSize = end(toChart).chartSize
  expect(heightOf(chartSize)).toBeGreaterThan(heightOf(size))

  const toBoth = await paneFramesAfter(page, 'Show both chart and table', 900)
  held(toBoth)
  expect(partOpen(toBoth, 'legendFrame')).toBeGreaterThan(0)
  expect(end(toBoth).legendFrame).toBe(0)
  expect(end(toBoth).tableFrame).toBeGreaterThan(0)
  // Split back the way Both stood.
  expect(end(toBoth).chartSize).toBe(size)

  // Table to Chart hands the chart the same room the table had.
  const toTable = await paneFramesAfter(page, 'Show table only', 900)
  held(toTable)
  expect(partOpen(toTable, 'chartFrame')).toBeGreaterThan(0)
  expect(blankFrames(toTable)).toBe(0)
  await expect(shutChart(page)).toHaveCount(1)
  const tableToChart = await paneFramesAfter(page, 'Show chart only', 900)
  held(tableToChart)
  expect(partOpen(tableToChart, 'legendFrame')).toBeGreaterThan(0)
  expect(end(tableToChart).chartSize).toBe(chartSize)
})
