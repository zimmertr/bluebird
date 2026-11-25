// Bluebird Forecast's service worker (record 0349): the page a returning
// visitor already loaded, kept so it still opens while the pod or the tunnel
// in front of it is down. A plain script in `public/` rather than a module
// the bundle builds, because it must sit at the site's root to control it and
// its own bytes are what the browser compares to decide it changed.
//
// It answers two things and nothing else. The page itself (a navigation to
// `/`) is asked of the network first, every time, so a release is seen on the
// next load as before; only when the network has no answer, or the edge
// answers for a pod it cannot reach, is the copy from the last load served.
// The build's hashed assets are kept as they are fetched, because a name
// under `/assets/` never changes meaning. Every other request, the API and
// every third-party host included, goes past it untouched.
//
// Registered only while `/api/config` says `service_worker` (the off switch,
// `SERVICE_WORKER` on the pod), and removed on the next load once it says not.

const CACHE = 'bluebird-forecast-page-v1'
const PAGE = '/'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate' && url.pathname === PAGE) event.respondWith(page(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request))
})

async function page(request) {
  const cache = await caches.open(CACHE)
  let response
  try {
    response = await fetch(request)
  } catch (error) {
    const held = await cache.match(PAGE)
    if (held) return held
    throw error
  }
  if (response.ok) {
    await keep(cache, response.clone())
    return response
  }
  // A 5xx is the pod or the edge in front of it, which the copy outlives; a
  // 4xx is an answer about the request, which it does not.
  if (response.status >= 500) return (await cache.match(PAGE)) ?? response
  return response
}

// The new page, and only the assets it names: an older release's chunks are
// dropped as the page that named them is replaced, so the cache holds one
// release rather than every one since the first visit. A chunk the page loads
// later is fetched and kept again when it is asked for.
async function keep(cache, response) {
  const html = await response.clone().text()
  const named = new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])
  for (const key of await cache.keys()) {
    const path = new URL(key.url).pathname
    if (path.startsWith('/assets/') && !named.has(path)) await cache.delete(key)
  }
  await cache.put(PAGE, response)
}

async function asset(request) {
  const cache = await caches.open(CACHE)
  const held = await cache.match(request)
  if (held) return held
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}
