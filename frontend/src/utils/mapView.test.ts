import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA, decodeView, encodeView, initialCamera, isReaderMove } from './mapView'

describe('the camera in a link', () => {
  it('writes four decimals of position and two of zoom, without padding', () => {
    expect(encodeView({ lng: -121.612345, lat: 47.1, zoom: 9.456 })).toBe('-121.6123,47.1,9.46')
    expect(encodeView({ lng: -120.5, lat: 47.5, zoom: 7 })).toBe('-120.5,47.5,7')
  })

  it('reads back what it writes', () => {
    expect(decodeView('-121.6123,47.1,9.46')).toEqual({ lng: -121.6123, lat: 47.1, zoom: 9.46 })
  })

  it.each(['', '1,2', '1,2,3,4', 'a,2,3', '1,,3', '181,2,3', '1,86,3', '1,2,-1', '1,2,23', 'Infinity,2,3'])(
    'drops %j rather than guessing',
    (raw) => {
      expect(decodeView(raw)).toBeNull()
    },
  )
})

describe('the opening camera', () => {
  // A link's camera wins over every fit the app would make on load.
  it('is the link\'s own camera when it names one, else the default', () => {
    const view = { lng: -121, lat: 48, zoom: 11 }
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
