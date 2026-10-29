// Every host the browser fetches is answered here, so a run spends no
// Open-Meteo quota and no third-party outage can turn it red. The six
// third-party origins are the ones BROWSER_FETCH_ORIGINS in
// backend/app/security_headers.py lists; the CSP would refuse any other.
// A request to a host no handler claims is aborted and counted as a leak,
// and the fixture fails the test on any leak.
import { readFileSync } from 'node:fs'
import { test as base, expect, type Locator, type Page, type Route } from '@playwright/test'

const here = new URL('.', import.meta.url)
const style = JSON.parse(readFileSync(new URL('fixtures/style.json', here), 'utf8'))

// The forecast bodies reuse the inputs of the shared aggregation vectors, so the
// rows and the chart carry the shapes the aggregation is pinned against rather
// than numbers invented for this suite.
interface Vector {
  name: string
  payload: { hourly: Record<string, unknown[]>; hourly_units?: Record<string, string> }
}
const vectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/data/weather_vectors.json', here), 'utf8'),
) as { weather: Vector[]; aqi: Vector[] }
const payloadOf = (list: Vector[], name: string) => {
  const found = list.find((v) => v.name === name)
  if (!found) throw new Error(`weather_vectors.json has no case named ${name}`)
  return found.payload
}
const vector = (list: Vector[], name: string) => payloadOf(list, name).hourly
// The units those same cases declare, which are the ones a real answer
// carries: the aggregation refuses a number whose unit it cannot confirm.
const units = (list: Vector[], name: string) => payloadOf(list, name).hourly_units ?? {}
const WEATHER_INPUTS: Record<string, unknown[]> = {
  ...vector(vectors.weather, 'wind_and_temperature_levels_together'),
  ...vector(vectors.weather, 'freezing_level_in_feet_is_not_converted'),
  // The one variable only the browser asks for, so no vector carries it.
  wind_direction_10m: [0, 90, 180, 270],
}
const WEATHER_UNITS: Record<string, string> = {
  ...units(vectors.weather, 'wind_and_temperature_levels_together'),
  ...units(vectors.weather, 'freezing_level_in_feet_is_not_converted'),
}
// The cloud request asks for humidity alone, which carries no unit to check.
const CLOUD_UNITS: Record<string, string> = {}
const isCloud = (r: Route) =>
  (new URL(r.request().url()).searchParams.get('hourly') ?? '').includes('relative_humidity_2m')
const AQI_INPUTS = vector(vectors.aqi, 'simple_aggregation')

function hourStamps(start: string, end: string): string[] {
  const out: string[] = []
  const last = Date.parse(`${end}:00Z`)
  for (let t = Date.parse(`${start}:00Z`); t <= last; t += 3_600_000) {
    out.push(new Date(t).toISOString().slice(0, 16))
  }
  return out
}

// One body per requested location, each rotated by its index so the rows
// differ and the ranking has something to order.
function hourlyBodies(url: URL, inputs: Record<string, unknown[]>, units: Record<string, string>) {
  const locations = (url.searchParams.get('latitude') ?? '').split(',').filter(Boolean)
  const variables = (url.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const time = hourStamps(url.searchParams.get('start_hour')!, url.searchParams.get('end_hour')!)
  return locations.map((latitude, i) => {
    const hourly: Record<string, unknown[]> = { time }
    for (const name of variables) {
      const values = inputs[name]
      hourly[name] = time.map((_, h) => (values ? values[(h + i) % values.length] : null))
    }
    return {
      latitude: Number(latitude),
      longitude: Number((url.searchParams.get('longitude') ?? '').split(',')[i]),
      elevation: 1200,
      utc_offset_seconds: 0,
      hourly_units: { time: 'iso8601', ...units },
      hourly,
    }
  })
}

// The instant every page's clock starts at. `page.clock.install` starts the
// page's Date here and lets it run on in real time, with timers, intervals,
// animation frames and `performance` firing as they would (setFixedTime would
// freeze Date, and with it every elapsed-seconds readout). One instant and one
// zone, the one Vitest pins, so "a window N days out" means the same day on
// every runner whatever its own clock and zone say.
const START = Date.parse('2026-09-15T17:00:00Z')
const TIME_ZONE = 'America/Los_Angeles'

const DAY_MS = 86_400_000
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })

/** The local calendar day `offset` days from START, as a link's `d1`/`d2` spell it. */
export function isoDay(offset: number): string {
  return localDay.format(new Date(START + offset * DAY_MS))
}

/** One discovered peak, in the shape `POST /api/destinations` answers with. */
export function peak(row: { name: string; latitude: number; longitude: number; elevation_ft: number; osm_id: string }) {
  return { ...row, type: 'peak' }
}

/** The whole `POST /api/destinations` answer around those destinations. */
export function destinationsAnswer<T>(destinations: T[]) {
  return { destinations, total: destinations.length, total_found: null, truncated: false }
}

function destinationsBody(route: Route) {
  const req = route.request().postDataJSON() as { polygon?: { coordinates: number[][][] } }
  const ring = req.polygon?.coordinates?.[0] ?? [[-121.9, 47.5]]
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
  return destinationsAnswer(
    DESTINATION_NAMES.map((name, i) =>
      peak({
        name,
        latitude: Number((cy + (i - 2) * 0.004).toFixed(5)),
        longitude: Number((cx + (((i * 2) % 5) - 2) * 0.004).toFixed(5)),
        elevation_ft: 4000 + i * 350,
        osm_id: `node/${1000 + i}`,
      }),
    ),
  )
}

export const DESTINATION_NAMES = ['Mount Alpha', 'Beta Peak', 'Gamma Butte', 'Delta Point', 'Epsilon Ridge']

// The results table's rows. Named by its own attribute rather than as the
// page's only table, because an open marker popup is a table too since its
// grid (#683), and its rows would count as results.
export const resultRows = (page: Page) => page.locator('[data-results-table] tbody tr')

// A row's Type cell, the one cell a click lands on that holds no link or
// button. Found by its header rather than by a count, because the ranked
// group stands between it and Name and is as wide as the ranking (#586).
export async function typeCell(page: Page, row: Locator): Promise<Locator> {
  const at = await page
    .locator('[data-results-table] thead tr')
    .first()
    .locator('th')
    .evaluateAll((ths) => ths.findIndex((th) => th.getAttribute('data-col') === 'type'))
  return row.locator('td').nth(at)
}

// The rank column, top to bottom: a ranked row's number, or the dash of a row
// still waiting on its forecast. The rank is the first cell that holds no
// input, since the chart's box comes before it when that column shows.
const rankColumn = (page: Page) =>
  resultRows(page).evaluateAll((rows) =>
    rows.map((row) => row.querySelector(':scope > td:not(:has(input))')?.textContent?.trim() ?? ''),
  )

// A polygon run's found destinations stand in the table as pending rows the
// moment discovery answers, and take their ranked places only when their
// forecasts land (#782). So a row count says discovery answered, not that the
// ranking settled: a test that picks a row by its position, or presses one,
// waits here first, because the row at an index changes when the ranking
// lands and a pending row opens no card.
export async function expectRanked(page: Page, count = DESTINATION_NAMES.length) {
  await expect.poll(() => rankColumn(page)).toEqual(Array.from({ length: count }, (_, i) => String(i + 1)))
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const emptyCollection = () => json({ type: 'FeatureCollection', features: [], fetched_at: new Date().toISOString() })

// A 1x1 transparent PNG, for any raster tile an overlay asks for.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const blankTile = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG })

export interface Traffic {
  /** Third-party requests a handler answered, by host. */
  answered: Record<string, number>
  /** Requests no handler claimed. Each one would have left the machine. */
  leaks: string[]
}

async function installRoutes(page: Page, appHost: string): Promise<Traffic> {
  const traffic: Traffic = { answered: {}, leaks: [] }
  const answer = (handler: (route: Route) => Promise<void>) => (route: Route) => {
    const host = new URL(route.request().url()).hostname
    traffic.answered[host] = (traffic.answered[host] ?? 0) + 1
    return handler(route)
  }
  // Registered first, so it matches last: Playwright tries the newest route
  // first. The app's own host goes through to the image under test.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.host === appHost || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    traffic.leaks.push(url.hostname)
    return route.abort()
  })
  await page.route('https://tiles.openfreemap.org/**', answer(blankTile))
  await page.route('https://tiles.openfreemap.org/styles/**', answer((r) => r.fulfill(json(style))))
  await page.route('https://mesonet.agron.iastate.edu/**', answer(blankTile))
  await page.route('https://mapservices.weather.noaa.gov/**', answer(blankTile))
  const weather = answer((r) =>
    r.fulfill(json(hourlyBodies(new URL(r.request().url()), WEATHER_INPUTS, isCloud(r) ? CLOUD_UNITS : WEATHER_UNITS))),
  )
  await page.route('https://api.open-meteo.com/**', weather)
  await page.route('https://archive-api.open-meteo.com/**', weather)
  await page.route(
    'https://air-quality-api.open-meteo.com/**',
    answer((r) => r.fulfill(json(hourlyBodies(new URL(r.request().url()), AQI_INPUTS, {})))),
  )
  // The pod answers these five from its database, or from Overpass, NIFC,
  // NOAA and the Forest Service on a deployment without one, and the image
  // under test has none, so they are stubbed too. /api/capabilities and
  // /api/config reach no upstream and are left to the image, so the limits the
  // page reads are the real ones.
  await page.route('**/api/destinations', (r) => r.fulfill(json(destinationsBody(r))))
  await page.route('**/api/wildfires**', (r) => r.fulfill(emptyCollection()))
  await page.route('**/api/landmarks**', (r) => r.fulfill(emptyCollection()))
  await page.route('**/api/smoke**', (r) => r.fulfill(emptyCollection()))
  await page.route('**/api/closures**', (r) => r.fulfill(emptyCollection()))
  return traffic
}

export const test = base.extend<{ traffic: Traffic }>({
  // Before the test's first goto, so the app's first read of the clock is
  // START's.
  page: async ({ page }, use) => {
    await page.clock.install({ time: START })
    await use(page)
  },
  traffic: [
    async ({ page, baseURL }, use, testInfo) => {
      await page.addInitScript(() => localStorage.setItem('bluebird_forecast_welcomed', '1'))
      const traffic = await installRoutes(page, new URL(baseURL!).host)
      // The image serves its own Content-Security-Policy, so every test here
      // is also a load under that policy. Chromium reports what the policy
      // refused on the console; a refused style or script is a page that
      // renders wrong under the header production sends (#621).
      const refused: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/.test(message.text())) refused.push(message.text())
      })
      await use(traffic)
      testInfo.annotations.push({ type: 'third-party requests answered', description: JSON.stringify(traffic.answered) })
      expect(traffic.leaks, 'requests that would have reached a third-party host').toEqual([])
      expect(refused, 'what the served Content-Security-Policy refused').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// One of the panel's messages, read from the live region the Analyze button's
// badge stands beside (record 0208): the one copy that is in the page whether
// or not the list is open. A message in the opened list has a second copy, so
// a bare text locator would find two.
export const message = (page: Page, text: string | RegExp) => page.locator('[role="status"]').getByText(text)

// A click on the map counts only once MapLibre has fired `load` and the draw
// handler is attached, and nothing in the page says when that is. So click,
// wait for the panel's own readout to move, and click again while it has not.
// Every vertex goes through here so the retry lives in one place.
async function placeVertices(page: Page, vertices: readonly [number, number][]) {
  for (const [index, [x, y]] of vertices.entries()) {
    const remaining = vertices.length - index - 1
    const moved =
      remaining === 0
        ? page.getByRole('button', { name: 'Done' })
        : message(page, `Add at least ${remaining} more point${remaining === 1 ? '' : 's'}`)
    const hasMoved = async () => (remaining === 0 ? moved.isEnabled() : (await moved.count()) > 0)
    await expect(async () => {
      // A slow readout must not earn the ring a second vertex at this spot.
      if (!(await hasMoved())) await page.locator('.maplibregl-canvas').click({ position: { x, y } })
      if (remaining === 0) await expect(moved).toBeEnabled({ timeout: 1_500 })
      else await expect(moved).toBeAttached({ timeout: 1_500 })
    }).toPass({ timeout: 20_000 })
  }
  await page.getByRole('button', { name: 'Done' }).click()
}

export async function drawRing(page: Page) {
  await page.getByRole('button', { name: 'Draw polygon' }).click()
  await placeVertices(page, [
    [520, 260],
    [760, 300],
    [620, 480],
  ])
}

// Replaces the ring on the map with a new one through Edit polygon and Clear,
// the way a reader moves the search area after a report.
export async function redrawRing(page: Page, vertices: readonly [number, number][]) {
  await page.getByRole('button', { name: 'Edit polygon' }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await placeVertices(page, vertices)
}
