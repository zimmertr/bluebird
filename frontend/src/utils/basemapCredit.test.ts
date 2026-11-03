import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAP_CREDIT, BASEMAP_STYLE_OPTIONS, creditBasemap } from './basemapCredit'
import { markupText } from '../testSupport/markupText'

// OpenFreeMap's own string, as its Liberty style declares it (read 2026-11-03).
const OPENFREEMAP =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

const style = (attribution?: string): StyleSpecification => ({
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', ...(attribution ? { attribution } : {}) },
    ours: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: 'Ours' },
  },
  layers: [{ id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' }],
})

describe('creditBasemap', () => {
  // Each credit in the words its licence asks for, parted the way the control
  // parts sources, so the line reads as one list (TJ, 2026-11-03).
  it("says the basemap's three credits, parted by pipes, with the marks each asks for", () => {
    expect(markupText(BASEMAP_CREDIT)).toBe('OpenFreeMap | © OpenMapTiles | © OpenStreetMap contributors')
    for (const href of ['https://openfreemap.org', 'https://www.openmaptiles.org/', 'https://www.openstreetmap.org/copyright']) {
      expect(BASEMAP_CREDIT).toContain(`href="${href}" target="_blank" rel="noopener noreferrer"`)
    }
  })

  it("replaces the OpenFreeMap source's attribution and nothing else", () => {
    const next = style(OPENFREEMAP)
    const credited = creditBasemap(undefined, next)
    expect(credited.sources.openmaptiles).toEqual({ ...next.sources.openmaptiles, attribution: BASEMAP_CREDIT })
    expect(credited.sources.ours).toBe(next.sources.ours)
    expect(credited.layers).toBe(next.layers)
    expect(next.sources.openmaptiles).toHaveProperty('attribution', OPENFREEMAP)
  })

  it('leaves a style with no OpenFreeMap source as it was', () => {
    const next = style()
    expect(creditBasemap(undefined, next)).toBe(next)
    expect(creditBasemap(style(OPENFREEMAP), next)).toBe(next)
  })

  it('is what every load of the style passes', () => {
    expect(BASEMAP_STYLE_OPTIONS).toEqual({ transformStyle: creditBasemap })
  })
})
