import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/react'
import { render } from '../../testSupport/render'
import { resultRow } from '../../testSupport/fixtures'
import {
  CARD_FOLD_ATTR,
  GRID_BAND_COLOR,
  GRID_COMPACT_INSET_PX,
  GRID_COMPACT_LABEL_GAP_PX,
  GRID_INSET_PX,
  GRID_LABEL_GAP_PX,
  GRID_RANKED_COLOR,
  HEADER_BAND_COLOR,
  LABEL_COLOR,
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
  cardSection,
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
import { CHEVRON } from '../../iconPaths'
import { CARD_FOLD } from '../../styles'
import { destinationPopupHtml } from '../destinationCard'
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
      layer: 'Area closures',
      title: 'Probe Fire Closure',
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
  // do (TJ, 2026-10-16, #740): a grid number in the card's ink, the
  // coordinates in the facts line's grey. Its underline is `map.css`'s, on
  // the attribute, which answers a hover and a touch screen (#786).
  it('marks a link in the colour of the text around it, for the stylesheet to underline', () => {
    const html = metricGrid({
      columns: [AGGREGATE.minimum],
      rows: [{ kind: 'aggregates', label: 'Wind (mph)', cells: [{ text: '3.2', href: 'https://example.com', ranked: false }] }],
    })
    const link = mount(html).querySelector('td a')!
    expect(link.closest('td')!.getAttribute('style')).not.toMatch(/(^|;)color:/)
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
    expect(WIDEST_GRID_PX).toBe(353)
    expect(RESULT_POPUP_MAX_WIDTH_PX - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(WIDEST_GRID_PX)
  })

  it('takes the map less 10px a side where the map is narrower', () => {
    expect(resultPopupWidth(1280)).toBe(`${RESULT_POPUP_MAX_WIDTH_PX}px`)
    expect(RESULT_POPUP_MAX_WIDTH_PX).toBe(374)
    expect(resultPopupWidth(360)).toBe('340px')
    expect(resultPopupWidth(320)).toBe('300px')
    expect(resultPopupWidth(0)).toBe('180px')
  })
})

// A map too narrow for the widest grid at full inset takes 2px insets and a
// 6px label gap (TJ, 2026-10-08 and 2026-10-22). Measured on macOS, a grid
// with a two-digit window total is then 319.7px, which a 360px phone's 320px
// of body holds.
describe('compactGrid', () => {
  it('keeps the full inset wherever the widest grid fits it', () => {
    expect(compactGrid(1280)).toBe(false)
    expect(compactGrid(400)).toBe(false)
    expect(compactGrid(393)).toBe(false)
  })

  it('takes the compact inset on a narrower map', () => {
    expect(compactGrid(392)).toBe(true)
    expect(compactGrid(360)).toBe(true)
    expect(parseFloat(resultPopupWidth(360)) - 2 * RESULT_CARD_PAD_PX).toBeGreaterThanOrEqual(319.7)
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

// One section of a card (#832): its name, the link out where the thing has a
// page, the fold's chevron, and the body only while it is open. Mounted the
// way MapLibre mounts it, so the structure is read off the DOM a reader gets.
describe('cardSection', () => {
  const section = (over: Partial<Parameters<typeof cardSection>[0]> = {}) =>
    mount(
      cardSection({
        key: 'fire',
        heading: 'Active wildfires: Bolt Creek',
        label: 'Active wildfires',
        open: true,
        body: '<div data-testid="body">Size: 10 acres</div>',
        ...over,
      }),
    )
  const fold = (popup: HTMLElement) => popup.querySelector(`[${CARD_FOLD_ATTR}]`) as HTMLButtonElement

  it('opens on its heading, on one line', () => {
    const heading = section().firstElementChild!.firstElementChild as HTMLElement
    expect(heading.textContent).toBe('Active wildfires: Bolt Creek')
    expect(heading.getAttribute('style')).toContain('font-weight:600')
    expect(heading.getAttribute('style')).toContain('text-overflow:ellipsis')
    expect(heading.getAttribute('style')).toContain('white-space:nowrap')
  })

  it('shows the body only while open', () => {
    expect(within(section()).getByTestId('body').textContent).toBe('Size: 10 acres')
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
    expect(button.getAttribute('aria-label')).toBe('Active wildfires')
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
  // open.
  it('keeps the name, the link and the fold on one row whether open or folded', () => {
    const link = { href: 'https://nifc.example/', label: 'View on NIFC map' }
    for (const isOpen of [true, false]) {
      const line = section({ link, open: isOpen }).firstElementChild as HTMLElement
      expect(line.getAttribute('style')).toContain('display:flex')
      expect(Array.from(line.children).map((c) => c.tagName)).toEqual(['DIV', 'A', 'BUTTON'])
    }
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
