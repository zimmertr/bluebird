import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DestinationsRequest } from '../types'
import {
  API_DEADLINE_MS,
  API_UNREACHABLE_MESSAGE,
  ApiUnreachable,
  apiFetch,
  apiJson,
  postDestinations,
  retryAfterSeconds,
} from './apiFetch'

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
    stubFetch(() => Promise.resolve(new Response('{}', { status: 429 })))
    const res = await apiFetch('/api/wildfires')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(429)
  })

  it('returns a successful response unchanged', async () => {
    const spy = stubFetch(() => Promise.resolve(new Response('ok', { status: 200 })))
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
    const spy = stubFetch(() => Promise.resolve(new Response('ok', { status: 200 })))
    await apiFetch('/api/smoke')
    const signal = (spy.mock.calls[0][1] as RequestInit).signal as AbortSignal
    await vi.advanceTimersByTimeAsync(API_DEADLINE_MS * 2)
    expect(signal.aborted).toBe(false)
  })
})

describe('retryAfterSeconds', () => {
  it('reads the seconds form and nothing else', () => {
    const answer = (value?: string) =>
      new Response('', { status: 503, headers: value === undefined ? {} : { 'Retry-After': value } })
    expect(retryAfterSeconds(answer('60'))).toBe(60)
    expect(retryAfterSeconds(answer(' 5 '))).toBe(5)
    expect(retryAfterSeconds(answer())).toBeNull()
    expect(retryAfterSeconds(answer('Wed, 21 Oct 2026 07:28:00 GMT'))).toBeNull()
    expect(retryAfterSeconds(answer('-1'))).toBeNull()
  })
})

describe('apiJson', () => {
  it('parses the body of an answer that succeeded', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ limits: { max_limit: 500 } }), { status: 200 }),
      ),
    )
    await expect(apiJson('/api/capabilities')).resolves.toEqual({ limits: { max_limit: 500 } })
  })

  // The failing body is never parsed and never returned: a caller of this one
  // has nothing to say about a status, so an error body must not reach it
  // looking like an answer.
  it('throws on a failing status rather than parsing it', async () => {
    stubFetch(() => Promise.resolve(new Response('{"detail":"nope"}', { status: 503 })))
    await expect(apiJson('/api/capabilities')).rejects.toThrow('HTTP 503')
  })

  it('carries the unreachable message through', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(apiJson('/api/config')).rejects.toThrow(API_UNREACHABLE_MESSAGE)
  })
})

describe('postDestinations', () => {
  it('posts the request as JSON to the one path, with the caller signal', async () => {
    const spy = stubFetch(() => Promise.resolve(new Response('{"destinations":[]}', { status: 200 })))
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
