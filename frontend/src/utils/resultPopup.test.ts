import { describe, it, expect } from 'vitest'
import { resultPopupHtml } from './resultPopup'
import type { FireWarning } from './fireProximity'

// A fully-populated popup input; individual tests override `warning`.
const base = {
  rank: 1,
  name: 'Mount Rainier',
  type: 'peak',
  osmId: null,
  elevationFt: 14406,
  precipTotalIn: 0.123,
  windAvgMph: 5.4,
  tempAvgF: 41.2,
  aqiAvg: null,
  aqiMax: null,
  longitude: -121.760395,
  latitude: 46.851731,
}

describe('resultPopupHtml fire warning', () => {
  it('omits the warning line when no fire is nearby', () => {
    const html = resultPopupHtml({ ...base, warning: null })
    expect(html).not.toContain('⚠️')
  })

  it('renders the ⚠️ and the proximity text when a fire is near', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('⚠️')
    expect(html).toContain('3.2 mi from an active wildfire (Sourdough)')
  })

  it('phrases an inside-the-perimeter warning without a mileage', () => {
    const warning: FireWarning = { miles: 0, name: 'Bolt Creek' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('Inside an active wildfire perimeter (Bolt Creek)')
  })

  // NIFC incident names are third-party strings rendered via setHTML, so the
  // warning line must escape them rather than inject raw markup.
  it('escapes HTML in a third-party incident name', () => {
    const warning: FireWarning = { miles: 0, name: '<img src=x> "&' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
  })
})

describe('resultPopupHtml rank prefix', () => {
  it('shows "#N name" for a ranked result', () => {
    const html = resultPopupHtml({ ...base, rank: 3, warning: null })
    expect(html).toContain('<strong>#3 Mount Rainier</strong>')
  })

  it('drops the "#" for an unranked (searched) destination', () => {
    // The title carries no rank prefix (hex colors elsewhere still use '#').
    const html = resultPopupHtml({ ...base, rank: '', warning: null })
    expect(html).toContain('<strong>Mount Rainier</strong>')
  })
})

describe('resultPopupHtml layout', () => {
  // Wind and temperature shared a line separated by a "·" — the only line
  // carrying two metrics, and the only one long enough to wrap, so on a narrow
  // map it broke wherever the edge fell and the second label landed mid-line
  // under the first one's number.
  it('gives every stat its own line', () => {
    const html = resultPopupHtml({ ...base, aqiAvg: 24, aqiMax: 31, warning: null })
    const lines = html.match(/<div>[^]*?<\/div>/g) ?? []

    // Elevation, precipitation, wind, temperature, air quality twice,
    // coordinates. The title row is a styled div, so it is not in this match.
    expect(lines).toHaveLength(7)
    for (const line of lines) {
      // Colons in the inline style attribute are not label separators; the
      // rendered text is what a second stat on the line would show up in.
      const text = line.replace(/<[^>]*>/g, '')

      expect(text.match(/:/g), `two stats on one line: ${text}`).toHaveLength(1)
    }
    expect(html).not.toContain('·')
  })

  it('omits both air-quality lines together when there is no reading', () => {
    const html = resultPopupHtml({ ...base, aqiAvg: null, aqiMax: null, warning: null })

    expect(html.match(/<div>[^]*?<\/div>/g) ?? []).toHaveLength(5)
  })

  // The label/value split is carried by a face change rather than by weight,
  // because the popup's one bold is its title (see the emphasis suite below).
  // Every value wears it; no label does.
  it('sets values in a monospace face and labels in the popup default', () => {
    const html = resultPopupHtml({ ...base, aqiAvg: 24, aqiMax: 31, warning: null })
    const values = html.match(/<span style="font-family:ui-monospace[^"]*">[^<]*<\/span>/g) ?? []

    expect(values).toHaveLength(7)
    // A label that wandered inside a value span would read as part of the
    // number and defeat the whole split.
    for (const value of values) {
      expect(value.replace(/^<span style="[^"]*">/, '')).not.toContain(':')
    }
    expect(html).toContain('Elevation: <span')
    expect(html).toContain('mph</span>')
  })
})

// OSM supplies destination names, which makes them third-party text on its way
// to setHTML exactly like the NIFC incident name the warning line carries. This
// one had gone unescaped since the popup was written.
describe('resultPopupHtml escaping', () => {
  it('escapes HTML in a destination name', () => {
    const html = resultPopupHtml({ ...base, name: '<img src=x> "&', warning: null })

    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
  })
})

describe('resultPopupHtml emphasis', () => {
  // The popup's only bold is its title. Precip-total and AQI-avg wore
  // <strong> from the original implementation onward, singling out two values
  // by no rule — not the ranked metric (that varies; the markup didn't), not
  // line position (wind led its line unbolded).
  it('bolds the name and nothing else', () => {
    const html = resultPopupHtml({ ...base, aqiAvg: 24, aqiMax: 31, warning: null })
    expect(html.match(/<strong>/g)).toHaveLength(1)
    expect(html.indexOf('<strong>')).toBeLessThan(html.indexOf('Mount Rainier'))
  })
})
