import { describe, expect, it } from 'vitest'
import { FALLBACK_FORECAST_MODEL, modelForecastHours, parseCapabilities } from './useCapabilities'
// `?raw` gives us each file's text without executing it, the same drift-guard
// idiom metrics.test.ts uses. These assert a cap has one source rather than a
// copy per surface, which is what issue #152 was open about.
import appSource from '../App.tsx?raw'
import controlPanelSource from '../components/ControlPanel.tsx?raw'
import mapViewSource from '../components/MapView.tsx?raw'

describe('parseCapabilities', () => {
  const body = {
    limits: { max_destinations: 900, max_limit: 800, max_polygon_area_km2: 70_000 },
    // Deliberately NOT in reach order: the server ranks these for mountain
    // terrain, and a client that re-sorted would undo the ranking.
    forecast_models: [
      {
        id: 'gfs_seamless',
        label: 'NOAA GFS',
        summary: 'Sharp over North America at 3 km.',
        forecast_hours: 384,
        regional: false,
        default: true,
      },
      // No `summary`: a deployment on an older build publishes none, and the
      // row has to render as a plain name rather than as a gap.
      { id: 'gem_seamless', label: 'ECCC GEM', forecast_hours: 216, regional: false },
      { id: 'ecmwf_ifs025', label: 'ECMWF IFS', forecast_hours: 336, regional: false },
      { id: 'gfs_hrrr', label: 'NOAA HRRR', forecast_hours: 42, regional: true },
    ],
  }

  it('takes every ceiling the deployment publishes', () => {
    expect(parseCapabilities(body)).toEqual({
      maxDestinations: 900,
      maxLimit: 800,
      maxPolygonAreaKm2: 70_000,
      forecastModels: [
        {
          id: 'gfs_seamless',
          label: 'NOAA GFS',
          summary: 'Sharp over North America at 3 km.',
          forecastHours: 384,
          regional: false,
        },
        { id: 'gem_seamless', label: 'ECCC GEM', summary: '', forecastHours: 216, regional: false },
        { id: 'ecmwf_ifs025', label: 'ECMWF IFS', summary: '', forecastHours: 336, regional: false },
        { id: 'gfs_hrrr', label: 'NOAA HRRR', summary: '', forecastHours: 42, regional: true },
      ],
      defaultForecastModel: 'gfs_seamless',
    })
  })

  // The regression this pair caught while it was being written: the model
  // fields are spread over the parsed limits, so a body publishing ceilings but
  // no models must not have those ceilings replaced by compiled fallbacks.
  it('keeps the published ceilings when the deployment publishes no models', () => {
    const older = parseCapabilities({ limits: { max_limit: 800, max_destinations: 900 } })
    expect(older.maxLimit).toBe(800)
    expect(older.maxDestinations).toBe(900)
    expect(older.forecastModels).toEqual([FALLBACK_FORECAST_MODEL])
  })

  it('drops model entries missing the fields that make one usable', () => {
    const parsed = parseCapabilities({
      limits: {},
      forecast_models: [
        { id: 'good', forecast_hours: 100 },
        { id: 'no_hours' },
        { forecast_hours: 50 },
      ],
    })
    expect(parsed.forecastModels.map((m) => m.id)).toEqual(['good'])
    // No `default` flag anywhere still has to name one, or the panel would
    // land with nothing selected.
    expect(parsed.defaultForecastModel).toBe('good')
    // And a missing label reads as the id rather than as a gap.
    expect(parsed.forecastModels[0].label).toBe('good')
  })

  // An unknown model is an old link or a dropped model, and the calendar has to
  // pick some reach for it. The shortest on offer, not the longest: a day drawn
  // as available and returned empty is worse than one drawn as unavailable that
  // would have worked.
  // The server's ranking is not a sort on anything the client can see, so the
  // client must not impose one of its own.
  it('preserves the published order rather than re-sorting', () => {
    expect(parseCapabilities(body).forecastModels.map((m) => m.id)).toEqual([
      'gfs_seamless',
      'gem_seamless',
      'ecmwf_ifs025',
      'gfs_hrrr',
    ])
  })

  it('assumes the shortest reach for a model it does not recognize', () => {
    const models = parseCapabilities(body).forecastModels
    expect(modelForecastHours(models, 'ecmwf_ifs025')).toBe(336)
    expect(modelForecastHours(models, 'something_retired')).toBe(42)
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
