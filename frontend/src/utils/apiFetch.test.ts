import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DestinationsRequest } from '../types'
import { API_UNREACHABLE_MESSAGE, ApiUnreachable, apiFetch, apiJson, postDestinations } from './apiFetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: () => Promise<Response>) {
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
    expect(spy).toHaveBeenCalledWith('/api/smoke', { headers: { Accept: 'application/json' } })
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
    expect(spy).toHaveBeenCalledWith('/api/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  })
})
