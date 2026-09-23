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

const { fetchWildfires } = vi.hoisted(() => ({ fetchWildfires: vi.fn() }))
vi.mock('../../utils/wildfires', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/wildfires')>()),
  fetchWildfires: (...args: unknown[]) => fetchWildfires(...args),
}))

import {
  FIRE_POPUP_GRACE_MS,
  FIRE_REFETCH_DEBOUNCE_MS,
  WILDFIRE_FILL_LAYER,
  fireDetailFor,
  fireLinkAt,
  mountWildfires,
} from './wildfires'
import { COARSE_TOLERANCE_DEG, nifcFireUrl } from '../../utils/wildfires'
import { stubMap } from '../../testSupport/stubMap'

const FIRES = { type: 'FeatureCollection', features: [] as unknown[], fetched_at: '' }
const hover = (name: string, lng = -121.5, lat = 47.5) => ({
  features: [{ properties: { poly_IncidentName: name } }],
  lngLat: { lng, lat },
})

function setup() {
  const stub = stubMap({ canvasWidth: 1000, zoom: 8 })
  const restCursor = vi.fn()
  const fires = mountWildfires(stub.map, { restCursor })
  return { stub, fires, restCursor }
}

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
  fetchWildfires.mockReset()
  fetchWildfires.mockResolvedValue(FIRES)
})
afterEach(() => vi.useRealTimers())

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

  it('stops listening and empties the layer when switched off', () => {
    const { stub, fires } = setup()
    fires.update({ show: true })
    fires.update({ show: false })
    expect(stub.handlerCount('moveend')).toBe(0)
    expect(stub.sources.wildfires.data).toEqual({ type: 'FeatureCollection', features: [] })
    const signal = fetchWildfires.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  it('keeps the popup where it is while the cursor stays in the same fire', () => {
    const { stub } = setup()
    stub.fire('mouseenter', WILDFIRE_FILL_LAYER, hover('Alpha', -121.5))
    stub.fire('mousemove', WILDFIRE_FILL_LAYER, hover('Alpha', -121.4))
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.5, lat: 47.5 })
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mousemove', WILDFIRE_FILL_LAYER, hover('Beta', -121.3))
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual({ lng: -121.3, lat: 47.5 })
  })

  // A leave schedules the close rather than doing it, so the cursor can reach
  // the NIFC link; reaching the popup cancels it.
  it('closes on leaving only after the grace period, unless the popup is reached', () => {
    const { stub, restCursor } = setup()
    stub.fire('mouseenter', WILDFIRE_FILL_LAYER, hover('Alpha'))
    stub.fire('mouseleave', WILDFIRE_FILL_LAYER)
    expect(restCursor).toHaveBeenCalled()
    popups[0].listeners.mouseenter()
    vi.advanceTimersByTime(FIRE_POPUP_GRACE_MS * 2)
    expect(popups[0].removed).toBe(false)
    popups[0].listeners.mouseleave()
    vi.advanceTimersByTime(FIRE_POPUP_GRACE_MS)
    expect(popups[0].removed).toBe(true)
  })

  it('takes the popup and its pending close down when switched off', () => {
    const { stub, fires } = setup()
    fires.update({ show: true })
    stub.fire('mouseenter', WILDFIRE_FILL_LAYER, hover('Alpha'))
    stub.fire('mouseleave', WILDFIRE_FILL_LAYER)
    fires.update({ show: false })
    expect(popups[0].removed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
