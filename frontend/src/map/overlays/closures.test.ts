import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records where it is, what it says and
// whether it is still open, and fires `close` when removed, as MapLibre's
// does. Hoisted, because `vi.mock` runs before the imports.
const { FakePopup, popups } = vi.hoisted(() => {
  const popups: InstanceType<typeof FakePopup>[] = []
  class FakePopup {
    html = ''
    at: unknown = null
    removed = false
    closers: (() => void)[] = []
    constructor() {
      popups.push(this)
    }
    setLngLat(at: unknown) {
      this.at = at
      return this
    }
    setHTML(html: string) {
      this.html = html
      return this
    }
    addTo() {
      return this
    }
    on(_type: string, fn: () => void) {
      this.closers.push(fn)
      return this
    }
    remove() {
      this.removed = true
      for (const fn of this.closers) fn()
    }
  }
  return { FakePopup, popups }
})
vi.mock('maplibre-gl', () => ({ Popup: FakePopup }))

const { fetchClosures } = vi.hoisted(() => ({ fetchClosures: vi.fn() }))
vi.mock('../../utils/closures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/closures')>()),
  fetchClosures: (...args: unknown[]) => fetchClosures(...args),
}))

import {
  CLOSURE_AREA_FILL_LAYER,
  CLOSURE_SOURCES,
  CLOSURE_TRAIL_LINE_LAYER,
  CLOSURE_TRAIL_SITE_LAYER,
  CLOSURE_TRAIL_SLOP_PX,
  mountClosures,
} from './closures'
import { FIRE_REFETCH_DEBOUNCE_MS, WILDFIRE_FILL_LAYER, mountWildfires } from './wildfires'
import { closurePopupHtml, type ClosureKind, type ClosureProps } from '../../utils/closures'
import { closureFeature } from '../../testSupport/fixtures'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'

const SITE = closureFeature({ OBJECTID: 7, RouteName: null, RouteNum: null }, { type: 'Point', coordinates: [-121.9, 45.6] })
const TRAILS = {
  type: 'FeatureCollection',
  fetched_at: 1,
  features: [closureFeature(), SITE],
}
const closure = (over = {}, layer = CLOSURE_AREA_FILL_LAYER) => ({
  layer: { id: layer },
  properties: closureFeature(over).properties as Record<string, unknown>,
})

// Mounted beside the fire overlay, as `mountFeatures` does, and over a draw
// layer standing in for everything above it.
function setup(kind: ClosureKind = 'area', online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const { popups, click } = mountTestPopups(stub)
  mountWildfires(stub.map, { popups, online: null })
  const overlay = mountClosures(stub.map, kind, { popups, online })
  return { stub, overlay, click }
}

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
  fetchClosures.mockReset()
  fetchClosures.mockResolvedValue(TRAILS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('mountClosures', () => {
  it('stacks the area fill under its outline, over the fires', () => {
    const { stub } = setup('area')
    expect(stub.stack).toEqual([WILDFIRE_FILL_LAYER, 'wildfire-outline', CLOSURE_AREA_FILL_LAYER, 'closure-area-outline'])
    expect(stub.paint[CLOSURE_AREA_FILL_LAYER]).toEqual({ 'fill-color': '#c026d3', 'fill-opacity': 0.2 })
    expect(fetchClosures).not.toHaveBeenCalled()
  })

  // One source carries both geometries; each layer filters to its own, so a
  // closed trailhead reaches the dots and a closed trail the dashed line.
  it('draws the trail kind as a dashed line under a dot per site', () => {
    const { stub } = setup('trail')
    expect(stub.stack.slice(-2)).toEqual([CLOSURE_TRAIL_LINE_LAYER, CLOSURE_TRAIL_SITE_LAYER])
    const added = stub.calls.filter((c) => c[0] === 'addSource').map((c) => c[1])
    expect(added).toContain(CLOSURE_SOURCES.trail)
    expect(stub.paint[CLOSURE_TRAIL_LINE_LAYER]['line-dasharray']).toEqual([2, 1.5])
    expect(stub.paint[CLOSURE_TRAIL_SITE_LAYER]['circle-radius']).toBe(4.5)
  })

  it('fetches its own kind for the viewport, fills its source, and refetches after a pan', async () => {
    const { stub, overlay } = setup('trail')
    overlay.update({ show: true })
    expect(fetchClosures).toHaveBeenCalledTimes(1)
    const [bbox, kind, detail] = fetchClosures.mock.calls[0]
    expect([bbox, kind, detail]).toEqual([[-122, 47, -121, 48], 'trail', 'coarse'])
    await vi.waitFor(() => expect(stub.sources[CLOSURE_SOURCES.trail].data).toBe(TRAILS))
    // The site is in the one source the dot layer reads.
    expect((stub.sources[CLOSURE_SOURCES.trail].data as typeof TRAILS).features).toContain(SITE)
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchClosures).toHaveBeenCalledTimes(2)
  })

  // #580: the fire overlay's recovery, for the same reason.
  it('asks again on reconnect after a failed fetch', async () => {
    fetchClosures
      .mockReset()
      .mockRejectedValueOnce(new Error('Bluebird Forecast is offline. Try again later.'))
      .mockResolvedValueOnce(TRAILS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const { stub, overlay } = setup('trail', online)
    overlay.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchClosures).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(stub.sources[CLOSURE_SOURCES.trail].data).toBe(TRAILS))
  })

  it('aborts the fetch, stops listening and empties its source when switched off', () => {
    const { stub, overlay } = setup('area')
    overlay.update({ show: true })
    overlay.update({ show: false })
    expect(stub.handlerCount('moveend')).toBe(0)
    expect(stub.sources[CLOSURE_SOURCES.area].data).toEqual({ type: 'FeatureCollection', features: [] })
    expect((fetchClosures.mock.calls[0][3] as AbortSignal).aborted).toBe(true)
  })

  // Two switches, two sources: one layer on leaves the other empty.
  it('leaves the other kind alone', async () => {
    const stub = stubMap({ canvasWidth: 1000 })
    const { popups } = mountTestPopups(stub)
    const area = mountClosures(stub.map, 'area', { popups })
    mountClosures(stub.map, 'trail', { popups })
    area.update({ show: true })
    await vi.waitFor(() => expect(stub.sources[CLOSURE_SOURCES.area].data).toBe(TRAILS))
    expect(stub.sources[CLOSURE_SOURCES.trail].data).toBeUndefined()
  })

  // A click on a closure describes the order, where a hover used to (TJ,
  // 2026-10-08); a hover opens nothing.
  it('opens the closure’s popup on a click, and nothing on a hover', () => {
    const { stub, click } = setup('area')
    expect(stub.handlerCount('mouseenter', CLOSURE_AREA_FILL_LAYER)).toBe(0)
    click([closure()], { lngLat: { lng: -121.4, lat: 45.6 } })
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.4, lat: 45.6 })
    expect(popups[0].html).toBe(closurePopupHtml(closureFeature().properties as ClosureProps))
  })

  // The fire is the smaller shape and the hazard itself; the closure is often
  // drawn around it.
  it('gives a fire inside a closed area the click', () => {
    const { click } = setup('area')
    click([closure(), { layer: { id: WILDFIRE_FILL_LAYER }, properties: { poly_IncidentName: 'Alpha' } }])
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toContain('Alpha')
  })

  // A site is the smaller target, so a click on a site that sits on a line
  // describes the site.
  it('opens a site before the line it sits on', () => {
    const { click } = setup('trail')
    click([closure({ ClosureOrderName: 'Line' }, CLOSURE_TRAIL_LINE_LAYER), closure({ ClosureOrderName: 'Site' }, CLOSURE_TRAIL_SITE_LAYER)])
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toContain('Site')
  })

  // A closed trail is a 2.5px line, so it answers a click near it.
  it('asks about a closed trail over a box its margin wide', () => {
    const asked: unknown[] = []
    const stub = stubMap({ canvasWidth: 1000, rendered: (at) => (asked.push(at), []) })
    const { popups, click } = mountTestPopups(stub)
    mountClosures(stub.map, 'trail', { popups })
    click([])
    const m = CLOSURE_TRAIL_SLOP_PX
    expect(asked).toEqual([
      [
        [-m, -m],
        [m, m],
      ],
    ])
  })

  it('takes its popups down when switched off', () => {
    const { overlay, click } = setup('area')
    overlay.update({ show: true })
    click([closure()])
    overlay.update({ show: false })
    expect(popups[0].removed).toBe(true)
  })
})
