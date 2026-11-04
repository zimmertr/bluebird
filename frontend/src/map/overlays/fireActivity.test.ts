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

const { fetchFireActivity } = vi.hoisted(() => ({ fetchFireActivity: vi.fn() }))
vi.mock('../../utils/fireActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/fireActivity')>()),
  fetchFireActivity: (...args: unknown[]) => fetchFireActivity(...args),
}))

import type { FeatureCollection } from 'geojson'
import { FIRE_ACTIVITY_LAYER, FIRE_ACTIVITY_SOURCE, FIRE_STAR_IMAGE, fireActivityBox, mountFireActivity } from './fireActivity'
import { FIRE_REFETCH_DEBOUNCE_MS } from './wildfires'
import {
  FIRE_ACTIVITY_COLOR,
  FIRE_ACTIVITY_HALO_WIDTH,
  FIRE_ACTIVITY_ICON_SIZE,
  FIRE_ACTIVITY_MINZOOM,
  FIRE_ACTIVITY_RECOLOR_MS,
  FIRE_ACTIVITY_SORT_KEY,
  FIRE_ACTIVITY_ROW_LABEL,
  FIRE_ACTIVITY_STROKE,
} from '../../utils/fireActivity'
import { hotspotSectionAt } from '../../utils/hazardSections'
import type { FireActivityResponse } from '../../types'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'

const HOUR = 60 * 60 * 1000
// The clock every test reads the bands against. 12 hours less 30 seconds
// after the first detection, so the first minute tick moves it a band.
const START = Date.parse('2026-10-27T20:00:00Z')
const DETECTIONS = {
  type: 'FeatureCollection',
  fetched_at: START,
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.5, 47.5] },
      properties: {
        acquired: new Date(START - 12 * HOUR + 30_000).toISOString(),
        instrument: 'VIIRS',
        satellite: 'N21',
        confidence: 'high',
        frp: 12.5,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.4, 47.6] },
      properties: {
        acquired: new Date(START - 30 * HOUR).toISOString(),
        instrument: 'MODIS',
        satellite: 'A',
        confidence: '66',
        frp: null,
      },
    },
  ],
}

let clock = START

function setup(zoom = 8) {
  const stub = stubMap({ zoom })
  const { popups: mapPopups, click } = mountTestPopups(stub)
  // Where the spot's card was asked to open, and a card there; the real card
  // is `destinationCards.ts`'s.
  const spots: { lng: number; lat: number }[] = []
  mapPopups.registerSpot((at) => {
    spots.push(at)
    mapPopups.openCard(at, 'Spot', {})
  })
  const layer = mountFireActivity(stub.map, { popups: mapPopups, online: null, now: () => clock })
  return { stub, layer, click, spots }
}

// A star under a click, as MapLibre hands one over: its point and the
// route's properties.
const star = (i: number) => ({
  layer: { id: FIRE_ACTIVITY_LAYER },
  geometry: DETECTIONS.features[i].geometry,
  properties: DETECTIONS.features[i].properties,
})

const bands = (stub: ReturnType<typeof stubMap>) =>
  (stub.sources[FIRE_ACTIVITY_SOURCE].data as FeatureCollection).features.map((f) => f.properties?.band)

beforeEach(() => {
  vi.useFakeTimers()
  clock = START
  popups.length = 0
  fetchFireActivity.mockReset()
  fetchFireActivity.mockResolvedValue(DETECTIONS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('mountFireActivity', () => {
  // A starburst per detection (#799), as CalTopo draws them: one SDF image,
  // tinted per band and edged with a dark halo, every star drawn however they
  // crowd, and none taking a label's room.
  it('adds one starburst layer from the module values, and fetches nothing while off', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([FIRE_ACTIVITY_LAYER])
    const addImage = stub.calls.filter((c) => c[0] === 'addImage')
    expect(addImage).toEqual([['addImage', FIRE_STAR_IMAGE]])
    expect(stub.specs[FIRE_ACTIVITY_LAYER].type).toBe('symbol')
    expect(stub.specs[FIRE_ACTIVITY_LAYER].minzoom).toBe(FIRE_ACTIVITY_MINZOOM)
    expect(stub.layout[FIRE_ACTIVITY_LAYER]).toEqual({
      'icon-image': FIRE_STAR_IMAGE,
      'icon-size': FIRE_ACTIVITY_ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': FIRE_ACTIVITY_SORT_KEY,
    })
    expect(stub.paint[FIRE_ACTIVITY_LAYER]).toEqual({
      'icon-color': FIRE_ACTIVITY_COLOR,
      'icon-halo-color': FIRE_ACTIVITY_STROKE,
      'icon-halo-width': FIRE_ACTIVITY_HALO_WIDTH,
    })
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS * 3)
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchFireActivity).not.toHaveBeenCalled()
  })

  it('fetches the view when switched on and again after a pan settles', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
    expect(fetchFireActivity.mock.calls[0][0]).toEqual([-122, 47, -121, 48])
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchFireActivity).toHaveBeenCalledTimes(2)
  })

  it('reads the box the way the wildfire overlay does', () => {
    expect(fireActivityBox(stubMap({ bounds: { west: -125, south: 31, east: -102, north: 49 } }).map)).toEqual([
      -125, 31, -102, 49,
    ])
  })

  it('fetches nothing below its floor, where it draws nothing', async () => {
    const { layer } = setup(FIRE_ACTIVITY_MINZOOM - 0.5)
    layer.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFireActivity).not.toHaveBeenCalled()
  })

  // The band is the clock's, not the data's: a detection turns orange at 12
  // hours with no fetch, and a minute that moves no band repaints nothing.
  it('moves a detection into its next band as the minutes pass, without a fetch', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    const painted = () => stub.calls.filter((c) => c[0] === 'setData').length
    const before = painted()
    clock += FIRE_ACTIVITY_RECOLOR_MS
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(bands(stub)).toEqual([1, 2])
    expect(painted()).toBe(before + 1)
    clock += FIRE_ACTIVITY_RECOLOR_MS
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(painted()).toBe(before + 1)
    // Past 48 hours the old one is no longer drawn.
    clock += 18 * HOUR
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(bands(stub)).toEqual([2])
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
  })

  it('clears the timer, the listener and the points when switched off', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    expect(vi.getTimerCount()).toBe(1)
    layer.update({ show: false })
    expect(vi.getTimerCount()).toBe(0)
    expect(stub.handlerCount('moveend')).toBe(0)
    expect((stub.sources[FIRE_ACTIVITY_SOURCE].data as FeatureCollection).features).toEqual([])
    const painted = stub.calls.filter((c) => c[0] === 'setData').length
    clock += 13 * HOUR
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS * 2)
    expect(stub.calls.filter((c) => c[0] === 'setData').length).toBe(painted)
  })

  // A view with no fires empties the layer rather than leaving the last
  // view's points standing.
  it('empties the layer for a view with nothing in it', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    fetchFireActivity.mockResolvedValue({ type: 'FeatureCollection', features: [] })
    stub.fire('moveend')
    await vi.advanceTimersByTimeAsync(FIRE_REFETCH_DEBOUNCE_MS)
    expect(bands(stub)).toEqual([])
  })

  // #580: a failed fetch is asked again on reconnect, no sooner than the
  // pod's Retry-After, as the perimeters are.
  it('asks again on reconnect, no sooner than the pod’s Retry-After', async () => {
    fetchFireActivity
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { retryAfterS: 30 }))
      .mockResolvedValueOnce(DETECTIONS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const stub = stubMap({ zoom: 8 })
    const layer = mountFireActivity(stub.map, { popups: mountTestPopups(stub).popups, online, now: () => clock })
    layer.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchFireActivity).toHaveBeenCalledTimes(2)
  })

  // Every other thing on the map opens a card on a click, and a star does too
  // (the maintainer, 2026-10-29): the spot's card on the star rather than
  // where the click landed (#832), so two clicks on one star open one card in
  // one place.
  it('opens the spot’s card on a click, at the star', () => {
    const { click, spots } = setup()
    click([star(0)], { lngLat: { lng: -121.49, lat: 47.51 } })
    expect(spots).toEqual([{ lng: -121.5, lat: 47.5 }])
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.5, lat: 47.5 })
  })

  it('opens the spot at the click for a star with no point to stand on', () => {
    const { click, spots } = setup()
    click([{ ...star(0), geometry: { type: 'LineString', coordinates: [] } }], { lngLat: { lng: -121.49, lat: 47.51 } })
    expect(spots).toEqual([{ lng: -121.49, lat: 47.51 }])
  })

  it('pins a second card on a Shift-click and replaces both on a plain one', () => {
    const { click } = setup()
    click([star(0)])
    click([star(1)], { shiftKey: true })
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    click([star(0)])
    expect(popups.map((p) => p.removed)).toEqual([true, true, false])
  })

  // A section about a star the map no longer draws leaves its card; the card
  // stays for whatever else it says.
  it('asks the open cards to read it again when switched off', () => {
    const { popups: mapPopups, closed, refreshed } = fakeMapPopups()
    const layer = mountFireActivity(stubMap({ zoom: 8 }).map, { popups: mapPopups, online: null, now: () => clock })
    layer.update({ show: true })
    layer.update({ show: false })
    expect(refreshed).toEqual(['fire-activity'])
    expect(closed).toEqual([])
  })

  it('shows the pointer over a star', () => {
    const { stub } = setup()
    stub.setUnder([star(0)])
    stub.fire('mousemove', undefined, { point: { x: 0, y: 0 }, lngLat: { lng: -121.5, lat: 47.5 } })
    expect(stub.map.getCanvas().style.cursor).toBe('pointer')
  })

  it('aborts the request in flight when switched off', () => {
    const { layer } = setup()
    layer.update({ show: true })
    const signal = fetchFireActivity.mock.calls[0][1] as AbortSignal
    layer.update({ show: false })
    expect(signal.aborted).toBe(true)
  })
})

// Every card asks the layer for the hotspot within reach of its point, from
// the detections it holds (#832), its age read on the overlay's own clock.
describe('mountFireActivity point target', () => {
  const AT = { lng: -121.5, lat: 47.5, zoom: 8 }
  // About 120 miles east, far past the ten a hotspot reaches.
  const FAR = { lng: -119, lat: 47.5, zoom: 8 }
  const signal = () => new AbortController().signal

  function mounted() {
    const fake = fakeMapPopups()
    const layer = mountFireActivity(stubMap({ zoom: 8 }).map, { popups: fake.popups, online: null, now: () => clock })
    return { layer, ...fake, target: fake.points[0] }
  }

  it('is on while the layer is, and paints nothing for the cursor', () => {
    const { layer, points, target } = mounted()
    expect(points.map((p) => p.target)).toEqual(['fire-activity'])
    expect(target.shown()).toBe(false)
    layer.update({ show: true })
    expect(target.shown()).toBe(true)
    expect(target.paints(AT)).toBe(false)
    layer.update({ show: false })
    expect(target.shown()).toBe(false)
  })

  it('tells the open cards when the detections land, and describes the hotspot within reach', async () => {
    const { layer, target, refreshed } = mounted()
    expect(await target.read(AT, signal())).toBeNull()
    layer.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['fire-activity']))
    const reading = await target.read(AT, signal())
    expect(reading).toEqual({ section: hotspotSectionAt(DETECTIONS as unknown as FireActivityResponse, AT, START) })
    expect(reading?.section).toMatchObject({ kind: 'fire-activity', layer: FIRE_ACTIVITY_ROW_LABEL })
    expect(await target.read(FAR, signal())).toBeNull()
  })

  // The `Detected` row says how long ago by the clock the bands read.
  it('reads the detection’s age on its own clock at the ask', async () => {
    const { layer, target, refreshed } = mounted()
    layer.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['fire-activity']))
    clock = START + 2 * HOUR
    const later = await target.read(AT, signal())
    expect(later).toEqual({ section: hotspotSectionAt(DETECTIONS as unknown as FireActivityResponse, AT, START + 2 * HOUR) })
    expect(later).not.toEqual({ section: hotspotSectionAt(DETECTIONS as unknown as FireActivityResponse, AT, START) })
  })

  it('answers nothing once switched off', async () => {
    const { layer, target, refreshed } = mounted()
    layer.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['fire-activity']))
    layer.update({ show: false })
    expect(refreshed).toEqual(['fire-activity', 'fire-activity'])
    expect(await target.read(AT, signal())).toBeNull()
  })
})
