import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchLandmarks, loadUsStates } = vi.hoisted(() => ({ fetchLandmarks: vi.fn(), loadUsStates: vi.fn() }))
vi.mock('../utils/usStatesLoad', () => ({ loadUsStates: () => loadUsStates() }))
vi.mock('../utils/landmarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/landmarks')>()),
  fetchLandmarks: (...args: unknown[]) => fetchLandmarks(...args),
}))

import { LANDMARK_SOURCE, mountLandmarks } from './landmarks'
import { CLIMBING_IMAGE, POI_GLOW_IMAGE, POI_LABEL_PAINT, TRAILHEAD_IMAGE } from './basemap'
import { FIRE_REFETCH_DEBOUNCE_MS } from './overlays/wildfires'
import { LANDMARK_MINZOOM } from '../utils/landmarks'
import { stubMap } from '../testSupport/stubMap'
import { visibleBox } from '../utils/viewBox'

const LANDMARKS = {
  type: 'FeatureCollection',
  fetched_at: 1760600000000,
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.7437, 47.4875] },
      properties: { name: 'Mailbox Peak Trailhead', kind: 'trailhead', osm_id: 'node/4578891234', elevation_ft: null },
    },
  ],
}

// The loaded style as MapLibre reports it once `enhanceBasemap` has run: its
// own layers, with the basemap patch's symbols already among them.
const STYLE_LAYERS = [
  { id: 'background', type: 'background' },
  { id: 'ofm-trails', type: 'line' },
  { id: 'ofm-peaks-glow', type: 'symbol' },
  { id: 'ofm-peaks', type: 'symbol' },
  { id: 'road_label', type: 'symbol' },
]

type Spec = { id: string; filter?: unknown; minzoom?: number; layout?: Record<string, unknown>; paint?: unknown }

function setup({ zoom = 12, images = false, online = null as EventTarget | null } = {}) {
  const stub = stubMap({ styleLayers: STYLE_LAYERS, zoom })
  let currentZoom = zoom
  stub.map.getZoom = () => currentZoom
  stub.map.hasImage = () => images
  const added: Record<string, Spec> = {}
  const addLayer = stub.map.addLayer.bind(stub.map)
  stub.map.addLayer = ((layer: Spec, before?: string) => {
    added[layer.id] = layer
    return addLayer(layer as never, before)
  }) as typeof stub.map.addLayer
  const landmarks = mountLandmarks(stub.map, { online })
  return { stub, added, landmarks, zoomTo: (z: number) => (currentZoom = z) }
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchLandmarks.mockReset()
  fetchLandmarks.mockResolvedValue(LANDMARKS)
  loadUsStates.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('mountLandmarks', () => {
  // Over the basemap's own clickable labels and under the style's, each
  // label with its glow directly beneath it.
  it('stacks the two layers over the basemap patch, under the style\'s labels', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      'background',
      'ofm-trails',
      'ofm-peaks-glow',
      'ofm-peaks',
      'landmark-trailheads-glow',
      'landmark-trailheads',
      'landmark-crags-glow',
      'landmark-crags',
      'road_label',
    ])
    expect(stub.calls.find((c) => c[0] === 'addSource')?.[1]).toBe(LANDMARK_SOURCE)
  })

  it('gives each kind its own layer, from the trails\' floor, in the shared look', () => {
    const { added } = setup()
    expect(added['landmark-trailheads'].filter).toEqual(['==', ['get', 'kind'], 'trailhead'])
    expect(added['landmark-crags'].filter).toEqual(['==', ['get', 'kind'], 'crag'])
    for (const id of ['landmark-trailheads', 'landmark-crags']) {
      expect(added[id].minzoom).toBe(LANDMARK_MINZOOM)
      expect(added[`${id}-glow`].minzoom).toBe(LANDMARK_MINZOOM)
      expect(added[`${id}-glow`].filter).toEqual(added[id].filter)
      expect(added[`${id}-glow`].layout?.['icon-image']).toBe(POI_GLOW_IMAGE)
      expect(added[id].layout?.['text-field']).toEqual(['get', 'name'])
      expect(added[id].paint).toBe(POI_LABEL_PAINT)
    }
    expect(LANDMARK_MINZOOM).toBe(11)
  })

  // Boulders metres apart pile up, so the crags alone let collision hide
  // icons (the maintainer, 2026-10-15); a trailhead keeps its marker.
  it('lets crag icons collide away and keeps every trailhead', () => {
    const { added } = setup()
    expect(added['landmark-crags'].layout?.['icon-allow-overlap']).toBe(false)
    expect(added['landmark-trailheads'].layout?.['icon-allow-overlap']).toBe(true)
  })

  it('wears the drawn icons, or the sprite\'s circle where none could be drawn', () => {
    const drawn = setup({ images: true }).added
    expect(drawn['landmark-trailheads'].layout?.['icon-image']).toBe(TRAILHEAD_IMAGE)
    expect(drawn['landmark-crags'].layout?.['icon-image']).toBe(CLIMBING_IMAGE)
    const bare = setup().added
    expect(bare['landmark-trailheads'].layout?.['icon-image']).toBe('circle_stroked_11')
    expect(bare['landmark-crags'].layout?.['icon-image']).toBe('circle_stroked_11')
  })

  it('fetches the viewport on mount at the floor and above, and fills the source', async () => {
    const { stub } = setup({ zoom: 11 })
    expect(fetchLandmarks).toHaveBeenCalledTimes(1)
    expect(fetchLandmarks.mock.calls[0][0]).toEqual(visibleBox(stub.map.getCenter(), 11, 0, 0, 0))
    await vi.waitFor(() => expect(stub.sources[LANDMARK_SOURCE].data).toBe(LANDMARKS))
  })

  // A pitched camera's bounds run to the horizon (#799), and the markers ask
  // for the box the view would cover lying flat.
  it('asks for the view as it would lie flat, not to the horizon', () => {
    const stub = stubMap({
      styleLayers: STYLE_LAYERS,
      zoom: 13,
      canvasWidth: 1000,
      canvasHeight: 700,
      pitch: 60,
      bounds: { west: -140, south: 40, east: -100, north: 70 },
    })
    mountLandmarks(stub.map, { online: null })
    expect(fetchLandmarks.mock.calls[0][0]).toEqual(visibleBox(stub.map.getCenter(), 13, 1000, 700, 0))
  })

  // A crag's card names its state in its search, from outlines fetched once,
  // so a crag coming into view asks for them before anyone clicks it.
  it('asks for the state outlines when a crag comes into view, and not for trailheads alone', async () => {
    setup()
    await vi.runAllTimersAsync()
    expect(loadUsStates).not.toHaveBeenCalled()
    const crag = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.75024, 47.48886] },
      properties: { name: 'Family Wall', kind: 'crag', osm_id: 'way/1307110189', elevation_ft: null },
    }
    fetchLandmarks.mockResolvedValue({ ...LANDMARKS, features: [...LANDMARKS.features, crag] })
    setup()
    await vi.runAllTimersAsync()
    expect(loadUsStates).toHaveBeenCalledTimes(1)
  })

  it('answers a held marker\'s exact point by its OSM id, and null for one it does not hold', async () => {
    const { stub, landmarks } = setup({ zoom: 11 })
    expect(landmarks.pointOf('node/4578891234')).toBeNull()
    await vi.waitFor(() => expect(stub.sources[LANDMARK_SOURCE].data).toBe(LANDMARKS))
    expect(landmarks.pointOf('node/4578891234')).toEqual([-121.7437, 47.4875])
    expect(landmarks.pointOf('way/9')).toBeNull()
  })

  it('asks nothing below the floor, on mount or after a pan, and keeps what it holds', async () => {
    const { stub, zoomTo } = setup({ zoom: 10 })
    expect(fetchLandmarks).not.toHaveBeenCalled()
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchLandmarks).not.toHaveBeenCalled()

    zoomTo(12)
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    await vi.waitFor(() => expect(stub.sources[LANDMARK_SOURCE].data).toBe(LANDMARKS))
    zoomTo(9)
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchLandmarks).toHaveBeenCalledTimes(1)
    expect(stub.sources[LANDMARK_SOURCE].data).toBe(LANDMARKS)
  })

  it('asks again once a pan settles, dropping the request it replaces', () => {
    fetchLandmarks.mockReset().mockReturnValue(new Promise(() => {}))
    const { stub } = setup()
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS - 1)
    expect(fetchLandmarks).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(fetchLandmarks).toHaveBeenCalledTimes(2)
    expect((fetchLandmarks.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
    expect((fetchLandmarks.mock.calls[1][1] as AbortSignal).aborted).toBe(false)
  })

  // #580's rule for the pod's overlays: a failed fetch asks again when the
  // network comes back, and no sooner than the pod's Retry-After.
  it('asks again on reconnect after a 503, no sooner than its Retry-After', async () => {
    fetchLandmarks
      .mockReset()
      .mockRejectedValueOnce(
        Object.assign(new Error('Map destinations unavailable. Try again later.'), { rateLimited: true, retryAfterS: 30 }),
      )
      .mockResolvedValueOnce(LANDMARKS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const { stub } = setup({ online })
    await vi.advanceTimersByTimeAsync(0)
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(fetchLandmarks).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchLandmarks).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(stub.sources[LANDMARK_SOURCE].data).toBe(LANDMARKS))
  })

  // The layer has no switch, so a deployment with no database answers every
  // pan with a 503 and the Retry-After that says when to ask again.
  it('asks nothing on a pan inside a 503\'s Retry-After, and asks the first pan after it', async () => {
    fetchLandmarks
      .mockReset()
      .mockRejectedValueOnce(
        Object.assign(new Error('Map destinations unavailable. Try again later.'), { rateLimited: true, retryAfterS: 300 }),
      )
      .mockResolvedValueOnce(LANDMARKS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { stub } = setup()
    await vi.advanceTimersByTimeAsync(0)
    stub.fire('moveend')
    await vi.advanceTimersByTimeAsync(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchLandmarks).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300_000)
    stub.fire('moveend')
    await vi.advanceTimersByTimeAsync(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchLandmarks).toHaveBeenCalledTimes(2)
  })

  it('stops listening and drops its request when disposed', () => {
    fetchLandmarks.mockReset().mockReturnValue(new Promise(() => {}))
    const { stub, landmarks } = setup()
    expect(stub.handlerCount('moveend')).toBe(1)
    landmarks.dispose()
    expect(stub.handlerCount('moveend')).toBe(0)
    expect((fetchLandmarks.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
  })

  // The click is poiPopup.ts's, through map/mapPopups.ts.
  it('listens for no click, hover or pointer on its layers', () => {
    const { stub } = setup()
    for (const layer of ['landmark-trailheads', 'landmark-crags']) {
      for (const type of ['click', 'mouseenter', 'mouseleave', 'mousemove']) {
        expect(stub.handlerCount(type, layer)).toBe(0)
      }
    }
    expect(stub.handlerCount('click')).toBe(0)
  })
})
