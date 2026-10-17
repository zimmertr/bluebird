import { test, expect, SEARCH_ANSWER } from './fixtures'

// A search is sent with the map's view and listed nearest the map's centre
// first (#711): the pod's answer is fixed out of order (`SEARCH_ANSWER`), the
// famous namesake first and a subdivision second, and the list the box shows
// is the two Cascades lakes by distance from the opening view's centre, the
// subdivision gone.

test.use({ viewport: { width: 1280, height: 800 } })

test('a search carries the view and lists the nearest place first', async ({ page }) => {
  await page.goto('/')
  const field = page.getByRole('combobox', { name: 'Search for a place' })
  await field.fill('Blue Lake')
  const sent = page.waitForRequest('**/api/geocode**')
  await field.press('Enter')
  const url = new URL((await sent).url())

  // The opening camera is lng -120.5, lat 47.5 at zoom 7 (`DEFAULT_CAMERA`),
  // and the box is that view rounded outward to whole degrees, so it is four
  // integers that hold the centre.
  const box = (url.searchParams.get('viewbox') ?? '').split(',').map(Number)
  expect(box).toHaveLength(4)
  expect(box.every(Number.isInteger)).toBe(true)
  const [west, south, east, north] = box
  expect(west).toBeLessThan(-120.5)
  expect(east).toBeGreaterThan(-120.5)
  expect(south).toBeLessThan(47.5)
  expect(north).toBeGreaterThan(47.5)

  const options = page.getByRole('listbox', { name: 'Search results' }).getByRole('option')
  await expect(options).toHaveCount(3)
  const okanogan = SEARCH_ANSWER[3].display_name
  const skamania = SEARCH_ANSWER[2].display_name
  const california = SEARCH_ANSWER[0].display_name
  await expect(options.nth(0)).toContainText(okanogan)
  await expect(options.nth(1)).toContainText(skamania)
  await expect(options.nth(2)).toContainText(california)
})
