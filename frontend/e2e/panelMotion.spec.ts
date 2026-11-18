import { test, expect, expectRanked, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A desk's controls are a card over the map (#825; record 0305), so opening
// or closing them moves no edge: the map keeps the window's width and is
// never resized. A press on Table, Chart or Both opens and closes the results
// panes over the panel speed's 300ms (#714; record 0202).
// Measured on the live layout, frame by frame, since jsdom lays nothing out.

const CARD_PX = 361
const MAP_INSET_PX = 12

// Every frame for `ms` after a press, read in the frame: the panel's right
// edge, the map column's left edge and width, the results' top, and the
// width of the map's canvas, which changes only when the map is resized.
function framesAfter(page: Page, press: string, ms: number) {
  return page.evaluate(
    async ([selector, windowMs]) => {
      const aside = document.querySelector('aside')!
      const map = document.querySelector('main')!.firstElementChild!
      const results = document.querySelector('[data-tour="results"]')
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement
      const frames: {
        panelRight: number
        mapLeft: number
        mapWidth: number
        mapBottom: number
        resultsTop: number
        canvasWidth: number
      }[] = []
      ;(document.querySelector(selector) as HTMLElement).click()
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          const m = map.getBoundingClientRect()
          frames.push({
            panelRight: aside.getBoundingClientRect().right,
            mapLeft: m.left,
            mapWidth: m.width,
            mapBottom: m.bottom,
            resultsTop: results ? results.getBoundingClientRect().top : NaN,
            canvasWidth: canvas.width,
          })
          if (performance.now() - t0 < windowMs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return frames
    },
    [press, ms] as const,
  )
}

test.use({ viewport: { width: 1440, height: 900 } })

// How many sizes the map's canvas took over a press.
const canvasSizes = (frames: { canvasWidth: number }[]) => new Set(frames.map((f) => f.canvasWidth)).size

test('the controls card opens and closes over a map that keeps the window', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const width = page.viewportSize()!.width
  const card = page.locator('aside')

  // Open: the card stands one inset in from the map's top left, 361px wide,
  // with the search field in its Destinations section and the chip row under
  // it, in its column, on a map this tall.
  await expect(card).toHaveJSProperty('offsetWidth', CARD_PX)
  const open = (await card.boundingBox())!
  expect({ x: open.x, y: open.y }).toEqual({ x: MAP_INSET_PX, y: MAP_INSET_PX })
  await expect(card.getByRole('combobox')).toBeVisible()
  const chips = (await page.getByRole('button', { name: 'Layers' }).boundingBox())!
  expect(chips.x).toBeLessThan(open.x + open.width)
  expect(chips.y).toBe(open.y + open.height + 12)

  // Shut: the card is gone whole, and the chips, with the way back, stand
  // where it stood.
  const closing = await framesAfter(page, 'button[aria-label="Close controls"]', 400)
  for (const f of closing) expect({ left: f.mapLeft, width: f.mapWidth }).toEqual({ left: 0, width })
  expect(canvasSizes(closing)).toBe(1)
  await expect(card).toBeHidden()
  const under = (await page.getByRole('button', { name: 'Layers' }).boundingBox())!
  expect(under.y).toBe(MAP_INSET_PX)

  const opening = await framesAfter(page, 'button[aria-label="Open controls"]', 400)
  for (const f of opening) expect({ left: f.mapLeft, width: f.mapWidth }).toEqual({ left: 0, width })
  expect(canvasSizes(opening)).toBe(1)
  await expect(card).toHaveJSProperty('offsetWidth', CARD_PX)
})

// The search field is one field through an open and a close, never a second
// one mounted in its place, so what the reader typed is still in it.
test('the search field is the same field when the card closes and opens', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const field = page.locator('aside').getByRole('combobox')
  const kept = () => field.evaluate((el) => (el as HTMLElement & { kept?: boolean }).kept === true)
  await field.evaluate((el) => ((el as HTMLElement & { kept?: boolean }).kept = true))
  await page.getByRole('button', { name: 'Close controls' }).click()
  expect(await kept()).toBe(true)
  await page.getByRole('button', { name: 'Open controls' }).click()
  expect(await kept()).toBe(true)
})

// One section is open at a time, and the others say what they are set to.
test('the card opens one section at a time, and the others say what they are set to', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const head = (name: string) => page.locator('aside h2').getByRole('button', { name: new RegExp(`^${name}`) })
  await expect(head('Destinations')).toHaveAttribute('aria-expanded', 'true')
  await expect(head('Destinations')).toHaveText('Destinations')
  await expect(head('Forecast')).toHaveText('Forecast Current · NOAA GFS')
  await expect(head('Metrics')).toHaveText(/^Metrics AQI · Lowest · \d+$/)
  await expect(page.locator('aside').getByRole('button', { name: /^Search by area/ })).toBeVisible()

  await head('Forecast').click()
  await expect(head('Forecast')).toHaveAttribute('aria-expanded', 'true')
  await expect(head('Destinations')).toHaveAttribute('aria-expanded', 'false')
  await expect(head('Destinations')).toHaveText('Destinations None yet')
  await expect(page.locator('aside').getByRole('button', { name: /^Search by area/ })).toBeHidden()

  // The card is never taller than the map less an inset over and under it.
  const card = (await page.locator('aside').boundingBox())!
  const map = (await page.locator('main > div').first().boundingBox())!
  expect(card.y + card.height).toBeLessThanOrEqual(map.y + map.height - MAP_INSET_PX)
})

// The chip row stands under the open card while the legend's card has room
// there, so the key shares the card's column and the map to its right stays
// clear (the maintainer, 2026-11-17), and beside the card while it has not.
test('the chips stand under the card where the legend has room, and beside it where it has not', async ({ page }) => {
  await page.goto('/?wildfires=1')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const card = page.locator('aside')
  const head = (name: string) => card.locator('h2').getByRole('button', { name: new RegExp(`^${name}`) })
  const layers = page.getByRole('button', { name: 'Layers', exact: true })
  const where = async () => {
    const c = (await card.boundingBox())!
    const l = (await layers.boundingBox())!
    return l.x > c.x + c.width ? 'beside' : l.y >= c.y + c.height ? 'under' : 'over'
  }

  // Metrics is the tallest section: open, the card leaves the legend nothing
  // under it on a 900px map, so the chips are the map's first row beside it.
  await head('Metrics').click()
  await expect.poll(where).toBe('beside')
  expect((await layers.boundingBox())!.y).toBe(MAP_INSET_PX)

  // Collapsed, the card is at its shortest and the chips stand under it.
  await head('Metrics').click()
  await expect.poll(where).toBe('under')
  const shut = (await card.boundingBox())!
  expect((await layers.boundingBox())!.y).toBe(shut.y + shut.height + 12)

  // The legend's card hangs under its chip in the card's column, inside the map.
  const key = page.getByText('Active wildfires').first()
  await expect(key).toBeVisible()
  const keyBox = (await key.boundingBox())!
  const map = (await page.locator('main > div').first().boundingBox())!
  expect(keyBox.x).toBeLessThan(shut.x + shut.width)
  expect(keyBox.y).toBeGreaterThan(shut.y + shut.height)
  expect(keyBox.y + keyBox.height).toBeLessThanOrEqual(map.y + map.height)

  // The Layers menu is taller than what is left under the chips: it stops
  // one inset over the window's foot and scrolls, so its last row is in reach.
  await layers.click()
  const menu = page.locator('[data-tour="layers-menu"]')
  await expect(menu).toBeVisible()
  const menuBox = (await menu.boundingBox())!
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height - MAP_INSET_PX + 0.5)
  const sizes = await menu.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(sizes.scroll).toBeGreaterThanOrEqual(sizes.client)
  await menu.getByRole('checkbox', { name: 'Forecast player' }).scrollIntoViewIfNeeded()
  await expect(menu.getByRole('checkbox', { name: 'Forecast player' })).toBeInViewport()
})

// A shut pane keeps its body, inert, so the next press opens a frame around a
// body already drawn (record 0216).
const shutChart = (page: Page) => page.locator('[data-tour="results"] [inert] .recharts-wrapper')
const shutTable = (page: Page) => page.locator('[data-tour="results"] [inert] [data-results-table]')

// A press keeps the results' height (#850; the maintainer, 2026-11-04: "Yes,
// area keeps its height"), so the panes move inside it and the map holds
// still in every frame, on the results' top.
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
  await page.getByRole('button', { name: 'Analyze' }).click()
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
