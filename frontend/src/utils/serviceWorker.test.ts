import { describe, expect, it, vi } from 'vitest'
import { WORKER_URL, applyServiceWorkerSwitch, syncServiceWorker } from './serviceWorker'
import SCRIPT from '../../public/sw.js?raw'

function container(registrations = 0) {
  const unregister = vi.fn(async () => true)
  return {
    register: vi.fn(async () => ({})),
    getRegistrations: vi.fn(async () => Array.from({ length: registrations }, () => ({ unregister }))),
    unregister,
  }
}

describe('the service worker switch (record 0349)', () => {
  it('registers the worker while the deployment says so', async () => {
    const c = container()
    await syncServiceWorker(true, c as unknown as ServiceWorkerContainer)
    expect(c.register).toHaveBeenCalledWith(WORKER_URL)
  })

  it('removes every registration once the deployment says not', async () => {
    const c = container(2)
    await syncServiceWorker(false, c as unknown as ServiceWorkerContainer)
    expect(c.register).not.toHaveBeenCalled()
    expect(c.unregister).toHaveBeenCalledTimes(2)
  })

  it('changes nothing when the config does not answer, which is the visit the worker is for', async () => {
    const c = container(1)
    await applyServiceWorkerSwitch(async () => {
      throw new Error('offline')
    }, c as unknown as ServiceWorkerContainer)
    expect(c.register).not.toHaveBeenCalled()
    expect(c.unregister).not.toHaveBeenCalled()
  })

  it('reads only a true as on', async () => {
    const c = container(1)
    await applyServiceWorkerSwitch(async () => ({ service_worker: 'yes' }), c as unknown as ServiceWorkerContainer)
    expect(c.register).not.toHaveBeenCalled()
    expect(c.unregister).toHaveBeenCalledTimes(1)
  })

  it('does nothing in a browser without workers, and swallows a refusal', async () => {
    await expect(syncServiceWorker(true, undefined)).resolves.toBeUndefined()
    const c = { register: vi.fn(async () => Promise.reject(new Error('denied'))) }
    await expect(syncServiceWorker(true, c as unknown as ServiceWorkerContainer)).resolves.toBeUndefined()
  })
})

// ── The worker itself, run against a fake cache and a fake network ─────────

const ORIGIN = 'https://bluebirdforecast.com'

type Listener = (event: unknown) => void

function worker(network: (url: string) => Promise<Response>) {
  const listeners: Record<string, Listener> = {}
  const store = new Map<string, Map<string, Response>>()
  const keyOf = (k: string | Request) => (typeof k === 'string' ? new URL(k, ORIGIN).href : k.url)
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    const entries = store.get(name)!
    return {
      match: async (k: string | Request) => entries.get(keyOf(k))?.clone(),
      put: async (k: string | Request, r: Response) => void entries.set(keyOf(k), r),
      delete: async (k: string | Request) => entries.delete(keyOf(k)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
    }
  }
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn
    },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  }
  const fetchStub = vi.fn((request: Request) => network(request.url))
  new Function('self', 'caches', 'fetch', SCRIPT)(self, caches, fetchStub)

  async function get(path: string, mode: RequestMode = 'navigate'): Promise<Response | 'passed'> {
    // Request refuses `navigate` as a mode, so the event carries a stand-in.
    const request = { url: new URL(path, ORIGIN).href, method: 'GET', mode } as unknown as Request
    let answer: Promise<Response> | null = null
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => (answer = p) })
    return answer === null ? 'passed' : await answer
  }
  const answer = async (path: string) => (await get(path)) as Response
  return { get, answer, fetchStub, store, listeners }
}

const pageNaming = (asset: string) => `<script type="module" src="${asset}"></script>`

describe('sw.js', () => {
  it('asks the network for the page every time, and serves the last copy only when it has no answer', async () => {
    let up = true
    const w = worker(async (url) => {
      if (!up) throw new TypeError('Failed to fetch')
      return new Response(url.endsWith('/') ? pageNaming('/assets/a.js') : 'js', { status: 200 })
    })
    expect(await (await w.answer('/')).text()).toContain('/assets/a.js')
    up = false
    expect(await (await w.answer('/')).text()).toContain('/assets/a.js')
  })

  it('serves the last copy when the edge answers for a pod it cannot reach, but not on a 4xx', async () => {
    let status = 200
    const w = worker(async () => new Response(status === 200 ? pageNaming('/assets/a.js') : 'edge', { status }))
    await w.get('/')
    status = 530
    expect(await (await w.answer('/')).text()).toContain('/assets/a.js')
    status = 404
    expect(((await w.get('/')) as Response).status).toBe(404)
  })

  it('keeps an asset once and drops the ones the next page no longer names', async () => {
    let asset = '/assets/a.js'
    const w = worker(async (url) => new Response(url.endsWith('/') ? pageNaming(asset) : 'js', { status: 200 }))
    await w.get('/')
    await w.get('/assets/a.js', 'cors')
    await w.get('/assets/a.js', 'cors')
    expect(w.fetchStub.mock.calls.filter(([r]) => r.url.endsWith('/assets/a.js'))).toHaveLength(1)
    asset = '/assets/b.js'
    await w.get('/')
    const cached = [...[...w.store.values()][0].keys()]
    expect(cached.some((k) => k.endsWith('/assets/a.js'))).toBe(false)
  })

  it('lets the API, every other page and every other host past untouched', async () => {
    const w = worker(async () => new Response('x'))
    expect(await w.get('/api/capabilities', 'cors')).toBe('passed')
    expect(await w.get('/docs')).toBe('passed')
    expect(await w.get('https://api.open-meteo.com/v1/forecast', 'cors')).toBe('passed')
  })
})
