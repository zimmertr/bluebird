import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render } from '../testSupport/render'
import { closureFeature, closureWarning, resultRow } from '../testSupport/fixtures'
import {
  GRID_BAND_COLOR,
  GRID_COMPACT_INSET_PX,
  GRID_COMPACT_LABEL_GAP_PX,
  GRID_INSET_PX,
  GRID_LABEL_GAP_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  RESULT_CARD_PAD_PX,
  RESULT_POPUP_MAX_WIDTH_PX,
  SECTION_EDGE,
  WIDEST_GRID_PX,
  compactGrid,
  factsRow,
  metricGrid,
  bodyLines,
  factsLine,
  popupCard,
  resultPopupWidth,
  row,
} from './popupChrome'
import { AGGREGATE } from '../metrics'
import { closurePopupHtml } from './closures'
import { resultPopupHtml } from './resultPopup'
import { smokePopupHtml } from './smoke'
import { wildfirePopupHtml } from './wildfires'
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
    const popup = mount(popupCard({ title: 'Title', link: { href: `https://www.openstreetmap.org/${QUOTED}`, label: 'Open' } }))
    const [link] = within(popup).getAllByRole('link')
    expect(link.getAttribute('href')).toBe(`https://www.openstreetmap.org/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
  })

  it('keeps a quote mark in a value link inside the href', () => {
    const popup = mount(popupCard({ title: 'Title', link: { href: 'https://example.org/', label: 'Open' }, body: row('Wind', '5.0', `https://www.windy.com/${QUOTED}`) }))
    const links = within(popup).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toContain(`https://www.windy.com/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
  })

  it('reads an ampersand in a url back as one ampersand', () => {
    const url = 'https://www.peakbagger.com/search.aspx?tid=R&lat=46.85230&lon=-121.76030'
    const [link] = within(mount(popupCard({ title: 'Title', link: { href: url, label: 'Open' } }))).getAllByRole('link')
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

// The grid's column bands (TJ, 2026-10-08). Every colour on the card is
// measured in both themes in `styles.test.ts`, beside the scale bar, because
// its values are `map.css`'s (#740).
describe('the popup grid', () => {
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

  // The number the report ranks by is bold on a cell one step past its
  // column (TJ, 2026-10-08).
  it('marks the ranked number bold on its own shade', () => {
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

// The result card's header band (TJ, 2026-10-08).
describe('the header band', () => {
  // No hue: the band is the grid's own column slate (option H, TJ 2026-10-08).
  it('is the grid\'s own column shade', () => {
    expect(HEADER_BAND_COLOR).toBe(GRID_BAND_COLOR)
  })

  it('keeps the close button\'s lane, which map.css widens on a touch screen', () => {
    const html = popupCard({ title: 'Title', link: { href: 'https://example.com', label: 'Open' } })
    expect(html).toContain(`background:${HEADER_BAND_COLOR}`)
    expect(html).toContain('padding:10px var(--popup-close-lane, 2rem) 8px 10px')
    expect(html).not.toContain('<hr')
  })
})

// A name too long for the card ends in an ellipsis on one line, as the results
// table's does, rather than wrapping the rank away and running off the edge.
describe('a popup title', () => {
  const NAME = 'Taumatawhakatangihangakōauauotamateapōkaiwhenuakitānatahu'
  it('keeps a long name on one line, ending in an ellipsis', () => {
    const popup = document.createElement('div')
    popup.innerHTML = popupCard({ title: `#1 ${NAME}`, link: { href: 'https://example.com', label: 'Open' } })
    const title = popup.querySelector('strong')!
    expect(title.textContent).toBe(`#1 ${NAME}`)
    expect(title.getAttribute('style')).toContain('text-overflow:ellipsis')
    expect(title.getAttribute('style')).toContain('white-space:nowrap')
    expect(title.getAttribute('style')).toContain('min-width:0')
  })
})

describe('the facts line', () => {
  it('parts the type, elevation and coordinates with a pipe a screen reader skips', () => {
    const popup = mount(factsRow('Trailhead', '3,120 ft', 47.5, -121.25, null))
    expect(popup.textContent).toBe('Trailhead|3,120 ft|47.50000, -121.25000')
    expect(popup.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('drops a part it does not have', () => {
    expect(mount(factsRow(null, null, 47.5, -121.25, null)).textContent).toBe('47.50000, -121.25000')
  })

  // The pair is the link and the elevation is not (#712): a place is what a
  // reader takes elsewhere, a measurement is not. The text does not move.
  it('links the coordinates, and only them, where it is given somewhere to go', () => {
    const url = 'https://caltopo.com/map.html#ll=47.50000,-121.25000&z=14'
    const popup = mount(factsRow('Peak', '7,000 ft', 47.5, -121.25, url))
    expect(popup.textContent).toBe('Peak|7,000 ft|47.50000, -121.25000')
    const links = within(popup).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe('47.50000, -121.25000')
    expect(links[0].getAttribute('href')).toBe(url)
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
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


describe("an overlay's facts line and body", () => {
  it('parts the kind and its figure with the pipe a destination wears, and cuts rather than wraps', () => {
    const line = mount(factsLine(['Trail closure', 'BACON CR 1060000']))
    expect(line.textContent).toBe('Trail closure|BACON CR 1060000')
    expect(line.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(line.firstElementChild!.getAttribute('style')).toContain('text-overflow:ellipsis')
  })

  it('leaves off a part or a line it does not have', () => {
    expect(mount(factsLine(['Smoke', null, ''])).textContent).toBe('Smoke')
    expect(bodyLines([null, 'Colville National Forest', undefined])).toBe('<div>Colville National Forest</div>')
  })
})

// Every popup that describes a thing is one card (#738): a header band holding
// the title, then the sections below it. Mounted the way MapLibre mounts them,
// so the structure is read off the DOM a reader gets rather than off a string.
describe('every overlay card', () => {
  const band = (popup: HTMLElement) => popup.firstElementChild!.firstElementChild as HTMLElement
  const cards: [string, string][] = [
    ['a fire', wildfirePopupHtml({ attr_IncidentName: 'Kaiser Canyon', poly_GISAcres: 138285, attr_PercentContained: 100 }, 'https://nifc.example/')],
    ['an area closure', closurePopupHtml(closureFeature({ GIS_Acres: 4210, FireName: null, ClosureType: 'Safety Closure' }).properties, 'area')],
    ['a trail closure', closurePopupHtml(closureFeature().properties, 'trail')],
    ['a smoke plume', smokePopupHtml({ density: 'Medium', satellite: 'GOES-EAST' })],
  ]

  it.each(cards)('draws %s on the header band, its title and facts line inside it', (_, html) => {
    const popup = mount(html)
    expect(band(popup).getAttribute('style')).toContain(`background:${HEADER_BAND_COLOR}`)
    expect(band(popup).querySelector('strong')).not.toBeNull()
    expect(band(popup).children).toHaveLength(2)
    expect(popup.querySelector('hr')).toBeNull()
    expect(popup.textContent).not.toMatch(/🔥|🚫|🌫/u)
  })

  // The glyph is aria-hidden, so the label is the link's whole name (#738).
  it.each(cards.slice(0, 3))('names the link out of %s for a screen reader', (_, html) => {
    const [link] = within(mount(html)).getAllByRole('link')
    expect(link.getAttribute('aria-label')).toMatch(/^View (on NIFC map|closure order)$/)
  })

  it('puts the closure type in a notice section between the band and the body', () => {
    const popup = mount(cards[1][1])
    const [, notice, body] = Array.from(popup.firstElementChild!.children) as HTMLElement[]
    expect(notice.textContent).toContain('Safety Closure')
    expect(notice.getAttribute('style')).toContain(`border-bottom:${SECTION_EDGE}`)
    expect(body.hasAttribute('data-popup-body')).toBe(true)
  })
})
