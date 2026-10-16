import { describe, expect, it } from 'vitest'
import { BOTH_TITLE, inBounds, pointCardHtml, type PointSection } from './pointReadout'
import { SECTION_EDGE, row, sectionHeading, updatedLine, widestName } from './popupChrome'
import { markupText } from '../testSupport/markupText'

// The text a reader reads, a space between blocks: `markupText` joins
// adjacent block elements with nothing between them.
const text = (html: string) => markupText(html.split('</div>').join('</div> ')).replace(/\s+/g, ' ').trim()

const rain: PointSection = {
  title: 'Light precipitation',
  source: 'NEXRAD radar',
  rows: [row('Rate', '~0.02 in/h'), row('Reflectivity', '16.5 dBZ'), updatedLine('now')],
}
const snow: PointSection = {
  title: 'Very deep snow',
  source: 'NOAA snow analysis',
  rows: [row('Depth', '151 in'), row('Snow water equivalent', '83 in'), updatedLine('Oct 16, 2026, 5:00 AM')],
}

describe('pointCardHtml', () => {
  // A name on the band and data in the body, as every card on the map has it
  // (TJ, 2026-10-16).
  it('names one reading and its source on the band, and lists its values in the body', () => {
    const html = pointCardHtml([rain])
    expect(text(html)).toBe(
      'Light precipitation NEXRAD radar Rate: ~0.02 in/h Reflectivity: 16.5 dBZ Updated: now',
    )
    expect(html).not.toContain(`border-top:${SECTION_EDGE}`)
  })

  // Both pictures under one click: a band naming both with both sources,
  // and each section opening on its own name, in bold, so the rain's values
  // cannot be read as the snow's (TJ, 2026-10-16).
  it('names two readings together, and opens each section on its own name', () => {
    const html = pointCardHtml([rain, snow])
    expect(text(html)).toBe(
      `${BOTH_TITLE} NEXRAD radar|NOAA snow analysis ` +
        'Light precipitation Rate: ~0.02 in/h Reflectivity: 16.5 dBZ Updated: now ' +
        'Very deep snow Depth: 151 in Snow water equivalent: 83 in Updated: Oct 16, 2026, 5:00 AM',
    )
    expect(html.split(`border-top:${SECTION_EDGE}`)).toHaveLength(2)
    expect(html).toContain(sectionHeading('Light precipitation'))
    expect(html).toContain(sectionHeading('Very deep snow'))
  })

  it('names one reading on the band alone, with no heading in its body', () => {
    expect(pointCardHtml([rain])).not.toContain(sectionHeading('Light precipitation'))
  })
})

// A section the forecast player renames keeps its card one width, alone on
// the card or under the other picture's (#752).
describe('pointCardHtml, for a section that can change its name', () => {
  const NAMES = ['Light precipitation', 'Very heavy precipitation', 'No radar echo']
  const playing: PointSection = { ...rain, titles: NAMES }

  it('sizes the band title to the widest name', () => {
    expect(pointCardHtml([playing])).toContain(widestName('Light precipitation', NAMES))
  })

  it('sizes the section heading to the widest name on a card of two', () => {
    expect(pointCardHtml([playing, snow])).toContain(sectionHeading(widestName('Light precipitation', NAMES)))
  })

  it('leaves a section with one name as it was', () => {
    expect(pointCardHtml([rain])).not.toContain('inline-grid')
  })
})

describe('inBounds', () => {
  it('takes a point on or inside the box', () => {
    expect(inBounds(-121, 47, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(-130, 24, [-130, 24, -62, 58])).toBe(true)
    expect(inBounds(10, 46, [-130, 24, -62, 58])).toBe(false)
  })
})
