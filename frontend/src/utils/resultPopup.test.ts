import { describe, it, expect } from 'vitest'
import { resultPopupHtml } from './resultPopup'
import type { FireWarning } from './fireProximity'
import type { DestinationResult } from '../types'
import { NOUN, SEP } from '../metrics'
import { LABEL_COLOR } from './popupChrome'
import { displayedColumns } from './tableColumns'
import { closureWarning, resultRow } from '../testSupport/fixtures'

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

// The closure line follows the fire line in its markup (#550): the approved
// sentence, linked to the order's page when it has one.
describe('resultPopupHtml closure line', () => {
  it('says nothing without a closure', () => {
    expect(resultPopupHtml({ ...base, closure: null })).not.toContain('active closure')
  })

  it('links the sentence to the order after the fire line', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning, closure: closureWarning() })
    expect(html).toContain('⚠️ Inside an active closure (Probe Fire Closure)')
    expect(html).toContain('href="https://www.fs.usda.gov/r06/alerts/probe"')
    expect(html.indexOf('Sourdough')).toBeLessThan(html.indexOf('active closure'))
  })

  it('writes plain text for an order with no page, and escapes the name', () => {
    const html = resultPopupHtml({ ...base, closure: closureWarning({ url: null, name: '<b>x</b>' }) })
    expect(html).toContain('Inside an active closure (&lt;b&gt;x&lt;/b&gt;)')
    expect(html).not.toContain('fs.usda.gov')
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
    // One line per family, each a label and its value, and no aggregate
    // columns to head, because every family is one number.
    expect(html.match(/<th scope="row"/g) ?? []).toHaveLength(7)
    expect(html).not.toContain('scope="col"')
  })

  it('leads with the family the report is ranked by', () => {
    const html = resultPopupHtml({ ...base, columns: displayedColumns(false, 'aqi_max') })
    expect(html.indexOf(NOUN.aqi)).toBeLessThan(html.indexOf(NOUN.precip))
  })

  // A grid: a row per family, a column per aggregate, the aggregate words said
  // once at the top rather than on every family (TJ, 2026-10-08), which is what
  // keeps the card short enough to stand beside a phone's controls.
  it('lays the families out as a grid, one row each', () => {
    const html = resultPopupHtml({ ...base })
    const heads = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])
    expect(heads).toEqual(['Min', 'Max', 'Avg', 'Total'])
    // The heads lead the grid, above the first family.
    expect(html.indexOf('scope="col"')).toBeLessThan(html.indexOf('scope="row"'))
    // The temperature's three numbers stand under those three heads, in order.
    const temp = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.temp} \\(°F\\)</th>(.*?)</tr>`))![1]
    expect([...temp.matchAll(/>([\d.,]+)</g)].map((m) => m[1])).toEqual(['21.4', '38.9', '30.1'])
    // One line for each of the seven families, precipitation and snowfall
    // included.
    expect(html.match(/<th scope="row"/g) ?? []).toHaveLength(7)
  })

  // An AQI ranking's table leads its family with Avg; the grid keeps one order
  // for every family, so its Avg moves under the Avg head with the others.
  it('keeps one aggregate order for every family', () => {
    const html = resultPopupHtml({ ...base, columns: displayedColumns(false, 'aqi_avg') })
    const aqi = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.aqi}</th>(.*?)</tr>`))![1]
    expect([...aqi.matchAll(/>(\d+)</g)].map((m) => m[1])).toEqual(['11', '31', '24'])
  })

  // Precipitation and snowfall (#678) are the families whose columns do not
  // share a unit. Each is one line labelled with its rate, and its window
  // total stands last under the Total head with no unit of its own (TJ,
  // 2026-10-08).
  it('gives a mixed family one line with its total last', () => {
    const html = resultPopupHtml({ ...base })
    expect(html).toContain(`>${NOUN.snowfall} (in/hr)</th>`)
    const precip = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.precip} \\(in/hr\\)</th>(.*?)</tr>`))![1]
    expect([...precip.matchAll(/>([\d.]+)</g)].map((m) => m[1])).toEqual(['0.000', '0.009', '0.004', '0.123'])
    expect(html).not.toContain('Total</span>:')
    expect(html).not.toContain(' in<')
  })

  // A number never wraps: only the label column gives way, so a value and its
  // unit stay one thing. Unprotected, the old values line broke between
  // "0.000" and "in/hr" and left a bare unit on the next line.
  it('never breaks a line inside one measurement', () => {
    const html = resultPopupHtml({ ...base })
    const cells = html.match(/<td [^>]*>/g) ?? []
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell).toContain('white-space:nowrap')
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

  // The type, the elevation and the coordinates share one line under the name,
  // parted by a pipe a screen reader skips (TJ, 2026-10-08). The line never
  // wraps: a latitude and a longitude are one value in two halves, and a break
  // between them leaves a bare negative number looking like a third figure.
  it('puts the type, elevation and coordinates on one unlabelled line', () => {
    const html = resultPopupHtml({ ...base })
    expect(factsText(html)).toBe('Peak | 14,406 ft | 46.85173, -121.76040')
    expect(html).not.toContain('Coordinates')
    expect(html).not.toContain('Elevation (ft)')
  })

  it('leaves the elevation off the line when the place has none', () => {
    const html = resultPopupHtml({ ...base, row: { ...base.row, elevation_ft: null } })
    expect(factsText(html)).toBe('Peak | 46.85173, -121.76040')
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
    // Twenty-three metric values, the elevation and the coordinates.
    expect(values).toHaveLength(25)
    // A label that wandered inside a value span would read as part of the
    // number and defeat the whole split.
    for (const value of values) {
      expect(value.replace(/^<span style="[^"]*">/, '')).not.toContain(':')
    }
    expect(html).toMatch(new RegExp(`<th scope="row" style="[^"]*${LABEL_COLOR}[^"]*">${NOUN.temp} \\(°F\\)</th>`))
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
  // other is the title's own. See LABEL_COLOR for the measurement. The grid's
  // header cells are bold by default, so the one weight they may spell is the
  // one that undoes it.
  it('never sets a weight below the title', () => {
    const weights = resultPopupHtml({ ...base }).match(/font-weight:[a-z0-9]+/g) ?? []
    expect(weights.length).toBeGreaterThan(0)
    for (const w of weights) expect(w).toBe('font-weight:normal')
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
    const line = html.match(/<div style="white-space:nowrap">.*?<\/div>/)![0]
    expect(line).toContain('14,406 ft')
    expect(line).not.toContain('<a ')
  })

  it('opens every link in a new tab, with no window handle back', () => {
    const warning: FireWarning = { miles: 1, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = resultPopupHtml({ ...linked, warning })
    const anchors = html.match(/<a /g) ?? []
    // Twenty-three metric values, the warning, and the title's link-out glyph.
    expect(anchors.length).toBe(25)
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(25)
    expect(html.match(/target="_blank"/g)?.length).toBe(25)
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

/**
 * The facts line's text as a reader sees it, with each hidden pipe spaced the
 * way the eye reads it. Read from the text runs between tags rather than by
 * deleting tags, so nothing here looks like a sanitizer to CodeQL.
 */
function factsText(html: string): string {
  const line = html.match(/<div style="white-space:nowrap">(.*?)<\/div>/)![1]
  return [...`>${line}<`.matchAll(/>([^<]*)</g)]
    .map((m) => (m[1] === '|' ? ' | ' : m[1]))
    .join('')
}
