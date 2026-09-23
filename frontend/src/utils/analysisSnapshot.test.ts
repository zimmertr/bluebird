import { describe, expect, it } from 'vitest'
import type { AnalyzeRequest } from '../types'
import { analyzedView, requestsCloud, type RecordedFacts } from './analysisSnapshot'
import { constraintsFromRequest } from './clientAnalyze'
import { FALLBACK_WINDOW_LIMITS, windowSource } from './forecastWindow'
import { discoveryKeys } from './present'
import { geoKey } from './points'

const REQUEST: AnalyzeRequest = {
  polygon: { type: 'Polygon', coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] },
  destination_types: ['peak'],
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  forecast_model: 'gfs_seamless',
  limit: 25,
  custom_destinations: [{ name: 'Probe', latitude: 47.1, longitude: -121.2 }],
}
const FACTS: RecordedFacts = {
  discovery: discoveryKeys(REQUEST.polygon, REQUEST.destination_types, false),
  compareModels: ['icon_seamless'],
  snowAnalysisDate: '2026-07-20',
}
const NOW = Date.parse('2026-07-20T12:00:00Z')

describe('analyzedView', () => {
  const view = analyzedView(REQUEST, 'days', FACTS, NOW, FALLBACK_WINDOW_LIMITS)

  it('records the ranking the request asked for, defaulting like the server', () => {
    expect(view).toMatchObject({ sortBy: 'precip_total_in', sortDesc: false, limit: 25, kind: 'days' })
    expect(view.constraints).toEqual(constraintsFromRequest(REQUEST))
  })

  it('records the window, classified once at the moment given', () => {
    const startMs = Date.parse(REQUEST.start_datetime)
    const endMs = Date.parse(REQUEST.end_datetime)
    expect(view.window).toEqual({ startMs, endMs })
    expect(view.windowSource).toBe(windowSource(startMs, endMs, NOW, FALLBACK_WINDOW_LIMITS))
  })

  it('records the custom destinations the request covered, by coordinate', () => {
    expect([...view.customKeys]).toEqual([geoKey(47.1, -121.2)])
  })

  it('records the facts the request cannot say', () => {
    expect(view).toMatchObject({
      forecastModel: 'gfs_seamless',
      polygonKey: FACTS.discovery.polygonKey,
      typesKey: FACTS.discovery.typesKey,
      compareModels: ['icon_seamless'],
      snowAnalysisDate: '2026-07-20',
    })
  })

  it('takes an explicit discovery over what the request says', () => {
    // The weather-only refresh rides a custom-shaped request with no polygon.
    const refresh: AnalyzeRequest = { ...REQUEST, polygon: undefined, destination_types: [] }
    const out = analyzedView(refresh, 'days', FACTS, NOW, FALLBACK_WINDOW_LIMITS)
    expect(out.polygonKey).toBe(FACTS.discovery.polygonKey)
    expect(out.polygonKey).not.toBe(discoveryKeys(null, [], false).polygonKey)
  })
})

describe('requestsCloud', () => {
  it('fetches the cloud column only when the ranking or a bound names it', () => {
    expect(requestsCloud(REQUEST)).toBe(false)
    expect(requestsCloud({ ...REQUEST, sort_by: 'cloud_base_min_ft' })).toBe(true)
    expect(requestsCloud({ ...REQUEST, max_cloud_cover_pct: 50 })).toBe(true)
  })

  it('is what the snapshot records', () => {
    const cloudy = { ...REQUEST, sort_by: 'cloud_cover_avg_pct' as const }
    expect(analyzedView(cloudy, 'days', FACTS, NOW, FALLBACK_WINDOW_LIMITS).cloudFetched).toBe(true)
  })
})
