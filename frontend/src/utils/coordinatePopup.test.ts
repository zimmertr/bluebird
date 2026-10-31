import { describe, expect, it } from 'vitest'
import { caltopoUrl } from './caltopoUrl'
import { coordinatePlace, coordinatePopupHtml, isCoordinatePlace } from './coordinatePopup'
import { colorSwatch, escapeHtml, pendingValue, popupButton } from './popup/popupChrome'
import { POI_ACTION_ATTR } from './poiPopup'
import { SLOPE_BANDS } from './slopeAngle'
import { FEET_PER_METER } from './basemapPoi'
import { markupText } from '../testSupport/markupText'

describe('coordinatePlace', () => {
  // The coordinate the reader saw on the card, to the metre, is the one the
  // destination carries into the table and the share link.
  it('rounds the point to the five decimals its title shows', () => {
    expect(coordinatePlace(48.790123456, -121.832114999)).toEqual({
      label: '48.79012, -121.83211',
      description: '',
      kind: 'coordinates',
      lat: 48.79012,
      lon: -121.83211,
    })
  })

  it('knows the destination it made again', () => {
    const place = coordinatePlace(48.790123456, -121.832114999)
    expect(isCoordinatePlace(place, coordinatePlace(48.790121, -121.832111))).toBe(true)
    expect(isCoordinatePlace(place, coordinatePlace(48.79013, -121.83211))).toBe(false)
  })
})

describe('coordinatePopupHtml', () => {
  const POINT = coordinatePlace(48.79012, -121.83211)

  // The title is the pair, and its glyph opens CalTopo there (TJ, 2026-10-30).
  it('titles the card with the coordinates and links them to CalTopo', () => {
    const html = coordinatePopupHtml(POINT, false, { mapZoom: 13 })
    expect(markupText(html)).toContain('48.79012, -121.83211')
    expect(html).toContain(`href="${escapeHtml(caltopoUrl(48.79012, -121.83211, 13))}"`)
    expect(html).toContain('aria-label="Open in CalTopo"')
  })

  it('offers to add the point, and once added to take it back out', () => {
    expect(coordinatePopupHtml(POINT, false)).toContain(popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis'))
    expect(coordinatePopupHtml(POINT, true)).toContain(
      popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis'),
    )
  })
})

// The ground under the title, layout 1 (TJ, 2026-10-30): `8,412 ft · [swatch] 38° NE`.
describe("the card's ground", () => {
  const POINT = coordinatePlace(48.79012, -121.83211)
  const read = (degrees: number, aspect: number | null) =>
    coordinatePopupHtml(POINT, false, {
      ground: { kind: 'read', reading: { elevationM: 8412 / FEET_PER_METER, degrees, aspect } },
    })

  it('says the height, the slope in its band and the way it faces', () => {
    const html = read(38.7, 40)
    expect(markupText(html)).toMatch(/8,412 ft\s*·\s*38° NE/)
    expect(html).toContain(colorSwatch(SLOPE_BANDS[3].color))
  })

  // Each band holds its lower edge, so the whole degree under the angle
  // names the band the swatch is drawn in, and below 27 there is none.
  it('draws no swatch below 27 degrees, and reads the degree under the angle', () => {
    expect(markupText(read(26.9, 225))).toContain('26° SW')
    expect(read(26.9, 225)).not.toContain(colorSwatch(SLOPE_BANDS[0].color))
    expect(read(27, 225)).toContain(colorSwatch(SLOPE_BANDS[0].color))
  })

  it('names no direction for ground with no fall', () => {
    expect(markupText(read(0, null))).toMatch(/8,412 ft\s*·\s*0°/)
    expect(markupText(read(0, null))).not.toMatch(/0° [NESW]/)
  })

  it('stands a bar while it reads, and says nothing where there is no ground', () => {
    expect(coordinatePopupHtml(POINT, false, { ground: { kind: 'pending' } })).toContain(pendingValue())
    expect(coordinatePopupHtml(POINT, false, { ground: { kind: 'none' } })).toBe(coordinatePopupHtml(POINT, false))
  })
})

// A point is forecast by adding it and pressing Analyze (TJ, 2026-10-31).
it('carries no forecast', () => {
  expect(coordinatePopupHtml(coordinatePlace(48.79012, -121.83211), false)).not.toContain('<table')
})
