import { describe, it, expect } from 'vitest'
import { RESULT_ACTION_ATTR, resultPopupHtml } from './resultPopup'
import { poiPopupHtml, POI_ACTION_ATTR } from './poiPopup'
import { POPUP_BODY_ATTR, POPUP_TINT_ATTR } from './popupChrome'
import { cellTint } from './resultsCells'
import type { FireWarning } from './fireProximity'
import { FAMILY_KEYS, NOUN, SEP } from '../metrics'
import {
  GRID_COMPACT_INSET_PX,
  GRID_INSET_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  HEADER_EDGE_COLOR,
  LABEL_COLOR,
  SECTION_EDGE,
  SECTION_PAD_Y,
  WARNING_COLOR,
} from './popupChrome'
import { displayedColumns } from './tableColumns'
import { closureWarning, resultRow, series } from '../testSupport/fixtures'
import outlines from './usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from './usStates'

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

describe('resultPopupHtml link out', () => {
  const crag = resultRow({ name: 'Family Wall', type: 'crag', latitude: 47.48886, longitude: -121.75024 })

  it("names a crag's state in its search when the outlines are held, and the name alone before", () => {
    const states = decodeUsStates(outlines as UsStateOutlines)
    expect(resultPopupHtml({ ...base, row: crag, usStates: states })).toContain(
      'https://www.mountainproject.com/search?q=Family%20Wall%20Washington'
    )
    expect(resultPopupHtml({ ...base, row: crag })).toContain(
      'https://www.mountainproject.com/search?q=Family%20Wall"'
    )
  })
})

describe('resultPopupHtml fire warning', () => {
  it('omits the warning line when no fire is nearby', () => {
    const html = resultPopupHtml({ ...base, warning: null })
    expect(html).not.toContain('⚠️')
  })

  it('renders the ⚠️ and the proximity text when a fire is near', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('⚠️')
    expect(html).toContain('>Near a wildfire (Sourdough): 3.2 mi<')
  })

  // One form at every distance: a point inside a perimeter reads 0.0 mi.
  it('phrases an inside-the-perimeter warning at 0.0 mi', () => {
    const warning: FireWarning = { miles: 0, name: 'Bolt Creek', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('>Near a wildfire (Bolt Creek): 0.0 mi<')
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

// The warnings stand in a section of their own between the header and the
// grid, closed off from the grid by the header's own edge (TJ, 2026-10-08).
describe('resultPopupHtml warnings section', () => {
  const fire: FireWarning = { miles: 1, name: 'KING', latitude: 47.5, longitude: -121.3 }
  const section = (html: string) =>
    html.match(/<div style="font-size:12px;display:flex;[^"]*border-bottom:1px solid var\(--popup-[\w-]+\)">(.*?)<\/div>(?=\s*<div data-popup-body)/s)
  const glyphs = (html: string) => html.split('⚠️').length - 1

  it('puts both warnings after the header and before the grid, ruled off from it', () => {
    const html = resultPopupHtml({ ...base, warning: fire, closure: closureWarning() })
    const found = section(html)
    expect(found).not.toBeNull()
    expect(found![0]).toContain(`border-bottom:1px solid ${HEADER_EDGE_COLOR}`)
    expect(found![1]).toContain('KING')
    expect(found![1]).toContain('Within a closure')
    // Neither warning is inside the body the scroll cap shortens.
    const body = html.slice(html.indexOf('data-popup-body'))
    expect(body).not.toContain('active')
    // The header comes first.
    expect(html.indexOf(HEADER_BAND_COLOR)).toBeLessThan(html.indexOf('⚠️'))
  })

  it('draws no section, and no glyph, without a warning', () => {
    const html = resultPopupHtml({ ...base })
    expect(section(html)).toBeNull()
    expect(glyphs(html)).toBe(0)
  })

  // One glyph for the section, in a column of its own down its right side
  // under the close button, rather than one spending the start of every line.
  it('draws one glyph for the whole section, in a column after the warnings', () => {
    for (const d of [{ warning: fire }, { closure: closureWarning() }, { warning: fire, closure: closureWarning() }]) {
      const html = resultPopupHtml({ ...base, ...d })
      expect(glyphs(html)).toBe(1)
      expect(section(html)![1]).toMatch(/<span aria-hidden="true" style="flex:none;width:calc\(var\(--popup-close-lane, 2rem\) \+ 2px\);[^"]*">⚠️<\/span>$/)
    }
  })

  // Each warning keeps one line and ends in an ellipsis where it outruns the
  // card, linked or not, so a long order name no longer wraps the card.
  it('keeps every warning to one line, cut with an ellipsis', () => {
    const oneLine = /font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">/g
    expect(resultPopupHtml({ ...base, warning: fire, closure: closureWarning() }).match(oneLine)).toHaveLength(2)
    expect(resultPopupHtml({ ...base, closure: closureWarning({ url: null }) }).match(oneLine)).toHaveLength(1)
  })

  // Two warnings are a bulleted list; a lone one is its sentence alone.
  it('bullets two warnings, and leaves a lone one unbulleted', () => {
    const both = section(resultPopupHtml({ ...base, warning: fire, closure: closureWarning() }))![1]
    expect(both).toMatch(/<ul style="[^"]*list-style:disc[^"]*"><li>.*KING.*<\/li><li>.*Within a closure.*<\/li><\/ul>/s)
    expect(section(resultPopupHtml({ ...base, closure: closureWarning() }))![1]).not.toContain('<li>')
  })
})

// The closure line follows the fire line in its markup (#550): the approved
// sentence, linked to the order's page when it has one.
describe('resultPopupHtml closure line', () => {
  it('says nothing without a closure', () => {
    expect(resultPopupHtml({ ...base, closure: null })).not.toContain('closure (')
  })

  it('links the sentence to the order after the fire line', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = resultPopupHtml({ ...base, warning, closure: closureWarning() })
    expect(html).toContain('>Within a closure (Probe Fire Closure)</a>')
    expect(html).toContain('href="https://www.fs.usda.gov/r06/alerts/probe"')
    expect(html.indexOf('Sourdough')).toBeLessThan(html.indexOf('Within a closure'))
  })

  it('writes plain text for an order with no page, and escapes the name', () => {
    const html = resultPopupHtml({ ...base, closure: closureWarning({ url: null, name: '<b>x</b>' }) })
    expect(html).toContain('Within a closure (&lt;b&gt;x&lt;/b&gt;)')
    expect(html).not.toContain('fs.usda.gov')
  })
})

describe('resultPopupHtml rank prefix', () => {
  it('shows "#N name" for a ranked result', () => {
    const html = resultPopupHtml({ ...base, rank: 3 })
    expect(html).toMatch(/<strong[^>]*>#3 Mount Rainier<\/strong>/)
  })

  it('drops the "#" for an unranked (searched) destination', () => {
    // The title carries no rank prefix (hex colors elsewhere still use '#').
    const html = resultPopupHtml({ ...base, rank: '' })
    expect(html).toMatch(/<strong[^>]*>Mount Rainier<\/strong>/)
  })
})

// A finger removes a row through the card its row tap opens (#696), so the
// card carries the clicked feature's remove: its words, its look, its place.
describe('resultPopupHtml remove', () => {
  it('carries no action unless asked', () => {
    expect(resultPopupHtml(base)).not.toContain(RESULT_ACTION_ATTR)
  })

  it('offers the clicked feature\'s remove, centred under the numbers', () => {
    const html = resultPopupHtml({ ...base, removable: true })
    const button = html.match(new RegExp(`<button ${RESULT_ACTION_ATTR}="remove"[^>]*>([^<]*)</button>`))
    expect(button?.[1]).toBe('Remove from analysis')
    // The same look as the clicked feature's remove: only the attribute differs.
    const poi = poiPopupHtml({ name: 'Mount Rainier', lat: 46.85, lon: -121.76, kind: 'peak' }, true)
    const poiButton = poi.match(new RegExp(`<button ${POI_ACTION_ATTR}="remove"([^>]*)>`))![1]
    expect(button![0]).toContain(poiButton)
    // On a line of its own at the foot of the card, after the body the scroll
    // cap shortens rather than inside it, so a capped card keeps it in view.
    expect(html).toMatch(
      new RegExp(`<div style="padding:8px 10px;border-top:1px solid ${escapeRegExp(HEADER_EDGE_COLOR)}"><div style="display:flex;justify-content:center"><button ${RESULT_ACTION_ATTR}="remove"[^>]*>Remove from analysis</button></div></div>\\s*</div>$`),
    )
    expect(html.indexOf(POPUP_BODY_ATTR)).toBeLessThan(html.indexOf(RESULT_ACTION_ATTR))
  })

  // A section of its own (#696): ruled off from the grid by the edge the
  // warnings section wears, with that section's padding above and below, on
  // the narrow map's compact grid and the full one alike.
  it("rules the remove off in a section like the warnings', at both widths", () => {
    const fire: FireWarning = { miles: 1, name: 'KING', latitude: 47.5, longitude: -121.3 }
    for (const compact of [false, true]) {
      const html = resultPopupHtml({ ...base, compact, removable: true, warning: fire })
      const warnings = html.match(/<div style="font-size:12px;display:flex;align-items:flex-start;padding:(\d+px) 0 (\d+px) 10px;border-bottom:([^"]+)">/)!
      const action = html.match(new RegExp(`<div style="padding:(\\d+px) 10px;border-top:([^"]+)"><div style="display:flex;justify-content:center"><button ${RESULT_ACTION_ATTR}`))!
      expect(action[2]).toBe(warnings[3])
      expect(action[2]).toBe(SECTION_EDGE)
      expect([warnings[1], warnings[2]]).toEqual([SECTION_PAD_Y, SECTION_PAD_Y])
      expect(action[1]).toBe(SECTION_PAD_Y)
    }
    // No remove, no rule under the grid.
    expect(resultPopupHtml({ ...base })).not.toContain('border-top:')
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

  // A to Z whatever the ranking (TJ, 2026-10-08).
  it('lists the families alphabetically, whatever the ranking', () => {
    for (const sortBy of ['aqi_max', 'wind_max_mph', 'precip_total_in'] as const) {
      const html = resultPopupHtml({ ...base, columns: displayedColumns(false, sortBy) })
      const labels = [...html.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
      expect(labels[0]).toBe(NOUN.aqi)
    }
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
    // Every cell holding a number; the empty corner over the labels holds none.
    const cells = html.match(/<td [^>]*>(?=<a |<span )/g) ?? []
    expect(cells.length).toBeGreaterThan(20)
    for (const cell of cells) expect(cell).toContain('white-space:nowrap')
  })
})

// TJ moved these above the rule on 2026-09-14: all three identify the point
// rather than measure it, so the rule now parts what a destination IS from what
// the forecast says about it.
describe('resultPopupHtml identity band', () => {
  // On the header band, above the body, which the band's edge and shadow part
  // from it (TJ, 2026-10-08) where other popups draw a rule.
  it('puts the type and the coordinates on the header band, above the body', () => {
    const html = resultPopupHtml({ ...base })
    const body = html.indexOf('data-popup-body')
    expect(html).not.toContain('<hr')
    expect(html.indexOf(HEADER_BAND_COLOR)).toBeLessThan(html.indexOf('Peak'))
    expect(html.indexOf('Peak')).toBeLessThan(body)
    expect(html.indexOf('46.85173, -121.76040')).toBeLessThan(body)
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

  // The pair links to CalTopo centred on the point, one level above the
  // map's zoom (#712); the elevation beside it links nowhere.
  it('links the coordinates to CalTopo at the view the map is showing', () => {
    const html = resultPopupHtml({ ...base, mapZoom: 13 })
    expect(html).toContain('href="https://caltopo.com/map.html#ll=46.85173,-121.76040&amp;z=14"')
    expect(html).not.toMatch(/<a [^>]*>[^<]*14,406/)
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
    expect(html).toMatch(new RegExp(`<th scope="row" style="[^"]*${escapeRegExp(LABEL_COLOR)}[^"]*">${NOUN.temp} \\(°F\\)</th>`))
  })

  // The popup's only bold is its title. Precip-total and AQI-avg wore
  // <strong> from the original implementation onward, singling out two values
  // by no rule.
  it('bolds the name and nothing else', () => {
    const html = resultPopupHtml({ ...base })
    expect(html.match(/<strong[ >]/g)).toHaveLength(1)
    expect(html.indexOf('<strong')).toBeLessThan(html.indexOf('Mount Rainier'))
  })

  // Colour rather than weight for a label, because a weight step does not
  // read alike in every face. See LABEL_COLOR for the measurement. The column
  // heads are the one exception: bold, a size under the title, so they read
  // as the grid's heads rather than as one more label (TJ, 2026-10-08).
  it('keeps every label regular and only the column heads bold', () => {
    const html = resultPopupHtml({ ...base })
    const rowHeads = html.match(/<th scope="row" style="[^"]*"/g) ?? []
    expect(rowHeads.length).toBeGreaterThan(0)
    for (const th of rowHeads) expect(th).toContain('font-weight:normal')
    const colHeads = html.match(/<th scope="col" style="[^"]*"/g) ?? []
    expect(colHeads).toHaveLength(4)
    for (const th of colHeads) expect(th).toContain('font-weight:700')
  })
})

// The card marks the number the report ranks by, bold on a cell one slate
// darker than its column (TJ, 2026-10-08), and narrows its bands on a map
// too narrow for them.
describe('resultPopupHtml ranked number and insets', () => {
  // The ranked family wears the table's colours (#740), each number on its
  // own column's scale, and the ranked number alone is bold.
  it('bolds the ranked number and colours its family as the table does', () => {
    const columns = displayedColumns(false, 'wind_max_mph')
    const html = resultPopupHtml({ ...base, columns, rankedBy: 'wind_max_mph' })
    const bold = [...html.matchAll(/<span style="[^"]*font-weight:700[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(bold).toEqual(['41.8'])
    const tinted = [...html.matchAll(new RegExp(`<td ${POPUP_TINT_ATTR} style="[^"]*;background:([^;]+);--tint-dark:([^;]+);--tint-light:([^;]+);`, 'g'))]
    // The grid's column order, Min, Max, Avg.
    const wind = (['wind_min_mph', 'wind_max_mph', 'wind_avg_mph'] as const).filter((k) => columns.some((c) => c.key === k))
    expect(wind).toHaveLength(3)
    expect(tinted).toHaveLength(wind.length)
    const group = new Set<string>(FAMILY_KEYS.wind)
    wind.forEach((key, i) => {
      const tint = cellTint(key, row[key], group, false)!
      expect(tinted[i].slice(1)).toEqual([tint.fill, tint.ink.dark, tint.ink.light])
    })
    expect(html).not.toContain(`;background:${GRID_RANKED_COLOR}`)
  })

  it('marks and colours nothing without a ranking', () => {
    const html = resultPopupHtml({ ...base })
    expect(html).not.toContain(`;background:${GRID_RANKED_COLOR}`)
    expect(html).not.toContain(POPUP_TINT_ATTR)
  })

  it('takes the compact insets when asked', () => {
    expect(resultPopupHtml({ ...base, compact: true })).toContain(`padding:1px ${GRID_COMPACT_INSET_PX}px`)
    expect(resultPopupHtml({ ...base })).toContain(`padding:1px ${GRID_INSET_PX}px`)
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
  const hourly = series({
    precip_in: [0, 0, 0.1, 0],
    temp_f: [30, 21, 38, 25],
    wind_mph: [4, 22, 9, 12],
    freeze_ft: [9900, 9880, 9843, 9900],
    aqi: [31, 44, 58, 35],
  })
  const linked = {
    ...base,
    row: resultRow({ ...row, series: hourly }),
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
      row: resultRow({ ...row, series: hourly, freeze_min_ft: null, freeze_max_ft: null, freeze_avg_ft: null }),
    }
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
    expect(html).toContain(`color:${WARNING_COLOR}`)
  })

  // The coordinates name a place and link to it on CalTopo (#712); the
  // elevation is a measurement, not a forecast, and links nowhere. Matched as
  // the whole line: the title's own link-out glyph carries the coordinates
  // inside its href, so a substring search for them finds the wrong anchor.
  it('links the coordinates and leaves the elevation unlinked', () => {
    const html = resultPopupHtml({ ...linked, mapZoom: 13 })
    const line = html.match(/<div style="white-space:nowrap">.*?<\/div>/)![0]
    const anchors = line.match(/<a [^>]*>/g) ?? []
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toContain('href="https://caltopo.com/map.html#ll=46.85173,-121.76040&amp;z=14"')
    expect(line).toContain('14,406 ft')
    expect(line).not.toMatch(/<a [^>]*>[^<]*14,406/)
  })

  it('opens every link in a new tab, with no window handle back', () => {
    const warning: FireWarning = { miles: 1, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = resultPopupHtml({ ...linked, warning })
    const anchors = html.match(/<a /g) ?? []
    // Twenty-three metric values, the warning, the title's link-out glyph
    // and the coordinates.
    expect(anchors.length).toBe(26)
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(26)
    expect(html.match(/target="_blank"/g)?.length).toBe(26)
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

// A colour is a `var(--popup-*)` (#740), whose parentheses a pattern would
// read as a group; every character a pattern gives a meaning is escaped.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
