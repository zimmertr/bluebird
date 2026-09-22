import { describe, it, expect } from 'vitest'
import { resultPopupHtml } from './resultPopup'
import type { FireWarning } from './fireProximity'
import type { DestinationResult } from '../types'
import { NOUN, SEP } from '../metrics'
import { LABEL_COLOR } from './popupChrome'
import { displayedColumns } from './tableColumns'
import { resultRow } from '../testSupport/fixtures'

// Every aggregate is a different number so a test can tell which column a
// value came from.
const row = resultRow({
  latitude: 46.851731,
  longitude: -121.760395,
  elevation_ft: 14406,
  precip_total_in: 0.123,
  precip_avg_in_hr: 0.0041,
  precip_min_in_hr: 0.0,
  precip_max_in_hr: 0.0092,
  temp_min_f: 21.4,
  temp_max_f: 38.9,
  temp_avg_f: 30.1,
  wind_min_mph: 3.2,
  wind_max_mph: 41.8,
  wind_avg_mph: 5.4,
  freeze_min_ft: 9843,
  freeze_max_ft: 12100,
  freeze_avg_ft: 10800,
  aqi_avg: 24,
  aqi_min: 11,
  aqi_max: 31,
})

// A date-range report with every column on, which is the app's own default.
const WINDOW_COLS = displayedColumns(false, 'precip_total_in')
// A Current lookup, where the table collapses each family to one column.
const POINT_COLS = displayedColumns(true, 'precip_total_in')

const base = { rank: 1, row, columns: WINDOW_COLS, warning: null as FireWarning | null }

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

  // The wildfire flag is a safety statement, not a measurement, so it keeps its
  // amber banner and is the one table column the popup does not mirror (TJ,
  // 2026-09-14). A card that said it twice would be worse at saying it once.
  it('never repeats the warning as a metric line', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).not.toContain('Wildfire (mi)')
    expect(html.match(/⚠️/g)).toHaveLength(1)
  })
})

describe('resultPopupHtml rank prefix', () => {
  it('shows "#N name" for a ranked result', () => {
    const html = resultPopupHtml({ ...base, rank: 3 })
    expect(html).toContain('<strong>#3 Mount Rainier</strong>')
  })

  it('drops the "#" for an unranked (searched) destination', () => {
    // The title carries no rank prefix (hex colors elsewhere still use '#').
    const html = resultPopupHtml({ ...base, rank: '' })
    expect(html).toContain('<strong>Mount Rainier</strong>')
  })
})

// #370: the card shows what the results table shows, in the table's order. It
// used to hold six hard-coded rows, so a Current lookup printed "total",
// "avg", "min" and "max" over four copies of one number and a date-range
// report showed six of the sixteen values the table had.
describe('resultPopupHtml mirrors the table', () => {
  it('shows every aggregate the table shows over a date range', () => {
    const html = resultPopupHtml({ ...base })
    // Every one of the temperature family's three numbers, which the old card
    // reduced to the average alone.
    expect(html).toContain('21.4')
    expect(html).toContain('38.9')
    expect(html).toContain('30.1')
    // And all three AQI numbers, where the old card showed two.
    expect(html).toContain('>11<')
    expect(html).toContain('>31<')
  })

  it('collapses a Current lookup to one value per family', () => {
    const html = resultPopupHtml({ ...base, columns: POINT_COLS })
    // The table drops the aggregate word because every aggregate is the same
    // hour, and the popup follows it.
    expect(html).not.toContain(SEP)
    expect(html).toContain(`${NOUN.temp} (°F)`)
    // One line per family plus the elevation, each a plain label/value pair.
    const pairs = html.match(/<div><span style="[^"]*">[^<>:]+<\/span>: /g) ?? []
    expect(pairs).toHaveLength(7)
  })

  it('leads with the family the report is ranked by', () => {
    const html = resultPopupHtml({ ...base, columns: displayedColumns(false, 'aqi_max') })
    expect(html.indexOf(NOUN.aqi)).toBeLessThan(html.indexOf(NOUN.precip))
  })

  // A family's values sit on one line under one heading, which is what keeps a
  // sixteen-value card inside the 280px width ceiling (TJ, 2026-09-14).
  it('sets a family heading over an indented values line', () => {
    const html = resultPopupHtml({ ...base })
    // The heading is the family's noun and unit, alone on its line, and the
    // values line under it is the indented one.
    expect(html).toContain(`<span style="${LABEL_COLOR}">${NOUN.temp} (°F)</span></div>`)
    expect(html).toMatch(/<div style="padding-left:8px">/)
    // All five families are parted from what sits above them. None is the
    // first block here: the elevation leads, as a plain label/value line.
    expect((html.match(/margin-top:4px/g) ?? []).length).toBe(5)
  })

  // Precipitation is the one family whose columns do not share a unit, so the
  // heading is the bare noun and each value carries its own.
  it('spells a unit per value where a family mixes two', () => {
    const html = resultPopupHtml({ ...base })
    expect(html).toContain(`<span style="${LABEL_COLOR}">${NOUN.precip}</span>`)
    expect(html).toContain('0.123 in<')
    expect(html).toContain('0.004 in/hr<')
  })

  // A values line may break between pairs and nowhere else. Unprotected, the
  // precipitation line broke between "0.000" and "in/hr" and left a bare unit
  // on the next line, which is the failure that split the old shared
  // wind-and-temperature row.
  it('never breaks a line inside one measurement', () => {
    const html = resultPopupHtml({ ...base })
    const lines = html.match(/<div style="padding-left:8px">.*/g) ?? []
    expect(lines).toHaveLength(5)
    for (const line of lines) {
      const pairs = line.match(/<span style="white-space:nowrap">/g) ?? []
      const separators = line.match(/> \| </g) ?? []
      // Every pair is protected, and the separators are the only gaps left.
      expect(pairs.length).toBe(separators.length + 1)
    }
  })
})

// TJ moved these above the rule on 2026-09-14: all three identify the point
// rather than measure it, so the rule now parts what a destination IS from what
// the forecast says about it.
describe('resultPopupHtml identity band', () => {
  it('puts the type and the coordinates above the rule', () => {
    const html = resultPopupHtml({ ...base })
    const rule = html.indexOf('<hr')
    expect(html.indexOf('Peak')).toBeLessThan(rule)
    expect(html.indexOf('46.85173, -121.76040')).toBeLessThan(rule)
  })

  // A latitude and a longitude are one value in two halves, and breaking
  // between them leaves a bare negative number on its own line looking like a
  // third figure.
  it('keeps the coordinate pair on one line, unlabelled', () => {
    const html = resultPopupHtml({ ...base })
    expect(html).toMatch(/<div style="white-space:nowrap;font-family:ui-monospace[^"]*">46\.85173, -121\.76040<\/div>/)
    expect(html).not.toContain('Coordinates')
  })

  it('names no model while one model answered every row', () => {
    const html = resultPopupHtml({ ...base, modelFallbackLabel: 'GFS Seamless' })
    expect(html).not.toContain('GFS Seamless')
  })
})

// The label/value split is carried on two axes since TJ's 2026-09-14 call: the
// label is stepped back in colour and the value is monospace.
describe('resultPopupHtml type', () => {
  it('sets values in a monospace face and labels in a stepped-back colour', () => {
    const html = resultPopupHtml({ ...base })
    const values = html.match(/<span style="font-family:ui-monospace[^"]*">[^<]*<\/span>/g) ?? []
    // Seventeen metric values plus the elevation.
    expect(values).toHaveLength(18)
    // A label that wandered inside a value span would read as part of the
    // number and defeat the whole split.
    for (const value of values) {
      expect(value.replace(/^<span style="[^"]*">/, '')).not.toContain(':')
    }
    expect(html).toContain(`<span style="${LABEL_COLOR}">Elevation (ft)</span>: <span`)
  })

  // The popup's only bold is its title. Precip-total and AQI-avg wore
  // <strong> from the original implementation onward, singling out two values
  // by no rule.
  it('bolds the name and nothing else', () => {
    const html = resultPopupHtml({ ...base })
    expect(html.match(/<strong>/g)).toHaveLength(1)
    expect(html.indexOf('<strong>')).toBeLessThan(html.indexOf('Mount Rainier'))
  })

  // Colour rather than weight, because under this card's `sans-serif` only two
  // faces exist and both are wrong: one is invisible against the value, the
  // other is the title's own. See LABEL_COLOR for the measurement.
  it('never sets a weight below the title', () => {
    expect(resultPopupHtml({ ...base })).not.toContain('font-weight')
  })
})

// OSM supplies destination names, which makes them third-party text on its way
// to setHTML exactly like the NIFC incident name the warning line carries.
describe('resultPopupHtml escaping', () => {
  it('escapes HTML in a destination name', () => {
    const html = resultPopupHtml({ ...base, row: { ...row, name: '<img src=x> "&' } })
    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
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
  const linked = {
    ...base,
    row: { ...row, series } as DestinationResult,
    modelId: 'gfs_seamless',
    times: TIMES,
  }

  it('sends every metric to its own Windy layer, on the analyzed model', () => {
    const html = resultPopupHtml({ ...linked })
    expect(html).toContain('https://www.windy.com/?gfs,rain,')
    expect(html).toContain('https://www.windy.com/?gfs,wind,')
    expect(html).toContain('https://www.windy.com/?gfs,temp,')
    expect(html).toContain('https://www.windy.com/?gfs,deg0,')
    expect(html).toContain('https://www.windy.com/?gfs,pm2p5,')
  })

  // The same split the table makes: a window total or an average is every hour
  // at once, so only a floor or a ceiling carries one.
  it('carries the hour behind a floor or a ceiling, and no other', () => {
    const html = resultPopupHtml({ ...linked })
    expect(html).toContain('gfs,deg0,2026-09-16-14,')
    expect(html).toContain('gfs,temp,2026-09-16-13,')
    expect(html).toContain('gfs,rain,46.8517')
  })

  // The freezing-level line is drawn whatever the model publishes, so the mark
  // standing in for a missing number must not be a link to nothing.
  it('leaves an absent freezing level unlinked', () => {
    const bare = {
      ...linked,
      row: { ...row, series, freeze_min_ft: null, freeze_max_ft: null, freeze_avg_ft: null },
    } as typeof linked
    const html = resultPopupHtml(bare)
    expect(html).not.toContain('deg0')
    expect(html).toContain('N/A')
  })

  // A popup built before an analysis knows a model still links the way it
  // always did: a coordinate and a layer.
  it('falls back to the coordinate and the layer with no model', () => {
    const html = resultPopupHtml({ ...base })
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

  // Neither is a forecast, and the table links neither. Matched as whole
  // lines: the title's own link-out glyph carries the coordinates inside its
  // href, so a substring search for them finds the one anchor that is correct.
  it('leaves the elevation and the coordinates unlinked', () => {
    const html = resultPopupHtml({ ...linked })
    const elevation = html.match(/<div><span style="[^"]*">Elevation \(ft\)<\/span>:[^\n]*/)![0]
    expect(elevation).not.toContain('<a ')
    const coordinates = html.match(/<div style="white-space:nowrap[^"]*">[^<]*<\/div>/)![0]
    expect(coordinates).not.toContain('<a ')
  })

  it('opens every link in a new tab, with no window handle back', () => {
    const warning: FireWarning = { miles: 1, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = resultPopupHtml({ ...linked, warning })
    const anchors = html.match(/<a /g) ?? []
    // Sixteen metric values, the warning, and the title's link-out glyph.
    expect(anchors.length).toBe(18)
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(18)
    expect(html.match(/target="_blank"/g)?.length).toBe(18)
  })
})

// #457: a marker's headings are the bare noun and unit, the same words the
// table's headers use. The datum both once carried is gone for the reason
// tableColumns.test.ts records, and the popup reads the columns it is handed,
// so this pins that nothing here adds one back.
describe('resultPopupHtml names no datum', () => {
  it('carries no datum in any heading', () => {
    const html = resultPopupHtml({
      ...base,
      columns: displayedColumns(false, 'precip_total_in'),
    })
    expect(html).not.toMatch(/\bat (elevation|\d+ meters)\b/)
  })
})
