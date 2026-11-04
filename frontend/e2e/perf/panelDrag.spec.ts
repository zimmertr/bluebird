import { test, expect, resultRows, peak, destinationsAnswer, isoDay } from '../fixtures'
import type { Browser, Page } from '@playwright/test'

// What a chart panel's title drag costs (#846; the maintainer, 2026-11-03:
// "smooth and fast"): four panels in one over three, 200 lines over 15
// days, dark. A drag from the last slot's title to over the second, one move
// a frame, then the release. Per move, the main thread's task time over the
// drag divided by the moves, from Chrome's trace, and the React commits and
// box measures (`getBoundingClientRect`) made after the drag lifted, which
// should both be none. After the release, the time until the titles stand in
// their new order and a frame has painted, and the long tasks in it. Beside
// it, the same frames with no drag (`idle`), since the page commits and lays
// out now and then on its own (a clock, the map), and the drag's numbers are
// read against that.

const DESTINATIONS = 200
const RUNS = 3
const MOVES = 30
const RING = '-121.9,47.4;-121.5,47.4;-121.5,47.7;-121.9,47.7'

function field() {
  const columns = Math.ceil(Math.sqrt(DESTINATIONS))
  return Array.from({ length: DESTINATIONS }, (_, i) =>
    peak({
      name: `Probe ${i + 1}`,
      latitude: Number((47.42 + Math.floor(i / columns) * 0.02).toFixed(5)),
      longitude: Number((-121.88 + (i % columns) * 0.025).toFixed(5)),
      elevation_ft: 3000 + ((i * 37) % 6000),
      osm_id: `node/${10_000 + i}`,
    }),
  )
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

// The main thread's busy time inside [from, to), in microseconds: the union
// of its tasks, since a trace nests one task's record inside another's.
function busy(tasks: readonly { ts: number; dur?: number }[], from: number, to: number): number {
  const spans = tasks
    .map((e) => [Math.max(from, e.ts), Math.min(to, e.ts + (e.dur ?? 0))] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let end = from
  for (const [a, b] of spans) {
    if (b <= end) continue
    total += b - Math.max(a, end)
    end = b
  }
  return total
}
const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

interface TraceEvent {
  name: string
  ph: string
  ts: number
  dur?: number
  tid: number
  pid: number
  args?: { name?: string; data?: { type?: string } }
}

// The main thread over `MOVES` frames with nothing moving.
async function idle(browser: Browser, page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { probe: { commits: number; rects: number } }
    w.probe.commits = 0
    w.probe.rects = 0
  })
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] })
  const t0 = await page.evaluate(() => performance.now())
  for (let i = 0; i < MOVES; i++) await frame(page)
  const t1 = await page.evaluate(() => performance.now())
  const during = await page.evaluate(() => ({ ...(window as unknown as { probe: { commits: number; rects: number } }).probe }))
  const events = (JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] }).traceEvents
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  const onMain = events.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur)
  const tasks = onMain.filter((e) => /RunTask/.test(e.name))
  const all = onMain.map((e) => e.ts)
  return {
    frames: MOVES,
    spanMs: Math.round(t1 - t0),
    mainPerFrameMs: Math.round(busy(tasks, Math.min(...all), Math.max(...all)) / MOVES / 100) / 10,
    commits: during.commits,
    rectReads: during.rects,
    layouts: onMain.filter((e) => e.name === 'Layout').length,
  }
}

async function drag(browser: Browser, page: Page) {
  const title = page.locator('[data-panel-label="3"]')
  const target = page.locator('[data-chart-box]').nth(1)
  const from = (await title.boundingBox())!
  const to = (await target.boundingBox())!
  const order = await page.locator('[data-panel-label]').allTextContents()
  const expected = [order[0], order[3], order[1], order[2]]
  const x0 = from.x + from.width / 2
  const y0 = from.y + from.height / 2
  const x1 = to.x + to.width / 2
  const y1 = to.y + to.height / 2

  await page.mouse.move(x0, y0)
  await page.mouse.down()
  // Past the threshold, so the drag has lifted before the counters start.
  await page.mouse.move(x0 - 10, y0)
  await frame(page)
  await page.evaluate(() => {
    const w = window as unknown as { probe: { commits: number; rects: number } }
    w.probe.commits = 0
    w.probe.rects = 0
  })
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] })
  for (let i = 1; i <= MOVES; i++) {
    await page.mouse.move(x0 - 10 + ((x1 - x0 + 10) * i) / MOVES, y0 + ((y1 - y0) * i) / MOVES)
    await frame(page)
  }
  const during = await page.evaluate(() => ({ ...(window as unknown as { probe: { commits: number; rects: number } }).probe }))
  // The release, timed in the page from the pointerup to the first frame
  // after the titles stand in their new order.
  const settled = page.evaluate((want) => {
    return new Promise<number>((resolve) => {
      window.addEventListener(
        'pointerup',
        () => {
          const t0 = performance.now()
          const check = () => {
            const now = Array.from(document.querySelectorAll('[data-panel-label]')).map((el) => el.textContent)
            if (JSON.stringify(now) === JSON.stringify(want)) requestAnimationFrame(() => resolve(performance.now() - t0))
            else requestAnimationFrame(check)
          }
          check()
        },
        { capture: true, once: true },
      )
    })
  }, expected)
  await page.waitForTimeout(50)
  await page.mouse.up()
  const releaseMs = await settled
  await page.waitForTimeout(1500)
  const buffer = await browser.stopTracing()
  const events = (JSON.parse(buffer.toString()) as { traceEvents: TraceEvent[] }).traceEvents
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  const onMain = events.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && e.dur)
  const dispatched = (type: string) => onMain.filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === type)
  const moves = dispatched('pointermove')
  const up = dispatched('pointerup')[0]
  const start = moves[0].ts
  const end = up ? up.ts : moves[moves.length - 1].ts + moves[moves.length - 1].dur!
  const tasks = onMain.filter((e) => /RunTask/.test(e.name))
  const afterUp = up ? tasks.filter((e) => e.ts >= up.ts && e.ts < up.ts + releaseMs * 1000 + 50_000) : []
  const layouts = onMain.filter((e) => e.name === 'Layout' && e.ts >= start && e.ts < end).length
  // Where the main thread's time went over the moves, by kind, the largest first.
  const kinds: Record<string, number> = {}
  for (const e of onMain) if (e.ts >= start && e.ts < end && !/RunTask/.test(e.name)) kinds[e.name] = (kinds[e.name] ?? 0) + e.dur!
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v / 100) / 10])
  const ms = (us: number) => Math.round(us / 100) / 10
  return {
    moves: moves.length,
    mainPerMoveMs: ms(busy(tasks, start, end) / Math.max(1, moves.length)),
    pointermoveMedianMs: ms(median(moves.map((e) => e.dur!))),
    spanMs: ms(end - start),
    mainByKindMs: top,
    commitsDuringMoves: during.commits,
    rectReadsDuringMoves: during.rects,
    layoutsDuringMoves: layouts,
    releaseToOrderMs: Math.round(releaseMs),
    releaseMainMs: up ? ms(busy(tasks, up.ts, up.ts + releaseMs * 1000)) : null,
    releaseTasksOver16Ms: afterUp.filter((e) => e.dur! > 16_000).map((e) => ms(e.dur!)),
    releaseLongestTaskMs: ms(Math.max(0, ...afterUp.map((e) => e.dur!))),
  }
}

test('a chart panel title drag at four panels and 200 lines, dark', async ({ browser, page }, testInfo) => {
  // Counts React's commits through the DevTools hook, as `renderCost` does,
  // and every box measure, so a move that renders or reads layout shows.
  await page.addInitScript(() => {
    const w = window as unknown as { probe: { commits: number; rects: number }; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
    w.probe = { commits: 0, rects: 0 }
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => {
        w.probe.commits += 1
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    }
    const rect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      w.probe.rects += 1
      return rect.call(this)
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  const destinations = field()
  await page.route('**/api/destinations', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(destinationsAnswer(destinations)) }),
  )
  await page.goto(
    `/?type=peak&limit=${DESTINATIONS}&poly=${RING}&mode=days&d1=${isoDay(0)}&d2=${isoDay(14)}&sort=precip_total_in&chart=precip,temp,wind,freeze`,
  )
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.locator('aside').getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATIONS, { timeout: 300_000 })
  await page.locator('button[aria-label="Show chart only"]').click()
  await expect(page.locator('[data-panel-label]')).toHaveCount(4)
  await expect(page.locator('[data-tour="chart"] canvas')).toHaveCount(8)
  // Long enough for the field's air quality to land, so nothing arrives mid-probe.
  await page.waitForTimeout(15_000)
  const area = await page.locator('[data-tour="chart"]').boundingBox()

  const still = await idle(browser, page)
  const runs = []
  for (let i = 0; i < RUNS; i++) runs.push(await drag(browser, page))
  const result = { build: process.env.PROBE_BUILD ?? 'this', chartWidthPx: Math.round(area!.width), chartHeightPx: Math.round(area!.height), idle: still, runs }
  console.log(`panel drag: ${JSON.stringify(result)}`)
  await testInfo.attach('panel-drag.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
})
