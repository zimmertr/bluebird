import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA, MAX_PITCH, decodeView, encodeView, initialCamera, isReaderMove } from './mapView'

const FLAT = { bearing: 0, pitch: 0 }

describe('the camera in a link', () => {
  it('writes four decimals of position and two of zoom, without padding', () => {
    expect(encodeView({ ...FLAT, lng: -121.612345, lat: 47.1, zoom: 9.456 })).toBe('-121.6123,47.1,9.46')
    expect(encodeView({ ...FLAT, lng: -120.5, lat: 47.5, zoom: 7 })).toBe('-120.5,47.5,7')
  })

  it('reads back what it writes', () => {
    expect(decodeView('-121.6123,47.1,9.46')).toEqual({ ...FLAT, lng: -121.6123, lat: 47.1, zoom: 9.46 })
  })

  // The angle (#864): the bearing and the pitch in whole degrees after the
  // zoom, both or neither, so the fourth field is always the bearing.
  it('writes the bearing and the pitch only when the map is turned or tilted', () => {
    const at = { lng: -121.72, lat: 48.8, zoom: 10.5 }
    expect(encodeView({ ...at, bearing: 0, pitch: 0 })).toBe('-121.72,48.8,10.5')
    expect(encodeView({ ...at, bearing: 0, pitch: 45 })).toBe('-121.72,48.8,10.5,0,45')
    expect(encodeView({ ...at, bearing: -32.4, pitch: 0 })).toBe('-121.72,48.8,10.5,-32,0')
    expect(encodeView({ ...at, bearing: 151.6, pitch: 44.5 })).toBe('-121.72,48.8,10.5,152,45')
  })

  // A turn or a tilt under half a degree is a flat, north-up map, and a
  // bearing a hair west of north rounds to a zero that must not read `-0`.
  it('writes three fields for an angle that rounds to none', () => {
    expect(encodeView({ lng: -121.72, lat: 48.8, zoom: 10.5, bearing: -0.3, pitch: 0.4 })).toBe('-121.72,48.8,10.5')
    expect(encodeView({ lng: -121.72, lat: 48.8, zoom: 10.5, bearing: -0.3, pitch: 12 })).toBe('-121.72,48.8,10.5,0,12')
  })

  it('reads the angle back, and three fields as north-up and flat', () => {
    expect(decodeView('-121.72,48.8,10.5,-32,45')).toEqual({ lng: -121.72, lat: 48.8, zoom: 10.5, bearing: -32, pitch: 45 })
    expect(decodeView('-121.72,48.8,10.5,180,60')).toEqual({ lng: -121.72, lat: 48.8, zoom: 10.5, bearing: 180, pitch: 60 })
    expect(decodeView('-121.72,48.8,10.5')).toEqual({ lng: -121.72, lat: 48.8, zoom: 10.5, bearing: 0, pitch: 0 })
  })

  it.each([
    '',
    '1,2',
    '1,2,3,4',
    '1,2,3,4,5,6',
    'a,2,3',
    '1,,3',
    '181,2,3',
    '1,86,3',
    '1,2,-1',
    '1,2,23',
    'Infinity,2,3',
    // A bearing past a half turn, and a pitch the map cannot take.
    '1,2,3,181,0',
    '1,2,3,-181,0',
    '1,2,3,0,61',
    '1,2,3,0,-1',
    '1,2,3,north,45',
    '1,2,3,,45',
  ])('drops %j rather than guessing', (raw) => {
    expect(decodeView(raw)).toBeNull()
  })

  // The map is built with the same ceiling a link's pitch is held to.
  it('holds a pitch to the map\'s own steepest tilt', () => {
    expect(MAX_PITCH).toBe(60)
    expect(decodeView(`1,2,3,0,${MAX_PITCH}`)).not.toBeNull()
  })
})

describe('the opening camera', () => {
  // A link's camera wins over every fit the app would make on load.
  it('is the link\'s own camera when it names one, else the default', () => {
    const view = { lng: -121, lat: 48, zoom: 11, bearing: 20, pitch: 30 }
    expect(initialCamera(view)).toBe(view)
    expect(initialCamera(null)).toBe(DEFAULT_CAMERA)
  })
})

describe('a reader move', () => {
  it('is one MapLibre hands a DOM event, or the geolocate button\'s move', () => {
    expect(isReaderMove({ originalEvent: { type: 'wheel' } })).toBe(true)
    expect(isReaderMove({ geolocateSource: true })).toBe(true)
  })

  // The opening fit, a search, and a click on a rank carry neither.
  it('is not the app\'s own camera call', () => {
    expect(isReaderMove({})).toBe(false)
    expect(isReaderMove({ originalEvent: undefined, geolocateSource: false })).toBe(false)
  })
})
