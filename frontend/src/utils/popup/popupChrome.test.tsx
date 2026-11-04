import { describe, expect, it } from 'vitest'
import { cleanup, within } from '@testing-library/react'
import { render } from '../../testSupport/render'
import { resultRow } from '../../testSupport/fixtures'
import {
  CARD_FOLD_ATTR,
  CARD_RESIZE_ATTR,
  HEADER_ICON_COLOR,
  POPUP_MIN_WIDTH_PX,
  cardWidthRange,
  GRID_BAND_COLOR,
  GRID_COMPACT_INSET_PX,
  GRID_COMPACT_LABEL_GAP_PX,
  GRID_INSET_PX,
  GRID_LABEL_GAP_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  INK_COLOR,
  LABEL_COLOR,
  SECTION_BAND_COLOR,
  SECTION_GAP,
  WARNING_BAND_COLOR,
  RESULT_CARD_PAD_PX,
  RESULT_POPUP_MAX_WIDTH_PX,
  FINE_COLOR,
  POPUP_MAX_WIDTH_PX,
  POPUP_TINT_ATTR,
  WIDEST_GRID_PX,
  compactGrid,
  factsRow,
  metaBand,
  metricGrid,
  bodyLines,
  cardButton,
  cardSection,
  cardSections,
  factsLine,
  popupCard,
  fineprint,
  popupWidth,
  resultPopupWidth,
  row,
  updatedAt,
  updatedLine,
  dateOfMs,
  widestName,
  ageAgo,
  monthDayTime,
} from './popupChrome'
import { AGGREGATE } from '../../metrics'
import { CHEVRON, GRIP, GRIP_PX } from '../../iconPaths'
import { CARD_ACTION, CARD_BODY_END, CARD_FOLD, CARD_RESIZE, CARD_TITLE_ROW } from '../../styles'
import { destinationPopupHtml } from '../destinationCard'
import { WARNING_MARK } from '../fireProximity'
import type { PointSection } from '../pointReadout'
import { displayedColumns } from '../tableColumns'

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
      destinationPopupHtml({ kind: 'ranked', rank: 1, row: resultRow({ type: 'city', osm_id: QUOTED }) }, { columns }),
    )
    const hrefs = within(popup)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain(`https://www.openstreetmap.org/${QUOTED}`)
    expect(popup.querySelector('b')).toBeNull()
    expect(within(popup).queryByText('probe')).toBeNull()
  })

  // A section's url reaches the link as given and the link escapes it once,
  // so an ampersand must not come out escaped twice.
  it('links a closure order whose url carries an ampersand to that url', () => {
    const url = 'https://www.fs.usda.gov/r06/alerts?order=1&forest=probe'
    const section: PointSection = {
      kind: 'closure-area',
      layer: 'Area closure',
      title: 'Probe Fire Closure',
      warning: true,
      link: { href: url, label: 'View closure order' },
      source: 'US Forest Service',
      rows: [],
    }
    const popup = mount(
      destinationPopupHtml({ kind: 'ranked', rank: 1, row: resultRow() }, { columns, sections: [section] }),
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
  // A ranked family's number carries the table's fill and both themes' inks,
  // and takes its colour from the one `map.css` picks (#740); a ranked number
  // with no colour keeps the slate step.
  it('paints a coloured number with the fill and both inks it carries', () => {
    const tint = { fill: 'rgba(1,2,3,0.2)', ink: { dark: 'rgb(4,5,6)', light: 'rgb(7,8,9)' } }
    const html = metricGrid({
      columns: [AGGREGATE.minimum, AGGREGATE.maximum],
      rows: [
        {
          kind: 'aggregates',
          label: 'Wind (mph)',
          cells: [
            { text: '3.2', href: null, ranked: false, tint },
            { text: '41.8', href: null, ranked: true, tint },
          ],
        },
        { kind: 'value', label: 'AQI', cell: { text: '24', href: null, ranked: true } },
      ],
    })
    const cells = mount(html).querySelectorAll(`td[${POPUP_TINT_ATTR}]`)
    expect(cells).toHaveLength(2)
    for (const cell of cells) {
      expect(cell.getAttribute('style')).toContain(
        ';background:rgba(1,2,3,0.2);--tint-dark:rgb(4,5,6);--tint-light:rgb(7,8,9);color:var(--popup-tint)',
      )
    }
    expect(html.split(`;background:${GRID_RANKED_COLOR}`)).toHaveLength(2)
  })

  // A link reads in the colour of the text around it, as the table's numbers
  // do (TJ, 2026-10-16, #740): a grid number in its cell's grey, the
  // coordinates in the facts line's. Its underline is `map.css`'s, on
  // the attribute, which answers a hover and a touch screen (#786).
  it('marks a link in the colour of the text around it, for the stylesheet to underline', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum],
      rows: [{ kind: 'aggregates', label: 'Wind (mph)', cells: [{ text: '3.2', href: 'https://example.com', ranked: false }] }],
    })
    const link = mount(html).querySelector('td a')!
    expect(link.closest('td')!.getAttribute('style')).toContain(LABEL_COLOR)
    expect(link.hasAttribute('data-popup-link')).toBe(true)
    expect(link.getAttribute('style')).toBe('color:inherit;')
    const facts = metaBand([factsRow('Peak', null, 47.5, -121.7, 'https://example.com')])
    // The band's own tag carries the label grey the coordinates inherit.
    expect(facts.slice(0, facts.indexOf('>'))).toContain(LABEL_COLOR)
    expect(facts).toMatch(/<a data-popup-link [^>]*style="color:inherit;"/)
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
    expect(cells[0].querySelector('span')!.getAttribute('style')).not.toContain('font-weight:600')
    expect(cells[1].getAttribute('style')).toContain(`background:${GRID_RANKED_COLOR}`)
    expect(cells[1].querySelector('span')!.getAttribute('style')).toContain('font-weight:600')
    // The values' grey reads 3.94:1 on the ranked cell in dark, so its
    // number keeps the ink, set after the grey so it wins.
    expect(cells[0].getAttribute('style')!.endsWith(LABEL_COLOR)).toBe(true)
    expect(cells[1].getAttribute('style')!.endsWith(`background:${GRID_RANKED_COLOR};${INK_COLOR}`)).toBe(true)
  })

  // Key and value part as a section's row does (TJ, 2026-11-04): every head
  // the ink at 600, every value the label grey at 400 in the mono face.
  it('sets its heads in the ink at 600 and its values in the grey', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum, AGGREGATE.maximum],
      rows: [
        {
          kind: 'aggregates',
          label: 'Wind (mph)',
          cells: [
            { text: '3.2', href: null, ranked: false },
            { text: '41.8', href: 'https://example.com', ranked: false },
          ],
        },
        { kind: 'value', label: 'Cloud deck (ft)', cell: { text: '≥30,000', href: null, ranked: false } },
      ],
    })
    const table = mount(html)
    const heads = table.querySelectorAll('th')
    expect(heads).toHaveLength(4)
    for (const th of heads) {
      const style = th.getAttribute('style')!
      expect(style).toContain(INK_COLOR)
      expect(style).toContain('font-weight:600')
      expect(style).not.toContain(LABEL_COLOR)
    }
    const cells = table.querySelectorAll('td[style*="text-align:right"]')
    expect(cells).toHaveLength(3)
    for (const td of cells) {
      expect(td.getAttribute('style')).toContain(LABEL_COLOR)
      const number = td.querySelector('span')!.getAttribute('style')!
      expect(number).toContain('font-family:ui-monospace')
      expect(number).not.toMatch(/font-weight|(^|;)color:/)
    }
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

  // The title row starts at the ×'s own inset and is at least its height, so
  // the title, the button and the × share a centre line (TJ, 2026-11-04).
  it('keeps the close button\'s lane, which map.css widens on a touch screen', () => {
    const html = popupCard({ title: 'Title', link: { href: 'https://example.com', label: 'Open' } })
    expect(html).toContain(`background:${HEADER_BAND_COLOR}`)
    expect(html).toContain('padding:0.375rem var(--popup-close-lane, 2rem) 8px 10px')
    expect(mount(html).querySelector('strong')!.parentElement!.getAttribute('class')).toBe(CARD_TITLE_ROW)
    expect(html).not.toContain('<hr')
  })
})

// The card's one action stands in its title row, left of the ×, where it had
// a foot of its own under the body (TJ, 2026-11-04, the lab's treatment 6).
describe('the card\'s button', () => {
  const ADD = cardButton('data-card-action="add"', 'Add', 'Add to analysis')
  const REMOVE = cardButton('data-card-action="remove"', 'Remove', 'Remove from analysis')
  const card = (action: string, body = '<p>rows</p>') =>
    mount(popupCard({ title: 'Title', link: { href: 'https://example.com', label: 'Open' }, body, action }))

  it('reads a word and is named for the whole phrase', () => {
    const add = within(card(ADD)).getByRole('button', { name: 'Add to analysis' })
    expect(add.textContent).toBe('Add')
    expect(add.getAttribute('type')).toBe('button')
    expect(add.getAttribute('data-card-action')).toBe('add')
    cleanup()
    const remove = within(card(REMOVE)).getByRole('button', { name: 'Remove from analysis' })
    expect(remove.textContent).toBe('Remove')
  })

  // One role, so one width for both words: a press on Add that turns the
  // card's button into Remove moves nothing (TJ, 2026-11-04).
  it('wears one role, at one width, whichever word it says', () => {
    const classes = [ADD, REMOVE].map((html) => {
      cleanup()
      return mount(html).querySelector('button')!.getAttribute('class')
    })
    expect(classes).toEqual([CARD_ACTION, CARD_ACTION])
    expect(CARD_ACTION.split(' ')).toContain('w-16')
  })

  it('stands at the end of the title row, after the name and its link, clear of the ×', () => {
    const popup = card(REMOVE)
    const button = popup.querySelector('button[data-card-action]')!
    const slot = button.parentElement!
    const titleRow = slot.parentElement!
    expect(titleRow.firstElementChild!.tagName).toBe('STRONG')
    expect(titleRow.lastElementChild).toBe(slot)
    expect(titleRow.querySelector('a[data-popup-glyph]')!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Pushed to the row's end, and 4px short of the close lane, which with
    // the lane's own 4px of air stands it 8px off the × at a desk.
    expect(slot.getAttribute('style')).toBe('display:flex;flex:none;margin-left:auto;margin-right:4px')
  })

  // The body ends the card, so no foot follows it: only the handle does.
  it('leaves no foot under the body', () => {
    const root = card(ADD).firstElementChild as HTMLElement
    const parts = [...root.children]
    expect(parts).toHaveLength(3)
    expect(parts[1].hasAttribute('data-popup-body')).toBe(true)
    expect(parts[2].hasAttribute(CARD_RESIZE_ATTR)).toBe(true)
    expect(root.innerHTML).not.toContain('border-top')
  })

  it('stands in the title row of a card with no body too', () => {
    const root = card(ADD, '').firstElementChild as HTMLElement
    expect(root.querySelector('[data-popup-body]')).toBeNull()
    expect(root.querySelector('strong')!.parentElement!.querySelector('button[data-card-action="add"]')).not.toBeNull()
  })
})

// A card is as wide as its widest line (TJ, 2026-11-04): MapLibre's popup
// shrinks to its content under the max width its opener sets, so the card
// sets no width of its own, only the floor every card keeps.
describe('a card\'s width', () => {
  it('sets the floor on its root and no width anywhere', () => {
    const root = mount(popupCard({ title: 'Title', body: '<p>rows</p>' })).firstElementChild as HTMLElement
    expect(root.style.minWidth).toBe(`${POPUP_MIN_WIDTH_PX}px`)
    for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) expect(el.style.width).toBe('')
  })

  // A section heading longer than the cap gives way with its ellipsis rather
  // than widening the card past it.
  it('cuts a heading longer than the card with an ellipsis', () => {
    const LONG = 'Taumatawhakatangihangakōauauotamateapōkaiwhenuakitānatahu Fire Closure Order'
    const html = cardSection({ key: 'area-closure', layer: 'Area closure', name: LONG, open: true, body: '' })
    const text = mount(html).querySelector<HTMLElement>(`[${CARD_FOLD_ATTR}]`)!.parentElement!.children
    const heading = [...text].find((el) => el.textContent!.includes(LONG)) as HTMLElement
    expect(heading.getAttribute('style')).toContain('min-width:0;')
    expect(heading.getAttribute('style')).toContain('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')
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

// A name that changes while its card is open keeps the card one width
// (#752): every name it can take stands in one grid cell, and only the
// shown one is seen or read.
describe('widestName', () => {
  const NAMES = ['No radar echo', 'Moderate precipitation', 'Very heavy precipitation']

  it('shows one name and keeps the rest in the same cell, unseen and unread', () => {
    const name = mount(widestName('No radar echo', NAMES)).firstElementChild as HTMLElement
    expect(name.style.display).toBe('inline-grid')
    const cells = [...name.children] as HTMLElement[]
    expect(cells.map((c) => c.textContent)).toEqual(['No radar echo', 'Moderate precipitation', 'Very heavy precipitation'])
    expect(cells.map((c) => c.style.gridArea.replace(/ /g, ''))).toEqual(Array(3).fill('1/1'))
    expect(cells.map((c) => c.style.visibility)).toEqual(['', 'hidden', 'hidden'])
    expect(cells.map((c) => c.getAttribute('aria-hidden'))).toEqual([null, 'true', 'true'])
  })

  it('holds a name not in the list as well as one in it', () => {
    const cells = [...(mount(widestName('Glacier', NAMES)).firstElementChild as HTMLElement).children]
    expect(cells).toHaveLength(4)
    expect(cells[0].textContent).toBe('Glacier')
  })
})

describe('the facts line', () => {
  // Read off a detached element, since each `mount` renders into the one page.
  const lines = (html: string) => {
    const el = document.createElement('div')
    el.innerHTML = html
    return [...el.children].map((line) => line.textContent)
  }

  // The coordinates alone, then the type, the elevation and the slope (TJ,
  // 2026-10-31, #832).
  it('stands the coordinates alone, then parts the type, elevation and slope with a dot a screen reader skips', () => {
    const popup = mount(factsRow('Trailhead', '3,120 ft', 47.5, -121.25, null, '13° S'))
    expect(lines(factsRow('Trailhead', '3,120 ft', 47.5, -121.25, null, '13° S'))).toEqual([
      '47.50000, -121.25000',
      'Trailhead·3,120 ft·13° S',
    ])
    expect(popup.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('drops a part it does not have, and a line with none', () => {
    expect(lines(factsRow('Lake', null, 47.5, -121.25, null))).toEqual(['47.50000, -121.25000', 'Lake'])
    expect(lines(factsRow(null, null, 47.5, -121.25, null))).toEqual(['47.50000, -121.25000'])
  })

  // The pair is the link and the elevation is not (#712): a place is what a
  // reader takes elsewhere, a measurement is not. The text does not move.
  it('links the coordinates, and only them, where it is given somewhere to go', () => {
    const url = 'https://caltopo.com/map.html#ll=47.50000,-121.25000&z=14'
    const popup = mount(factsRow('Peak', '7,000 ft', 47.5, -121.25, url))
    expect(lines(factsRow('Peak', '7,000 ft', 47.5, -121.25, url))).toEqual(['47.50000, -121.25000', 'Peak·7,000 ft'])
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
    expect(WIDEST_GRID_PX).toBe(360)
    expect(RESULT_POPUP_MAX_WIDTH_PX - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(WIDEST_GRID_PX)
  })

  it('takes the map less 10px a side where the map is narrower', () => {
    expect(resultPopupWidth(1280)).toBe(`${RESULT_POPUP_MAX_WIDTH_PX}px`)
    expect(RESULT_POPUP_MAX_WIDTH_PX).toBe(381)
    expect(resultPopupWidth(360)).toBe('340px')
    expect(resultPopupWidth(320)).toBe('300px')
    expect(resultPopupWidth(0)).toBe('180px')
  })
})

// A reader's drag on the resize handle (TJ, 2026-11-03) runs from the floor
// every card keeps to the map less 10px a side.
describe('cardWidthRange', () => {
  it('runs from the cards\' floor to the map less 10px a side', () => {
    expect(POPUP_MIN_WIDTH_PX).toBe(180)
    expect(cardWidthRange(1280)).toEqual({ min: 180, max: 1260 })
    expect(cardWidthRange(360)).toEqual({ min: 180, max: 340 })
    // A map too narrow for the floor still lets the card keep it.
    expect(cardWidthRange(150)).toEqual({ min: 180, max: 180 })
    expect(resultPopupWidth(360)).toBe(`${cardWidthRange(360).max}px`)
  })
})

// Every card ends on its resize handle (TJ, 2026-11-03): a pointer-only grip
// in the bottom-right corner, hidden from a screen reader and out of the tab
// order, in the glyph grey that lights under a pointer.
describe('the resize handle', () => {
  const card = () => mount(popupCard({ title: 'Title', body: '<p>rows</p>', action: '<button type="button">Act</button>' }))

  it('is the last thing in the card, standing in its corner', () => {
    const popup = card()
    const root = popup.firstElementChild as HTMLElement
    expect(root.style.position).toBe('relative')
    const handle = root.lastElementChild as HTMLElement
    expect(handle.hasAttribute(CARD_RESIZE_ATTR)).toBe(true)
    expect(popup.querySelectorAll(`[${CARD_RESIZE_ATTR}]`)).toHaveLength(1)
    expect(handle.getAttribute('class')).toBe(CARD_RESIZE)
  })

  // With no foot under it, the body ends the card, so it keeps the handle's
  // height clear at its end: the handle stands under the last section, not
  // over a folded heading's chevron or a grid's last number (TJ, 2026-11-04).
  it('stands under the body\'s end, which keeps its height clear', () => {
    const body = card().querySelector<HTMLElement>('[data-popup-body]')!
    expect(body.getAttribute('class')).toBe(CARD_BODY_END)
    expect(body.style.paddingBottom).toBe('')
    expect(body.style.paddingTop).toBe('8px')
  })

  // A name would be a new string for a control the keyboard cannot work, and
  // a keyboard reader has the body's scroll.
  it('is hidden from a screen reader, named nothing, and never focused', () => {
    const handle = card().querySelector<HTMLElement>(`[${CARD_RESIZE_ATTR}]`)!
    expect(handle.tagName).toBe('SPAN')
    expect(handle.getAttribute('aria-hidden')).toBe('true')
    expect(handle.hasAttribute('aria-label')).toBe(false)
    expect(handle.hasAttribute('tabindex')).toBe(false)
    expect(handle.textContent).toBe('')
  })

  it('draws the grip in the glyph grey that takes the accent under a pointer', () => {
    const handle = card().querySelector<HTMLElement>(`[${CARD_RESIZE_ATTR}]`)!
    expect(handle.hasAttribute('data-popup-glyph')).toBe(true)
    expect(handle.getAttribute('style')).toBe(`color:${HEADER_ICON_COLOR}`)
    const svg = handle.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect([...svg.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a))))).toEqual(
      GRIP.lines.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]),
    )
    expect(svg.getAttribute('width')).toBe(String(GRIP_PX))
  })
})

// A map too narrow for the widest grid at full inset takes 1px insets and a
// 6px label gap (TJ, 2026-10-08 and 2026-10-22; 1px since 2026-11-04).
// Measured on macOS, a grid with a two-digit window total is then 318.2px,
// which a 360px phone's 320px of body holds.
describe('compactGrid', () => {
  it('keeps the full inset wherever the widest grid fits it', () => {
    expect(compactGrid(1280)).toBe(false)
    expect(compactGrid(400)).toBe(false)
  })

  it('takes the compact inset on a narrower map', () => {
    expect(compactGrid(399)).toBe(true)
    expect(compactGrid(360)).toBe(true)
    expect(parseFloat(resultPopupWidth(360)) - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(318.2)
  })
})


describe("an overlay's facts line and body", () => {
  it('parts the kind and its figure with the dot a destination wears, and cuts rather than wraps', () => {
    const line = mount(factsLine(['Trail closure', 'BACON CR 1060000']))
    expect(line.textContent).toBe('Trail closure·BACON CR 1060000')
    expect(line.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(line.firstElementChild!.getAttribute('style')).toContain('text-overflow:ellipsis')
  })

  it('leaves off a part or a line it does not have', () => {
    expect(mount(factsLine(['Smoke', null, ''])).textContent).toBe('Smoke')
    expect(bodyLines([null, 'Colville National Forest', undefined])).toBe('<div>Colville National Forest</div>')
  })
})

// One date line for every source that says when it measured: a fire's survey,
// the snow analysis, the radar frame (TJ, 2026-10-16).
describe('the updated line', () => {
  it('labels the date and sets it as fine print', () => {
    const line = mount(updatedLine('Oct 16, 2026, 5:00 AM'))
    expect(line.textContent).toBe('Updated: Oct 16, 2026, 5:00 AM')
    expect(line.firstElementChild!.getAttribute('style')).toContain('font-style:italic')
  })

  // A source the card names says the time beside its own name, `NEXRAD
  // radar: 10 min ago`, in place of `Updated:` (TJ, 2026-11-03).
  it('names the source in place of the label where there is one', () => {
    expect(mount(updatedLine('10 min ago', 'NEXRAD radar')).textContent).toBe('NEXRAD radar: 10 min ago')
  })

  it('sets fine print small, italic and stepped back', () => {
    expect(fineprint('Updated: today')).toBe(
      `<span style="color:${FINE_COLOR};font-size:11px;font-style:italic">Updated: today</span>`,
    )
  })

  it("formats a source's time with its date, and leaves the line off without one", () => {
    // The reader's locale and zone decide the rendering, so only its two
    // halves are asserted.
    expect(updatedAt(Date.UTC(2026, 9, 16, 12))).toMatch(/2026.*\d:\d\d/)
    expect(updatedAt(null)).toBeNull()
    expect(updatedAt(undefined)).toBeNull()
    expect(updatedAt(Number.NaN)).toBeNull()
    expect(updatedAt(9e15)).toBeNull()
  })
})

// A plume's window and a fire detection are hours old at most, so the year
// is left off (#799). America/Los_Angeles, the zone the suite runs in.
describe('monthDayTime', () => {
  it('names the month, the day and the time, and no year', () => {
    expect(monthDayTime(new Date(Date.UTC(2026, 9, 29, 17, 12)))).toMatch(/^Oct 29, 10:12\s?AM$/)
  })
})

// The radar frame's words, and a fire detection's, which runs to hours (#799).
describe('ageAgo', () => {
  const MIN = 60 * 1000
  it.each([
    [0, 'now'],
    [59 * 1000, 'now'],
    [-10 * MIN, 'now'],
    [MIN, '1 min ago'],
    [40 * MIN, '40 min ago'],
    [59 * MIN + 59 * 1000, '59 min ago'],
    [60 * MIN, '1 hour ago'],
    [119 * MIN, '1 hour ago'],
    [120 * MIN, '2 hours ago'],
    [47 * 60 * MIN + 59 * MIN, '47 hours ago'],
  ])('reads %d ms as %j', (ms, words) => {
    expect(ageAgo(ms)).toBe(words)
  })
})

describe('dateOfMs', () => {
  it('is the instant a finite stamp inside the range names', () => {
    expect(dateOfMs(Date.UTC(2026, 9, 16, 12))?.toISOString()).toBe('2026-10-16T12:00:00.000Z')
    expect(dateOfMs(0)?.getTime()).toBe(0)
  })

  it('is null for no stamp, a stamp that is no number, and one past the range', () => {
    for (const ms of [null, undefined, Number.NaN, Infinity, 9e15, -9e15]) expect(dateOfMs(ms)).toBeNull()
  })
})

// One section of a card (#832): its heading on the band, the link out where
// the thing has a page, the fold's chevron, and the body only while it is
// open. Mounted the way MapLibre mounts it, so the structure is read off the
// DOM a reader gets.
describe('cardSection', () => {
  // A test mounts a second section to compare against the first, so the
  // first is taken down before, or the popup is found twice.
  const section = (over: Partial<Parameters<typeof cardSection>[0]> = {}) => {
    cleanup()
    return mount(
      cardSection({
        key: 'fire',
        layer: 'Active wildfire',
        name: 'Bolt Creek',
        open: true,
        body: '<div data-testid="body">Size: 10 acres</div>',
        ...over,
      }),
    )
  }
  const fold = (popup: HTMLElement) => popup.querySelector(`[${CARD_FOLD_ATTR}]`) as HTMLButtonElement
  const band = (popup: HTMLElement) => popup.firstElementChild as HTMLElement
  const headingText = (popup: HTMLElement) => fold(popup).parentElement!.querySelector('div') as HTMLElement

  // The layer's word and its colon at the heading weight, the name after it
  // regular, both in the ink, on one line cut with an ellipsis (TJ,
  // 2026-11-03).
  it('opens on the layer semibold and the name regular, in the ink, on one line', () => {
    const text = headingText(section())
    expect(text.textContent).toBe('Active wildfire: Bolt Creek')
    expect(text.getAttribute('style')).toContain(INK_COLOR)
    expect(text.getAttribute('style')).not.toContain('font-weight')
    expect(text.getAttribute('style')).toContain('text-overflow:ellipsis')
    expect(text.getAttribute('style')).toContain('white-space:nowrap')
    const word = text.querySelector('span')!
    expect(word.textContent).toBe('Active wildfire:')
    expect(word.getAttribute('style')).toBe('font-weight:600')
  })

  it('stands the layer alone, with no colon, where there is no name', () => {
    expect(headingText(section({ layer: 'Forecast', name: undefined })).textContent).toBe('Forecast')
  })

  // The band fill, run through the body's 10px sides to the card's edges,
  // with the rows' inset inside it, as tall as the fold's box at least.
  it('draws the heading on the band, edge to edge, at the rows\' inset', () => {
    const style = band(section()).getAttribute('style')!
    expect(style).toContain(`background:${SECTION_BAND_COLOR}`)
    expect(SECTION_BAND_COLOR).toBe(HEADER_BAND_COLOR)
    expect(style).toContain('margin:0 -10px')
    expect(style).toContain('padding:0 10px')
    expect(style).toContain('min-height:24px')
    expect(style).toContain('display:flex')
  })

  // A warning lays the amber over the band and stands the table's own mark
  // in a slot of fixed width before the layer's word, so a name cut short
  // never moves it.
  it('stands a warning on the amber band, the mark in a fixed slot before the layer', () => {
    const popup = section({ warning: true })
    expect(band(popup).getAttribute('style')).toContain(`background:${WARNING_BAND_COLOR}`)
    const [slot, text] = Array.from(band(popup).children) as HTMLElement[]
    expect(slot.tagName).toBe('SPAN')
    expect(slot.textContent).toBe(WARNING_MARK)
    expect(slot.getAttribute('style')).toContain('flex:none')
    expect(slot.getAttribute('style')).toContain('width:1.5em')
    expect(text.textContent).toBe('Active wildfire: Bolt Creek')
    // The mark is text, as the table's cell is, which a screen reader names
    // itself; no label of the app's own.
    expect(slot.hasAttribute('aria-label')).toBe(false)
    expect(slot.hasAttribute('aria-hidden')).toBe(false)
  })

  it('carries no mark and the plain band where it is no warning', () => {
    const popup = section()
    expect(popup.textContent).not.toContain(WARNING_MARK)
    expect(band(popup).getAttribute('style')).not.toContain(WARNING_BAND_COLOR)
  })

  it('shows the body only while open, a step under the heading', () => {
    const body = within(section()).getByTestId('body')
    expect(body.textContent).toBe('Size: 10 acres')
    expect(body.parentElement!.getAttribute('style')).toBe('padding-top:4px')
    expect(within(section({ open: false })).queryByTestId('body')).toBeNull()
  })

  // Down while the body shows, up while it is folded, as the results bar reads.
  it('points the chevron down while open and up while folded', () => {
    expect(fold(section()).querySelector('polyline')!.getAttribute('points')).toBe(CHEVRON.down)
    expect(fold(section({ open: false })).querySelector('polyline')!.getAttribute('points')).toBe(CHEVRON.up)
  })

  // Named for the layer, so a screen reader hears the layer and whether it is
  // expanded rather than a word of the app's own.
  it('names the fold for the layer and says whether it is expanded', () => {
    const button = fold(section())
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute(CARD_FOLD_ATTR)).toBe('fire')
    expect(button.getAttribute('aria-label')).toBe('Active wildfire')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(fold(section({ open: false })).getAttribute('aria-expanded')).toBe('false')
  })

  it('wears the fold role and lights as a glyph', () => {
    const button = fold(section())
    expect(button.getAttribute('class')).toBe(CARD_FOLD)
    expect(button.hasAttribute('data-popup-glyph')).toBe(true)
    expect(button.getAttribute('style')).toContain('color:var(--popup-glyph)')
  })

  it('carries the link-out glyph only with a link, named for a screen reader', () => {
    expect(within(section()).queryAllByRole('link')).toHaveLength(0)
    const [link] = within(section({ link: { href: 'https://nifc.example/?a=1&b=2', label: 'View on NIFC map' } })).getAllByRole('link')
    expect(link.getAttribute('href')).toBe('https://nifc.example/?a=1&b=2')
    expect(link.getAttribute('aria-label')).toBe('View on NIFC map')
    expect(link.hasAttribute('data-popup-glyph')).toBe(true)
  })

  // The link stands beside the name and the fold at the row's end, folded or
  // open, with the mark first on a warning.
  it('keeps the name, the link and the fold on one row whether open or folded', () => {
    const link = { href: 'https://nifc.example/', label: 'View on NIFC map' }
    for (const isOpen of [true, false]) {
      expect(Array.from(band(section({ link, open: isOpen })).children).map((c) => c.tagName)).toEqual(['DIV', 'A', 'BUTTON'])
      expect(Array.from(band(section({ link, open: isOpen, warning: true })).children).map((c) => c.tagName)).toEqual([
        'SPAN',
        'DIV',
        'A',
        'BUTTON',
      ])
    }
  })
})

// A card's sections part on their bands with a gap of the card's surface
// between them, where a hairline ruled them off before (TJ, 2026-11-03).
describe('cardSections', () => {
  it('stands each section after the first a gap below the one above, and rules none off', () => {
    const html = cardSections(['<p>one</p>', '<p>two</p>', '<p>three</p>'])
    expect(html).toBe(`<p>one</p><div style="margin-top:${SECTION_GAP}"><p>two</p></div><div style="margin-top:${SECTION_GAP}"><p>three</p></div>`)
    expect(SECTION_GAP).toBe('8px')
    expect(cardSections(['<p>one</p>'])).toBe('<p>one</p>')
    expect(cardSections([])).toBe('')
  })
})

// A section's row (TJ, 2026-11-03, the design lab's mockup 1): the key
// semibold in the ink, the value regular in the label's grey and the values'
// face. A grey key over a dark value read as inverted.
describe('row', () => {
  it('sets the key semibold in the ink and the value regular in the grey mono', () => {
    const line = mount(row('Size', '10 acres')).firstElementChild as HTMLElement
    expect(line.textContent).toBe('Size: 10 acres')
    const [key, value] = Array.from(line.querySelectorAll('span'))
    expect(key.textContent).toBe('Size')
    expect(key.getAttribute('style')).toBe(`${INK_COLOR};font-weight:600`)
    expect(value.textContent).toBe('10 acres')
    expect(value.getAttribute('style')).toContain('font-family:ui-monospace')
    expect(value.getAttribute('style')).toContain(LABEL_COLOR)
    expect(value.getAttribute('style')).not.toContain('font-weight')
  })

  // A linked value is the grey value still: a card's link takes its text's colour.
  it('links the value alone, in its grey', () => {
    const line = mount(row('Wind', '5.0', 'https://www.windy.com/')).firstElementChild as HTMLElement
    const link = within(line).getByRole('link')
    expect(link.textContent).toBe('5.0')
    expect(link.querySelector('span')!.getAttribute('style')).toContain(LABEL_COLOR)
  })
})

// A phone's map is the constraint, not the content: a 300px card on a 320px
// map is the whole map, and with the chart and table open the map can be a
// couple of hundred pixels tall.
describe('sizing a popup to the map it opens on', () => {
  it('takes the ceiling on a desktop-sized canvas', () => {
    expect(popupWidth(1200)).toBe(`${POPUP_MAX_WIDTH_PX}px`)
  })

  // The bug this exists for: subtracting a fixed margin from a phone-width map
  // still left the ceiling winning, so the card was 88% of the map.
  it('leaves a real band of map either side on a phone', () => {
    const px = Number(popupWidth(320).replace('px', ''))
    expect(px).toBeLessThan(POPUP_MAX_WIDTH_PX)
    expect(320 - px).toBeGreaterThanOrEqual(48)
  })

  it('never collapses to unreadable, however narrow the canvas', () => {
    expect(Number(popupWidth(0).replace('px', ''))).toBeGreaterThanOrEqual(180)
  })
})
