import { describe, expect, it } from 'vitest'
import { POI_ACTION_ATTR, poiPopupHtml } from './poiPopup'
import { ELEVATION_COL } from './tableColumns'
import {
  FINE_COLOR,
  HEADER_BAND_COLOR,
  POPUP_BODY_ATTR,
  POPUP_MAX_WIDTH_PX,
  fineprint,
  popupButton,
  popupWidth,
} from './popupChrome'

const RAINIER = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }

describe('poiPopupHtml', () => {
  // The same card a ranked result wears (#712): the kind, the elevation and
  // the coordinates on one facts line under the name, the kind in the word the
  // Type column will use once the place is analyzed, so OSM's "volcano" reads
  // as the table's "Peak". Both cards describe the same mountain, so they say
  // its height one way: "14,410 ft" on the facts line, as a result card says
  // it, and never the "Elevation (ft): 14,410" row this card used to carry
  // under a rule.
  it('says what the feature is on the facts line, in the Type column\'s word', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toContain('Mount Rainier')
    expect(factsText(html)).toBe('Peak | 14,410 ft | 46.85290, -121.76040')
    expect(html).not.toContain('volcano')
    expect(html).not.toContain(ELEVATION_COL.label)
  })

  // The glyph shows no site, so its link's name says which (#738).
  it('names the link out for a screen reader by the site it opens', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain('aria-label="View on Peakbagger"')
    expect(poiPopupHtml({ ...RAINIER, kind: 'water' }, false)).toContain('aria-label="View on OpenStreetMap"')
  })

  // The add and remove buttons are popupChrome's one button recipe in two of
  // its three variants (#365). The button stands alone in the body under the
  // band, so it carries no gap of its own.
  it('dresses its buttons through popupButton', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain(
      popupButton(`${POI_ACTION_ATTR}="add"`, 'primary', 'Add to analysis'),
    )
    expect(poiPopupHtml(RAINIER, true)).toContain(
      popupButton(`${POI_ACTION_ATTR}="remove"`, 'secondary', 'Remove from analysis'),
    )
  })

  it('keeps one recipe across the three button variants', () => {
    const [primary, secondary, danger] = (['primary', 'secondary', 'danger'] as const).map((v) =>
      popupButton('data-x', v, 'Go'),
    )
    const look = (html: string) => html.replace(/background:[^;]+;color:[^;"]+/, '')
    expect(look(primary)).toBe(look(secondary))
    expect(look(primary)).toBe(look(danger))
    expect(primary).toContain('<button data-x style="')
    expect(popupButton('data-x', 'danger', 'Go', 'margin-top:6px')).toMatch(/;margin-top:6px">Go<\/button>$/)
  })

  it('sets fine print small, italic and stepped back', () => {
    expect(fineprint('Updated: today')).toBe(
      `<span style="color:${FINE_COLOR};font-size:11px;font-style:italic">Updated: today</span>`,
    )
  })

  // The result card's own dress (TJ, 2026-10-14): the header band in place of
  // a rule, the link out beside the name, and the facts on the band above the
  // body, which holds the button alone.
  it('wears the result card, band and all', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toContain(HEADER_BAND_COLOR)
    expect(html).not.toContain('<hr')
    expect(html).toContain('peakbagger.com')
    expect(html.indexOf('46.85290, -121.76040')).toBeLessThan(html.indexOf(POPUP_BODY_ATTR))
    expect(html.indexOf(POPUP_BODY_ATTR)).toBeLessThan(html.indexOf(`${POI_ACTION_ATTR}="add"`))
  })

  // A latitude and a longitude are one value in two halves; breaking between
  // them leaves a bare negative number looking like a third figure.
  it('keeps the coordinate pair on one line', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain('white-space:nowrap')
  })

  // The pair links to CalTopo at the map's view, as a ranked result's does
  // (#712); a card built with no map under it links without a zoom.
  it('links the coordinates to CalTopo', () => {
    expect(poiPopupHtml(RAINIER, false, 13)).toContain(
      'href="https://caltopo.com/map.html#ll=46.85290,-121.76040&amp;z=14"',
    )
    expect(poiPopupHtml(RAINIER, false)).toContain('href="https://caltopo.com/map.html#ll=46.85290,-121.76040"')
  })

  it('links a lake to OpenStreetMap rather than Peakbagger', () => {
    const html = poiPopupHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)
    expect(html).toContain('openstreetmap.org')
    expect(html).not.toContain('peakbagger.com')
  })

  // A trailhead from the pod's landmarks brings its OSM id, so it links to
  // that object; a crag goes to Mountain Project by name, as its row does
  // (#734).
  it('links a trailhead to its OSM object and a crag to Mountain Project', () => {
    const trailhead = poiPopupHtml(
      { name: 'Mailbox Peak Trailhead', kind: 'trailhead', lat: 47.4875, lon: -121.7437, osmId: 'node/4578891234' },
      false,
    )
    expect(trailhead).toContain('href="https://www.openstreetmap.org/node/4578891234"')
    expect(factsText(trailhead)).toBe('Trailhead | 47.48750, -121.74370')
    const crag = poiPopupHtml(
      { name: 'Lower Town Wall', kind: 'crag', lat: 47.8208, lon: -121.5555, osmId: 'relation/1234' },
      false,
    )
    expect(crag).toContain('https://www.mountainproject.com/search?q=Lower%20Town%20Wall')
    expect(crag).toContain('aria-label="View on Mountain Project"')
    expect(factsText(crag)).toBe('Crag | 47.82080, -121.55550')
  })

  // A lone action sits centred in the body (TJ, 2026-10-14), not against the
  // card's left edge where the facts line's width left it hanging.
  it('centres the button in the body', () => {
    const html = poiPopupHtml(RAINIER, false)
    expect(html).toMatch(new RegExp(`<div style="text-align:center"><button ${POI_ACTION_ATTR}="add"`))
  })

  it('offers the way in, then the way back out', () => {
    expect(poiPopupHtml(RAINIER, false)).toContain(`${POI_ACTION_ATTR}="add"`)
    expect(poiPopupHtml(RAINIER, false)).not.toContain(`${POI_ACTION_ATTR}="remove"`)
    expect(poiPopupHtml(RAINIER, true)).toContain(`${POI_ACTION_ATTR}="remove"`)
    expect(poiPopupHtml(RAINIER, true)).not.toContain(`${POI_ACTION_ATTR}="add"`)
  })

  // Most lakes and many summits carry no `ele` tag; the fact goes away rather
  // than printing a dash, because nothing was measured and failed.
  it('drops the elevation from the facts line when the tile carries none', () => {
    const html = poiPopupHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)
    expect(factsText(html)).toBe('Lake | 47.40000, -121.40000')
    expect(html).not.toContain('Elevation')
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

/**
 * The facts line's text as a reader sees it, each hidden pipe spaced the way
 * the eye reads it; the same reading `resultPopup.test.ts` makes of a result
 * card's line, so the two tests compare like with like.
 */
function factsText(html: string): string {
  const line = html.match(/<div style="white-space:nowrap">(.*?)<\/div>/)![1]
  return [...`>${line}<`.matchAll(/>([^<]*)</g)]
    .map((m) => (m[1] === '|' ? ' | ' : m[1]))
    .join('')
}

// A phone's map is the constraint, not the content: a 300px card on a 320px
// map is the whole map, and with the chart and table open the map can be a
// couple of hundred pixels tall.
describe('sizing a popup to the map it opens on', () => {
  it('takes the ceiling on a desktop-sized canvas', () => {
    expect(popupWidth(1200)).toBe(`${POPUP_MAX_WIDTH_PX}px`)
  })

  // The bug this exists for: subtracting a fixed margin from a phone-width map
  // still left the ceiling winning, so the card was 88% of the map.
  it('leaves a real band of map either side on a phone', () => {
    const px = Number(popupWidth(320).replace('px', ''))
    expect(px).toBeLessThan(POPUP_MAX_WIDTH_PX)
    expect(320 - px).toBeGreaterThanOrEqual(48)
  })

  it('never collapses to unreadable, however narrow the canvas', () => {
    expect(Number(popupWidth(0).replace('px', ''))).toBeGreaterThanOrEqual(180)
  })
})
