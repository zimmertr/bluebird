import { describe, expect, it } from 'vitest'
import { CALTOPO_ZOOM_OFFSET, caltopoUrl, caltopoZoom } from './caltopoUrl'

describe('caltopoUrl', () => {
  it('centres CalTopo on the point, latitude first, at five decimals', () => {
    expect(caltopoUrl(46.851731, -121.760395, 13)).toBe(
      'https://caltopo.com/map.html#ll=46.85173,-121.76040&z=14',
    )
  })

  // The bare centring URL: no base layer, no overlay, nothing the reader's own
  // CalTopo settings would not choose (TJ, 2026-10-14).
  it('names no layer', () => {
    expect(caltopoUrl(47.5, -121.25, 13)).not.toMatch(/[&#](b|o|n)=/)
  })

  it('carries no zoom when the map has none', () => {
    expect(caltopoUrl(47.5, -121.25)).toBe('https://caltopo.com/map.html#ll=47.50000,-121.25000')
  })

  // Measured 2026-10-14: CalTopo's Z14 is MapLibre's zoom 13, because one
  // counts on 256px tiles and the other on 512px ones.
  it('lands one level above the map, on whole levels', () => {
    expect(CALTOPO_ZOOM_OFFSET).toBe(1)
    expect(caltopoZoom(13)).toBe(14)
    expect(caltopoZoom(12.6)).toBe(14)
    expect(caltopoZoom(12.4)).toBe(13)
  })
})
