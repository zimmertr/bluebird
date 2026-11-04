import { describe, it, expect } from 'vitest'
import type { DestinationResult } from '../types'
import type { BasemapPoi } from './basemapPoi'
import { FEET_PER_METER } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import type { PendingDestination } from './customList'
import {
  CARD_ACTION_ATTR,
  type CardView,
  FORECAST_SECTION,
  cardAction,
  destinationPopupHtml,
  sectionOpen,
  spotPlace,
  subjectPlace,
  subjectPoint,
  subjectType,
} from './destinationCard'
import type { PointSection } from './pointReadout'
import {
  CARD_FOLD_ATTR,
  CARD_RESIZE_ATTR,
  POPUP_BODY_ATTR,
  POPUP_TINT_ATTR,
  colorSwatch,
  escapeHtml,
  cardButton,
  pendingValue,
  row as valueRow,
  sectionHeading,
  updatedAt,
  updatedLine,
  warningLine,
  widestName,
} from './popup/popupChrome'
import { cellTint } from './results/resultsCells'
import type { ModelRow } from './model/modelCompare'
import { FAMILY_KEYS, NOUN, SEP } from '../metrics'
import {
  GRID_COMPACT_INSET_PX,
  GRID_INSET_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  INK_COLOR,
  LABEL_COLOR,
  SECTION_GAP,
  WARNING_BAND_COLOR,
  WARNING_COLOR,
} from './popup/popupChrome'
import { WARNING_MARK } from './fireProximity'
import { SLOPE_BANDS } from './slopeAngle'
import { ELEVATION_COL, MODEL_COL, displayedColumns } from './tableColumns'
import { resultRow, series } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'
import outlines from './usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from './usStates'

// A card's one button in its title row, after the name and its link, where
// it stood in a foot under the body until 2026-11-04 (TJ, the lab's
// treatment 6). The row holds no `</div>` until it ends.
const inTitleRow = (action: 'add' | 'remove') =>
  new RegExp(`<strong[^>]*>(?:(?!</div>).)*</strong>(?:(?!</div>).)*<button type="button" ${CARD_ACTION_ATTR}="${action}"`)

// Each subject's card, spelled the way a test reads it.
const rankedHtml = ({ rank, row, ...view }: { rank: number | string; row: DestinationResult } & CardView) =>
  destinationPopupHtml({ kind: 'ranked', row, rank }, view)
const pendingHtml = ({ pending, ...view }: { pending: PendingDestination } & CardView) =>
  destinationPopupHtml({ kind: 'pending', pending }, view)
const labelHtml = (poi: BasemapPoi, added: boolean, view: CardView = {}) =>
  destinationPopupHtml({ kind: 'label', poi }, { ...view, added })
const spotHtml = (lat: number, lon: number, sections: readonly PointSection[], view: CardView = {}) =>
  destinationPopupHtml({ kind: 'spot', lat, lon }, { ...view, sections })

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

const base = { rank: 1, row, columns: WINDOW_COLS }

// What three layers say at a point (#832), as the readers hand them over:
// every string already escaped, a fire's name linked out, a closure's type
// in the warning amber, and both a warning, which the radar is not.
const FIRE: PointSection = {
  kind: 'fire',
  layer: 'Active wildfire',
  warning: true,
  title: 'Bolt Creek',
  link: { href: 'https://data-nifc.opendata.arcgis.com/explore?location=47.80000,-121.30000,10', label: 'View on NIFC map' },
  source: 'NIFC',
  rows: [valueRow('Distance', '3.2 mi NW'), valueRow('Size', '10 acres')],
  when: 'Jul 17, 2026, 5:00 AM',
}
const CLOSURE: PointSection = {
  kind: 'closure-area',
  layer: 'Area closure',
  warning: true,
  title: 'Probe Fire Closure',
  warn: 'Safety Closure',
  source: 'US Forest Service',
  rows: [valueRow('Forest', 'Columbia River Gorge NSA')],
}
const RADAR: PointSection = {
  kind: 'radar',
  layer: 'Rain radar',
  title: 'Light precipitation',
  source: 'NEXRAD radar',
  rows: [valueRow('Rate', '~0.02 in/h')],
  when: '10 min ago',
}

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

  it('offers the clicked feature\'s remove, in its title row', () => {
    const html = rankedHtml({ ...base, removable: true })
    expect(html).toContain(cardButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove', 'Remove from analysis'))
    // The same button as the clicked feature's remove, word, name and look.
    const poi = labelHtml({ name: 'Mount Rainier', lat: 46.85, lon: -121.76, kind: 'peak' }, true)
    expect(poi).toContain(cardButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove', 'Remove from analysis'))
    // Beside the name, left of the ×, ahead of the body, so a capped card
    // keeps it in view with its name (TJ, 2026-11-04).
    expect(html).toMatch(inTitleRow('remove'))
    expect(html.indexOf(CARD_ACTION_ATTR)).toBeLessThan(html.indexOf(POPUP_BODY_ATTR))
  })

  // The foot that held it is gone, on the narrow map's compact grid and the
  // full one alike: nothing under the band is ruled off, and the card ends
  // on its body and the resize handle.
  it('rules nothing off under the sections, at both widths', () => {
    for (const compact of [false, true]) {
      const html = rankedHtml({ ...base, compact, removable: true, sections: [FIRE] })
      expect(html).not.toContain('border-top:')
      expect(html).toMatch(new RegExp(`</table>.*</div></div><span ${CARD_RESIZE_ATTR}[^>]*><svg[^>]*>(?:<line [^>]*/>)+</svg></span>\\s*</div>$`, 's'))
    }
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

  // The forecast section's heading names it instead (#832).
  it('names no model on the band while one model answered every row', () => {
    const html = rankedHtml({ ...base, modelFallbackLabel: 'GFS Seamless' })
    expect(html.slice(0, html.indexOf(POPUP_BODY_ATTR))).not.toContain('GFS Seamless')
  })
})

// The label/value split is carried on three axes since TJ's 2026-11-04 call,
// as a section row's is: the label the ink at 600, the value monospace at 400
// in the label's grey.
describe('a ranked card: type', () => {
  it('sets values in a monospace face in the grey and labels in the ink', () => {
    const html = rankedHtml({ ...base })
    const values = html.match(/<span style="font-family:ui-monospace[^"]*">[^<]*<\/span>/g) ?? []
    // Twenty-three metric values, the elevation and the coordinates.
    expect(values).toHaveLength(25)
    // A label that wandered inside a value span would read as part of the
    // number and defeat the whole split.
    for (const value of values) {
      expect(value.replace(/^<span style="[^"]*">/, '')).not.toContain(':')
    }
    expect(html).toMatch(new RegExp(`<th scope="row" style="[^"]*${escapeRegExp(INK_COLOR)}[^"]*">${NOUN.temp} \\(°F\\)</th>`))
    const temp = html.match(new RegExp(`<th scope="row"[^>]*>${NOUN.temp} \\(°F\\)</th>(.*?)</tr>`))![1]
    for (const td of temp.match(/<td [^>]*style="[^"]*"/g) ?? []) expect(td).toContain(LABEL_COLOR)
  })

  // The popup's only bold is its title. Precip-total and AQI-avg wore
  // <strong> from the original implementation onward, singling out two values
  // by no rule.
  it('bolds the name and nothing else', () => {
    const html = rankedHtml({ ...base })
    expect(html.match(/<strong[ >]/g)).toHaveLength(1)
    expect(html.indexOf('<strong')).toBeLessThan(html.indexOf('Mount Rainier'))
  })

  // Every head is a key, the ink at 600, as a section row's key is (TJ,
  // 2026-11-04): the families down the side and the aggregates across the
  // top alike.
  it('sets every head in the ink at 600', () => {
    const html = rankedHtml({ ...base })
    const rowHeads = html.match(/<th scope="row" style="[^"]*"/g) ?? []
    expect(rowHeads.length).toBeGreaterThan(0)
    for (const th of rowHeads) expect(th).toContain(INK_COLOR)
    for (const th of rowHeads) expect(th).toContain('font-weight:600')
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
    // Read in the grid: the section heading over it sets its layer's word at
    // the same weight.
    const grid = html.slice(html.indexOf('<table'))
    const bold = [...grid.matchAll(/<span style="[^"]*font-weight:600[^"]*">([^<]*)<\/span>/g)].map((m) => m[1])
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
// to setHTML exactly like the NIFC incident name a fire's section carries.
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
    const html = rankedHtml({ ...linked, sections: [FIRE] })
    const anchors = html.match(/<a /g) ?? []
    // Twenty-three metric values, the fire section's glyph, the title's
    // link-out glyph and the coordinates.
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
        cardButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove', 'Remove from analysis'),
      )
    }
  })

  // With nothing under the band, the card is its band alone, the button in
  // its title row as on every card (TJ, 2026-11-04).
  it('keeps the button in the title row with nothing under the band', () => {
    const html = pendingHtml({ pending: { ...at, source: 'csv' } })
    expect(html).toMatch(inTitleRow('remove'))
    expect(html).not.toContain(POPUP_BODY_ATTR)
  })

  // A pasted or clicked spot is named by its pair, which stood as the title
  // and again as the first fact (TJ, 2026-11-03): once, as the spot card's.
  it('says a coordinate-named destination\'s pair once, as the title, opening CalTopo', () => {
    const ground = { kind: 'read', reading: { elevationM: 1800, degrees: 14.2, aspect: 45 } } as const
    const spot = { name: '48.07030, -121.07337', latitude: 48.0703, longitude: -121.07337, kind: 'coordinates' }
    for (const html of [
      pendingHtml({ pending: { ...spot, source: 'search' }, ground }),
      rankedHtml({ rank: 1, row: resultRow({ ...spot, type: 'coordinates', elevation_ft: null }), ground, columns: WINDOW_COLS }),
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
  // 0215), so the two states of one place say "in" and "out" in one look:
  // `Add` and `Remove` on its face, the whole phrase its name for a screen
  // reader (TJ, 2026-11-04).
  it('dresses both its buttons as the one card button, a word named by its phrase', () => {
    expect(labelHtml(RAINIER, false)).toContain(cardButton(`${CARD_ACTION_ATTR}="add"`, 'Add', 'Add to analysis'))
    expect(labelHtml(RAINIER, true)).toContain(cardButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove', 'Remove from analysis'))
    expect(labelHtml(RAINIER, false)).toMatch(/aria-label="Add to analysis"[^>]*>Add<\/button>/)
    expect(labelHtml(RAINIER, true)).toMatch(/aria-label="Remove from analysis"[^>]*>Remove<\/button>/)
  })

  // The result card's own dress (TJ, 2026-10-14): the header band in place of
  // a rule, the link out beside the name, and the facts on the band. The
  // button stands in the title row (TJ, 2026-11-04), so a label with no layer
  // at its point is its band alone.
  it('wears the result card, band and all, with the button beside the name', () => {
    const html = labelHtml(RAINIER, false)
    expect(html).toContain(HEADER_BAND_COLOR)
    expect(html).not.toContain('<hr')
    expect(html).toContain('peakbagger.com')
    expect(html).toMatch(inTitleRow('add'))
    expect(html.indexOf(`${CARD_ACTION_ATTR}="add"`)).toBeLessThan(html.indexOf('46.85290, -121.76040'))
    expect(html).not.toContain(POPUP_BODY_ATTR)
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
    expect(spotHtml(48.79012, -121.83211, [])).toContain(cardButton(`${CARD_ACTION_ATTR}="add"`, 'Add', 'Add to analysis'))
    expect(spotHtml(48.79012, -121.83211, [], { added: true })).toContain(
      cardButton(`${CARD_ACTION_ATTR}="remove"`, 'Remove', 'Remove from analysis'),
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
    kind: 'radar',
    layer: 'Rain radar',
    title: 'Light precipitation',
    source: 'NEXRAD radar',
    rows: [valueRow('Rate', '~0.02 in/h'), valueRow('Reflectivity', '16.5 dBZ')],
    when: '10 min ago',
  }
  const snow: PointSection = {
    kind: 'snow',
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
    expect(html).toContain(`>${sectionHeading('Rain radar', 'Light precipitation')}</div>`)
    expect(html).toContain(updatedLine('10 min ago', 'NEXRAD radar'))
    expect(body(html)).toMatch(/Rain radar: Light precipitation Rate: ~0.02 in\/h Reflectivity: 16.5 dBZ NEXRAD radar: 10 min ago/)
  })

  // Both pictures under one click, each section on its own heading's band
  // and a gap of the card's surface above every one after the first, so the
  // rain's values cannot be read as the snow's (TJ, 2026-10-16, 2026-11-03).
  it('parts each later section from the one above it', () => {
    const gap = new RegExp(`<div style="margin-top:${SECTION_GAP}">`, 'g')
    const html = spotHtml(48.79012, -121.83211, [rain, snow])
    expect(body(html)).toMatch(/Rain radar: Light precipitation .* NEXRAD radar: 10 min ago .*Snow depth: Very deep snow .* NOAA snow analysis: Oct 16, 2026, 5:00 AM/)
    expect(html.match(gap)).toHaveLength(1)
    expect(spotHtml(48.79012, -121.83211, [rain]).match(gap)).toBeNull()
    // No rule under the band: the action's foot that wore one is gone.
    expect(html).not.toContain('border-top:')
  })

  // A section that holds a failure has no time to give.
  it('leaves the fine print off a section with no time', () => {
    const html = spotHtml(48.79012, -121.83211, [{ ...rain, when: undefined }])
    expect(html).not.toContain('NEXRAD radar:')
  })

  // The button stands in the title row whatever is under the band (TJ,
  // 2026-11-04), as a ranked card's does.
  it('puts the button in the title row, ahead of the sections', () => {
    const html = spotHtml(48.79012, -121.83211, [rain])
    expect(html.indexOf(`${CARD_ACTION_ATTR}="add"`)).toBeLessThan(html.indexOf('NEXRAD radar: 10 min ago'))
    expect(html).toMatch(inTitleRow('add'))
  })

  // A section the forecast player renames keeps its card one width (#752).
  it('sizes a heading that can change to the widest of its names', () => {
    const NAMES = ['Light precipitation', 'Very heavy precipitation', 'No radar echo']
    const html = spotHtml(48.79012, -121.83211, [{ ...rain, titles: NAMES }])
    expect(html).toContain(`>${sectionHeading('Rain radar', widestName('Light precipitation', NAMES))}</div>`)
    expect(spotHtml(48.79012, -121.83211, [rain])).not.toContain('inline-grid')
  })
})

// Every card is one stack of sections (#832, TJ 2026-11-03): one per layer
// with something at the point, in the order the map hands them over, and a
// ranked card's forecast last. Each folds on its chevron.
describe("a card's sections", () => {
  const at = { name: 'Camp Muir', latitude: 46.83545, longitude: -121.73231, source: 'csv' } as const
  const pendingWith = (sections: readonly PointSection[], view: CardView = {}) =>
    pendingHtml({ pending: at, sections, ...view })
  const heading = (layer: string, name?: string) => `>${sectionHeading(layer, name)}</div>`
  const foldOf = (html: string, key: string) =>
    html.match(new RegExp(`<button type="button" ${CARD_FOLD_ATTR}="${key}"[^>]*aria-expanded="(true|false)"[^>]*>`))?.[1]
  const LATER = new RegExp(`<div style="margin-top:${SECTION_GAP}">`, 'g')

  it("opens each section on its layer's word and its own name, in the order given", () => {
    const html = pendingWith([FIRE, CLOSURE, RADAR])
    const starts = [heading('Active wildfire', 'Bolt Creek'), heading('Area closure', 'Probe Fire Closure'), heading('Rain radar', 'Light precipitation')].map(
      (h) => html.indexOf(h),
    )
    expect(starts.every((i) => i > html.indexOf(POPUP_BODY_ATTR))).toBe(true)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  // So one layer's values cannot be read as the next one's.
  it('parts every section after the first by a gap, and rules none off', () => {
    expect(pendingWith([FIRE]).match(LATER)).toBeNull()
    expect(pendingWith([FIRE, CLOSURE, RADAR]).match(LATER)).toHaveLength(2)
    expect(pendingWith([FIRE, CLOSURE, RADAR])).not.toContain('border-top:')
  })

  // A fire and a closure are warnings: the amber band and the table's own
  // mark before the layer's word. The radar is weather, on the plain band.
  it('stands a warning on the amber band behind the warning mark, and nothing else', () => {
    const html = pendingWith([FIRE, CLOSURE, RADAR])
    expect(html.match(new RegExp(`background:${escapeRegExp(WARNING_BAND_COLOR)}`, 'g'))).toHaveLength(2)
    expect(html.split(WARNING_MARK)).toHaveLength(3)
    const radar = pendingWith([RADAR])
    expect(radar).not.toContain(WARNING_BAND_COLOR)
    expect(radar).not.toContain(WARNING_MARK)
  })

  it("sets a closure's type in the warning amber under its name, above its rows", () => {
    const html = pendingWith([CLOSURE])
    expect(html).toContain(warningLine('Safety Closure', null))
    expect(html).toContain(`color:${WARNING_COLOR}`)
    expect(html.indexOf(heading('Area closure', 'Probe Fire Closure'))).toBeLessThan(html.indexOf('Safety Closure'))
    expect(html.indexOf('Safety Closure')).toBeLessThan(html.indexOf('Columbia River Gorge NSA'))
  })

  it('ends a section on its source and time, and leaves the line off without a time', () => {
    const html = pendingWith([FIRE, CLOSURE])
    expect(html).toContain(updatedLine('Jul 17, 2026, 5:00 AM', 'NIFC'))
    expect(html.indexOf('10 acres')).toBeLessThan(html.indexOf('NIFC: Jul 17'))
    expect(html).not.toContain('US Forest Service')
  })

  it("links a section's name out where the thing has a page, named for a screen reader", () => {
    const html = pendingWith([FIRE, RADAR])
    expect(html).toContain('aria-label="View on NIFC map"')
    expect(html).toContain(`href="${escapeHtml(FIRE.link!.href)}"`)
    // The fire's glyph and the destination's own, and none for the radar.
    expect(html.match(/data-popup-glyph href=/g)).toHaveLength(2)
  })

  // Before an analysis every section stands open; on a ranked card only the
  // forecast does, since the grid is what the marker was clicked for.
  it('opens every section on a card with no forecast', () => {
    const cards = [
      pendingWith([FIRE, RADAR]),
      labelHtml(RAINIER, false, { sections: [FIRE, RADAR] }),
      spotHtml(48.79012, -121.83211, [FIRE, RADAR]),
    ]
    for (const html of cards) {
      expect([foldOf(html, 'fire'), foldOf(html, 'radar')]).toEqual(['true', 'true'])
      expect(html).toContain('3.2 mi NW')
      expect(html).toContain('~0.02 in/h')
    }
  })

  // A ranked card opens its forecast and every warning, and folds the rest
  // (TJ, 2026-11-03): a fire at the point is worth reading before the grid.
  it('opens the forecast and the warnings on a ranked card, and folds the rest', () => {
    const html = rankedHtml({ ...base, sections: [FIRE, CLOSURE, RADAR] })
    expect([FIRE, CLOSURE, RADAR].map((s) => foldOf(html, s.kind))).toEqual(['true', 'true', 'false'])
    expect(foldOf(html, FORECAST_SECTION)).toBe('true')
    expect(html).toContain(heading('Active wildfire', 'Bolt Creek'))
    expect(html).toContain('3.2 mi NW')
    expect(html).toContain('NIFC: Jul 17')
    expect(html).not.toContain('~0.02 in/h')
    expect(html).toContain('<table')
  })

  // A fold the reader made holds on every card, whichever way it went.
  it("takes the reader's own fold over the default", () => {
    const folds = new Map([
      ['fire', false],
      ['radar', true],
      [FORECAST_SECTION, false],
    ])
    const ranked = rankedHtml({ ...base, sections: [FIRE, RADAR], folds })
    expect([foldOf(ranked, 'fire'), foldOf(ranked, 'radar'), foldOf(ranked, FORECAST_SECTION)]).toEqual(['false', 'true', 'false'])
    expect(ranked).not.toContain('3.2 mi NW')
    expect(ranked).toContain('~0.02 in/h')
    expect(ranked).not.toContain('<table')
    const pending = pendingWith([FIRE, RADAR], { folds: new Map([['radar', false]]) })
    expect([foldOf(pending, 'fire'), foldOf(pending, 'radar')]).toEqual(['true', 'false'])
    expect(pending).not.toContain('~0.02 in/h')
  })

  // The hazards are what a reader weighs the forecast against, so they come
  // first and the forecast last, ruled off from them.
  it("puts a ranked card's forecast after its layers", () => {
    const html = rankedHtml({ ...base, sections: [FIRE] })
    expect(html.indexOf(heading('Active wildfire', 'Bolt Creek'))).toBeLessThan(html.indexOf(heading('Forecast')))
    expect(html.indexOf(heading('Forecast'))).toBeLessThan(html.indexOf('<table'))
    expect(html.match(LATER)).toHaveLength(1)
  })
})

// The forecast section (#832): the model the numbers came from in its name,
// the grid, and when the report was analyzed in the fine print.
describe("a ranked card's forecast section", () => {
  const heading = (layer: string, name?: string) => `>${sectionHeading(layer, name)}</div>`

  it("names a comparison row's own model, or the one model that answered every row", () => {
    const compared = { ...row, modelId: 'ecmwf_ifs025', modelLabel: 'ECMWF IFS' } as ModelRow
    expect(rankedHtml({ ...base, row: compared, modelFallbackLabel: 'GFS Seamless' })).toContain(heading('Forecast', 'ECMWF IFS'))
    expect(rankedHtml({ ...base, modelFallbackLabel: 'GFS Seamless' })).toContain(heading('Forecast', 'GFS Seamless'))
  })

  // A comparison shows the Model column, whose label used to stand on the
  // band; the forecast heading names it now, so the band drops it rather
  // than say the model twice (#832). With no forecast section to name it,
  // the band keeps the line.
  it("says a comparison row's model once, in the forecast heading, and on the band only without one", () => {
    const compared = { ...row, modelId: 'ecmwf_ifs025', modelLabel: 'ECMWF IFS' } as ModelRow
    const columns = [...WINDOW_COLS, MODEL_COL]
    const html = rankedHtml({ ...base, row: compared, columns })
    expect(html.slice(0, html.indexOf(POPUP_BODY_ATTR))).not.toContain('ECMWF IFS')
    expect(html).toContain(heading('Forecast', 'ECMWF IFS'))
    const bare = rankedHtml({ ...base, row: compared, columns: [MODEL_COL] })
    expect(bare).toContain('<div>ECMWF IFS</div>')
    expect(bare).not.toContain('Forecast')
  })

  // An archive report's numbers came from no model.
  it('is plain Forecast with no model to name', () => {
    const html = rankedHtml({ ...base })
    expect(html).toContain(heading('Forecast'))
    expect(html).not.toContain('Forecast:')
  })

  it('names its fold Forecast for a screen reader', () => {
    expect(rankedHtml({ ...base, modelFallbackLabel: 'GFS Seamless' })).toMatch(
      new RegExp(`<button type="button" ${CARD_FOLD_ATTR}="${FORECAST_SECTION}"[^>]*aria-label="Forecast"`),
    )
  })

  it('says when the report was analyzed, under the grid, and nothing without the time', () => {
    const analyzed = Date.UTC(2026, 10, 3, 21, 36)
    const html = rankedHtml({ ...base, analyzedAtMs: analyzed })
    const line = updatedLine(escapeHtml(updatedAt(analyzed)!), 'Analyzed')
    expect(html).toContain(line)
    expect(html.indexOf('</table>')).toBeLessThan(html.indexOf(line))
    expect(rankedHtml({ ...base })).not.toContain('Analyzed:')
    expect(rankedHtml({ ...base, analyzedAtMs: null })).not.toContain('Analyzed:')
  })

  // With no column to show there is no forecast to section, and with no
  // layer either the card is its band, the button in its title row.
  it('draws no section without a column, and keeps the button in the title row', () => {
    const html = rankedHtml({ rank: 1, row, removable: true })
    expect(html).not.toContain('Forecast')
    expect(html).not.toContain(CARD_FOLD_ATTR)
    expect(html).not.toContain(POPUP_BODY_ATTR)
    expect(html).toMatch(inTitleRow('remove'))
  })

  it('stands the layers alone without a column', () => {
    const html = rankedHtml({ rank: 1, row, sections: [FIRE] })
    expect(html).toContain(heading('Active wildfire', 'Bolt Creek'))
    expect(html).not.toContain(heading('Forecast'))
  })
})

describe('sectionOpen', () => {
  const ranked = { kind: 'ranked', row, rank: 1 } as const
  const others = [
    { kind: 'pending', pending: { name: 'Camp Muir', latitude: 46.8, longitude: -121.7, source: 'csv' } },
    { kind: 'label', poi: RAINIER },
    { kind: 'spot', lat: 48.8, lon: -121.8 },
  ] as const

  it('opens the forecast and every warning on a ranked card, and nothing else', () => {
    expect(sectionOpen(ranked, FORECAST_SECTION)).toBe(true)
    for (const key of ['fire', 'fire-activity', 'closure-area', 'closure-trail']) expect(sectionOpen(ranked, key, undefined, true)).toBe(true)
    for (const key of ['smoke', 'radar', 'snow']) expect(sectionOpen(ranked, key)).toBe(false)
    expect(sectionOpen(ranked, 'radar', undefined, false)).toBe(false)
  })

  it('opens every section on every other card, warning or not', () => {
    for (const subject of others) {
      expect(sectionOpen(subject, 'fire', undefined, true)).toBe(true)
      expect(sectionOpen(subject, 'snow')).toBe(true)
    }
  })

  it("lets the reader's choice win either way, and only for the section it names", () => {
    const folds = new Map([
      ['fire', true],
      [FORECAST_SECTION, false],
      ['radar', false],
    ])
    expect(sectionOpen(ranked, 'fire', folds)).toBe(true)
    // A fold the reader made shuts a warning as it shuts anything else.
    expect(sectionOpen(ranked, 'closure-area', new Map([['closure-area', false]]), true)).toBe(false)
    expect(sectionOpen(ranked, FORECAST_SECTION, folds)).toBe(false)
    expect(sectionOpen(ranked, 'smoke', folds)).toBe(false)
    expect(sectionOpen(others[2], 'radar', folds)).toBe(false)
    expect(sectionOpen(others[2], 'snow', folds)).toBe(true)
  })

  // On a phone every section but the forecast opens folded, on every card,
  // before and after an analysis, a warning's too (TJ, 2026-11-04).
  it('folds every section but the forecast on a phone, warnings included', () => {
    expect(sectionOpen(ranked, FORECAST_SECTION, undefined, false, true)).toBe(true)
    for (const subject of [ranked, ...others]) {
      for (const key of ['fire', 'fire-activity', 'closure-area', 'closure-trail']) expect(sectionOpen(subject, key, undefined, true, true)).toBe(false)
      for (const key of ['smoke', 'radar', 'snow']) expect(sectionOpen(subject, key, undefined, false, true)).toBe(false)
    }
  })

  it("lets the reader's choice win on a phone too", () => {
    const folds = new Map([
      ['fire', true],
      [FORECAST_SECTION, false],
    ])
    expect(sectionOpen(others[1], 'fire', folds, true, true)).toBe(true)
    expect(sectionOpen(ranked, FORECAST_SECTION, folds, false, true)).toBe(false)
    expect(sectionOpen(ranked, 'smoke', folds, false, true)).toBe(false)
  })

  // The card draws what `sectionOpen` says: a phone's label card stands its
  // fire folded to its heading, and a phone's ranked card its forecast open.
  it('draws a phone card with only its forecast open', () => {
    const label = destinationPopupHtml({ kind: 'label', poi: RAINIER }, { sections: [FIRE], phone: true })
    expect(label).toMatch(new RegExp(`${CARD_FOLD_ATTR}="fire"[^>]*aria-expanded="false"`))
    expect(destinationPopupHtml({ kind: 'label', poi: RAINIER }, { sections: [FIRE] })).toContain('aria-expanded="true"')
    const html = destinationPopupHtml(
      { kind: 'ranked', row, rank: 1 },
      { columns: displayedColumns(false, 'aqi_avg'), sections: [FIRE], phone: true },
    )
    expect(html).toMatch(new RegExp(`${CARD_FOLD_ATTR}="${FORECAST_SECTION}"[^>]*aria-expanded="true"`))
    expect(html).toMatch(new RegExp(`${CARD_FOLD_ATTR}="fire"[^>]*aria-expanded="false"`))
    expect(html).toContain('</table>')
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
    const spot = { kind: 'spot', lat: 48.790123456, lon: -121.832114999 } as const
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
    expect(subjectType({ kind: 'spot', lat: 0, lon: 0 })).toBeNull()
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
