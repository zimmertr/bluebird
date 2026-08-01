import { describe, expect, it } from 'vitest'
import { POI_ACTION_ATTR, poiPopupHtml } from './poiPopup'

const RAINIER = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }

describe('poiPopupHtml', () => {
  it('names the feature and its elevation', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toContain('Mount Rainier')
    expect(html).toContain('14,410 ft')
  })

  // The kind had a line of its own under the title, saying "Peak" beneath the
  // name of a peak — which the icon on the map has already said and the name
  // usually says again.
  it('does not restate the kind under the name', () => {
    expect(poiPopupHtml(RAINIER, false)).not.toContain('volcano')
  })

  // Same chrome as a ranked result, because they are one destination at two
  // stages: a rule under the title, a link out, and coordinates.
  it('wears the shared popup chrome', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toContain('<hr')
    expect(html).toContain('peakbagger.com')
    expect(html).toContain('46.85290, -121.76040')
  })

  // A latitude and a longitude are one value in two halves; breaking between
  // them leaves a bare negative number looking like a third figure.
  it('keeps the coordinate pair on one line', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain('white-space:nowrap')
  })

  it('links a lake to OpenStreetMap rather than Peakbagger', () => {
    const html = poiPopupHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)
    expect(html).toContain('openstreetmap.org')
    expect(html).not.toContain('peakbagger.com')
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
  it('escapes the name', () => {
    const html = poiPopupHtml(
      { name: '<img src=x onerror=alert(1)>', kind: 'peak', lat: 0, lon: 0 },
      false,
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
