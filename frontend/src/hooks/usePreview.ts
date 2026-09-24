import { useEffect, useState } from 'react'
import { apiJson } from '../utils/apiFetch'

export type PreviewInfo = {
  enabled: boolean
  pr: string | null
  commit: string | null
}

const HIDDEN: PreviewInfo = { enabled: false, pr: null, commit: null }

// Preview metadata is a runtime concern (the SPA is built once, then deployed to
// many environments), so we fetch it from the backend rather than baking it in.
// `enabled` is false for the tutorial's copy of the app (#536): the banner is
// the reader's, already on screen under it.
export function usePreview(enabled = true): PreviewInfo {
  const [preview, setPreview] = useState<PreviewInfo>(HIDDEN)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    apiJson<{ preview?: PreviewInfo }>('/api/config')
      .then((data) => {
        if (!cancelled && data?.preview) setPreview(data.preview)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])

  return preview
}
