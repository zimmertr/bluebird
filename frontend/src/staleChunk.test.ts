import { describe, expect, it } from 'vitest'
import { CHUNK_RELOAD_KEY, reloadOnStaleChunk } from './staleChunk'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

// One page load: a fresh window, the session's storage, and a count of the
// reloads it asked for. Node has EventTarget and Event, which is all the
// listener touches.
function load(store: ReturnType<typeof memoryStorage>, build: string) {
  const target = new EventTarget()
  const page = { reloads: 0, fail: () => void target.dispatchEvent(new Event('vite:preloadError')) }
  reloadOnStaleChunk({ target, storage: () => store, reload: () => page.reloads++, build })
  return page
}

describe('reloadOnStaleChunk', () => {
  it('reloads a stale tab once, and records the build that did', () => {
    const store = memoryStorage()
    const stale = load(store, '/assets/main-A.js')
    stale.fail()
    expect(stale.reloads).toBe(1)
    expect(store.getItem(CHUNK_RELOAD_KEY)).toBe('/assets/main-A.js')
  })

  it('does not reload the same build twice in a session', () => {
    const store = memoryStorage()
    load(store, '/assets/main-B.js').fail()
    // The reload served the same build, whose chunk is still missing.
    const again = load(store, '/assets/main-B.js')
    again.fail()
    again.fail()
    expect(again.reloads).toBe(0)
  })

  it('reloads again for a later release', () => {
    const store = memoryStorage()
    load(store, '/assets/main-A.js').fail()
    const next = load(store, '/assets/main-B.js')
    next.fail()
    expect(next.reloads).toBe(1)
  })

  it('does not reload without storage to guard it', () => {
    const target = new EventTarget()
    let reloads = 0
    reloadOnStaleChunk({
      target,
      storage: () => {
        throw new Error('blocked')
      },
      reload: () => reloads++,
      build: '/assets/main-A.js',
    })
    target.dispatchEvent(new Event('vite:preloadError'))
    expect(reloads).toBe(0)
  })

  it('leaves the event uncancelled, so the failure still reaches the boundary', () => {
    const target = new EventTarget()
    reloadOnStaleChunk({ target, storage: memoryStorage, reload: () => {}, build: 'x' })
    const event = new Event('vite:preloadError', { cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
