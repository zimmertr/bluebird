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

const { fetchWildfires } = vi.hoisted(() => ({ fetchWildfires: vi.fn() }))
vi.mock('../../utils/wildfires', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/wildfires')>()),
  fetchWildfires: (...args: unknown[]) => fetchWildfires(...args),
}))

import {
  FIRE_REFETCH_DEBOUNCE_MS,
  WILDFIRE_FILL_LAYER,
  fireDetailFor,
  fireLinkAt,
  mountWildfires,
} from './wildfires'
import { COARSE_TOLERANCE_DEG, nifcFireUrl, wildfirePopupHtml } from '../../utils/wildfires'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'

const FIRES = { type: 'FeatureCollection', features: [] as unknown[], fetched_at: '' }
const fire = (name: string) => ({ layer: { id: WILDFIRE_FILL_LAYER }, properties: { poly_IncidentName: name } })

function setup(online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const { popups, click } = mountTestPopups(stub)
  const fires = mountWildfires(stub.map, { popups, online })
  return { stub, fires, click }
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

describe('fireLinkAt', () => {
  it('opens NIFC framed at least at zoom 11, one level closer than the map', () => {
    const at = { lng: -121.5, lat: 47.5 }
    expect(fireLinkAt(stubMap({ zoom: 6 }).map, at)).toBe(nifcFireUrl(-121.5, 47.5, 11))
    expect(fireLinkAt(stubMap({ zoom: 13 }).map, at)).toBe(nifcFireUrl(-121.5, 47.5, 14))
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
    expect(fetchWildfires.mock.calls[0][0]).toEqual([-122, 47, -121, 48])
    await vi.waitFor(() => expect(stub.sources.wildfires.data).toBe(FIRES))
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchWildfires).toHaveBeenCalledTimes(2)
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

  // A click on a perimeter describes the fire, with its NIFC link, where a
  // hover used to (TJ, 2026-10-08); a hover opens nothing.
  it('opens the fire’s popup on a click, and nothing on a hover', () => {
    const { stub, click } = setup()
    expect(stub.handlerCount('mouseenter', WILDFIRE_FILL_LAYER)).toBe(0)
    expect(stub.handlerCount('mousemove', WILDFIRE_FILL_LAYER)).toBe(0)
    click([fire('Alpha')], { lngLat: { lng: -121.4, lat: 47.6 } })
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.4, lat: 47.6 })
    expect(popups[0].html).toBe(
      wildfirePopupHtml({ poly_IncidentName: 'Alpha' }, fireLinkAt(stub.map, { lng: -121.4, lat: 47.6 })),
    )
  })

  it('takes the fire’s popups down when switched off', () => {
    const { fires, click } = setup()
    fires.update({ show: true })
    click([fire('Alpha')])
    click([fire('Beta')], { shiftKey: true })
    fires.update({ show: false })
    expect(popups.map((p) => p.removed)).toEqual([true, true])
  })
})
