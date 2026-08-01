import { describe, expect, it } from 'vitest'
import { POI_ACTION_ATTR, poiPopupHtml } from './poiPopup'

const RAINIER = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }

describe('poiPopupHtml', () => {
  it('names the feature, its kind, and its elevation', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toContain('Mount Rainier')
    expect(html).toContain('volcano')
    expect(html).toContain('14,410 ft')
  })

  it('offers the way in, then the way back out', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain(`${POI_ACTION_ATTR}="add"`)
    expect(poiPopupHtml(RAINIER, false)).not.toContain(`${POI_ACTION_ATTR}="remove"`)
    expect(poiPopupHtml(RAINIER, true)).toContain(`${POI_ACTION_ATTR}="remove"`)
    expect(poiPopupHtml(RAINIER, true)).not.toContain(`${POI_ACTION_ATTR}="add"`)
  })

  // Most lakes and many summits carry no `ele` tag; the line goes away rather
  // than printing a dash, because nothing was measured and failed.
  it('drops the elevation line when the tile carries none', () => {
    expect(poiPopupHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)).not.toContain(
      'Elevation',
    )
  })

  // OSM names are third-party text reaching setHTML, same as the NIFC incident
  // names the wildfire popup escapes.
  it('escapes the name and kind', () => {
    const html = poiPopupHtml(
      { name: '<img src=x onerror=alert(1)>', kind: '"peak"', lat: 0, lon: 0 },
      false,
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&quot;peak&quot;')
  })
})
