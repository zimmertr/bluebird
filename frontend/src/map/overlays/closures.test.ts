import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records where it is, what it says,
// whether it is still open, and the two listeners the grace close hangs on
// its content element. Hoisted, because `vi.mock` runs before the imports.
const { FakePopup, popups } = vi.hoisted(() => {
  const popups: InstanceType<typeof FakePopup>[] = []
  class FakePopup {
    html = ''
    at: unknown = null
    removed = false
    listeners: Record<string, () => void> = {}
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
    remove() {
      this.removed = true
    }
    getElement() {
      return {
        querySelector: () => ({
          addEventListener: (type: string, fn: () => void) => {
            this.listeners[type] = fn
          },
        }),
      }
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
  mountClosures,
} from './closures'
import { FIRE_POPUP_GRACE_MS, FIRE_REFETCH_DEBOUNCE_MS, WILDFIRE_FILL_LAYER, mountWildfires } from './wildfires'
import type { ClosureKind } from '../../utils/closures'
import { closureFeature } from '../../testSupport/fixtures'
import { stubMap } from '../../testSupport/stubMap'

const SITE = closureFeature({ OBJECTID: 7, RouteName: null, RouteNum: null }, { type: 'Point', coordinates: [-121.9, 45.6] })
const TRAILS = {
  type: 'FeatureCollection',
  fetched_at: 1,
  features: [closureFeature(), SITE],
}
const hover = (over = {}, layer = CLOSURE_AREA_FILL_LAYER, lng = -121.5) => ({
  features: [{ layer: { id: layer }, properties: closureFeature(over).properties }],
  lngLat: { lng, lat: 45.6 },
})

// Mounted beside the fire overlay, as `mountFeatures` does, and over a draw
// layer standing in for everything above it.
function setup(kind: ClosureKind = 'area', online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const restCursor = vi.fn()
  mountWildfires(stub.map, { restCursor, online: null })
  const overlay = mountClosures(stub.map, kind, { restCursor, online })
  return { stub, overlay, restCursor }
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
    const area = mountClosures(stub.map, 'area', { restCursor: vi.fn() })
    mountClosures(stub.map, 'trail', { restCursor: vi.fn() })
    area.update({ show: true })
    await vi.waitFor(() => expect(stub.sources[CLOSURE_SOURCES.area].data).toBe(TRAILS))
    expect(stub.sources[CLOSURE_SOURCES.trail].data).toBeUndefined()
  })

  it('keeps the popup anchored within one closure and moves it to the next', () => {
    const { stub } = setup('area')
    stub.fire('mouseenter', CLOSURE_AREA_FILL_LAYER, hover({}, CLOSURE_AREA_FILL_LAYER, -121.5))
    stub.fire('mousemove', CLOSURE_AREA_FILL_LAYER, hover({}, CLOSURE_AREA_FILL_LAYER, -121.4))
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.5, lat: 45.6 })
    expect(popups[0].html).toContain('🚫 Probe Fire Closure')
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mousemove', CLOSURE_AREA_FILL_LAYER, hover({ OBJECTID: 8 }, CLOSURE_AREA_FILL_LAYER, -121.3))
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.3, lat: 45.6 })
  })

  // A line and a site can share a number across the service's two layers.
  it('reads a site and a line with one id as two closures', () => {
    const { stub } = setup('trail')
    stub.fire('mouseenter', CLOSURE_TRAIL_LINE_LAYER, hover({}, CLOSURE_TRAIL_LINE_LAYER, -121.5))
    stub.fire('mouseenter', CLOSURE_TRAIL_SITE_LAYER, hover({}, CLOSURE_TRAIL_SITE_LAYER, -121.2))
    expect(popups[0].at).toEqual({ lng: -121.2, lat: 45.6 })
  })

  it('closes on leaving only after the grace period, unless the popup is reached', () => {
    const { stub, restCursor } = setup('trail')
    stub.fire('mouseenter', CLOSURE_TRAIL_SITE_LAYER, hover({}, CLOSURE_TRAIL_SITE_LAYER))
    stub.fire('mouseleave', CLOSURE_TRAIL_SITE_LAYER)
    expect(restCursor).toHaveBeenCalled()
    popups[0].listeners.mouseenter()
    vi.advanceTimersByTime(FIRE_POPUP_GRACE_MS * 2)
    expect(popups[0].removed).toBe(false)
    popups[0].listeners.mouseleave()
    vi.advanceTimersByTime(FIRE_POPUP_GRACE_MS)
    expect(popups[0].removed).toBe(true)
  })

  it('takes the popup and its pending close down when switched off', () => {
    const { stub, overlay } = setup('area')
    overlay.update({ show: true })
    stub.fire('mouseenter', CLOSURE_AREA_FILL_LAYER, hover())
    stub.fire('mouseleave', CLOSURE_AREA_FILL_LAYER)
    overlay.update({ show: false })
    expect(popups[0].removed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
