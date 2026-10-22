import { describe, it, expect } from 'vitest'
import { destinationLinkLabel, destinationUrl } from './destinationUrl'
import outlines from './usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from './usStates'

const STATES = decodeUsStates(outlines as UsStateOutlines)

const blackPeak = {
  name: 'Black Peak',
  type: 'peak',
  latitude: 48.5257,
  longitude: -120.7568,
  osm_id: 'node/358963047',
}

describe('destinationUrl', () => {
  it('links peaks to a Peakbagger radius search at the coordinates, even with an osm_id', () => {
    expect(destinationUrl(blackPeak)).toBe(
      'https://www.peakbagger.com/search.aspx?tid=R&lat=48.52570&lon=-120.75680'
    )
  })

  it('links other OSM-sourced types to their exact OSM object', () => {
    expect(
      destinationUrl({
        name: 'Paradise',
        type: 'trailhead',
        latitude: 46.786,
        longitude: -121.735,
        osm_id: 'node/4744885856',
      })
    ).toBe('https://www.openstreetmap.org/node/4744885856')
    expect(
      destinationUrl({
        name: 'Lake Constance',
        type: 'lake',
        latitude: 47.601,
        longitude: -123.246,
        osm_id: 'way/33104903',
      })
    ).toBe('https://www.openstreetmap.org/way/33104903')
  })

  // A crag links by name even with an osm_id, and the name is escaped whole:
  // an unescaped ampersand would end the query at "Lower Town Wall ".
  it('links crags to a Mountain Project search by name', () => {
    expect(
      destinationUrl({
        name: 'Lower Town Wall',
        type: 'crag',
        latitude: 47.8216,
        longitude: -121.5532,
        osm_id: 'relation/123',
      })
    ).toBe('https://www.mountainproject.com/search?q=Lower%20Town%20Wall')
    expect(
      destinationUrl({ name: 'Castle & Rock', type: 'crag', latitude: 0, longitude: 0, osm_id: null })
    ).toBe('https://www.mountainproject.com/search?q=Castle%20%26%20Rock')
  })

  // `Family Wall` alone lists North Carolina's, California's and Colorado's
  // first; with the state, Little Si's is the one area it lists (2026-10-22).
  it("names a crag's state in the search once the outlines are held", () => {
    const familyWall = { name: 'Family Wall', type: 'crag', latitude: 47.48886, longitude: -121.75024, osm_id: 'way/1307110189' }
    expect(destinationUrl(familyWall, STATES)).toBe(
      'https://www.mountainproject.com/search?q=Family%20Wall%20Washington'
    )
    expect(destinationUrl(familyWall)).toBe('https://www.mountainproject.com/search?q=Family%20Wall')
  })

  it('searches by name alone for a crag outside the fifty states', () => {
    expect(
      destinationUrl({ name: 'The Chief', type: 'crag', latitude: 49.6817, longitude: -123.153, osm_id: null }, STATES)
    ).toBe('https://www.mountainproject.com/search?q=The%20Chief')
  })

  it('leaves every other type alone when the outlines are held', () => {
    expect(destinationUrl(blackPeak, STATES)).toBe(destinationUrl(blackPeak))
  })

  it('falls back to an OSM map pin for rows without an osm_id', () => {
    expect(
      destinationUrl({
        name: 'Mount Rainier',
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

// The card's glyph shows no site, so its name says which one it opens, by the
// rule `destinationUrl` picks it with (#738).
describe('destinationLinkLabel', () => {
  it('names the site destinationUrl opens for each type', () => {
    expect(destinationLinkLabel('peak')).toBe('View on Peakbagger')
    expect(destinationLinkLabel('crag')).toBe('View on Mountain Project')
    expect(destinationLinkLabel('lake')).toBe('View on OpenStreetMap')
    expect(destinationLinkLabel('custom')).toBe('View on OpenStreetMap')
  })
})
