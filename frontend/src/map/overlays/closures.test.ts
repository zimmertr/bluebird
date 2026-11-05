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
    // `openCard` measures the card; a fake one has no size.
    getElement() {
      return undefined
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
import type { FeatureCollection } from 'geojson'
import { CLOSURE_SECTION_LABELS, type ClosureKind } from '../../utils/closures'
import { closureSectionAt } from '../../utils/hazardSections'
import { closureFeature } from '../../testSupport/fixtures'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'
import { visibleBox } from '../../utils/viewBox'

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

// Mounted after the fire overlay, as `mountFeatures` does.
function setup(kind: ClosureKind = 'area', online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const { popups, click } = mountTestPopups(stub)
  // Where the spot's card was asked to open; the card is `destinationCards.ts`'s.
  const spots: { lng: number; lat: number }[] = []
  popups.registerSpot((at) => spots.push(at))
  mountWildfires(stub.map, { popups, online: null })
  const overlay = mountClosures(stub.map, kind, { popups, online })
  return { stub, overlay, click, spots }
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
  // Under the fires though it is mounted after them (record 0268).
  it('stacks the area fill under its outline, under the fires', () => {
    const { stub } = setup('area')
    expect(stub.stack).toEqual([CLOSURE_AREA_FILL_LAYER, 'closure-area-outline', WILDFIRE_FILL_LAYER, 'wildfire-outline'])
    expect(stub.paint[CLOSURE_AREA_FILL_LAYER]).toEqual({ 'fill-color': '#c026d3', 'fill-opacity': 0.2 })
    expect(fetchClosures).not.toHaveBeenCalled()
  })

  // One source carries both geometries; each layer filters to its own, so a
  // closed trailhead reaches the dots and a closed trail the dashed line.
  // Over the fires, where the area kind is under them (record 0268).
  it('draws the trail kind as a dashed line under a dot per site, over the fires', () => {
    const { stub } = setup('trail')
    expect(stub.stack).toEqual([WILDFIRE_FILL_LAYER, 'wildfire-outline', CLOSURE_TRAIL_LINE_LAYER, CLOSURE_TRAIL_SITE_LAYER])
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
    expect([bbox, kind, detail]).toEqual([visibleBox(stub.map.getCenter(), 8, 1000, 0, 0), 'trail', 'coarse'])
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

  // A click on a closure opens the spot's card there, whose closure section
  // describes the order (#832); a hover opens nothing.
  it('opens the spot’s card at a click on a closure, and nothing on a hover', () => {
    const { stub, click, spots } = setup('area')
    expect(stub.handlerCount('mouseenter', CLOSURE_AREA_FILL_LAYER)).toBe(0)
    click([closure()], { lngLat: { lng: -121.4, lat: 45.6 } })
    expect(spots).toEqual([{ lng: -121.4, lat: 45.6 }])
    expect(popups).toEqual([])
  })

  // A fire inside a closed area, or a site on its closed trail, is one card
  // at the click, which carries a section for each.
  it('opens one spot for a fire inside a closed area, and for a site on its line', () => {
    const area = setup('area')
    area.click([closure(), { layer: { id: WILDFIRE_FILL_LAYER }, properties: { poly_IncidentName: 'Alpha' } }])
    expect(area.spots).toHaveLength(1)
    const trail = setup('trail')
    trail.click([closure({ ClosureOrderName: 'Line' }, CLOSURE_TRAIL_LINE_LAYER), closure({ ClosureOrderName: 'Site' }, CLOSURE_TRAIL_SITE_LAYER)])
    expect(trail.spots).toHaveLength(1)
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

  // A section about a closure the map no longer draws leaves its card; the
  // card stays for whatever else it says.
  it('asks the open cards to read it again when switched off', () => {
    const { popups: mapPopups, closed, refreshed } = fakeMapPopups()
    const overlay = mountClosures(stubMap({ canvasWidth: 1000 }).map, 'area', { popups: mapPopups, online: null })
    overlay.update({ show: true })
    overlay.update({ show: false })
    expect(refreshed).toEqual(['closure-area'])
    expect(closed).toEqual([])
  })
})

// Every card asks each closure layer for the order at its point, from the
// closures it holds (#832): the area it stands in, or the closed trail
// within a mile.
describe('mountClosures point target', () => {
  const AREA = closureFeature(
    { ClosureOrderName: 'Area order', GIS_Acres: 640 },
    {
      type: 'Polygon',
      coordinates: [
        [
          [-122, 45.5],
          [-121.8, 45.5],
          [-121.8, 45.7],
          [-122, 45.7],
          [-122, 45.5],
        ],
      ],
    },
  )
  const HELD: Record<ClosureKind, FeatureCollection> = {
    area: { type: 'FeatureCollection', features: [AREA] },
    trail: { type: 'FeatureCollection', features: [closureFeature()] },
  }
  // Inside the area, and about a third of a mile from the trail's start.
  const NEAR = { lng: -121.9, lat: 45.605, zoom: 8 }
  // Some twenty miles east of both.
  const FAR = { lng: -121.5, lat: 45.6, zoom: 8 }
  const signal = () => new AbortController().signal

  function mounted(kind: ClosureKind) {
    fetchClosures.mockResolvedValue(HELD[kind])
    const fake = fakeMapPopups()
    const overlay = mountClosures(stubMap({ canvasWidth: 1000 }).map, kind, { popups: fake.popups, online: null })
    return { overlay, ...fake, target: fake.points[0] }
  }

  it('registers each kind under its own target, on while its layer is, painting nothing', () => {
    for (const [kind, name] of [
      ['area', 'closure-area'],
      ['trail', 'closure-trail'],
    ] as const) {
      const { overlay, points, target } = mounted(kind)
      expect(points.map((p) => p.target)).toEqual([name])
      expect(target.shown()).toBe(false)
      overlay.update({ show: true })
      expect(target.shown()).toBe(true)
      expect(target.paints(NEAR)).toBe(false)
      overlay.update({ show: false })
      expect(target.shown()).toBe(false)
    }
  })

  it.each(['area', 'trail'] as const)('tells the open cards when its %s closures land, and describes the one at the point', async (kind) => {
    const { overlay, target, refreshed } = mounted(kind)
    const name = kind === 'area' ? 'closure-area' : 'closure-trail'
    expect(await target.read(NEAR, signal())).toBeNull()
    overlay.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual([name]))
    const reading = await target.read(NEAR, signal())
    expect(reading).toEqual({ section: closureSectionAt(HELD[kind], kind, NEAR) })
    expect(reading?.section).toMatchObject({ kind: name, layer: CLOSURE_SECTION_LABELS[kind], warning: true })
    expect(await target.read(FAR, signal())).toBeNull()
    overlay.update({ show: false })
    expect(refreshed).toEqual([name, name])
    expect(await target.read(NEAR, signal())).toBeNull()
  })
})
