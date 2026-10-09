import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render } from '../testSupport/render'
import { closureWarning, resultRow } from '../testSupport/fixtures'
import {
  FINE_COLOR,
  GRID_BAND_COLOR,
  GRID_COMPACT_INSET_PX,
  GRID_COMPACT_LABEL_GAP_PX,
  GRID_GUTTER_COLOR,
  GRID_INSET_PX,
  GRID_LABEL_GAP_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  HEADER_ICON_COLOR,
  LABEL_COLOR,
  LINK_COLOR,
  RESULT_CARD_PAD_PX,
  RESULT_POPUP_MAX_WIDTH_PX,
  WIDEST_GRID_PX,
  compactGrid,
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
      rows: [{ kind: 'value', label: 'Cloud deck (ft)', cell: { text: '≥30,000', href: null, ranked: false } }],
    })
    // The value row alone: the corner over the labels is the head row's.
    const valueRow = html.slice(html.indexOf('<th scope="row"'))
    expect(valueRow).toContain('<td colspan="3"')
    expect(valueRow.match(/<td /g)).toHaveLength(2)
  })

  // Every label stays on one line; the card is sized for the widest.
  it('never wraps a family label', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum],
      rows: [{ kind: 'aggregates', label: 'Precipitation (in/hr)', cells: [{ text: '0.000', href: null, ranked: false }] }],
    })
    expect(html).toMatch(/<th scope="row" style="[^"]*white-space:nowrap[^"]*">Precipitation \(in\/hr\)<\/th>/)
  })

  // The number the report ranks by is bold on the header's sky (TJ,
  // 2026-10-08). The sky is barely darker than the slate it replaces, so the
  // link on it must still clear AA, and the bold does the rest.
  it('marks the ranked number bold on the sky, keeping its link above AA', () => {
    expect(GRID_RANKED_COLOR).toBe(HEADER_BAND_COLOR)
    expect(round2(contrast(LINK_COLOR, GRID_RANKED_COLOR))).toBe(5.17)
    const html = metricGrid({
      columns: [AGGREGATE.minimum, AGGREGATE.maximum],
      rows: [
        {
          kind: 'aggregates',
          label: 'Wind (mph)',
          cells: [
            { text: '3.2', href: null, ranked: false },
            { text: '41.8', href: null, ranked: true },
          ],
        },
      ],
    })
    const cells = mount(html).querySelectorAll('td[style*="text-align:right"]')
    expect(cells).toHaveLength(2)
    expect(cells[0].getAttribute('style')).not.toContain(GRID_RANKED_COLOR)
    expect(cells[0].querySelector('span')!.getAttribute('style')).not.toContain('font-weight:700')
    expect(cells[1].getAttribute('style')).toContain(`background:${GRID_RANKED_COLOR}`)
    expect(cells[1].querySelector('span')!.getAttribute('style')).toContain('font-weight:700')
  })

  it('narrows every band and the label gap when asked', () => {
    const grid = {
      columns: [AGGREGATE.minimum],
      rows: [{ kind: 'aggregates' as const, label: 'Wind (mph)', cells: [{ text: '3.2', href: null, ranked: false }] }],
    }
    const full = metricGrid(grid)
    expect(full).toContain(`padding:1px ${GRID_INSET_PX}px`)
    expect(full).toContain(`padding:1px ${GRID_LABEL_GAP_PX}px 1px 0`)
    const compact = metricGrid(grid, { compact: true })
    expect(compact).toContain(`padding:1px ${GRID_COMPACT_INSET_PX}px`)
    expect(compact).toContain(`padding:1px ${GRID_COMPACT_LABEL_GAP_PX}px 1px 0`)
    expect(compact).not.toContain(`padding:1px ${GRID_INSET_PX}px`)
    expect(compact).not.toContain(`padding:1px ${GRID_LABEL_GAP_PX}px`)
  })
})

// The result card's header band (TJ, 2026-10-08): every colour on it measured.
describe('the header band', () => {
  it('keeps its text above AA and its link glyph above the 3:1 an icon owes', () => {
    expect(round2(contrast(LABEL_COLOR.replace('color:', ''), HEADER_BAND_COLOR))).toBe(6.6)
    expect(round2(contrast('#000000', HEADER_BAND_COLOR))).toBe(18.3)
    expect(round2(contrast(HEADER_ICON_COLOR, HEADER_BAND_COLOR))).toBe(3.57)
    // The pipes are decoration, hidden from a screen reader; they need only show.
    expect(round2(contrast(FINE_COLOR, HEADER_BAND_COLOR))).toBe(2.23)
  })

  it('keeps the close button\'s lane, which map.css widens on a touch screen', () => {
    const html = popupShell('Title', 'https://example.com', '', '', { resultCard: true })
    expect(html).toContain(`background:${HEADER_BAND_COLOR}`)
    expect(html).toContain('padding:10px var(--popup-close-lane, 2rem) 8px 10px')
    expect(html).not.toContain('<hr')
  })
})

// A name too long for the card ends in an ellipsis on one line, as the results
// table's does, rather than wrapping the rank away and running off the edge.
describe('a popup title', () => {
  const NAME = 'Taumatawhakatangihangakōauauotamateapōkaiwhenuakitānatahu'
  it('keeps a long name on one line, ending in an ellipsis, on both shells', () => {
    for (const resultCard of [false, true]) {
      const popup = document.createElement('div')
      popup.innerHTML = popupShell(`#1 ${NAME}`, 'https://example.com', '', '', { resultCard })
      const title = popup.querySelector('strong')!
      expect(title.textContent).toBe(`#1 ${NAME}`)
      expect(title.getAttribute('style')).toContain('text-overflow:ellipsis')
      expect(title.getAttribute('style')).toContain('white-space:nowrap')
      expect(title.getAttribute('style')).toContain('min-width:0')
    }
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

// The result popup's own width (TJ, 2026-10-08), against the widest grid
// measured in Chrome on macOS, `WIDEST_GRID_PX`.
describe('resultPopupWidth', () => {
  it('fits the widest grid measured on macOS', () => {
    expect(WIDEST_GRID_PX).toBe(345)
    expect(RESULT_POPUP_MAX_WIDTH_PX - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(WIDEST_GRID_PX)
  })

  it('takes the map less 10px a side where the map is narrower', () => {
    expect(resultPopupWidth(1280)).toBe(`${RESULT_POPUP_MAX_WIDTH_PX}px`)
    expect(RESULT_POPUP_MAX_WIDTH_PX).toBe(366)
    expect(resultPopupWidth(360)).toBe('340px')
    expect(resultPopupWidth(320)).toBe('300px')
    expect(resultPopupWidth(0)).toBe('180px')
  })
})

// A map too narrow for the widest grid at full inset takes 3px insets and a
// 6px label gap (TJ, 2026-10-08). Measured on macOS, a grid with a two-digit
// window total is then 319.4px, which a 360px phone's 320px of body holds.
describe('compactGrid', () => {
  it('keeps the full inset wherever the widest grid fits it', () => {
    expect(compactGrid(1280)).toBe(false)
    expect(compactGrid(390)).toBe(false)
    expect(compactGrid(385)).toBe(false)
  })

  it('takes the compact inset on a narrower map', () => {
    expect(compactGrid(384)).toBe(true)
    expect(compactGrid(360)).toBe(true)
    expect(parseFloat(resultPopupWidth(360)) - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(319.4)
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
