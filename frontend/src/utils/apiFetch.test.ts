import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DestinationsRequest } from '../types'
import { API_UNREACHABLE_MESSAGE, ApiUnreachable, apiFetch, apiJson, postDestinations } from './apiFetch'

// Every source file under src/, read as text through the `?raw` trick
// branding.test.ts and useCapabilities.test.ts use. Nothing here executes a
// module; this is a lint, not a run.
const globbed = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Keys arrive relative to THIS file, so a sibling reads './x.ts' and everything
// else '../dir/x.ts'. Re-spelled from src/ so one list of exceptions covers
// both shapes and a path in a failure message says where the file actually is.
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(globbed).map(([path, text]) => [
    path.startsWith('../') ? path.slice(3) : `utils/${path.slice(2)}`,
    text,
  ]),
)

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
    expect((err as Error).message).toBe('Cannot reach Bluebird Forecast. Try again later.')
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

// The leak is closed at the primitive, which only holds while the primitive is
// the only door. Open-Meteo keeps its own, because its taxonomy is about a
// quota and a model domain rather than about our pod being up.
describe('our API has one door', () => {
  const ALLOWED = ['utils/apiFetch.ts', 'utils/openMeteo.ts']
  // Spelled in pieces so this file's own text is not a match. No space before
  // the paren: prose about a fetch (like this) is not a call.
  const CALL = new RegExp('(?<![A-Za-z0-9_$])' + 'fetch' + '\\(')

  it('is the only file under src that calls the browser primitive', () => {
    const offenders: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('.test.ts') || ALLOWED.includes(path)) continue
      const m = CALL.exec(text)
      if (m) offenders.push(`${path}:${text.slice(0, m.index).split('\n').length}`)
    }
    expect(offenders, 'call apiFetch/apiJson from utils/apiFetch.ts instead').toEqual([])
  })

  it('reads the files it claims to lint, on both sides of its own folder', () => {
    const paths = Object.keys(sources)
    expect(paths).toContain('hooks/useAnalyze.ts')
    expect(paths).toContain('utils/wildfires.ts')
    expect(paths).toContain('utils/openMeteo.ts')
    expect(paths).toContain('App.tsx')
  })
})
