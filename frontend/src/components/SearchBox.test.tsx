import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import SearchBox from './SearchBox'
import { searchPlaces } from '../utils/geocode'
import { place } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

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

const field = () => screen.getByRole('textbox', { name: 'Search for a place' })

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
