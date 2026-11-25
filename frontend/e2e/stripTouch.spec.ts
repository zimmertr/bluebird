import { test, expect } from './fixtures'

// A finger drags across the phone's days and picks the run it crossed, as a
// mouse does at a desk (record 0336), so a run of days is a drag and a press
// on Forecast rather than five presses through the When sheet. The drag is
// sent through the protocol, because the page's own touchscreen helper only
// taps.
test.describe('on a 390 px phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a finger dragged across the strip picks the days it crossed, and leaves the map where it was', async ({
    page,
    context,
  }) => {
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const row = page.getByRole('main').getByRole('group', { name: 'Forecast day' })
    const days = row.locator('[data-day]')
    await expect(days.first()).toBeVisible()
    const from = (await days.nth(1).boundingBox())!
    const to = (await days.nth(4).boundingBox())!
    const y = from.y + from.height / 2
    // The map's camera rides the link once it moves (`view=`).
    const viewBefore = new URL(page.url()).searchParams.get('view')

    const cdp = await context.newCDPSession(page)
    const touch = (type: string, x?: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y }] })
    const startX = from.x + from.width / 2
    const endX = to.x + to.width / 2
    await touch('touchStart', startX)
    for (let i = 1; i <= 8; i++) await touch('touchMove', startX + ((endX - startX) * i) / 8)
    await touch('touchEnd')

    const keys = await days.evaluateAll((els) => els.map((el) => el.getAttribute('data-day')))
    const pressed = await days.evaluateAll((els) =>
      els.filter((el) => el.getAttribute('aria-pressed') === 'true').map((el) => el.getAttribute('data-day')),
    )
    expect(pressed).toEqual(keys.slice(1, 5))
    // The drag was the strip's: the map did not pan under it.
    expect(new URL(page.url()).searchParams.get('view')).toBe(viewBefore)
  })
})
