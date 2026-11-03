import { describe, it, expect } from 'vitest'
import type { DestinationResult } from '../types'
import type { BasemapPoi } from './basemapPoi'
import { FEET_PER_METER } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import type { PendingDestination } from './customList'
import {
  CARD_ACTION_ATTR,
  type CardView,
  cardAction,
  destinationPopupHtml,
  spotPlace,
  subjectPlace,
  subjectPoint,
  subjectType,
} from './destinationCard'
import type { PointSection } from './pointReadout'
import {
  POPUP_BODY_ATTR,
  POPUP_TINT_ATTR,
  colorSwatch,
  escapeHtml,
  pendingValue,
  popupButton,
  row as valueRow,
  sectionHeading,
  updatedLine,
  widestName,
} from './popup/popupChrome'
import { cellTint } from './results/resultsCells'
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
} from './popup/popupChrome'
import { SLOPE_BANDS } from './slopeAngle'
import { ELEVATION_COL, displayedColumns } from './tableColumns'
import { closureWarning, resultRow, series } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'
import outlines from './usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from './usStates'

// Each subject's card, spelled the way a test reads it.
const rankedHtml = ({ rank, row, ...view }: { rank: number | string; row: DestinationResult } & CardView) =>
  destinationPopupHtml({ kind: 'ranked', row, rank }, view)
const pendingHtml = ({ pending, ...view }: { pending: PendingDestination } & CardView) =>
  destinationPopupHtml({ kind: 'pending', pending }, view)
const labelHtml = (poi: BasemapPoi, added: boolean, view: CardView = {}) =>
  destinationPopupHtml({ kind: 'label', poi }, { ...view, added })
const spotHtml = (lat: number, lon: number, sections: readonly PointSection[], view: CardView = {}) =>
  destinationPopupHtml({ kind: 'spot', lat, lon, sections }, view)

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

describe('a ranked card: link out', () => {
  const crag = resultRow({ name: 'Family Wall', type: 'crag', latitude: 47.48886, longitude: -121.75024 })

  it("names a crag's state in its search when the outlines are held, and the name alone before", () => {
    const states = decodeUsStates(outlines as UsStateOutlines)
    expect(rankedHtml({ ...base, row: crag, usStates: states })).toContain(
      'https://www.mountainproject.com/search?q=Family%20Wall%20Washington'
    )
    expect(rankedHtml({ ...base, row: crag })).toContain(
      'https://www.mountainproject.com/search?q=Family%20Wall"'
    )
  })
})

describe('a ranked card: fire warning', () => {
  it('omits the warning line when no fire is nearby', () => {
    const html = rankedHtml({ ...base, warning: null })
    expect(html).not.toContain('⚠️')
  })

  it('renders the ⚠️ and the proximity text when a fire is near', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = rankedHtml({ ...base, warning })
    expect(html).toContain('⚠️')
    expect(html).toContain('>Near a wildfire (Sourdough): 3.2 mi<')
  })

  // One form at every distance: a point inside a perimeter reads 0.0 mi.
  it('phrases an inside-the-perimeter warning at 0.0 mi', () => {
    const warning: FireWarning = { miles: 0, name: 'Bolt Creek', latitude: 0, longitude: 0 }
    const html = rankedHtml({ ...base, warning })
    expect(html).toContain('>Near a wildfire (Bolt Creek): 0.0 mi<')
  })

  // NIFC incident names are third-party strings rendered via setHTML, so the
  // warning line must escape them rather than inject raw markup.
  it('escapes HTML in a third-party incident name', () => {
    const warning: FireWarning = { miles: 0, name: '<img src=x> "&', latitude: 0, longitude: 0 }
    const html = rankedHtml({ ...base, warning })
    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
  })

  // The wildfire flag is a safety statement, not a measurement, so it keeps its
  // amber banner and is the one table column the popup does not mirror (TJ,
  // 2026-09-14). A card that said it twice would be worse at saying it once.
  it('never repeats the warning as a metric line', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = rankedHtml({ ...base, warning })
    expect(html).not.toContain('Wildfire (mi)')
    expect(html.match(/⚠️/g)).toHaveLength(1)
  })
})

// The warnings stand in a section of their own between the header and the
// grid, closed off from the grid by the header's own edge (TJ, 2026-10-08).
describe('a ranked card: warnings section', () => {
  const fire: FireWarning = { miles: 1, name: 'KING', latitude: 47.5, longitude: -121.3 }
  const section = (html: string) =>
    html.match(/<div style="font-size:12px;display:flex;[^"]*border-bottom:1px solid var\(--popup-[\w-]+\)">(.*?)<\/div>(?=\s*<div data-popup-body)/s)
  const glyphs = (html: string) => html.split('⚠️').length - 1

  it('puts both warnings after the header and before the grid, ruled off from it', () => {
    const html = rankedHtml({ ...base, warning: fire, closure: closureWarning() })
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
    const html = rankedHtml({ ...base })
    expect(section(html)).toBeNull()
    expect(glyphs(html)).toBe(0)
  })

  // One glyph for the section, in a column of its own down its right side
  // under the close button, rather than one spending the start of every line.
  it('draws one glyph for the whole section, in a column after the warnings', () => {
    for (const d of [{ warning: fire }, { closure: closureWarning() }, { warning: fire, closure: closureWarning() }]) {
      const html = rankedHtml({ ...base, ...d })
      expect(glyphs(html)).toBe(1)
      expect(section(html)![1]).toMatch(/<span aria-hidden="true" style="flex:none;width:calc\(var\(--popup-close-lane, 2rem\) \+ 2px\);[^"]*">⚠️<\/span>$/)
    }
  })

  // Each warning keeps one line and ends in an ellipsis where it outruns the
  // card, linked or not, so a long order name no longer wraps the card.
  it('keeps every warning to one line, cut with an ellipsis', () => {
    const oneLine = /font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">/g
    expect(rankedHtml({ ...base, warning: fire, closure: closureWarning() }).match(oneLine)).toHaveLength(2)
    expect(rankedHtml({ ...base, closure: closureWarning({ url: null }) }).match(oneLine)).toHaveLength(1)
  })

  // Two warnings are a bulleted list; a lone one is its sentence alone.
  it('bullets two warnings, and leaves a lone one unbulleted', () => {
    const both = section(rankedHtml({ ...base, warning: fire, closure: closureWarning() }))![1]
    expect(both).toMatch(/<ul style="[^"]*list-style:disc[^"]*"><li>.*KING.*<\/li><li>.*Within a closure.*<\/li><\/ul>/s)
    expect(section(rankedHtml({ ...base, closure: closureWarning() }))![1]).not.toContain('<li>')
  })
})

// The closure line follows the fire line in its markup (#550): the approved
// sentence, linked to the order's page when it has one.
describe('a ranked card: closure line', () => {
  it('says nothing without a closure', () => {
    expect(rankedHtml({ ...base, closure: null })).not.toContain('closure (')
  })

  it('links the sentence to the order after the fire line', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 0, longitude: 0 }
    const html = rankedHtml({ ...base, warning, closure: closureWarning() })
    expect(html).toContain('>Within a closure (Probe Fire Closure)</a>')
    expect(html).toContain('href="https://www.fs.usda.gov/r06/alerts/probe"')
    expect(html.indexOf('Sourdough')).toBeLessThan(html.indexOf('Within a closure'))
  })

  it('writes plain text for an order with no page, and escapes the name', () => {
    const html = rankedHtml({ ...base, closure: closureWarning({ url: null, name: '<b>x</b>' }) })
    expect(html).toContain('Within a closure (&lt;b&gt;x&lt;/b&gt;)')
    expect(html).not.toContain('fs.usda.gov')
  })
})

describe('a ranked card: rank prefix', () => {
  it('shows "#N name" for a ranked result', () => {
    const html = rankedHtml({ ...base, rank: 3 })
    expect(html).toMatch(/<strong[^>]*>#3 Mount Rainier<\/strong>/)
  })

  it('drops the "#" for an unranked (searched) destination', () => {
    // The title carries no rank prefix (hex colors elsewhere still use '#').
    const html = rankedHtml({ ...base, rank: '' })
    expect(html).toMatch(/<strong[^>]*>Mount Rainier<\/strong>/)
  })
})

// A finger removes a row through the card its row tap opens (#696), so the
// card carries the clicked feature's remove: its words, its look, its place.
describe('a ranked card: remove', () => {
  it('carries no action unless asked', () => {
    expect(rankedHtml(base)).not.toContain(CARD_ACTION_ATTR)
  })

  it('offers the clicked feature\'s remove, centred under the numbers', () => {
    const html = rankedHtml({ ...base, removable: true })
    const button = html.match(new RegExp(`<button ${CARD_ACTION_ATTR}="remove"[^>]*>([^<]*)</button>`))
    expect(button?.[1]).toBe('Remove from analysis')
    // The same look as the clicked feature's remove: only the attribute differs.
    const poi = labelHtml({ name: 'Mount Rainier', lat: 46.85, lon: -121.76, kind: 'peak' }, true)
    const poiButton = poi.match(new RegExp(`<button ${CARD_ACTION_ATTR}="remove"([^>]*)>`))![1]
    expect(button![0]).toContain(poiButton)
    // On a line of its own at the foot of the card, after the body the scroll
    // cap shortens rather than inside it, so a capped card keeps it in view.
    expect(html).toMatch(
      new RegExp(`<div style="padding:8px 10px;border-top:1px solid ${escapeRegExp(HEADER_EDGE_COLOR)}"><div style="display:flex;justify-content:center"><button ${CARD_ACTION_ATTR}="remove"[^>]*>Remove from analysis</button></div></div>\\s*</div>$`),
    )
    expect(html.indexOf(POPUP_BODY_ATTR)).toBeLessThan(html.indexOf(CARD_ACTION_ATTR))
  })

  // A section of its own (#696): ruled off from the grid by the edge the
  // warnings section wears, with that section's padding above and below, on
  // the narrow map's compact grid and the full one alike.
  it("rules the remove off in a section like the warnings', at both widths", () => {
    const fire: FireWarning = { miles: 1, name: 'KING', latitude: 47.5, longitude: -121.3 }
    for (const compact of [false, true]) {
      const html = rankedHtml({ ...base, compact, removable: true, warning: fire })
      const warnings = html.match(/<div style="font-size:12px;display:flex;align-items:flex-start;padding:(\d+px) 0 (\d+px) 10px;border-bottom:([^"]+)">/)!
      const action = html.match(new RegExp(`<div style="padding:(\\d+px) 10px;border-top:([^"]+)"><div style="display:flex;justify-content:center"><button ${CARD_ACTION_ATTR}`))!
      expect(action[2]).toBe(warnings[3])
      expect(action[2]).toBe(SECTION_EDGE)
      expect([warnings[1], warnings[2]]).toEqual([SECTION_PAD_Y, SECTION_PAD_Y])
      expect(action[1]).toBe(SECTION_PAD_Y)
    }
    // No remove, no rule under the grid.
    expect(rankedHtml({ ...base })).not.toContain('border-top:')
  })
})

// #370: the card shows what the results table shows, in the table's order. It
// used to hold six hard-coded rows, so a Current lookup printed "total",
// "avg", "min" and "max" over four copies of one number and a date-range
// report showed six of the sixteen values the table had.
describe('a ranked card: mirrors the table', () => {
  it('shows every aggregate the table shows over a date range', () => {
    const html = rankedHtml({ ...base })
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
    const html = rankedHtml({ ...base, columns: POINT_COLS })
    // The table drops the aggregate word because every aggregate is the same
    // hour, and the popup follows it. (The facts line under the title joins
    // its parts with the same dot, so the labels alone are read.)
    for (const label of html.match(/<th scope="row"[^>]*>[^<]*</g) ?? []) expect(label).not.toContain(SEP)
    expect(html).toContain(`${NOUN.temp} (°F)`)
    // One line per family, each a label and its value, and no aggregate
    // columns to head, because every family is one number.
    expect(html.match(/<th scope="row"/g) ?? []).toHaveLength(7)
    expect(html).not.toContain('scope="col"')
  })

  // A to Z whatever the ranking (TJ, 2026-10-08).
  it('lists the families alphabetically, whatever the ranking', () => {
    for (const sortBy of ['aqi_max', 'wind_max_mph', 'precip_total_in'] as const) {
      const html = rankedHtml({ ...base, columns: displayedColumns(false, sortBy) })
      const labels = [...html.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
      expect(labels[0]).toBe(NOUN.aqi)
    }
  })

  // A grid: a row per family, a column per aggregate, the aggregate words said
  // once at the top rather than on every family (TJ, 2026-10-08), which is what
  // keeps the card short enough to stand beside a phone's controls.
  it('lays the families out as a grid, one row each', () => {
    const html = rankedHtml({ ...base })
    // In the table's order, Avg first by default (record 0257).
    const heads = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)/g)].map((m) => m[1])
    expect(heads).toEqual(['Avg', 'Min', 'Max', 'Total'])
    // The heads lead the grid, above the first family.
    expect(html.indexOf('scope="col"')).toBeLessThan(html.indexOf('scope="row"'))
    // The temperature's three numbers stand under those three heads, in order.
    const temp = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.temp} \\(°F\\)</th>(.*?)</tr>`))![1]
    expect([...temp.matchAll(/>([\d.,]+)</g)].map((m) => m[1])).toEqual(['30.1', '21.4', '38.9'])
    // One line for each of the seven families, precipitation and snowfall
    // included.
    expect(html.match(/<th scope="row"/g) ?? []).toHaveLength(7)
  })

  // The grid keeps one order for every family, the first family's, so every
  // family's Avg stands under the one Avg head.
  it('keeps one aggregate order for every family', () => {
    const html = rankedHtml({ ...base, columns: displayedColumns(false, 'aqi_avg') })
    const aqi = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.aqi}</th>(.*?)</tr>`))![1]
    expect([...aqi.matchAll(/>(\d+)</g)].map((m) => m[1])).toEqual(['24', '11', '31'])
  })

  // Precipitation and snowfall (#678) are the families whose columns do not
  // share a unit. Each is one line labelled with its rate, and its window
  // total stands last under the Total head with no unit of its own (TJ,
  // 2026-10-08).
  it('gives a mixed family one line with its total last', () => {
    const html = rankedHtml({ ...base })
    expect(html).toContain(`>${NOUN.snowfall} (in/hr)</th>`)
    const precip = html.match(new RegExp(`<tr><th scope="row"[^>]*>${NOUN.precip} \\(in/hr\\)</th>(.*?)</tr>`))![1]
    expect([...precip.matchAll(/>([\d.]+)</g)].map((m) => m[1])).toEqual(['0.004', '0.000', '0.009', '0.123'])
    expect(html).not.toContain('Total</span>:')
    expect(html).not.toContain(' in<')
  })

  // A number never wraps: only the label column gives way, so a value and its
  // unit stay one thing. Unprotected, the old values line broke between
  // "0.000" and "in/hr" and left a bare unit on the next line.
  it('never breaks a line inside one measurement', () => {
    const html = rankedHtml({ ...base })
    // Every cell holding a number; the empty corner over the labels holds none.
    const cells = html.match(/<td [^>]*>(?=<a |<span )/g) ?? []
    expect(cells.length).toBeGreaterThan(20)
    for (const cell of cells) expect(cell).toContain('white-space:nowrap')
  })
})

// TJ moved these above the rule on 2026-09-14: all three identify the point
// rather than measure it, so the rule now parts what a destination IS from what
// the forecast says about it.
describe('a ranked card: identity band', () => {
  // On the header band, above the body, which the band's edge and shadow part
  // from it (TJ, 2026-10-08) where other popups draw a rule.
  it('puts the type and the coordinates on the header band, above the body', () => {
    const html = rankedHtml({ ...base })
    const body = html.indexOf('data-popup-body')
    expect(html).not.toContain('<hr')
    expect(html.indexOf(HEADER_BAND_COLOR)).toBeLessThan(html.indexOf('Peak'))
    expect(html.indexOf('Peak')).toBeLessThan(body)
    expect(html.indexOf('46.85173, -121.76040')).toBeLessThan(body)
  })

  // The coordinates alone under the name, then the type, the elevation and
  // the slope, parted by a dot a screen reader skips (TJ, 2026-10-31, #832).
  // Neither line wraps: a latitude and a longitude are one value in two
  // halves, and a break between them leaves a bare negative number looking
  // like a third figure.
  it('puts the coordinates, then the type and elevation, on unlabelled lines', () => {
    const html = rankedHtml({ ...base })
    expect(factsText(html)).toBe('46.85173, -121.76040 / Peak · 14,406 ft')
    expect(html).not.toContain('Coordinates')
    expect(html).not.toContain('Elevation (ft)')
  })

  it('leaves the elevation off the line when the place has none', () => {
    const html = rankedHtml({ ...base, row: { ...base.row, elevation_ft: null } })
    expect(factsText(html)).toBe('46.85173, -121.76040 / Peak')
  })

  // The slope at the marker's point, after its elevation (#832).
  it('says the slope and the way the ground falls after the elevation', () => {
    const ground = { kind: 'read', reading: { elevationM: 4391, degrees: 12.3, aspect: 90 } } as const
    expect(factsText(rankedHtml({ ...base, ground }))).toBe('46.85173, -121.76040 / Peak · 14,406 ft · 12° E')
  })

  // The pair links to CalTopo centred on the point, one level above the
  // map's zoom (#712); the elevation beside it links nowhere.
  it('links the coordinates to CalTopo at the view the map is showing', () => {
    const html = rankedHtml({ ...base, mapZoom: 13 })
    expect(html).toContain('href="https://caltopo.com/map.html#ll=46.85173,-121.76040&amp;z=14"')
    expect(html).not.toMatch(/<a [^>]*>[^<]*14,406/)
  })

  it('names no model while one model answered every row', () => {
    const html = rankedHtml({ ...base, modelFallbackLabel: 'GFS Seamless' })
    expect(html).not.toContain('GFS Seamless')
  })
})

// The label/value split is carried on two axes since TJ's 2026-09-14 call: the
// label is stepped back in colour and the value is monospace.
describe('a ranked card: type', () => {
  it('sets values in a monospace face and labels in a stepped-back colour', () => {
    const html = rankedHtml({ ...base })
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
    const html = rankedHtml({ ...base })
    expect(html.match(/<strong[ >]/g)).toHaveLength(1)
    expect(html.indexOf('<strong')).toBeLessThan(html.indexOf('Mount Rainier'))
  })

  // Colour rather than weight for a label, because a weight step does not
  // read alike in every face. See LABEL_COLOR for the measurement. The column
  // heads are the one exception: bold, a size under the title, so they read
  // as the grid's heads rather than as one more label (TJ, 2026-10-08).
  it('keeps every label regular and only the column heads bold', () => {
    const html = rankedHtml({ ...base })
    const rowHeads = html.match(/<th scope="row" style="[^"]*"/g) ?? []
    expect(rowHeads.length).toBeGreaterThan(0)
    for (const th of rowHeads) expect(th).toContain('font-weight:normal')
    const colHeads = html.match(/<th scope="col" [^>]*?style="[^"]*"/g) ?? []
    expect(colHeads).toHaveLength(4)
    for (const th of colHeads) expect(th).toContain('font-weight:600')
  })
})

// The card marks the number the report ranks by, bold on a cell one slate
// darker than its column (TJ, 2026-10-08), and narrows its bands on a map
// too narrow for them.
describe('a ranked card: ranked number and insets', () => {
  // The ranked family wears the table's colours (#740), each number on its
  // own column's scale, and the ranked number alone is bold.
  it('bolds the ranked number and colours its family as the table does', () => {
    const columns = displayedColumns(false, 'wind_max_mph')
    const html = rankedHtml({ ...base, columns, rankedBy: 'wind_max_mph' })
    const bold = [...html.matchAll(/<span style="[^"]*font-weight:600[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(bold).toEqual(['41.8'])
    const tinted = [...html.matchAll(new RegExp(`<td ${POPUP_TINT_ATTR} style="[^"]*;background:([^;]+);--tint-dark:([^;]+);--tint-light:([^;]+);`, 'g'))]
    // The grid's column order, which follows the table's (record 0257).
    const token = { Min: 'min', Max: 'max', Avg: 'avg' } as Record<string, string>
    const wind = [...html.matchAll(/data-agg="([^"]+)"/g)]
      .map((m) => `wind_${token[m[1]]}_mph` as 'wind_min_mph')
      .filter((k) => columns.some((c) => c.key === k))
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
    const html = rankedHtml({ ...base })
    expect(html).not.toContain(`;background:${GRID_RANKED_COLOR}`)
    expect(html).not.toContain(POPUP_TINT_ATTR)
  })

  it('takes the compact insets when asked', () => {
    expect(rankedHtml({ ...base, compact: true })).toContain(`padding:1px ${GRID_COMPACT_INSET_PX}px`)
    expect(rankedHtml({ ...base })).toContain(`padding:1px ${GRID_INSET_PX}px`)
  })
})

// OSM supplies destination names, which makes them third-party text on its way
// to setHTML exactly like the NIFC incident name the warning line carries.
describe('a ranked card: escaping', () => {
  it('escapes HTML in a destination name', () => {
    const html = rankedHtml({ ...base, row: { ...row, name: '<img src=x> "&' } })
    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
  })
})

describe('a ranked card: links out', () => {
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
    const html = rankedHtml({ ...linked })
    expect(html).toContain('https://www.windy.com/?gfs,rain,')
    expect(html).toContain('https://www.windy.com/?gfs,wind,')
    expect(html).toContain('https://www.windy.com/?gfs,temp,')
    expect(html).toContain('https://www.windy.com/?gfs,deg0,')
    expect(html).toContain('https://www.windy.com/?gfs,pm2p5,')
  })

  // The same split the table makes: a window total or an average is every hour
  // at once, so only a floor or a ceiling carries one.
  it('carries the hour behind a floor or a ceiling, and no other', () => {
    const html = rankedHtml({ ...linked })
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
    const html = rankedHtml(bare)
    expect(html).not.toContain('deg0')
    expect(html).toContain('N/A')
  })

  // A popup built before an analysis knows a model still links the way it
  // always did: a coordinate and a layer.
  it('falls back to the coordinate and the layer with no model', () => {
    const html = rankedHtml({ ...base })
    expect(html).toContain('https://www.windy.com/?rain,46.8517,-121.7604,11')
  })

  it('links the whole wildfire warning to the fire on the NIFC map', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = rankedHtml({ ...linked, warning })
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
    const html = rankedHtml({ ...linked, mapZoom: 13 })
    const line = html.match(/(<div style="white-space:nowrap">.*?<\/div>)+/)![0]
    const anchors = line.match(/<a [^>]*>/g) ?? []
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toContain('href="https://caltopo.com/map.html#ll=46.85173,-121.76040&amp;z=14"')
    expect(line).toContain('14,406 ft')
    expect(line).not.toMatch(/<a [^>]*>[^<]*14,406/)
  })

  it('opens every link in a new tab, with no window handle back', () => {
    const warning: FireWarning = { miles: 1, name: 'Sourdough', latitude: 48.8, longitude: -121.1 }
    const html = rankedHtml({ ...linked, warning })
    const anchors = html.match(/<a /g) ?? []
    // Twenty-three metric values, the warning, the title's link-out glyph
    // and the coordinates.
    expect(anchors.length).toBe(26)
    expect(html.match(/rel="noopener noreferrer"/g)?.length).toBe(26)
    expect(html.match(/target="_blank"/g)?.length).toBe(26)
  })
})

// A pending dot's card (#832): the ranked card's header with no rank and no
// grid, and the table's × as its button where the table has one.
describe('a pending card', () => {
  const at = { name: 'Camp Muir', latitude: 46.83545, longitude: -121.73231, elevation_ft: 10080 }

  it('says what is known of the destination, and no forecast', () => {
    const ground = { kind: 'read', reading: { elevationM: 3072, degrees: 21.5, aspect: 180 } } as const
    const html = pendingHtml({ pending: { ...at, source: 'csv' }, ground })
    expect(html).toContain('Camp Muir')
    expect(factsText(html)).toBe('46.83545, -121.73231 / 10,080 ft · 21° S')
    expect(html).not.toContain('<table')
  })

  it("names a found or searched destination's type in the Type column's word", () => {
    expect(factsText(pendingHtml({ pending: { ...at, kind: 'peak', source: 'polygon' } }))).toBe(
      '46.83545, -121.73231 / Peak · 10,080 ft',
    )
    expect(factsText(pendingHtml({ pending: { ...at, kind: 'volcano', source: 'search' } }))).toBe(
      '46.83545, -121.73231 / Peak · 10,080 ft',
    )
  })

  // Every pending row's × leaves the analysis, whatever named it (TJ,
  // 2026-11-03), and the card says so as its button.
  it('offers the remove on every pending destination, as its table row does', () => {
    for (const source of ['search', 'csv', 'polygon'] as const) {
      expect(pendingHtml({ pending: { ...at, source } })).toContain(
        popupButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove from analysis'),
      )
    }
  })

  // With nothing under the band, the button stands alone in the body, centred
  // (record 0139), where a foot's rule would draw a second line under the first.
  it('centres the lone button in the body', () => {
    expect(pendingHtml({ pending: { ...at, source: 'csv' } })).toMatch(
      new RegExp(`<div style="display:flex;justify-content:center"><button ${CARD_ACTION_ATTR}="remove"`),
    )
  })

  // A pasted or clicked spot is named by its pair, which stood as the title
  // and again as the first fact (TJ, 2026-11-03): once, as the spot card's.
  it('says a coordinate-named destination\'s pair once, as the title, opening CalTopo', () => {
    const ground = { kind: 'read', reading: { elevationM: 1800, degrees: 14.2, aspect: 45 } } as const
    const spot = { name: '48.07030, -121.07337', latitude: 48.0703, longitude: -121.07337, kind: 'coordinates' }
    for (const html of [
      pendingHtml({ pending: { ...spot, source: 'search' }, ground }),
      rankedHtml({ rank: 1, row: resultRow({ ...spot, type: 'coordinates', elevation_ft: null }), ground, columns: [] }),
    ]) {
      expect(html.split('48.07030, -121.07337')).toHaveLength(2)
      expect(html).toContain('aria-label="Open in CalTopo"')
      expect(html).toContain('href="https://caltopo.com/map.html#ll=48.07030,-121.07337"')
      expect(markupText(html)).toMatch(/Coordinates\s*·\s*14° NE/)
    }
  })

  it('escapes the name', () => {
    const html = pendingHtml({ pending: { ...at, name: '<img src=x>', source: 'csv' } })
    expect(html).not.toContain('<img')
  })
})

// #457: a marker's headings are the bare noun and unit, the same words the
// table's headers use. The datum both once carried is gone for the reason
// tableColumns.test.ts records, and the popup reads the columns it is handed,
// so this pins that nothing here adds one back.
describe('a ranked card: names no datum', () => {
  it('carries no datum in any heading', () => {
    const html = rankedHtml({
      ...base,
      columns: displayedColumns(false, 'precip_total_in'),
    })
    expect(html).not.toMatch(/\bat (elevation|\d+ meters)\b/)
  })
})

const RAINIER = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }

// A clicked label's card (#712): the card a ranked result wears, with the
// place's way in or out as its one button.
describe('a label card', () => {
  // The kind in the word the Type column will use once the place is
  // analyzed, so OSM's "volcano" reads as the table's "Peak". Both cards
  // describe the same mountain, so they say its height one way: "14,410 ft"
  // on the facts line, never the "Elevation (ft): 14,410" row this card used
  // to carry under a rule.
  it("says what the feature is on the facts line, in the Type column's word", () => {
    const html = labelHtml(RAINIER, false)
    expect(html).toContain('Mount Rainier')
    expect(factsText(html)).toBe('46.85290, -121.76040 / Peak · 14,410 ft')
    expect(html).not.toContain('volcano')
    expect(html).not.toContain(ELEVATION_COL.label)
  })

  // The glyph shows no site, so its link's name says which (#738).
  it('names the link out for a screen reader by the site it opens', () => {
    expect(labelHtml(RAINIER, false)).toContain('aria-label="View on Peakbagger"')
    expect(labelHtml({ ...RAINIER, kind: 'water' }, false)).toContain('aria-label="View on OpenStreetMap"')
  })

  // The add and the remove are one button, the panel's accent (#786, record
  // 0215), so the two states of one place say "in" and "out" in one look.
  it('dresses both its buttons as the one popup button', () => {
    expect(labelHtml(RAINIER, false)).toContain(popupButton(`${CARD_ACTION_ATTR}="add"`, 'Add to analysis'))
    expect(labelHtml(RAINIER, true)).toContain(popupButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove from analysis'))
  })

  // The result card's own dress (TJ, 2026-10-14): the header band in place of
  // a rule, the link out beside the name, and the facts on the band above the
  // body, which holds the button alone, centred.
  it('wears the result card, band and all, with the button centred in the body', () => {
    const html = labelHtml(RAINIER, false)
    expect(html).toContain(HEADER_BAND_COLOR)
    expect(html).not.toContain('<hr')
    expect(html).toContain('peakbagger.com')
    expect(html.indexOf('46.85290, -121.76040')).toBeLessThan(html.indexOf(POPUP_BODY_ATTR))
    expect(html.indexOf(POPUP_BODY_ATTR)).toBeLessThan(html.indexOf(`${CARD_ACTION_ATTR}="add"`))
    expect(html).toMatch(new RegExp(`<div style="display:flex;justify-content:center"><button ${CARD_ACTION_ATTR}="add"`))
  })

  // A latitude and a longitude are one value in two halves; breaking between
  // them leaves a bare negative number looking like a third figure.
  it('keeps the coordinate pair on one line', () => {
    expect(labelHtml(RAINIER, false)).toContain('white-space:nowrap')
  })

  // The pair links to CalTopo at the map's view, as a ranked result's does
  // (#712); a card built with no map under it links without a zoom.
  it('links the coordinates to CalTopo', () => {
    expect(labelHtml(RAINIER, false, { mapZoom: 13 })).toContain(
      'href="https://caltopo.com/map.html#ll=46.85290,-121.76040&amp;z=14"',
    )
    expect(labelHtml(RAINIER, false)).toContain('href="https://caltopo.com/map.html#ll=46.85290,-121.76040"')
  })

  it('links a lake to OpenStreetMap rather than Peakbagger', () => {
    const html = labelHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)
    expect(html).toContain('openstreetmap.org')
    expect(html).not.toContain('peakbagger.com')
  })

  // A trailhead from the pod's landmarks brings its OSM id, so it links to
  // that object; a crag goes to Mountain Project by name, as its row does
  // (#734).
  it('links a trailhead to its OSM object and a crag to Mountain Project', () => {
    const trailhead = labelHtml(
      { name: 'Mailbox Peak Trailhead', kind: 'trailhead', lat: 47.4875, lon: -121.7437, osmId: 'node/4578891234' },
      false,
    )
    expect(trailhead).toContain('href="https://www.openstreetmap.org/node/4578891234"')
    expect(factsText(trailhead)).toBe('47.48750, -121.74370 / Trailhead')
    const crag = labelHtml(
      { name: 'Lower Town Wall', kind: 'crag', lat: 47.8208, lon: -121.5555, osmId: 'relation/1234' },
      false,
    )
    expect(crag).toContain('https://www.mountainproject.com/search?q=Lower%20Town%20Wall')
    expect(crag).toContain('aria-label="View on Mountain Project"')
    expect(factsText(crag)).toBe('47.82080, -121.55550 / Crag')
  })

  it("names a crag's state in its search when the outlines are held", () => {
    const usStates = decodeUsStates(outlines as UsStateOutlines)
    const crag = labelHtml(
      { name: 'Lower Town Wall', kind: 'crag', lat: 47.8208, lon: -121.5555, osmId: 'relation/1234' },
      false,
      { usStates },
    )
    expect(crag).toContain('https://www.mountainproject.com/search?q=Lower%20Town%20Wall%20Washington')
  })

  // Most lakes and many summits carry no `ele` tag; the fact goes away rather
  // than printing a dash, because nothing was measured and failed.
  it('drops the elevation from the facts line when the tile carries none', () => {
    const html = labelHtml({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 }, false)
    expect(factsText(html)).toBe('47.40000, -121.40000 / Lake')
    expect(html).not.toContain('Elevation')
  })

  // The slope at the place's point, after its elevation (#832, TJ 2026-10-31).
  it('says the slope and the way the ground falls after the elevation', () => {
    const ground = { kind: 'read', reading: { elevationM: 2198, degrees: 33.1, aspect: 315 } } as const
    expect(factsText(labelHtml(RAINIER, false, { ground }))).toBe('46.85290, -121.76040 / Peak · 14,410 ft · 33° NW')
  })

  // OSM names are third-party text reaching setHTML, same as the NIFC incident
  // names the wildfire popup escapes.
  it('escapes the name', () => {
    const html = labelHtml({ name: '<img src=x onerror=alert(1)>', kind: 'peak', lat: 0, lon: 0 }, false)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

// A click on bare map (#832, TJ 2026-11-03): the spot's own card.
describe('a spot card', () => {
  // The title is the pair, and its glyph opens CalTopo there (TJ, 2026-10-30).
  it('titles the card with the coordinates and links them to CalTopo', () => {
    const html = spotHtml(48.79012, -121.83211, [], { mapZoom: 13 })
    expect(markupText(html)).toContain('48.79012, -121.83211')
    expect(html).toContain(`href="${escapeHtml(caltopoUrl(48.79012, -121.83211, 13))}"`)
    expect(html).toContain('aria-label="Open in CalTopo"')
  })

  it('offers to add the point, and once added to take it back out', () => {
    expect(spotHtml(48.79012, -121.83211, [])).toContain(popupButton(`${CARD_ACTION_ATTR}="add"`, 'Add to analysis'))
    expect(spotHtml(48.79012, -121.83211, [], { added: true })).toContain(
      popupButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove from analysis'),
    )
  })

  // A point is forecast by adding it and pressing Analyze (TJ, 2026-10-31).
  it('carries no forecast', () => {
    expect(spotHtml(48.79012, -121.83211, [])).not.toContain('<table')
  })
})

// The ground under a spot's title, layout 1 (TJ, 2026-10-30): `8,412 ft · [swatch] 38° NE`.
describe("a spot card's ground", () => {
  const read = (degrees: number, aspect: number | null) =>
    spotHtml(48.79012, -121.83211, [], {
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
    expect(spotHtml(48.79012, -121.83211, [], { ground: { kind: 'pending' } })).toContain(pendingValue())
    expect(spotHtml(48.79012, -121.83211, [], { ground: { kind: 'none' } })).toBe(spotHtml(48.79012, -121.83211, []))
  })
})

// What the pictures painted at the spot (#737), each a section under the
// band, layout C1 (TJ, 2026-11-03): its name, its values, and where and when
// it was measured in the fine print at its foot.
describe("a spot card's sections", () => {
  // The text a reader reads, a space between blocks: `markupText` joins
  // adjacent block elements with nothing between them.
  const text = (html: string) => markupText(html.split('</div>').join('</div> ')).replace(/\s+/g, ' ').trim()
  const rain: PointSection = {
    layer: 'Rain radar',
    title: 'Light precipitation',
    source: 'NEXRAD radar',
    rows: [valueRow('Rate', '~0.02 in/h'), valueRow('Reflectivity', '16.5 dBZ')],
    when: '10 min ago',
  }
  const snow: PointSection = {
    layer: 'Snow depth',
    title: 'Very deep snow',
    source: 'NOAA snow analysis',
    rows: [valueRow('Depth', '151 in'), valueRow('Snow water equivalent', '83 in')],
    when: 'Oct 16, 2026, 5:00 AM',
  }
  const body = (html: string) => text(html.slice(html.indexOf(POPUP_BODY_ATTR)))

  // The heading names the layer first, so a reader knows what `Weak radar
  // echo` is a reading of (TJ, 2026-11-03).
  it("opens a section on its layer's name and its reading, its values under it, and its source and time at its foot", () => {
    const html = spotHtml(48.79012, -121.83211, [rain])
    expect(html).toContain(sectionHeading('Rain radar: Light precipitation'))
    expect(html).toContain(updatedLine('10 min ago', 'NEXRAD radar'))
    expect(body(html)).toMatch(/Rain radar: Light precipitation Rate: ~0.02 in\/h Reflectivity: 16.5 dBZ NEXRAD radar: 10 min ago/)
  })

  // Both pictures under one click, each section on its own name and ruled
  // off from the one above it, so the rain's values cannot be read as the
  // snow's (TJ, 2026-10-16).
  it('rules each later section off from the one above it', () => {
    const html = spotHtml(48.79012, -121.83211, [rain, snow])
    expect(body(html)).toMatch(/Rain radar: Light precipitation .* NEXRAD radar: 10 min ago .*Snow depth: Very deep snow .* NOAA snow analysis: Oct 16, 2026, 5:00 AM/)
    expect(html.split(`border-top:${SECTION_EDGE}`).length - spotHtml(48.79012, -121.83211, [rain]).split(`border-top:${SECTION_EDGE}`).length).toBe(1)
  })

  // A section that holds a failure has no time to give.
  it('leaves the fine print off a section with no time', () => {
    const html = spotHtml(48.79012, -121.83211, [{ ...rain, when: undefined }])
    expect(html).not.toContain('NEXRAD radar:')
  })

  // The section has its body, so the button is ruled off in a foot of its
  // own after it (#696), as a ranked card's is.
  it('puts the button in the foot under the sections', () => {
    const html = spotHtml(48.79012, -121.83211, [rain])
    expect(html.indexOf('NEXRAD radar: 10 min ago')).toBeLessThan(html.indexOf(`${CARD_ACTION_ATTR}="add"`))
    expect(html).toMatch(new RegExp(`border-top:[^"]+"><div style="display:flex;justify-content:center"><button ${CARD_ACTION_ATTR}="add"`))
  })

  // A section the forecast player renames keeps its card one width (#752).
  it('sizes a heading that can change to the widest of its names', () => {
    const NAMES = ['Light precipitation', 'Very heavy precipitation', 'No radar echo']
    const html = spotHtml(48.79012, -121.83211, [{ ...rain, titles: NAMES }])
    expect(html).toContain(sectionHeading(`Rain radar: ${widestName('Light precipitation', NAMES)}`))
    expect(spotHtml(48.79012, -121.83211, [rain])).not.toContain('inline-grid')
  })
})

describe('what a subject is', () => {
  const pending = (over: Partial<PendingDestination>): PendingDestination => ({
    name: 'Camp Muir',
    latitude: 46.83545,
    longitude: -121.73231,
    source: 'csv',
    ...over,
  })

  // The coordinate the reader saw on the card, to the metre, is the one the
  // destination carries into the table and the share link.
  it('registers a spot at the five decimals its title shows', () => {
    expect(spotPlace(48.790123456, -121.832114999)).toEqual({
      label: '48.79012, -121.83211',
      description: '',
      kind: 'coordinates',
      lat: 48.79012,
      lon: -121.83211,
    })
    const spot = { kind: 'spot', lat: 48.790123456, lon: -121.832114999, sections: [] } as const
    expect(subjectPlace(spot)).toEqual(spotPlace(48.790123456, -121.832114999))
    expect(subjectPoint(spot)).toEqual({ lat: 48.79012, lon: -121.83211 })
  })

  it('registers a label as a search by name does, and nothing for a row already in', () => {
    expect(subjectPlace({ kind: 'label', poi: RAINIER })).toMatchObject({ label: 'Mount Rainier', lat: 46.8529, lon: -121.7604 })
    expect(subjectPlace({ kind: 'pending', pending: pending({}) })).toBeNull()
    expect(subjectPlace({ kind: 'ranked', row: resultRow(), rank: 1 })).toBeNull()
  })

  // A row in the analysis offers its way out; a place outside it its way in,
  // or its way back out once added.
  it('gives every card one button, and a ranked card one only on a map', () => {
    expect(cardAction({ kind: 'ranked', row: resultRow(), rank: 1 }, {})).toBeNull()
    expect(cardAction({ kind: 'ranked', row: resultRow(), rank: 1 }, { removable: true })).toBe('remove')
    expect(cardAction({ kind: 'pending', pending: pending({}) }, {})).toBe('remove')
    expect(cardAction({ kind: 'label', poi: RAINIER }, {})).toBe('add')
    expect(cardAction({ kind: 'label', poi: RAINIER }, { added: true })).toBe('remove')
  })

  it('names the row type it is, or will be', () => {
    expect(subjectType({ kind: 'label', poi: RAINIER })).toBe('peak')
    expect(subjectType({ kind: 'pending', pending: pending({ kind: 'crag', source: 'polygon' }) })).toBe('crag')
    expect(subjectType({ kind: 'pending', pending: pending({}) })).toBe('custom')
    expect(subjectType({ kind: 'spot', lat: 0, lon: 0, sections: [] })).toBeNull()
  })
})


/**
 * The facts lines' text as a reader sees it, a slash between lines and each hidden dot spaced the
 * way the eye reads it. Read from the text runs between tags rather than by
 * deleting tags, so nothing here looks like a sanitizer to CodeQL.
 */
function factsText(html: string): string {
  return [...html.matchAll(/<div style="white-space:nowrap">(.*?)<\/div>/g)]
    .map(([, line]) =>
      [...`>${line}<`.matchAll(/>([^<]*)</g)].map((m) => (m[1] === '·' ? ' · ' : m[1])).join(''),
    )
    .join(' / ')
}

// A colour is a `var(--popup-*)` (#740), whose parentheses a pattern would
// read as a group; every character a pattern gives a meaning is escaped.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
