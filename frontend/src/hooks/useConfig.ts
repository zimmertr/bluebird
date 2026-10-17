import { useEffect, useMemo, useState } from 'react'
import type { ConfigResponse, PreviewInfo } from '../types'
import { apiJson } from '../utils/apiFetch'
import { setUpstreams } from '../utils/upstreams'

const HIDDEN: PreviewInfo = { enabled: false, pr: null, commit: null }

export interface LiveConfig {
  preview: PreviewInfo
  /**
   * True once `/api/config` has answered or failed, and never false again.
   * Until then the upstream addresses are the production hosts, so whatever
   * builds a URL once and keeps it (the map's style, a link's run on open)
   * waits for it.
   */
  settled: boolean
}

// The deployment's runtime settings, fetched once at mount. Runtime rather
// than baked in, because the SPA is built once and then deployed to many
// environments: the preview banner differs per environment, and the upstream
// hosts differ between production and a stack on the supplier simulator (#224).
export function useConfig(): LiveConfig {
  const [preview, setPreview] = useState<PreviewInfo>(HIDDEN)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiJson<Partial<ConfigResponse>>('/api/config', { signal: controller.signal })
      .then((data) => {
        // Before the flag rises, so nothing that waits for it reads the
        // production hosts in the render that says they are settled.
        setUpstreams(data?.upstreams)
        if (data?.preview) setPreview(data.preview)
        setSettled(true)
      })
      .catch(() => {
        // The production hosts are a working answer, so a failure settles
        // too. An abort does not: the component is gone.
        if (!controller.signal.aborted) setSettled(true)
      })
    return () => controller.abort()
  }, [])

  return useMemo(() => ({ preview, settled }), [preview, settled])
}
