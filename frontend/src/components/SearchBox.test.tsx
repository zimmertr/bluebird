import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import SearchBox from './SearchBox'
import { SEARCH_LIMIT, searchPlaces } from '../utils/geocode'
import { place } from '../testSupport/fixtures'
import { render } from '../testSupport/render'
import { MAP_PILL } from '../styles'

// The geocoder is the one thing replaced: it is a network call to Nominatim,
// whose usage policy is the reason the box searches on Enter at all. The
// coordinate parser stays real, because answering a coordinate pair without
// the network is the box's own behavior.
vi.mock('../utils/geocode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/geocode')>()),
  searchPlaces: vi.fn(),
}))
const search = vi.mocked(searchPlaces)

const onSelect = vi.fn()
beforeEach(() => {
  search.mockReset()
  onSelect.mockClear()
})

const field = () => screen.getByRole('combobox', { name: 'Search for a place' })

describe('SearchBox', () => {
  it('does not search while the reader types', async () => {
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount Baker')
    expect(search).not.toHaveBeenCalled()
  })

  it('searches on Enter and picks a lone result', async () => {
    search.mockResolvedValue([place()])
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(search).toHaveBeenCalledOnce()
    expect(search.mock.lastCall?.[0]).toBe('Mount Baker')
    expect(onSelect).toHaveBeenCalledWith(place())
  })

  it('lists several results and takes the highlighted one on Enter', async () => {
    const second = place({ label: 'Mount Baker', description: 'Mount Baker, Uganda', lat: 0.38, lon: 29.87 })
    search.mockResolvedValue([place(), second])
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(await screen.findByRole('listbox', { name: 'Search results' })).toBeTruthy()
    expect(onSelect).not.toHaveBeenCalled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(second)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  // A combobox (#576): the field keeps the keyboard and says which place the
  // highlight is on, so a screen reader hears the arrow keys move.
  it('is a combobox that names the highlighted place', async () => {
    const second = place({ label: 'Mount Baker', description: 'Mount Baker, Uganda', lat: 0.38, lon: 29.87 })
    search.mockResolvedValue([place(), second])
    const { user } = render(<SearchBox onSelect={onSelect} />)
    expect(field().getAttribute('aria-expanded')).toBe('false')
    await user.type(field(), 'Mount Baker{Enter}')
    const list = await screen.findByRole('listbox', { name: 'Search results' })
    expect(field().getAttribute('aria-expanded')).toBe('true')
    expect(field().getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(field().getAttribute('aria-activedescendant')).toBe(options[0].id)
    await user.keyboard('{ArrowDown}')
    expect(field().getAttribute('aria-activedescendant')).toBe(options[1].id)
    // An option holds no control of its own; the field is the one Tab stop.
    expect(list.querySelector('button')).toBeNull()
    await user.click(options[0])
    expect(onSelect).toHaveBeenCalledWith(place())
  })

  // The map's view rides the search (#711), read at Enter: what the reader is
  // looking at biases the geocoder's answer and orders the list.
  it('hands the map\'s view to the search when it has one', async () => {
    const view = { west: -123, south: 46, east: -120, north: 49, lat: 47.5, lon: -121.5 }
    search.mockResolvedValue([place()])
    const { user } = render(<SearchBox onSelect={onSelect} view={() => view} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(search.mock.lastCall?.[3]).toEqual(view)
  })

  it('searches with no view before the map exists', async () => {
    search.mockResolvedValue([place()])
    const { user } = render(<SearchBox onSelect={onSelect} view={() => null} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(search.mock.lastCall?.[3]).toBeNull()
  })

  // Ten places, the pod's ceiling, where it asked for five (#696).
  it('asks for ten places', async () => {
    search.mockResolvedValue([place()])
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(SEARCH_LIMIT).toBe(10)
    expect(search.mock.lastCall?.[2]).toBe(SEARCH_LIMIT)
  })

  // The list scrolls past six or so places, so the arrow keys bring the
  // highlighted one into view, and only as far as it takes (#696).
  describe('a list longer than its box', () => {
    const scrolled = vi.fn()
    const original = Element.prototype.scrollIntoView
    beforeEach(() => {
      scrolled.mockClear()
      Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
        scrolled(this.id, arg)
      }
    })
    afterEach(() => {
      Element.prototype.scrollIntoView = original
    })

    it('scrolls the highlighted place into view as the arrow keys move it', async () => {
      const places = Array.from({ length: SEARCH_LIMIT }, (_, i) =>
        place({ label: `Mount Baker ${i}`, lat: 48 + i / 100, lon: -121.8 }),
      )
      search.mockResolvedValue(places)
      const { user } = render(<SearchBox onSelect={onSelect} />)
      await user.type(field(), 'Mount Baker{Enter}')
      const options = await screen.findAllByRole('option')
      expect(options).toHaveLength(SEARCH_LIMIT)
      for (let i = 0; i < 8; i++) await user.keyboard('{ArrowDown}')
      expect(field().getAttribute('aria-activedescendant')).toBe(options[8].id)
      expect(scrolled).toHaveBeenLastCalledWith(options[8].id, { block: 'nearest' })
      await user.keyboard('{ArrowUp}')
      expect(scrolled).toHaveBeenLastCalledWith(options[7].id, { block: 'nearest' })
    })
  })

  // The phone's pill (#696): the slot's size in the pill's face, and a report
  // each time the field takes or leaves the keyboard or its list opens or
  // shuts, which widens the pill and steps the chip row aside.
  it('reports while it is in use as a pill, and holds open while its list is', async () => {
    const expanded = vi.fn()
    search.mockResolvedValue([place(), place({ label: 'Baker Lake', lat: 48.7 })])
    const { user } = render(
      <>
        <SearchBox onSelect={onSelect} pill onExpandedChange={expanded} />
        <button>Elsewhere</button>
      </>,
    )
    expect(field().parentElement!.className).toBe(MAP_PILL)
    expect(expanded).toHaveBeenLastCalledWith(false)
    await user.click(field())
    expect(expanded).toHaveBeenLastCalledWith(true)
    await user.keyboard('Mount Baker{Enter}')
    await screen.findAllByRole('option')
    // A press on a result begins by taking the keyboard from the field; the
    // open list keeps the pill wide under the finger.
    field().blur()
    expect(expanded).toHaveBeenLastCalledWith(true)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(expanded).toHaveBeenLastCalledWith(false)
  })

  // A notice that arrives holding its text is not announced by most screen
  // readers, so it lands in a region that was already there (#576).
  it('says a failed search into a region mounted before it', async () => {
    search.mockRejectedValue(new Error('down'))
    const { user } = render(<SearchBox onSelect={onSelect} />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    await user.type(field(), 'Mount Baker{Enter}')
    expect(await screen.findByText('Search failed. Try again later.')).toBeTruthy()
    expect(region.textContent).toBe('Search failed. Try again later.')
  })

  // A label on an element with no role is read by nobody, so the wait is a
  // named picture (#576).
  it('names the spinner while a search runs', async () => {
    search.mockReturnValue(new Promise(() => {}))
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount Baker{Enter}')
    expect(screen.getByRole('img', { name: 'Searching' })).toBeTruthy()
  })

  it('answers a coordinate pair without the geocoder', async () => {
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), '46.8523, -121.7603{Enter}')
    expect(search).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'coordinates', lat: 46.8523, lon: -121.7603 }),
    )
  })

  it('says so when nothing is found, and typing clears it', async () => {
    search.mockResolvedValue([])
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Nowhere{Enter}')
    expect(await screen.findByText('No places found.')).toBeTruthy()
    await user.type(field(), 's')
    expect(screen.queryByText('No places found.')).toBeNull()
  })

  it('clears the text and keeps the focus in the field', async () => {
    const { user } = render(<SearchBox onSelect={onSelect} />)
    await user.type(field(), 'Mount')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect((field() as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(field())
  })
})
