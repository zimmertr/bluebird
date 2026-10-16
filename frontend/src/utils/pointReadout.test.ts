import { describe, expect, it } from 'vitest'
import { inBounds, pointCardHtml, type PointSection } from './pointReadout'
import { SECTION_EDGE, row } from './popupChrome'
import { markupText } from '../testSupport/markupText'

const rain: PointSection = {
  title: 'Moderate precipitation',
  source: 'NEXRAD radar, now',
  rows: [row('Reflectivity', '38.5 dBZ'), row('Rain rate', 'about 0.25 in/h')],
}
// The text a reader reads, a space between blocks: `markupText` joins
// adjacent block elements with nothing between them.
const text = (html: string) => markupText(html.split('</div>').join('</div> ')).replace(/\s+/g, ' ').trim()

const snow: PointSection = {
  title: '20 in of snow',
  source: 'NOAA snow analysis, 5:00 AM',
  rows: [row('Snow water equivalent', '4.1 in')],
}

describe('pointCardHtml', () => {
  it('names one reading on the band and lists its values', () => {
    const html = pointCardHtml([rain])
    expect(text(html)).toBe(
      'Moderate precipitation NEXRAD radar, now Reflectivity: 38.5 dBZ Rain rate: about 0.25 in/h',
    )
    expect(html).not.toContain(`border-top:${SECTION_EDGE}`)
  })

  // The card a storm over a snowpack opens: the radar on the band, the snow
  // ruled off under its values with its own name and source line.
  it('rules a second reading off below the first, with its own name and source', () => {
    const html = pointCardHtml([rain, snow])
    expect(text(html)).toBe(
      'Moderate precipitation NEXRAD radar, now Reflectivity: 38.5 dBZ Rain rate: about 0.25 in/h ' +
        '20 in of snow NOAA snow analysis, 5:00 AM Snow water equivalent: 4.1 in',
    )
    expect(html.split(`border-top:${SECTION_EDGE}`)).toHaveLength(2)
    // The card's one <strong> stays the band's title.
    expect(html.match(/<strong/g)).toHaveLength(1)
  })

  it('opens the body on the second reading, not on a rule, when the first has no values', () => {
    const html = pointCardHtml([{ ...rain, rows: [] }, snow])
    expect(html).not.toContain(`border-top:${SECTION_EDGE}`)
    expect(markupText(html)).toContain('20 in of snow')
  })
})

describe('inBounds', () => {
  it('takes a point on or inside the box', () => {
    expect(inBounds(-121, 47, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(-130, 24, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(10, 46, [-130, 24, -62, 58])).toBe(false)
  })
})
