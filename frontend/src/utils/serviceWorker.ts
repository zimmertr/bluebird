// The off switch for the page's service worker (record 0349, `public/sw.js`).
// `/api/config` says whether this deployment wants one; with it on the worker
// is registered, and with it off every registration this site holds is
// removed, so turning `SERVICE_WORKER` off on the pod takes the worker out of
// every browser that loads the page while the pod answers. A config that does
// not answer changes nothing: that is exactly the visit the worker is for.

import { apiJson } from './apiFetch'

export const WORKER_URL = '/sw.js'

/** Register the worker, or remove every one this site holds. */
export async function syncServiceWorker(
  enabled: boolean,
  container: ServiceWorkerContainer | undefined = globalThis.navigator?.serviceWorker,
): Promise<void> {
  if (!container) return
  try {
    if (enabled) {
      await container.register(WORKER_URL)
      return
    }
    for (const registration of await container.getRegistrations()) await registration.unregister()
  } catch {
    // A browser that refuses a worker (a private window, a policy) loads the
    // page as it always has.
  }
}

/** Read the switch from `/api/config` and apply it. */
export async function applyServiceWorkerSwitch(
  read: () => Promise<{ service_worker?: unknown }> = () => apiJson('/api/config'),
  container?: ServiceWorkerContainer,
): Promise<void> {
  let enabled: boolean
  try {
    enabled = (await read()).service_worker === true
  } catch {
    return
  }
  await syncServiceWorker(enabled, container)
}
