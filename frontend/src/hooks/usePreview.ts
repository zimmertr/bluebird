import { useEffect, useState } from 'react'

export type PreviewInfo = {
  enabled: boolean
  pr: string | null
  commit: string | null
}

const HIDDEN: PreviewInfo = { enabled: false, pr: null, commit: null }

// Preview metadata is a runtime concern (the SPA is built once, then deployed to
// many environments), so we fetch it from the backend rather than baking it in.
export function usePreview(): PreviewInfo {
  const [preview, setPreview] = useState<PreviewInfo>(HIDDEN)

  useEffect(() => {
    let cancelled = false
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.preview) setPreview(data.preview)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return preview
}
