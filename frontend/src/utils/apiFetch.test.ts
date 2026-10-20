import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DestinationsRequest } from '../types'
import {
  API_DEADLINE_MS,
  API_UNREACHABLE_MESSAGE,
  ApiUnreachable,
  apiFetch,
  apiJson,
  overlayFeatures,
  postDestinations,
  type OverlayFailure,
  retryAfterSeconds,
} from './apiFetch'
import { fakeResponse } from '../testSupport/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// A fetch that never answers on its own and rejects with the signal's reason
// when aborted, which is what a browser does.
function hangingFetch() {
  return stubFetch(
    (_path?: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      }),
  )
}

function stubFetch(impl: (path?: unknown, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('apiFetch', () => {
  // The bug itself (#381): the banner used to read "Failed to fetch", which is
  // Chrome's sentence and not one anybody approved.
  it('translates a rejected request into one message of our own', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const err = await apiFetch('/api/destinations').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiUnreachable)
    expect((err as Error).message).toBe('Bluebird Forecast is offline. Try again later.')
    expect((err as Error).message).toBe(API_UNREACHABLE_MESSAGE)
  })

  // A cancel is the user's own doing. It has to arrive at the caller as the
  // same object, because every caller tells an abort from a failure by name.
  it('passes an abort through untouched', async () => {
    const abort = new DOMException('The user aborted a request.', 'AbortError')
    stubFetch(() => Promise.reject(abort))
    const err = await apiFetch('/api/destinations').catch((e: unknown) => e)
    expect(err).toBe(abort)
  })

  // A status is an answer, and what one means differs per endpoint: the map
  // overlays read 429 and 503 as "wait", analyze reads a refusal body. Those
  // judgements stay with the caller, so a failing status must come back rather
  // than throw here.
  it('hands a failing status back to the caller', async () => {
    stubFetch(() => Promise.resolve(fakeResponse({}, 429)))
    const res = await apiFetch('/api/wildfires')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(429)
  })

  it('returns a successful response unchanged', async () => {
    const spy = stubFetch(() => Promise.resolve(fakeResponse({ raw: 'ok' })))
    const res = await apiFetch('/api/smoke', { headers: { Accept: 'application/json' } })
    expect(res.ok).toBe(true)
    expect(spy).toHaveBeenCalledWith(
      '/api/smoke',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  // #580: a request that never got an answer held its caller forever.
  it('gives a request with no answer up as unreachable at the deadline', async () => {
    vi.useFakeTimers()
    hangingFetch()
    const pending = apiFetch('/api/smoke').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(API_DEADLINE_MS - 1)
    let settled = false
    void pending.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const err = await pending
    expect(err).toBeInstanceOf(ApiUnreachable)
    expect((err as Error).message).toBe(API_UNREACHABLE_MESSAGE)
  })

  it('still passes the caller’s own cancel through as an abort', async () => {
    hangingFetch()
    const controller = new AbortController()
    const pending = apiFetch('/api/smoke', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort()
    const err = await pending
    expect((err as Error).name).toBe('AbortError')
  })

  it('stops the clock once the answer has started', async () => {
    vi.useFakeTimers()
    const spy = stubFetch(() => Promise.resolve(fakeResponse({ raw: 'ok' })))
    await apiFetch('/api/smoke')
    const signal = (spy.mock.calls[0][1] as RequestInit).signal as AbortSignal
    await vi.advanceTimersByTimeAsync(API_DEADLINE_MS * 2)
    expect(signal.aborted).toBe(false)
  })
})

describe('retryAfterSeconds', () => {
  it('reads the seconds form and nothing else', () => {
    const answer = (value?: string) =>
      fakeResponse({ raw: '' }, 503, value === undefined ? {} : { 'Retry-After': value })
    expect(retryAfterSeconds(answer('60'))).toBe(60)
    expect(retryAfterSeconds(answer(' 5 '))).toBe(5)
    expect(retryAfterSeconds(answer())).toBeNull()
    expect(retryAfterSeconds(answer('Wed, 21 Oct 2026 07:28:00 GMT'))).toBeNull()
    expect(retryAfterSeconds(answer('-1'))).toBeNull()
  })

  // RFC 9110's delta-seconds is digits alone, so a value that is not one is no
  // wait, and each caller falls back to its own: Open-Meteo's 429 used to read
  // these leniently and waited 2 s, 1 s and 1000 s for them.
  it('reads a decimal, a sign or an exponent as no wait, and 0 as 0', () => {
    const answer = (value: string) => fakeResponse({ raw: '' }, 429, { 'Retry-After': value })
    expect(retryAfterSeconds(answer('1.5'))).toBeNull()
    expect(retryAfterSeconds(answer('-5'))).toBeNull()
    expect(retryAfterSeconds(answer('1e3'))).toBeNull()
    expect(retryAfterSeconds(answer(''))).toBeNull()
    expect(retryAfterSeconds(answer('0'))).toBe(0)
  })

  it('reads an answer with no headers at all as no wait', () => {
    expect(retryAfterSeconds({ ok: false, status: 429 } as Response)).toBeNull()
  })
})

describe('overlayFeatures', () => {
  const read = (res: Response) => overlayFeatures(res, 'Probe data unavailable. Try again later.', 'Probe data could not be read.')

  it('hands back a FeatureCollection as it came', async () => {
    const body = { type: 'FeatureCollection', features: [], coverage: null }
    expect(await read(fakeResponse(body))).toEqual(body)
  })

  it('marks a 429 or a 503 as a wait with its Retry-After, and any other refusal as neither', async () => {
    for (const status of [429, 503]) {
      const err = (await read(fakeResponse({}, status, { 'Retry-After': '30' })).catch((e: unknown) => e)) as OverlayFailure
      expect(err).toMatchObject({ message: 'Probe data unavailable. Try again later.', rateLimited: true, retryAfterS: 30 })
    }
    const err = (await read(fakeResponse({}, 500)).catch((e: unknown) => e)) as OverlayFailure
    expect(err).toMatchObject({ rateLimited: false, retryAfterS: null })
  })

  it('refuses a body that is no FeatureCollection with the unreadable sentence', async () => {
    for (const body of [{ type: 'Feature' }, { type: 'FeatureCollection' }, null]) {
      await expect(read(fakeResponse(body))).rejects.toThrow('Probe data could not be read.')
    }
  })
})

describe('apiJson', () => {
  it('parses the body of an answer that succeeded', async () => {
    stubFetch(() => Promise.resolve(fakeResponse({ limits: { max_limit: 500 } })))
    await expect(apiJson('/api/capabilities')).resolves.toEqual({ limits: { max_limit: 500 } })
  })

  // The failing body is never parsed and never returned: a caller of this one
  // has nothing to say about a status, so an error body must not reach it
  // looking like an answer.
  it('throws on a failing status rather than parsing it', async () => {
    stubFetch(() => Promise.resolve(fakeResponse({ detail: 'nope' }, 503)))
    await expect(apiJson('/api/capabilities')).rejects.toThrow('HTTP 503')
  })

  it('carries the unreachable message through', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(apiJson('/api/config')).rejects.toThrow(API_UNREACHABLE_MESSAGE)
  })
})

describe('postDestinations', () => {
  it('posts the request as JSON to the one path, with the caller signal', async () => {
    const spy = stubFetch(() => Promise.resolve(fakeResponse({ destinations: [] })))
    const controller = new AbortController()
    const body: DestinationsRequest = { destination_types: ['peak'] }
    await postDestinations(body, controller.signal)
    expect(spy).toHaveBeenCalledWith(
      '/api/destinations',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    // The fetch carries a signal of its own, for the deadline, that the
    // caller's cancel still reaches.
    const signal = (spy.mock.calls[0][1] as RequestInit).signal as AbortSignal
    controller.abort()
    expect(signal.aborted).toBe(true)
  })
})
