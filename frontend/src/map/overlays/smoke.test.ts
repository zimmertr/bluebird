import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM; this stands in for it, records what opened and
// whether it is still open, and fires `close` when removed, as MapLibre's
// does. Hoisted, because `vi.mock` runs before the imports.
const { opened, fetchSmoke } = vi.hoisted(() => ({
  opened: [] as { html: string; options: unknown; removed: boolean }[],
  fetchSmoke: vi.fn(),
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    options: unknown
    html = ''
    state = { html: '', options: null as unknown, removed: false }
    closers: (() => void)[] = []
    constructor(options: unknown) {
      this.options = options
    }
    on(_type: string, fn: () => void) {
      this.closers.push(fn)
      return this
    }
    remove() {
      this.state.removed = true
      for (const fn of this.closers) fn()
    }
    setLngLat() {
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
      this.state.html = this.html
      this.state.options = this.options
      opened.push(this.state)
      return this
    }
  },
}))

vi.mock('../../utils/smoke', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/smoke')>()),
  fetchSmoke: (signal: AbortSignal) => fetchSmoke(signal),
}))

import { mountSmoke } from './smoke'
import { createMapController } from '../controller'
import { mapInputs } from '../../testSupport/fixtures'
import type { FeatureCollection } from 'geojson'
import { SMOKE_CLICK_ORDER, SMOKE_DENSITIES, SMOKE_ROW_LABEL, smokeLayerId, type SmokeDensity } from '../../utils/smoke'
import { smokeSectionAt } from '../../utils/hazardSections'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { mountTestPopups } from '../../testSupport/mapPopups'
import { stubMap } from '../../testSupport/stubMap'

const PLUME = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {} }] }

function setup(drawing = false, online: EventTarget | null = null) {
  const stub = stubMap({ canvasWidth: 800 })
  const controller = createMapController(mapInputs({ drawing }))
  const { popups, click } = mountTestPopups(stub, controller)
  // Where the spot's card was asked to open; the card is `destinationCards.ts`'s.
  const spots: { lng: number; lat: number }[] = []
  popups.registerSpot((at) => spots.push(at))
  const smoke = mountSmoke(stub.map, { popups, online })
  return { stub, smoke, click, spots }
}

beforeEach(() => {
  opened.length = 0
  fetchSmoke.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('mountSmoke', () => {
  it('adds one fill per density, lightest lowest, and the outline over them', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([...SMOKE_DENSITIES.map(smokeLayerId), 'smoke-outline'])
  })

  it('fetches once when switched on and clears the plumes when switched off', async () => {
    fetchSmoke.mockResolvedValue(PLUME)
    const { stub, smoke } = setup()
    smoke.update({ show: true })
    smoke.update({ show: true })
    expect(fetchSmoke).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(stub.sources.smoke.data).toBe(PLUME))
    smoke.update({ show: false })
    expect(stub.sources.smoke.data).toEqual({ type: 'FeatureCollection', features: [] })
  })

  // A late answer for a toggle the reader has already undone paints nothing.
  it('drops an answer that arrives after the overlay was switched off', async () => {
    let answer: (fc: unknown) => void = () => {}
    fetchSmoke.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { stub, smoke } = setup()
    smoke.update({ show: true })
    smoke.update({ show: false })
    answer(PLUME)
    await Promise.resolve()
    await Promise.resolve()
    expect(stub.sources.smoke.data).not.toBe(PLUME)
  })

  // A click on a plume opens the spot's card there, whose smoke section
  // describes the densest plume over it (#832), however many it lands on.
  it('opens the spot’s card at a click on the plumes', () => {
    const { stub, click, spots } = setup()
    expect(stub.handlerCount('mouseenter', SMOKE_CLICK_ORDER[0])).toBe(0)
    const plume = (density: SmokeDensity) => ({ layer: { id: smokeLayerId(density) }, properties: { density } })
    click([plume('Light'), plume('Heavy'), plume('Medium')])
    expect(spots).toEqual([{ lng: -121.5, lat: 47.5 }])
    expect(opened).toEqual([])
  })

  // A section about a plume the map no longer draws leaves its card; the card
  // stays for whatever else it says.
  it('asks the open cards to read it again when switched off', () => {
    fetchSmoke.mockResolvedValue(PLUME)
    const { popups, closed, refreshed } = fakeMapPopups()
    const smoke = mountSmoke(stubMap({ canvasWidth: 800 }).map, { popups, online: null })
    smoke.update({ show: true })
    smoke.update({ show: false })
    expect(refreshed).toEqual(['smoke'])
    expect(closed).toEqual([])
  })

  // #580: one failed fetch used to leave the layer empty until a toggle.
  it('asks again when the pod’s Retry-After runs out, with no toggle', async () => {
    vi.useFakeTimers()
    try {
      fetchSmoke
        .mockRejectedValueOnce(Object.assign(new Error('Smoke data unavailable. Try again later.'), { retryAfterS: 60 }))
        .mockResolvedValueOnce(PLUME)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { stub, smoke } = setup()
      smoke.update({ show: true })
      await vi.advanceTimersByTimeAsync(59_000)
      expect(fetchSmoke).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(fetchSmoke).toHaveBeenCalledTimes(2)
      await vi.waitFor(() => expect(stub.sources.smoke.data).toBe(PLUME))
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks again when the browser comes back online', async () => {
    fetchSmoke.mockRejectedValueOnce(new Error('Bluebird Forecast is offline. Try again later.')).mockResolvedValueOnce(PLUME)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const { stub, smoke } = setup(false, online)
    smoke.update({ show: true })
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled())
    online.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(fetchSmoke).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(stub.sources.smoke.data).toBe(PLUME))
  })

  it('asks nothing more once switched off', async () => {
    vi.useFakeTimers()
    try {
      fetchSmoke.mockRejectedValue(Object.assign(new Error('Smoke data unavailable. Try again later.'), { retryAfterS: 60 }))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { smoke } = setup()
      smoke.update({ show: true })
      await vi.advanceTimersByTimeAsync(0)
      smoke.update({ show: false })
      await vi.advanceTimersByTimeAsync(600_000)
      expect(fetchSmoke).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

// Every card asks the layer for the plume over its point, from the analysis
// it holds (#832).
describe('mountSmoke point target', () => {
  const square = (density: SmokeDensity, half: number) => ({
    type: 'Feature' as const,
    properties: { density, satellite: 'GOES-West' },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-121.5 - half, 47.5 - half],
          [-121.5 + half, 47.5 - half],
          [-121.5 + half, 47.5 + half],
          [-121.5 - half, 47.5 + half],
          [-121.5 - half, 47.5 - half],
        ],
      ],
    },
  })
  // HMS nests its plumes: a wide light one around a narrow heavy one.
  const HELD: FeatureCollection = { type: 'FeatureCollection', features: [square('Light', 1), square('Heavy', 0.2)] }
  const UNDER = { lng: -121.5, lat: 47.5, zoom: 8 }
  // Outside every plume.
  const CLEAR = { lng: -118, lat: 47.5, zoom: 8 }
  const signal = () => new AbortController().signal

  function mounted() {
    fetchSmoke.mockResolvedValue(HELD)
    const fake = fakeMapPopups()
    const smoke = mountSmoke(stubMap({ canvasWidth: 800 }).map, { popups: fake.popups, online: null })
    return { smoke, ...fake, target: fake.points[0] }
  }

  it('is on while the layer is, and paints nothing for the cursor', () => {
    const { smoke, points, target } = mounted()
    expect(points.map((p) => p.target)).toEqual(['smoke'])
    expect(target.shown()).toBe(false)
    smoke.update({ show: true })
    expect(target.shown()).toBe(true)
    expect(target.paints(UNDER)).toBe(false)
    smoke.update({ show: false })
    expect(target.shown()).toBe(false)
  })

  it('tells the open cards when the analysis lands, and describes the densest plume over the point', async () => {
    const { smoke, target, refreshed } = mounted()
    expect(await target.read(UNDER, signal())).toBeNull()
    smoke.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['smoke']))
    const reading = await target.read(UNDER, signal())
    expect(reading).toEqual({ section: smokeSectionAt(HELD, UNDER) })
    expect(reading?.section).toMatchObject({ kind: 'smoke', layer: SMOKE_ROW_LABEL })
    expect(reading?.section.title).toContain('Heavy')
    expect(await target.read(CLEAR, signal())).toBeNull()
  })

  it('answers nothing once switched off', async () => {
    const { smoke, target, refreshed } = mounted()
    smoke.update({ show: true })
    await vi.waitFor(() => expect(refreshed).toEqual(['smoke']))
    smoke.update({ show: false })
    expect(refreshed).toEqual(['smoke', 'smoke'])
    expect(await target.read(UNDER, signal())).toBeNull()
  })
})
