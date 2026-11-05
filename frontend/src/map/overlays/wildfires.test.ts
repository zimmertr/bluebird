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

const { fetchWildfires } = vi.hoisted(() => ({ fetchWildfires: vi.fn() }))
vi.mock('../../utils/wildfires', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/wildfires')>()),
  fetchWildfires: (...args: unknown[]) => fetchWildfires(...args),
}))

import type { Feature, FeatureCollection } from 'geojson'
import { FIRE_REFETCH_DEBOUNCE_MS, WILDFIRE_FILL_LAYER, fireDetailFor, mountWildfires } from './wildfires'
import { COARSE_TOLERANCE_DEG, WILDFIRE_SECTION_LABEL } from '../../utils/wildfires'
import { wildfireSectionAt } from '../../utils/hazardSections'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'
import { visibleBox } from '../../utils/viewBox'

const FIRES = { type: 'FeatureCollection', features: [] as unknown[], fetched_at: '' }
const fire = (name: string) => ({ layer: { id: WILDFIRE_FILL_LAYER }, properties: { poly_IncidentName: name } })

function setup(online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const { popups, click } = mountTestPopups(stub)
  // Where the spot's card was asked to open; the card is `destinationCards.ts`'s.
  const spots: { lng: number; lat: number }[] = []
  popups.registerSpot((at) => spots.push(at))
  const fires = mountWildfires(stub.map, { popups, online })
  return { stub, fires, click, spots }
}

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
  fetchWildfires.mockReset()
  fetchWildfires.mockResolvedValue(FIRES)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('fireDetailFor', () => {
  // Two screen pixels of longitude against the coarse copy's tolerance.
  it('asks for the coarse copy on a wide view and the full one up close', () => {
    expect(fireDetailFor(-125, -115, 1000)).toBe('coarse')
    expect(fireDetailFor(-121.01, -121, 1000)).toBe('full')
    const edge = (COARSE_TOLERANCE_DEG / 2) * 1000
    expect(fireDetailFor(0, edge, 1000)).toBe('full')
    expect(fireDetailFor(0, edge * 1.01, 1000)).toBe('coarse')
  })

  it('reads a canvas with no width as one pixel rather than dividing by zero', () => {
    expect(fireDetailFor(-121.01, -121, 0)).toBe('coarse')
  })
})

describe('mountWildfires', () => {
  it('adds the fill and the outline over it, and draws nothing until switched on', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([WILDFIRE_FILL_LAYER, 'wildfire-outline'])
    expect(fetchWildfires).not.toHaveBeenCalled()
  })

  it('fetches the viewport when switched on and again after a pan settles', async () => {
    const { stub, fires } = setup()
    fires.update({ show: true })
    expect(fetchWildfires).toHaveBeenCalledTimes(1)
    expect(fetchWildfires.mock.calls[0][0]).toEqual(visibleBox(stub.map.getCenter(), 8, 1000, 0, 0))
    await vi.waitFor(() => expect(stub.sources.wildfires.data).toBe(FIRES))
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchWildfires).toHaveBeenCalledTimes(2)
  })

  // A pitched camera's bounds run to the horizon (#799): the fetch asks for
  // the box the view would cover lying flat, and the width term that picks
  // the copy reads that box too.
  it('asks for the view as it would lie flat, not to the horizon', () => {
    const horizon = { west: -140, south: 40, east: -100, north: 70 }
    const stub = stubMap({ canvasWidth: 1000, canvasHeight: 700, zoom: 12, pitch: 45, bearing: 20, bounds: horizon })
    mountWildfires(stub.map, { popups: mountTestPopups(stub).popups, online: null }).update({ show: true })
    const [bbox, detail] = fetchWildfires.mock.calls[0]
    expect(bbox).toEqual(visibleBox(stub.map.getCenter(), 12, 1000, 700, 20))
    expect(detail).toBe(fireDetailFor(bbox[0], bbox[2], 1000))
    expect(detail).not.toBe(fireDetailFor(horizon.west, horizon.east, 1000))
  })

  // #580: a failed fetch waited for a pan, even after the network came back.
  it('asks again on reconnect, no sooner than the pod’s Retry-After', async () => {
    fetchWildfires
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('Wildfire data unavailable. Try again later.'), { retryAfterS: 30 }))
      .mockResolvedValueOnce(FIRES)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const { stub, fires } = setup(online)
    fires.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(fetchWildfires).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchWildfires).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(stub.sources.wildfires.data).toBe(FIRES))
    // Recovered: another reconnect asks nothing.
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchWildfires).toHaveBeenCalledTimes(2)
  })

  it('stops listening and empties the layer when switched off', () => {
    const { stub, fires } = setup()
    fires.update({ show: true })
    fires.update({ show: false })
    expect(stub.handlerCount('moveend')).toBe(0)
    expect(stub.sources.wildfires.data).toEqual({ type: 'FeatureCollection', features: [] })
    const signal = fetchWildfires.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  // A click on a perimeter opens the spot's card there, whose fire section
  // describes the fire (#832); a hover opens nothing.
  it('opens the spot’s card at a click on a perimeter, and nothing on a hover', () => {
    const { stub, click, spots } = setup()
    expect(stub.handlerCount('mouseenter', WILDFIRE_FILL_LAYER)).toBe(0)
    expect(stub.handlerCount('mousemove', WILDFIRE_FILL_LAYER)).toBe(0)
    click([fire('Alpha')], { lngLat: { lng: -121.4, lat: 47.6 } })
    expect(spots).toEqual([{ lng: -121.4, lat: 47.6 }])
    expect(popups).toEqual([])
  })

  // A section about a fire the map no longer draws leaves its card; the card
  // stays for whatever else it says.
  it('asks the open cards to read it again when switched off', () => {
    const { popups: mapPopups, closed, refreshed } = fakeMapPopups()
    const fires = mountWildfires(stubMap({ canvasWidth: 1000, zoom: 8 }).map, { popups: mapPopups, online: null })
    fires.update({ show: true })
    fires.update({ show: false })
    expect(refreshed).toEqual(['fire'])
    expect(closed).toEqual([])
  })
})

// Every card asks the layer for the fire within reach of its point, from the
// perimeters it holds (#832).
describe('mountWildfires point target', () => {
  const PERIMETER: Feature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-121.6, 47.4],
          [-121.4, 47.4],
          [-121.4, 47.6],
          [-121.6, 47.6],
          [-121.6, 47.4],
        ],
      ],
    },
    properties: { poly_IncidentName: 'Alpha', poly_GISAcres: 1200 },
  }
  const HELD: FeatureCollection = { type: 'FeatureCollection', features: [PERIMETER] }
  const INSIDE = { lng: -121.5, lat: 47.5, zoom: 8 }
  // About 120 miles east, far past the ten a fire reaches.
  const FAR = { lng: -119, lat: 47.5, zoom: 8 }
  const signal = () => new AbortController().signal

  function mounted() {
    fetchWildfires.mockResolvedValue(HELD)
    const fake = fakeMapPopups()
    const fires = mountWildfires(stubMap({ canvasWidth: 1000, zoom: 8 }).map, { popups: fake.popups, online: null })
    return { fires, ...fake, target: fake.points[0] }
  }

  it('is on while the layer is, and paints nothing for the cursor', () => {
    const { fires, points, target } = mounted()
    expect(points.map((p) => p.target)).toEqual(['fire'])
    expect(target.shown()).toBe(false)
    fires.update({ show: true })
    expect(target.shown()).toBe(true)
    expect(target.paints(INSIDE)).toBe(false)
    fires.update({ show: false })
    expect(target.shown()).toBe(false)
  })

  it('answers nothing before its perimeters land', async () => {
    const { fires, target } = mounted()
    expect(await target.read(INSIDE, signal())).toBeNull()
    fires.update({ show: true })
    expect(await target.read(INSIDE, signal())).toBeNull()
  })

  // A fire the pan brought in joins the open cards within its reach.
  it('tells the open cards when its perimeters land, and describes the fire within reach', async () => {
    const { fires, target, refreshed } = mounted()
    fires.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['fire']))
    const reading = await target.read(INSIDE, signal())
    expect(reading).toEqual({ section: wildfireSectionAt(HELD, INSIDE) })
    expect(reading?.section).toMatchObject({ kind: 'fire', layer: WILDFIRE_SECTION_LABEL, warning: true })
    expect(reading?.section.title).toContain('Alpha')
    expect(await target.read(FAR, signal())).toBeNull()
  })

  it('answers nothing once switched off', async () => {
    const { fires, target, refreshed } = mounted()
    fires.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['fire']))
    fires.update({ show: false })
    expect(refreshed).toEqual(['fire', 'fire'])
    expect(await target.read(INSIDE, signal())).toBeNull()
  })
})
