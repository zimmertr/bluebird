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
  maxPolygonAreaKm2: number
}

// Fallback for the polygon-area gate. Lives here rather than beside the map
// because nothing computes with it: it is only ever the stand-in until
// /api/capabilities answers with what this deployment actually enforces. It
// used to be a hand-synced mirror of MAX_POLYGON_AREA_KM2 in
// backend/app/models.py, which is the duplication issue #152 set out to end.
// Sized to where Cascades-density terrain starts timing Overpass out
// (measured: ~103k km2 answered in ~26s, ~151k km2 drew a 504).
const FALLBACK_POLYGON_AREA_KM2 = 100_000

const FALLBACK: Capabilities = {
  maxDestinations: MAX_ANALYZE_DESTINATIONS,
  maxLimit: MAX_ANALYZE_DESTINATIONS,
  maxPolygonAreaKm2: FALLBACK_POLYGON_AREA_KM2,
}

/**
 * Map a /api/capabilities body onto the ceilings the SPA enforces, falling back
 * per field. Split out of the hook so the fallback behavior is testable without
 * a DOM: a deployment running an older build publishes a subset of these keys,
 * and a missing key must leave that ceiling alone rather than land as undefined
 * in a Math.min.
 */
export function parseCapabilities(body: unknown): Capabilities {
  const limits = (body as { limits?: Record<string, unknown> } | null)?.limits
  if (!limits) return FALLBACK
  const num = (key: string, fallback: number): number =>
    typeof limits[key] === 'number' ? (limits[key] as number) : fallback
  return {
    maxDestinations: num('max_destinations', FALLBACK.maxDestinations),
    maxLimit: num('max_limit', FALLBACK.maxLimit),
    maxPolygonAreaKm2: num('max_polygon_area_km2', FALLBACK.maxPolygonAreaKm2),
  }
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.limits) return
        setCaps(parseCapabilities(body))
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
