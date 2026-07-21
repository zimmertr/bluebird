import { describe, it, expect } from 'vitest'
import {
  wildfireQueryUrl,
  formatAcres,
  formatContainment,
  formatUpdated,
  wildfirePopupHtml,
  nifcFireUrl,
} from './wildfires'

// A representative fire-scoped NIFC link, reused by the popup tests.
const NIFC = nifcFireUrl(-121.5, 39.5, 11)

describe('wildfireQueryUrl', () => {
  it('targets the NIFC WFIGS current-perimeters layer as geojson', () => {
    const url = wildfireQueryUrl([-125, 31, -102, 49])
    expect(url).toContain('WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query')
    expect(url).toContain('f=geojson')
  })

  it('encodes the viewport as an intersecting envelope in EPSG:4326', () => {
    const url = new URL(wildfireQueryUrl([-125, 31, -102, 49]))
    expect(url.searchParams.get('geometry')).toBe('-125,31,-102,49')
    expect(url.searchParams.get('geometryType')).toBe('esriGeometryEnvelope')
    expect(url.searchParams.get('inSR')).toBe('4326')
    expect(url.searchParams.get('spatialRel')).toBe('esriSpatialRelIntersects')
  })

  it('filters to wildfires, excluding prescribed burns', () => {
    const url = new URL(wildfireQueryUrl([-125, 31, -102, 49]))
    expect(url.searchParams.get('where')).toBe("attr_IncidentTypeCategory='WF'")
  })

  it('adds maxAllowableOffset only when a positive tolerance is given', () => {
    expect(new URL(wildfireQueryUrl([0, 0, 1, 1], 0.01)).searchParams.get('maxAllowableOffset')).toBe(
      '0.01',
    )
    expect(new URL(wildfireQueryUrl([0, 0, 1, 1])).searchParams.has('maxAllowableOffset')).toBe(false)
    expect(new URL(wildfireQueryUrl([0, 0, 1, 1], 0)).searchParams.has('maxAllowableOffset')).toBe(
      false,
    )
  })
})

describe('formatAcres', () => {
  it('rounds and thousands-separates a known size', () => {
    expect(formatAcres(4727.66)).toBe('4,728 acres')
  })
  it('collapses sub-acre fires', () => {
    expect(formatAcres(0.4)).toBe('<1 acre')
  })
  it('handles missing sizes', () => {
    expect(formatAcres(null)).toBe('Size not reported')
    expect(formatAcres(undefined)).toBe('Size not reported')
  })
})

describe('formatContainment', () => {
  it('rounds a reported percentage', () => {
    expect(formatContainment(55.4)).toBe('55% contained')
    expect(formatContainment(0)).toBe('0% contained')
    expect(formatContainment(100)).toBe('100% contained')
  })
  it('handles an unreported percentage', () => {
    expect(formatContainment(null)).toBe('Containment not reported')
  })
})

describe('formatUpdated', () => {
  it('omits the line when no timestamp is present', () => {
    expect(formatUpdated(null)).toBeNull()
    expect(formatUpdated(undefined)).toBeNull()
  })
  it('produces an "Updated …" line for a real timestamp', () => {
    // Avoid asserting a locale/timezone-specific rendering — just the prefix.
    expect(formatUpdated(Date.UTC(2026, 6, 20))).toMatch(/^Updated /)
  })
})

describe('nifcFireUrl', () => {
  it('deep-links the NIFC explore map to the fire, as lat,lon,zoom', () => {
    const url = nifcFireUrl(-121.5, 39.5, 11.42)
    expect(url).toContain('data-nifc.opendata.arcgis.com')
    expect(url).toContain('/explore?location=')
    expect(url).toContain('location=39.50000,-121.50000,11.42')
  })
})

describe('wildfirePopupHtml', () => {
  it('coalesces the incident name and falls back when absent', () => {
    expect(wildfirePopupHtml({ attr_IncidentName: 'P-L Gulch' }, NIFC)).toContain('P-L Gulch')
    expect(wildfirePopupHtml({ poly_IncidentName: 'Beehive' }, NIFC)).toContain('Beehive')
    expect(wildfirePopupHtml({}, NIFC)).toContain('Unnamed fire')
  })

  it('escapes HTML in third-party incident names', () => {
    const html = wildfirePopupHtml({ attr_IncidentName: '<img src=x>' }, NIFC)
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;img src=x&gt;')
  })

  it('renders size and containment together', () => {
    const html = wildfirePopupHtml({ poly_GISAcres: 5649, attr_PercentContained: 0 }, NIFC)
    expect(html).toContain('5,649 acres')
    expect(html).toContain('0% contained')
  })

  it('links to the fire-scoped NIFC map', () => {
    const html = wildfirePopupHtml({ attr_IncidentName: 'Beehive' }, NIFC)
    expect(html).toContain(`href="${NIFC}"`)
    expect(html).toContain('target="_blank"')
  })
})
