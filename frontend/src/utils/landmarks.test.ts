import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LANDMARK_LAYERS,
  LANDMARK_MINZOOM,
  LANDMARKS_URL,
  fetchLandmarks,
  landmarkKindOf,
  landmarkQueryUrl,
} from './landmarks'
import { isRateLimited } from './wildfires'
import { fakeResponse } from '../testSupport/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('landmarkQueryUrl', () => {
  it('asks the pod for the viewport as west,south,east,north', () => {
    const url = landmarkQueryUrl([-122, 47, -121, 48])
    expect(url.startsWith(`${LANDMARKS_URL}?`)).toBe(true)
    expect(new URL(url, 'http://x').searchParams.get('bbox')).toBe('-122,47,-121,48')
  })
})

// The trails' floor (`ofm-trails`), so a trailhead draws with its trail
// (the maintainer, 2026-10-16).
describe('LANDMARK_MINZOOM', () => {
  it('is the zoom the trails draw from', () => {
    expect(LANDMARK_MINZOOM).toBe(11)
  })
})

describe('landmarkKindOf', () => {
  it('names the kind each layer draws, and nothing for another layer', () => {
    expect(LANDMARK_LAYERS.map(landmarkKindOf)).toEqual(['trailhead', 'crag'])
    expect(landmarkKindOf('ofm-peaks')).toBeNull()
  })
})

describe('fetchLandmarks', () => {
  const run = () => fetchLandmarks([-122, 47, -121, 48], new AbortController().signal)

  it('returns the collection', async () => {
    const body = {
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
    const fetchSpy = vi.fn(async () => fakeResponse(body))
    vi.stubGlobal('fetch', fetchSpy)
    const fc = await run()
    expect(fc.features[0].properties.kind).toBe('trailhead')
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('/api/landmarks?bbox=')
  })

  // Both mean "wait": a 429 is this client over its own limit, a 503 a pod
  // that holds no snapshot yet. The pod's Retry-After rides the error.
  it.each([429, 503])('marks a %i as rate limited, with its Retry-After', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ detail: 'x' }, status, { 'Retry-After': '30' })))
    const err = await run().catch((e: unknown) => e)
    expect((err as Error).message).toBe('Map destinations unavailable. Try again later.')
    expect(isRateLimited(err)).toBe(true)
    expect((err as { retryAfterS?: number }).retryAfterS).toBe(30)
  })

  it('leaves any other refusal unmarked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ detail: 'x' }, 422)))
    const err = await run().catch((e: unknown) => e)
    expect(isRateLimited(err)).toBe(false)
  })

  it('refuses a body that is not a FeatureCollection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ type: 'Feature' })))
    await expect(run()).rejects.toThrow('Map destinations could not be read.')
  })
})
