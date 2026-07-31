import { describe, expect, it } from 'vitest'
import { parseCapabilities } from './useCapabilities'
// `?raw` gives us each file's text without executing it, the same drift-guard
// idiom metrics.test.ts uses. These assert a cap has one source rather than a
// copy per surface, which is what issue #152 was open about.
import appSource from '../App.tsx?raw'
import controlPanelSource from '../components/ControlPanel.tsx?raw'
import mapViewSource from '../components/MapView.tsx?raw'

describe('parseCapabilities', () => {
  const body = {
    limits: { max_destinations: 900, max_limit: 800, max_polygon_area_km2: 70_000 },
  }

  it('takes every ceiling the deployment publishes', () => {
    expect(parseCapabilities(body)).toEqual({
      maxDestinations: 900,
      maxLimit: 800,
      maxPolygonAreaKm2: 70_000,
    })
  })

  it('falls back per field, so an older deployment keeps the rest', () => {
    const partial = parseCapabilities({ limits: { max_limit: 800 } })
    expect(partial.maxLimit).toBe(800)
    // Not undefined: these feed Math.min and a polygon comparison.
    expect(partial.maxDestinations).toBeGreaterThan(0)
    expect(partial.maxPolygonAreaKm2).toBeGreaterThan(0)
  })

  it('falls back whole when the body is missing, empty, or the wrong shape', () => {
    const fallback = parseCapabilities(null)
    expect(fallback.maxPolygonAreaKm2).toBeGreaterThan(0)
    expect(parseCapabilities({})).toEqual(fallback)
    expect(parseCapabilities({ limits: {} })).toEqual(fallback)
    expect(parseCapabilities({ limits: { max_limit: 'lots' } })).toEqual(fallback)
  })
})

describe('the polygon-area cap has one source', () => {
  const surfaces = [
    ['App.tsx', appSource],
    ['ControlPanel.tsx', controlPanelSource],
    ['MapView.tsx', mapViewSource],
  ] as const

  it('is not spelled out in any surface that gates on it', () => {
    for (const [name, source] of surfaces) {
      expect(source, `${name} must read the cap from /api/capabilities`).not.toMatch(
        /100[_,]?000/,
      )
    }
  })

  it('reaches the panel as a prop rather than an import from the map', () => {
    expect(controlPanelSource).toMatch(/maxAreaKm2: number/)
    for (const [name, source] of surfaces) {
      expect(source, `${name} must not resurrect the mirrored constant`).not.toContain(
        'MAX_AREA_KM2',
      )
    }
  })
})
