import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLOSURE_COLOR,
  CLOSURE_EDGE,
  USFS_HREF,
  closureAreaSwatch,
  closureIdentity,
  closureName,
  closurePopupHtml,
  closureQueryUrl,
  closureTrailSwatch,
  fetchClosures,
  formatClosureDates,
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

describe('closureIdentity', () => {
  it('keys a closure by its OBJECTID, and by its name without one', () => {
    expect(closureIdentity(props({ OBJECTID: 42 }))).toBe('42')
    expect(closureIdentity(props({ OBJECTID: null }))).toBe('Probe Fire Closure')
  })
})

describe('closureName', () => {
  it('trims the order name, and falls back to its number, then to a word', () => {
    expect(closureName(props())).toBe('Probe Fire Closure')
    expect(closureName(props({ ClosureOrderName: '  ' }))).toBe('06-22-00-26-01')
    expect(closureName(props({ ClosureOrderName: null, ClosureOrderNumber: null }))).toBe('Closure')
  })
})

describe('formatClosureDates', () => {
  it('states the span only when both ends exist', () => {
    expect(formatClosureDates(START, END)).toBe(`${medium(START)} to ${medium(END)}`)
    expect(formatClosureDates(START, null)).toBeNull()
    expect(formatClosureDates(undefined, END)).toBeNull()
    expect(formatClosureDates(Number.NaN, END)).toBeNull()
  })
})

describe('closurePopupHtml', () => {
  it('names the order, the forest, the route and the dates, and links the order', () => {
    const html = closurePopupHtml(props())
    expect(html).toContain('<strong>🚫 Probe Fire Closure</strong>')
    expect(html).toContain('<br>Columbia River Gorge NSA')
    expect(html).toContain('<br>Eagle Creek 440')
    expect(html).toContain(`<br>${medium(START)} to ${medium(END)}`)
    expect(html).toContain('href="https://www.fs.usda.gov/r06/alerts/probe"')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('View closure order ↗')
  })

  it('leaves out every line the order does not carry', () => {
    const html = closurePopupHtml(
      props({ ForestUnit: null, RouteName: null, RouteNum: null, ClosureEndDate: null, ClosureURLlink: null }),
    )
    expect(html.match(/<br>/g)).toBeNull()
    expect(html).not.toContain('View closure order')
  })

  it('joins whichever half of the route exists', () => {
    expect(closurePopupHtml(props({ RouteName: null }))).toContain('<br>440')
    expect(closurePopupHtml(props({ RouteNum: null }))).toContain('<br>Eagle Creek\n')
  })

  it('escapes every value it prints', () => {
    const html = closurePopupHtml(
      props({ ClosureOrderName: '<img src=x>', ForestUnit: 'A & B', RouteName: '"q"' }),
    )
    expect(html).toContain('🚫 &lt;img src=x&gt;')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('&quot;q&quot;')
    expect(html).not.toContain('<img')
  })

  // The link is the service's free text, and only a web address is a link.
  it('links nothing but an http(s) address', () => {
    expect(closurePopupHtml(props({ ClosureURLlink: 'javascript:alert(1)' }))).not.toContain('<a ')
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
