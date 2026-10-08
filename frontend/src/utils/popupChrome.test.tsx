import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render } from '../testSupport/render'
import { closureWarning, resultRow } from '../testSupport/fixtures'
import {
  GRID_BAND_COLOR,
  GRID_GUTTER_COLOR,
  LABEL_COLOR,
  LINK_COLOR,
  RESULT_POPUP_MAX_WIDTH_PX,
  factsRow,
  metricGrid,
  popupShell,
  resultPopupWidth,
  row,
} from './popupChrome'
import { AGGREGATE } from '../metrics'
import { resultPopupHtml } from './resultPopup'
import { displayedColumns } from './tableColumns'

// A popup is a string MapLibre hands to innerHTML (`Popup.setHTML`), so these
// mount it the same way and read the DOM a reader would get. A link's href is
// the one value in that markup that sits inside an attribute, which is where a
// quote mark ends the value and whatever follows it becomes markup (#621).

function mount(html: string) {
  const { getByTestId } = render(<div data-testid="popup" dangerouslySetInnerHTML={{ __html: html }} />)
  return getByTestId('popup')
}

// The smallest value that shows it: a quote mark to end the attribute and an
// angle bracket to start an element.
const QUOTED = 'x"><b>probe</b><i x="'

describe('a popup link', () => {
  it('keeps a quote mark in the link-out url inside the href', () => {
    const popup = mount(popupShell('Title', `https://www.openstreetmap.org/${QUOTED}`, ''))
    const [link] = within(popup).getAllByRole('link')
    expect(link.getAttribute('href')).toBe(`https://www.openstreetmap.org/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
  })

  it('keeps a quote mark in a value link inside the href', () => {
    const popup = mount(popupShell('Title', 'https://example.org/', row('Wind', '5.0', `https://www.windy.com/${QUOTED}`)))
    const links = within(popup).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toContain(`https://www.windy.com/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
  })

  it('reads an ampersand in a url back as one ampersand', () => {
    const url = 'https://www.peakbagger.com/search.aspx?tid=R&lat=46.85230&lon=-121.76030'
    const [link] = within(mount(popupShell('Title', url, ''))).getAllByRole('link')
    expect(link.getAttribute('href')).toBe(url)
  })
})

describe('a result popup', () => {
  const columns = displayedColumns(false, 'precip_total_in')

  // The route the review traced: a place that is not a peak, carrying an id
  // nothing checked, reaches the link-out glyph through `destinationUrl`.
  it('writes an OSM id carrying markup as text inside the link', () => {
    const popup = mount(
      resultPopupHtml({ rank: 1, row: resultRow({ type: 'city', osm_id: QUOTED }), columns, warning: null }),
    )
    const hrefs = within(popup)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`https://www.openstreetmap.org/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
    expect(within(popup).queryByText('probe')).toBeNull()
  })

  // The closure url was escaped before it reached the link, so once the link
  // escapes for itself an ampersand must not come out escaped twice.
  it('links a closure order whose url carries an ampersand to that url', () => {
    const url = 'https://www.fs.usda.gov/r06/alerts?order=1&forest=probe'
    const popup = mount(
      resultPopupHtml({ rank: 1, row: resultRow(), columns, warning: null, closure: closureWarning({ url }) }),
    )
    const hrefs = within(popup)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(url)
  })
})

// The grid's column bands (TJ, 2026-10-08). The band sits under every number
// and every head, so both colours on it must still clear AA.
describe('the popup grid', () => {
  it('keeps link and label text above AA on the band', () => {
    expect(round2(contrast(LINK_COLOR, GRID_BAND_COLOR))).toBe(5.42)
    expect(round2(contrast(LABEL_COLOR.replace('color:', ''), GRID_BAND_COLOR))).toBe(6.92)
    expect(GRID_GUTTER_COLOR).toBe('#ffffff')
  })

  it('stands a one-value line across Min, Max and Avg and leaves Total empty', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum, AGGREGATE.maximum, AGGREGATE.average, AGGREGATE.total],
      rows: [{ kind: 'value', label: 'Cloud deck (ft)', cell: { text: '≥30,000', href: null } }],
    })
    const cells = [...html.matchAll(/<td colspan="(\d)"|<td style/g)]
    expect(html).toContain('<td colspan="3"')
    expect(cells).toHaveLength(2)
  })

  // Every label stays on one line; the card is sized for the widest.
  it('never wraps a family label', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum],
      rows: [{ kind: 'aggregates', label: 'Precipitation (in/hr)', cells: [{ text: '0.000', href: null }] }],
    })
    expect(html).toMatch(/<th scope="row" style="[^"]*white-space:nowrap[^"]*">Precipitation \(in\/hr\)<\/th>/)
  })
})

describe('the facts line', () => {
  it('parts the type, elevation and coordinates with a pipe a screen reader skips', () => {
    const popup = mount(factsRow('Trailhead', '3,120 ft', 47.5, -121.25))
    expect(popup.textContent).toBe('Trailhead|3,120 ft|47.50000, -121.25000')
    expect(popup.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('drops a part it does not have', () => {
    expect(mount(factsRow(null, null, 47.5, -121.25)).textContent).toBe('47.50000, -121.25000')
  })
})

// The result popup's own width (TJ, 2026-10-08). Measured in Chrome on macOS:
// the widest label beside the widest Min, Max, Avg and Total needs 316px of
// grid, and the last band's 3px inset makes 319. The body has the card less
// 10px a side. A change to the grid's columns or type re-measures this.
const WIDEST_GRID_PX = 319
describe('resultPopupWidth', () => {
  it('fits the widest grid measured on macOS', () => {
    expect(RESULT_POPUP_MAX_WIDTH_PX - 20).toBeGreaterThanOrEqual(WIDEST_GRID_PX)
  })

  it('takes the map less 10px a side where the map is narrower', () => {
    expect(resultPopupWidth(1280)).toBe(`${RESULT_POPUP_MAX_WIDTH_PX}px`)
    expect(resultPopupWidth(360)).toBe('340px')
    expect(resultPopupWidth(320)).toBe('300px')
    expect(resultPopupWidth(0)).toBe('180px')
  })
})

// WCAG relative luminance and contrast, for the band above. Small enough to
// live here, as `colors.test.ts` keeps its own.
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
