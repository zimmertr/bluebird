import { describe, it, expect } from 'vitest'
import { destinationUrl } from './destinationUrl'

const blackPeak = {
  type: 'peak',
  latitude: 48.5257,
  longitude: -120.7568,
  osm_id: 'node/358963047',
}

describe('destinationUrl', () => {
  it('links peaks to a Peakbagger radius search at the coordinates', () => {
    expect(destinationUrl(blackPeak)).toBe(
      'https://www.peakbagger.com/search.aspx?tid=R&lat=48.52570&lon=-120.75680'
    )
  })

  it('links peaks by coordinates even when an osm_id is present', () => {
    expect(destinationUrl(blackPeak)).toContain('peakbagger.com')
  })

  it('links other OSM-sourced types to their exact OSM object', () => {
    expect(
      destinationUrl({
        type: 'trailhead',
        latitude: 46.786,
        longitude: -121.735,
        osm_id: 'node/4744885856',
      })
    ).toBe('https://www.openstreetmap.org/node/4744885856')
    expect(
      destinationUrl({
        type: 'lake',
        latitude: 47.601,
        longitude: -123.246,
        osm_id: 'way/33104903',
      })
    ).toBe('https://www.openstreetmap.org/way/33104903')
  })

  it('falls back to an OSM map pin for rows without an osm_id', () => {
    expect(
      destinationUrl({
        type: 'custom',
        latitude: 46.8523,
        longitude: -121.7603,
        osm_id: null,
      })
    ).toBe(
      'https://www.openstreetmap.org/?mlat=46.85230&mlon=-121.76030#map=13/46.85230/-121.76030'
    )
  })
})
