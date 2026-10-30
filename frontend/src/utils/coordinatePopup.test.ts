import { describe, expect, it } from 'vitest'
import { caltopoUrl } from './caltopoUrl'
import { coordinatePlace, coordinatePopupHtml, isCoordinatePlace } from './coordinatePopup'
import { escapeHtml, popupButton } from './popup/popupChrome'
import { POI_ACTION_ATTR } from './poiPopup'
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
    const html = coordinatePopupHtml(POINT, false, 13)
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
