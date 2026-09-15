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
  freezeMinFt: 9843,
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
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('⚠️')
    expect(html).toContain('3.2 mi from an active wildfire (Sourdough)')
  })

  it('phrases an inside-the-perimeter warning without a mileage', () => {
    const warning: FireWarning = { miles: 0, name: 'Bolt Creek', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('Inside an active wildfire perimeter (Bolt Creek)')
  })

  // NIFC incident names are third-party strings rendered via setHTML, so the
  // warning line must escape them rather than inject raw markup.
  it('escapes HTML in a third-party incident name', () => {
    const warning: FireWarning = { miles: 0, name: '<img src=x> "&', latitude: 0, longitude: 0 }
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

    // Elevation, precipitation, wind, temperature, the freezing level, and
    // air quality twice. The
    // title row is a styled div, so it is not in this match, and neither is
    // the coordinate pair — it carries a nowrap of its own now, asserted just
    // below, because a latitude and a longitude are one value in two halves
    // and breaking between them leaves a bare negative number on its own line.
    expect(lines).toHaveLength(7)
    // Matched whole rather than by stripping the tags out and counting colons,
    // which is the same regex shape as a naive sanitizer and reads to CodeQL as
    // one. It is also the better assertion: a label carries no colon of its own
    // and neither does a value, so "one label, one value" is the structure
    // itself, not a property counted off the flattened text.
    for (const line of lines) {
      expect(line, 'not a single label/value pair').toMatch(
        /^<div>[^<>:]+: (<a href="[^"]*"[^<>]*>)?<span style="[^"]*">[^<>]*<\/span>(<\/a>)?<\/div>$/,
      )
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

    expect(values).toHaveLength(8)
    // A label that wandered inside a value span would read as part of the
    // number and defeat the whole split.
    for (const value of values) {
      expect(value.replace(/^<span style="[^"]*">/, '')).not.toContain(':')
    }
    expect(html).toContain('Elevation: <span')
    expect(html).toContain('mph</span>')
  })

  // The one row that must never break, and the rule that separates the title
  // from what describes it. Both are shared with the popup a clicked basemap
  // feature opens, which is the point of pulling them into popupChrome: a
  // destination you clicked and the same one analyzed are one object at two
  // stages and had drifted into two kinds of card.
  it('keeps the coordinate pair on one line, under a rule', () => {
    const html = resultPopupHtml({ ...base, aqiAvg: 24, aqiMax: 31, warning: null })
    expect(html).toMatch(/<div style="white-space:nowrap[^"]*">Coordinates: /)
    expect(html).toContain('<hr')
  })
})

// The freezing level is the one metric a model can decline to publish, and
// five of the eight do (#295). The popup has no hover to explain a mark with,
// so the mark is all it carries.
describe('resultPopupHtml freezing level', () => {
  it('reads the height in feet, grouped like the elevation above it', () => {
    const html = resultPopupHtml({ ...base, freezeMinFt: 9843, warning: null })
    expect(html).toMatch(/Freezing level min: <a [^>]*><span[^>]*>9,843 ft<\/span>/)
  })

  it('marks the line rather than dropping it when the model publishes none', () => {
    // The opposite of the air-quality pair above: a vanished line would read
    // as the app forgetting the metric, where a missing air quality is one
    // forecast falling short and takes its rows with it.
    const html = resultPopupHtml({ ...base, freezeMinFt: null, warning: null })
    expect(html).toMatch(/Freezing level min: <span[^>]*>N\/A<\/span>/)
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

describe('resultPopupHtml links out', () => {
  // Four hourly stamps an hour apart, so the extremes below have an hour to
  // name. The freezing level bottoms out in the third of them.
  const TIMES = [
    Date.UTC(2026, 8, 16, 12),
    Date.UTC(2026, 8, 16, 13),
    Date.UTC(2026, 8, 16, 14),
    Date.UTC(2026, 8, 16, 15),
  ]
  const series = {
    precip_in: [0, 0, 0.1, 0],
    temp_f: [30, 21, 38, 25],
    wind_mph: [4, 22, 9, 12],
    freeze_ft: [9900, 9880, 9843, 9900],
    aqi: [31, 44, 58, 35],
  }
  const linked = { ...base, aqiAvg: 42, aqiMax: 58, modelId: 'gfs_seamless', series, times: TIMES }

  it('sends every metric to its own Windy layer, on the analyzed model', () => {
    const html = resultPopupHtml({ ...linked, warning: null })
    expect(html).toContain('https://www.windy.com/?gfs,rain,')
    expect(html).toContain('https://www.windy.com/?gfs,wind,')
    expect(html).toContain('https://www.windy.com/?gfs,temp,')
    expect(html).toContain('https://www.windy.com/?gfs,deg0,')
    expect(html).toContain('https://www.windy.com/?gfs,pm2p5,')
  })

  // The same split the table makes: a window total or an average is every hour
  // at once, so only a floor or a ceiling carries one.
  it('carries the hour behind a floor or a ceiling, and no other', () => {
    const html = resultPopupHtml({ ...linked, warning: null })
    expect(html).toContain('gfs,deg0,2026-09-16-14,')
    expect(html).toContain('gfs,pm2p5,2026-09-16-14,')
    expect(html).toContain('gfs,rain,46.8517')
    expect(html).toContain('gfs,wind,46.8517')
    expect(html).toContain('gfs,temp,46.8517')
  })

  // The freezing-level row is drawn whatever the model publishes, so the mark
  // standing in for a missing number must not be a link to nothing.
  it('leaves an absent freezing level unlinked', () => {
    const html = resultPopupHtml({ ...linked, freezeMinFt: null, warning: null })
    expect(html).not.toContain('deg0')
  })

  // A popup built before an analysis knows a model still links the way it
  // always did: a coordinate and a layer.
  it('falls back to the coordinate and the layer with no model', () => {
    const html = resultPopupHtml({ ...base, warning: null })
    expect(html).toContain('https://www.windy.com/?rain,46.8517,-121.7604,11')
  })

  it('links the whole wildfire warning to the fire on the NIFC map', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = resultPopupHtml({ ...linked, warning })
    expect(html).toContain('data-nifc.opendata.arcgis.com')
    expect(html).toContain('?location=48.80000,-121.10000,10')
    // The line keeps its amber: popupLink's own colour is declared first.
    expect(html).toContain('color:#f59e0b')
  })

  // Neither is a forecast, and the table links neither.
  it('leaves the elevation and the coordinates unlinked', () => {
    const html = resultPopupHtml({ ...linked, warning: null })
    for (const line of html.split('<div')) {
      if (line.includes('Elevation:') || line.includes('Coordinates:')) {
        expect(line).not.toContain('<a ')
      }
    }
  })

  it('opens every link in a new tab, with no window handle back', () => {
    const warning: FireWarning = { miles: 1, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = resultPopupHtml({ ...linked, warning })
    const anchors = html.match(/<a /g) ?? []
    expect(anchors.length).toBe(8)
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(8)
    expect(html.match(/target="_blank"/g)?.length).toBe(8)
  })
})

// #361: a marker's wind row names the same datum the table's column header
// does, so a point clicked on the map cannot describe its number differently
// from the row it came from.
describe('resultPopupHtml wind datum', () => {
  it('names the elevation datum over a forecast window', () => {
    const html = resultPopupHtml({ ...base, warning: null, windowSource: 'forecast' })
    expect(html).toContain('Wind at elevation')
  })

  it('names the surface datum over an archive window', () => {
    const html = resultPopupHtml({ ...base, warning: null, windowSource: 'archive' })
    expect(html).toContain('Wind at 10 meters')
  })

  // Both silent states, and the reason the popup takes the source at all
  // rather than a boolean.
  it('claims no datum over a spanning window or without one', () => {
    for (const source of ['spanning', null, undefined] as const) {
      const html = resultPopupHtml({ ...base, warning: null, windowSource: source })
      expect(html).not.toContain('at elevation')
      expect(html).not.toContain('at 10 meters')
    }
  })

  // The row is still a row: the datum joins the label, never the value, and the
  // Windy link the cell carries is untouched by it.
  it('leaves the value and the link alone', () => {
    const html = resultPopupHtml({ ...base, warning: null, windowSource: 'forecast' })
    expect(html).toContain('5.4 mph')
    expect(html).toContain('windy.com')
  })
})
