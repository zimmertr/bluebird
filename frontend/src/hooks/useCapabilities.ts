import { useEffect, useState } from 'react'
import { MAX_ANALYZE_DESTINATIONS } from '../utils/clientAnalyze'

// The live limits this deployment enforces, from GET /api/capabilities. The
// SPA reads its ceilings (analysis cap, results-knob maximum) from here so a
// server-side recalibration never needs a coordinated frontend release; the
// compiled constants are only the fallback for the moments before the fetch
// answers, or a deployment where it fails.
export interface Capabilities {
  maxDestinations: number
  maxLimit: number
}

const FALLBACK: Capabilities = {
  maxDestinations: MAX_ANALYZE_DESTINATIONS,
  maxLimit: MAX_ANALYZE_DESTINATIONS,
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.limits) return
        setCaps({
          maxDestinations: body.limits.max_destinations ?? FALLBACK.maxDestinations,
          maxLimit: body.limits.max_limit ?? FALLBACK.maxLimit,
        })
      })
      .catch(() => {
        // Metadata only: the fallback constants keep everything working.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return caps
}
