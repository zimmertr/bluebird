import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLOSURE_COLOR,
  CLOSURE_EDGE,
  USFS_HREF,
  closureAreaSwatch,
  closureDate,
  closureName,
  closureQueryUrl,
  closureReason,
  closureTrailSwatch,
  fetchClosures,
} from './closures'
import { isRateLimited } from './wildfires'
import { closureFeature, fakeResponse } from '../testSupport/fixtures'

const props = (over = {}) => closureFeature(over).properties
const START = Date.UTC(2026, 7, 1, 12)
const END = Date.UTC(2026, 11, 31, 12)
const medium = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })

afterEach(() => vi.unstubAllGlobals())

describe('closureQueryUrl', () => {
  it('asks Bluebird Forecast for one kind at one fidelity inside the viewport', () => {
    const url = closureQueryUrl([-122, 45, -121, 46], 'trail', 'coarse')
    expect(url.startsWith('/api/closures?')).toBe(true)
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('bbox')).toBe('-122,45,-121,46')
    expect(params.get('kind')).toBe('trail')
    expect(params.get('detail')).toBe('coarse')
    expect(new URL(closureQueryUrl([0, 0, 1, 1], 'area', 'full'), 'http://x').searchParams.get('kind')).toBe('area')
  })
})

describe('fetchClosures', () => {
  const run = () => fetchClosures([-122, 45, -121, 46], 'area', 'coarse', new AbortController().signal)

  it('returns the collection with its coverage', async () => {
    const body = { type: 'FeatureCollection', fetched_at: 1, coverage: { type: 'MultiPolygon', coordinates: [] }, features: [closureFeature()] }
    const fetchSpy = vi.fn(async () => fakeResponse(body))
    vi.stubGlobal('fetch', fetchSpy)
    const fc = await run()
    expect(fc.features).toHaveLength(1)
    expect(fc.coverage?.type).toBe('MultiPolygon')
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('kind=area')
  })

  // Both mean "wait": a 429 is this client over its own limit, a 503 a pod
  // that has never fetched the orders.
  it.each([429, 503])('marks a %i as rate limited', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ detail: 'x' }, status)))
    const err = await run().catch((e: unknown) => e)
    expect((err as Error).message).toBe('Closure data unavailable. Try again later.')
    expect(isRateLimited(err)).toBe(true)
  })

  it('leaves any other refusal unmarked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ detail: 'x' }, 422)))
    const err = await run().catch((e: unknown) => e)
    expect((err as Error).message).toBe('Closure data unavailable. Try again later.')
    expect(isRateLimited(err)).toBe(false)
  })

  it('refuses a body that is not a FeatureCollection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ type: 'Feature' })))
    await expect(run()).rejects.toThrow('Closure data could not be read.')
  })
})

describe('closureName', () => {
  it('trims the order name, and falls back to its number, then to a word', () => {
    expect(closureName(props())).toBe('Probe Fire Closure')
    expect(closureName(props({ ClosureOrderName: '  ' }))).toBe('06-22-00-26-01')
    expect(closureName(props({ ClosureOrderName: null, ClosureOrderNumber: null }))).toBe('Closure')
  })
})

// One end of an order's span (#832): the card states the span only when
// both ends have one, so a stamp that names no instant must read as none.
describe('closureDate', () => {
  it('is a medium date for a stamp, and null for none', () => {
    expect(closureDate(START)).toBe(medium(START))
    expect(closureDate(END)).toBe(medium(END))
    expect(closureDate(null)).toBeNull()
    expect(closureDate(undefined)).toBeNull()
    expect(closureDate(Number.NaN)).toBeNull()
  })
})

describe('closureReason', () => {
  it('is the order type where the region files one, and never the fire', () => {
    expect(closureReason(props({ FireName: null, ClosureType: ' Recreation Closure ' }))).toBe('Recreation Closure')
    expect(closureReason(props({ FireName: 'Cedar Creek', ClosureType: null }))).toBeNull()
    expect(closureReason(props({ FireName: null, ClosureType: '  ' }))).toBeNull()
  })
})

describe('the closure paint', () => {
  it('keys the area on the closure colour at the fire swatch alpha, edged in the outline colour', () => {
    expect(CLOSURE_COLOR).toBe('#c026d3')
    expect(closureAreaSwatch()).toEqual({ backgroundColor: 'rgba(192,38,211,0.35)', borderColor: CLOSURE_EDGE })
    expect(closureTrailSwatch()).toEqual({ borderColor: CLOSURE_COLOR })
  })

  it('credits the Forest Service over https', () => {
    expect(USFS_HREF).toBe('https://www.fs.usda.gov/')
  })
})
