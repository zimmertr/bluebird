import { describe, expect, it } from 'vitest'
import { DEM_TILES, EOX_IMAGERY_TILES, USGS_IMAGERY_TILES } from './terrainSources'

// The three templates are the whole of what the browser asks these hosts for,
// and the CSP names each host (`security_headers.py`), so a change here is a
// change to what the page may fetch.
describe('the terrain and imagery tile templates', () => {
  it('names each template exactly', () => {
    expect(DEM_TILES).toBe('https://tiles.mapterhorn.com/{z}/{x}/{y}.webp')
    expect(USGS_IMAGERY_TILES).toBe(
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    )
    expect(EOX_IMAGERY_TILES).toBe(
      'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    )
  })

  // Both imagery services address a tile by row before column. Swapped, a
  // template draws some other tile rather than failing, so the order is held
  // here rather than trusted to be seen.
  it('puts the row before the column for both imagery sources, and not for the elevation', () => {
    for (const template of [USGS_IMAGERY_TILES, EOX_IMAGERY_TILES]) {
      expect(template.indexOf('{y}')).toBeGreaterThan(template.indexOf('{z}'))
      expect(template.indexOf('{y}')).toBeLessThan(template.indexOf('{x}'))
    }
    expect(DEM_TILES.indexOf('{x}')).toBeLessThan(DEM_TILES.indexOf('{y}'))
  })
})
