import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import DestinationsSection from './DestinationsSection'
import { render } from '../testSupport/render'
import { place } from '../testSupport/fixtures'
import { PRESET_LISTS, PRESET_REGIONS } from '../utils/presetLists'
import { MAX_AREAS } from '../utils/drawGeometry'
import { STARRED_LISTS_KEY } from '../utils/viewPrefs'
import type { DiscoveryType, GeoPolygon } from '../types'

// The section's own behavior (record 0306): the chips that name every
// destination added, the search beside them at a desk, Search by list and
// Search by area with their lines, the draw readout while an area is drawn,
// the kinds the areas look for, and the coordinates box, which frames a paste
// but never a keystroke.

type Props = ComponentProps<typeof DestinationsSection>

function props(over: Partial<Props> = {}): Props {
  const noop = () => {}
  return {
    areas: [],
    areaKm2s: [],
    drawing: false,
    drawPointCount: 0,
    onStartArea: noop,
    onEditArea: noop,
    onRemoveArea: noop,
    onFinishDrawing: noop,
    onCancelDrawing: noop,
    areaTooLarge: false,
    areaCount: 0,
    draftAreaKm2: null,
    maxAreaKm2: 100_000,
    onPointAtMapPois: noop,
    destinationTypes: ['peak'],
    setDestinationTypes: noop,
    includeUnnamedPeaks: false,
    setIncludeUnnamedPeaks: noop,
    presetLists: { ids: [], add: noop, remove: noop },
    customCsv: '',
    setCustomCsv: noop,
    parsedCount: 0,
    onCsvPasted: noop,
    places: [],
    onRemovePlace: noop,
    onFramePlace: noop,
    ...over,
  }
}

const AREA: GeoPolygon = { type: 'Polygon', coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
// One finished area a search can use: the kinds stand under it, live.
const ONE_AREA = { areas: [AREA], areaKm2s: [453.2], areaCount: 1 } as const

const coordinates = () => screen.getByRole('textbox', { name: /^Custom destination coordinates/ })
const noBox = () => screen.queryByRole('textbox', { name: /^Custom destination coordinates/ }) === null
const byList = () => screen.getByRole('button', { name: /^Search by list/ })
const byArea = () => screen.getByRole('button', { name: /^Search by area/ }) as HTMLButtonElement
// The box stands once Your own coordinates is picked.
async function openBox(user: ReturnType<typeof render>['user']) {
  await user.click(byList())
  await user.click(screen.getByRole('button', { name: 'Your own coordinates' }))
}
// A list's row in the menu, named by its name and its peak count, and its
// region's heading, which opens the rows (#848). A heading stands under the
// headings above it, so opening one opens each of those first (#892).
const peaks = (count: number) => `${count} ${count === 1 ? 'peak' : 'peaks'}`
const listRow = (list: (typeof PRESET_LISTS)[number]) =>
  screen.getByRole('button', { name: `${list.name} ${peaks(list.peaks)}` })
const pathTo = (region: string): string[] => {
  const parent = PRESET_REGIONS.find((each) => each.name === region)?.parent ?? null
  return parent === null ? [region] : [...pathTo(parent), region]
}
const holdsLists = (region: string): boolean =>
  PRESET_LISTS.some((list) => list.region === region) ||
  PRESET_REGIONS.some((each) => each.parent === region && holdsLists(each.name))
async function openRegion(user: ReturnType<typeof render>['user'], region: string) {
  for (const name of pathTo(region)) {
    const heading = screen.getByRole('button', { name: new RegExp(`^${name} \\d+ lists?$`) })
    if (heading.getAttribute('aria-expanded') !== 'true') await user.click(heading)
  }
}

describe('DestinationsSection', () => {
  describe('the two ways to add', () => {
    // Each says what it does while nothing is added (TJ, 2026-11-17), and
    // the lines go once anything is, so the pair shrinks to its names.
    it('offers Search by list and Search by area, each with its line until anything is added', () => {
      const { rerender } = render(<DestinationsSection {...props()} />)
      expect(byList().textContent).toBe('Search by listChoose a peak list or provide coordinates')
      expect(byArea().textContent).toBe('Search by areaDraw a shape and search within it')
      rerender(<DestinationsSection {...props(ONE_AREA)} />)
      expect(byList().textContent).toBe('Search by list')
      expect(byArea().textContent).toBe('Search by area')
    })

    it('starts an area, and offers no new one at the cap', async () => {
      const onStartArea = vi.fn()
      const { user, rerender } = render(<DestinationsSection {...props({ onStartArea })} />)
      await user.click(byArea())
      expect(onStartArea).toHaveBeenCalledOnce()
      const full = Array.from({ length: MAX_AREAS }, () => AREA)
      rerender(<DestinationsSection {...props({ areas: full, areaKm2s: full.map(() => 1), areaCount: MAX_AREAS })} />)
      expect(byArea().disabled).toBe(true)
    })

    it('adds a list from the menu, under its region', async () => {
      const add = vi.fn()
      const list = PRESET_LISTS[0]
      const { user } = render(<DestinationsSection {...props({ presetLists: { ids: [], add, remove: vi.fn() } })} />)
      expect(byList().getAttribute('aria-haspopup')).toBe('dialog')
      await user.click(byList())
      await openRegion(user, list.region)
      await user.click(listRow(list))
      expect(add).toHaveBeenCalledExactlyOnceWith(list.id)
      expect(noBox()).toBe(true)
    })

    // The menu opens on the headings no heading stands over, A to Z, and a
    // heading with no list under it is not drawn; Your own coordinates
    // stands apart at its foot.
    it('offers every list under its region, then Your own coordinates apart', async () => {
      const { user } = render(<DestinationsSection {...props()} />)
      await user.click(byList())
      const under = (parent: string | null) =>
        PRESET_REGIONS.filter((region) => region.parent === parent && holdsLists(region.name)).map((region) => region.name)
      const top = under(null)
      expect(screen.getAllByRole('button', { name: /\d+ lists?$/ }).map((b) => b.textContent!.replace(/ \d+ lists?$/, ''))).toEqual(
        top.length === 1 ? [top[0], ...under(top[0])] : top,
      )
      const region = PRESET_LISTS[0].region
      await openRegion(user, region)
      const rows = within(screen.getByRole('group', { name: region })).getAllByRole('button', { name: /\d+ peaks?$/ })
      expect(rows.map((b) => b.textContent)).toEqual(
        PRESET_LISTS.filter((list) => list.region === region).map((list) => `${list.name} ${peaks(list.peaks)}`),
      )
      expect(screen.getByRole('button', { name: 'Your own coordinates' }).previousElementSibling!.getAttribute('aria-hidden')).toBe(
        'true',
      )
    })

    // A star is this browser's habit (#848): it is kept across a reload, and
    // the starred list stands first under Starred.
    it('keeps a starred list in this browser and shows it first', async () => {
      const list = PRESET_LISTS[0]
      const { user, unmount } = render(<DestinationsSection {...props()} />)
      await user.click(byList())
      await openRegion(user, list.region)
      await user.click(screen.getByRole('button', { name: `Star ${list.name}` }))
      expect(JSON.parse(localStorage.getItem(STARRED_LISTS_KEY)!)).toEqual([list.id])
      unmount()
      const again = render(<DestinationsSection {...props()} />)
      await again.user.click(byList())
      const starredGroup = screen.getByRole('group', { name: 'Starred' })
      expect(within(starredGroup).getByRole('button', { name: `${list.name} ${peaks(list.peaks)}` })).toBeTruthy()
      await again.user.click(within(starredGroup).getByRole('button', { name: `Star ${list.name}` }))
      expect(localStorage.getItem(STARRED_LISTS_KEY)).toBeNull()
    })
  })

  describe('the chips', () => {
    const chipNames = () =>
      screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')!.replace(/^Remove /, ''))

    // Lists first, then the reader's own coordinates, the areas and the
    // places, each with its ×.
    it('names every list, area and place, each with its count or size', () => {
      const list = PRESET_LISTS[0]
      render(
        <DestinationsSection
          {...props({
            ...ONE_AREA,
            presetLists: { ids: [list.id], add: vi.fn(), remove: vi.fn() },
            customCsv: '1,2',
            parsedCount: 1,
            places: [place()],
          })}
        />,
      )
      expect(chipNames()).toEqual([`${list.name} · ${list.peaks}`, 'Your own coordinates', 'Area 1 · ~453 km²', 'Mount Baker'])
    })

    it('removes each from its own ×', async () => {
      const list = PRESET_LISTS[0]
      const remove = vi.fn()
      const onRemoveArea = vi.fn()
      const onRemovePlace = vi.fn()
      const setCustomCsv = vi.fn()
      const baker = place()
      const { user } = render(
        <DestinationsSection
          {...props({
            areas: [AREA, AREA],
            areaKm2s: [10, 20],
            areaCount: 2,
            presetLists: { ids: [list.id], add: vi.fn(), remove },
            customCsv: '1,2',
            setCustomCsv,
            places: [baker],
            onRemoveArea,
            onRemovePlace,
          })}
        />,
      )
      await user.click(screen.getByRole('button', { name: `Remove ${list.name} · ${list.peaks}` }))
      expect(remove).toHaveBeenCalledExactlyOnceWith(list.id)
      await user.click(screen.getByRole('button', { name: 'Remove Area 2 · ~20 km²' }))
      expect(onRemoveArea).toHaveBeenCalledExactlyOnceWith(1)
      await user.click(screen.getByRole('button', { name: 'Remove Mount Baker' }))
      expect(onRemovePlace).toHaveBeenCalledExactlyOnceWith(baker.lat, baker.lon)
      await user.click(screen.getByRole('button', { name: 'Remove Your own coordinates' }))
      expect(setCustomCsv).toHaveBeenCalledExactlyOnceWith('')
    })

    // Pressing an area's chip opens it for editing (TJ, 2026-11-17), and a
    // place's goes to it on the map. Neither presses while an area is drawn.
    it('edits an area and goes to a place from their chips', async () => {
      const onEditArea = vi.fn()
      const onFramePlace = vi.fn()
      const baker = place()
      const { user, rerender } = render(
        <DestinationsSection {...props({ ...ONE_AREA, places: [baker], onEditArea, onFramePlace })} />,
      )
      await user.click(screen.getByRole('button', { name: 'Area 1 · ~453 km²' }))
      expect(onEditArea).toHaveBeenCalledExactlyOnceWith(0)
      await user.click(screen.getByRole('button', { name: 'Mount Baker' }))
      expect(onFramePlace).toHaveBeenCalledExactlyOnceWith(baker)
      rerender(<DestinationsSection {...props({ ...ONE_AREA, drawing: true, onEditArea })} />)
      expect(screen.queryByRole('button', { name: 'Area 1 · ~453 km²' })).toBeNull()
    })

    // A ×'s chip goes with the press, so the keyboard lands on the first add
    // button rather than the body (#576).
    it('hands the keyboard to Search by list when a chip goes', async () => {
      const { user, rerender } = render(<DestinationsSection {...props({ places: [place()] })} />)
      await user.click(screen.getByRole('button', { name: 'Remove Mount Baker' }))
      rerender(<DestinationsSection {...props()} />)
      expect(document.activeElement).toBe(byList())
    })

    // A desk's search stands in the field; a phone's is the map's pill, so
    // its field stands only once there is a chip to hold.
    it('holds the search at a desk, and shows a phone\'s field only with a chip in it', () => {
      const { rerender } = render(<DestinationsSection {...props({ onSearchSelect: vi.fn() })} />)
      expect(screen.getByPlaceholderText('Search by name')).toBeTruthy()
      rerender(<DestinationsSection {...props({ phone: true })} />)
      expect(screen.queryByPlaceholderText('Search by name')).toBeNull()
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
      rerender(<DestinationsSection {...props({ phone: true, places: [place()] })} />)
      expect(screen.getByRole('button', { name: 'Remove Mount Baker' })).toBeTruthy()
    })
  })

  describe('drawing an area', () => {
    // The approved readout (record 0306): what to do, how far the ring is
    // from an area, then both ways to finish.
    it('says what to do, then counts to three, then names both ways to finish', () => {
      const { rerender } = render(<DestinationsSection {...props({ drawing: true })} />)
      expect(screen.getByText('Press the map to place points')).toBeTruthy()
      rerender(<DestinationsSection {...props({ drawing: true, drawPointCount: 2 })} />)
      expect(screen.getByText('2 of 3 points placed')).toBeTruthy()
      rerender(<DestinationsSection {...props({ drawing: true, drawPointCount: 4, draftAreaKm2: 779 })} />)
      expect(screen.getByText('4 points placed. Press Done or Analyze.')).toBeTruthy()
    })

    // The count and the area share one line (#687), and neither breaks.
    it("puts the area on the readout's line, with the cap once it is over it", () => {
      const { rerender } = render(<DestinationsSection {...props({ drawing: true, drawPointCount: 3, draftAreaKm2: 779 })} />)
      const counter = screen.getByText('3 points placed. Press Done or Analyze.')
      const area = screen.getByText('~779 km²')
      expect(area.parentElement).toBe(counter.parentElement)
      expect(area.parentElement!.className).toContain('justify-between')
      for (const el of [counter, area]) expect(el.className).toContain('whitespace-nowrap')
      rerender(
        <DestinationsSection {...props({ drawing: true, drawPointCount: 4, draftAreaKm2: 120_000, areaTooLarge: true })} />,
      )
      expect(screen.getByText(/~120,000 km² \(max 100,000 km²\)/)).toBeTruthy()
    })

    it('warns a large area that is still under the cap', () => {
      render(<DestinationsSection {...props({ drawing: true, drawPointCount: 4, draftAreaKm2: 50_000 })} />)
      expect(screen.getByText('Large polygon areas may be slow and hit limits.')).toBeTruthy()
    })

    // Done and Cancel stand where the two add buttons were, Done waiting for
    // three points and Cancel the way out at any count, which a phone with
    // no Escape key needs before the first point.
    it('trades the add buttons for Done and Cancel, Done waiting for three points', async () => {
      const onFinishDrawing = vi.fn()
      const onCancelDrawing = vi.fn()
      const { user, rerender } = render(
        <DestinationsSection {...props({ drawing: true, drawPointCount: 2, onFinishDrawing, onCancelDrawing })} />,
      )
      expect(screen.queryByRole('button', { name: /^Search by/ })).toBeNull()
      expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancelDrawing).toHaveBeenCalledOnce()
      rerender(<DestinationsSection {...props({ drawing: true, drawPointCount: 3, onFinishDrawing, onCancelDrawing })} />)
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(onFinishDrawing).toHaveBeenCalledOnce()
    })

    // Search by area goes under the press that starts the mode, so Cancel,
    // the first that can act, takes the keyboard (#576).
    it('hands the keyboard to Cancel on starting an area', async () => {
      const { user, rerender } = render(<DestinationsSection {...props()} />)
      await user.click(byArea())
      rerender(<DestinationsSection {...props({ drawing: true })} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })
  })

  describe('the kinds the areas find', () => {
    const typeBoxes = () =>
      ['Peaks', 'Crags', 'Lakes', 'Trailheads', 'Unnamed peaks'].map(
        (name) => screen.getByRole('checkbox', { name }) as HTMLInputElement,
      )

    // With no area there is nothing for a kind to search, so the row stands
    // only once there is one or one is being drawn.
    it('stands under Find in areas once there is an area or one is drawn', () => {
      const { rerender } = render(<DestinationsSection {...props()} />)
      expect(screen.queryByText('Find in areas')).toBeNull()
      expect(screen.queryByRole('checkbox', { name: 'Peaks' })).toBeNull()
      rerender(<DestinationsSection {...props({ drawing: true })} />)
      expect(screen.getByText('Find in areas')).toBeTruthy()
      rerender(<DestinationsSection {...props(ONE_AREA)} />)
      expect(screen.getByRole('checkbox', { name: 'Peaks' })).toBeTruthy()
    })

    it('adds and removes a kind from the set, Crags between Peaks and Lakes', async () => {
      const setDestinationTypes = vi.fn()
      const { user } = render(<DestinationsSection {...props({ ...ONE_AREA, setDestinationTypes })} />)
      const labels = screen
        .getAllByRole('checkbox')
        .filter((box) => (box as HTMLInputElement).name === 'destination_types')
        .map((box) => box.closest('label')?.textContent)
      expect(labels).toEqual(['Peaks', 'Crags', 'Lakes', 'Trailheads'])
      await user.click(screen.getByRole('checkbox', { name: 'Lakes' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak', 'lake'])
      await user.click(screen.getByRole('checkbox', { name: 'Peaks' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith([])
    })

    // Shift reaches every kind from the last pressed to this one, as every
    // checkbox group in the app does (record 0209, #801).
    it('ticks and unticks every kind between the last press and a Shift-click', () => {
      const setDestinationTypes = vi.fn()
      const page = (types: DiscoveryType[]) => (
        <DestinationsSection {...props({ ...ONE_AREA, destinationTypes: types, setDestinationTypes })} />
      )
      const { rerender } = render(page([]))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Peaks' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak'])
      rerender(page(['peak']))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Trailheads' }), { shiftKey: true })
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak', 'crag', 'lake', 'trailhead'])
      rerender(page(['peak', 'crag', 'lake', 'trailhead']))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Trailheads' }))
      rerender(page(['peak', 'crag', 'lake']))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Crags' }), { shiftKey: true })
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak'])
    })

    // A kind with no usable area discovers nothing, so the row greys while
    // the area being drawn is not one yet or is past the cap; the ticks
    // survive the grey (the maintainer, 2026-10-15).
    it('greys the kinds until an area is usable, keeping the ticks', () => {
      const ticked = { destinationTypes: ['peak', 'crag'] as DiscoveryType[], includeUnnamedPeaks: true }
      const { rerender } = render(<DestinationsSection {...props({ drawing: true, drawPointCount: 2, ...ticked })} />)
      expect(typeBoxes().map((b) => b.disabled)).toEqual([true, true, true, true, true])
      expect(typeBoxes().map((b) => b.checked)).toEqual([true, true, false, false, true])
      rerender(<DestinationsSection {...props({ drawing: true, drawPointCount: 3, areaCount: 1, ...ticked })} />)
      expect(typeBoxes().some((b) => b.disabled)).toBe(false)
      rerender(<DestinationsSection {...props({ ...ONE_AREA, ...ticked, areaTooLarge: true })} />)
      expect(typeBoxes().every((b) => b.disabled)).toBe(true)
    })

    // Unnamed peaks widens a peak search, so it stands only while Peaks is
    // ticked (#687), and hiding it keeps its value.
    it('shows Unnamed peaks only while Peaks is ticked, and keeps its tick', () => {
      const { rerender } = render(
        <DestinationsSection {...props({ ...ONE_AREA, destinationTypes: ['lake'], includeUnnamedPeaks: true })} />,
      )
      expect(screen.queryByRole('checkbox', { name: 'Unnamed peaks' })).toBeNull()
      rerender(<DestinationsSection {...props({ ...ONE_AREA, destinationTypes: ['lake', 'peak'], includeUnnamedPeaks: true })} />)
      expect((screen.getByRole('checkbox', { name: 'Unnamed peaks' }) as HTMLInputElement).checked).toBe(true)
    })

    it('ticks Unnamed peaks and leaves the kind set alone', async () => {
      const setDestinationTypes = vi.fn()
      const setIncludeUnnamedPeaks = vi.fn()
      const { user } = render(
        <DestinationsSection {...props({ ...ONE_AREA, setDestinationTypes, setIncludeUnnamedPeaks })} />,
      )
      await user.click(screen.getByRole('checkbox', { name: 'Unnamed peaks' }))
      expect(setIncludeUnnamedPeaks).toHaveBeenCalledWith(true)
      expect(setDestinationTypes).not.toHaveBeenCalled()
    })
  })

  describe('the coordinates box', () => {
    afterEach(() => vi.restoreAllMocks())

    it('opens an empty box on Your own coordinates, with its chip, and hands it the keyboard', async () => {
      const setCustomCsv = vi.fn()
      const { user } = render(<DestinationsSection {...props({ setCustomCsv })} />)
      expect(noBox()).toBe(true)
      await openBox(user)
      expect(document.activeElement).toBe(coordinates())
      expect(screen.getByRole('button', { name: 'Remove Your own coordinates' })).toBeTruthy()
      expect(setCustomCsv).not.toHaveBeenCalled()
      expect(screen.queryByText(/parsed/)).toBeNull()
    })

    // A share link restores the reader's own rows, which stand in the box.
    it('stands open over rows of the reader\'s own', () => {
      render(<DestinationsSection {...props({ customCsv: '1,2,Mine', parsedCount: 1 })} />)
      expect(coordinates()).toBeTruthy()
    })

    it('frames a pasted list on the map', async () => {
      const onCsvPasted = vi.fn()
      const setCustomCsv = vi.fn()
      const { user } = render(<DestinationsSection {...props({ onCsvPasted, setCustomCsv })} />)
      await openBox(user)
      await user.click(coordinates())
      await user.paste('46.8529,-121.7604,Mount Rainier')
      expect(setCustomCsv).toHaveBeenLastCalledWith('46.8529,-121.7604,Mount Rainier')
      expect(onCsvPasted).toHaveBeenCalledOnce()
      expect(onCsvPasted.mock.calls[0][0]).toHaveLength(1)
    })

    it('never moves the camera for typing', async () => {
      const onCsvPasted = vi.fn()
      const setCustomCsv = vi.fn()
      const { user } = render(<DestinationsSection {...props({ onCsvPasted, setCustomCsv })} />)
      await openBox(user)
      fireEvent.keyDown(coordinates())
      fireEvent.change(coordinates(), { target: { value: '46.8529,-121.7604' } })
      expect(setCustomCsv).toHaveBeenCalledWith('46.8529,-121.7604')
      expect(onCsvPasted).not.toHaveBeenCalled()
    })

    it('counts what the box parses to once it holds text', () => {
      const { rerender } = render(<DestinationsSection {...props({ customCsv: '1,2\n3,4', parsedCount: 2 })} />)
      expect(screen.getByText('2 destinations parsed')).toBeTruthy()
      rerender(<DestinationsSection {...props({ customCsv: '1,2', parsedCount: 1 })} />)
      expect(screen.getByText('1 destination parsed')).toBeTruthy()
    })

    // The gutter flags the lines the parse drops and is hidden from a
    // screen reader, so the caption says how many in words (record 0265).
    it('adds the lines it could not read to the count', () => {
      const { rerender } = render(
        <DestinationsSection {...props({ customCsv: '1,2\nMount Baker\n3,4', parsedCount: 2 })} />,
      )
      expect(screen.getByText('2 destinations parsed, 1 line not read')).toBeTruthy()
      rerender(<DestinationsSection {...props({ customCsv: '1,2\nnope\n95,0', parsedCount: 1 })} />)
      expect(screen.getByText('1 destination parsed, 2 lines not read')).toBeTruthy()
      rerender(<DestinationsSection {...props({ customCsv: '# mine\n1,2\n\n3,4', parsedCount: 2 })} />)
      expect(screen.queryByText(/not read/)).toBeNull()
    })

    it('stands two rows tall with the format and one example row', async () => {
      const { user } = render(<DestinationsSection {...props()} />)
      await openBox(user)
      expect(coordinates().getAttribute('rows')).toBe('2')
      expect(coordinates().getAttribute('placeholder')).toBe(
        '# Lat,Lon or Lat,Lon,Name\n46.8529,-121.7604,Mount Rainier',
      )
    })

    it('empties and shuts the box from its chip\'s ×', async () => {
      const setCustomCsv = vi.fn()
      const { user } = render(<DestinationsSection {...props({ setCustomCsv })} />)
      await openBox(user)
      await user.click(screen.getByRole('button', { name: 'Remove Your own coordinates' }))
      expect(setCustomCsv).toHaveBeenCalledWith('')
      expect(noBox()).toBe(true)
    })
  })

  // The map is a way in with no control here, so hovering the section glows
  // what a press on the map would add.
  it('points at the map while the section is hovered', () => {
    const onPointAtMapPois = vi.fn()
    render(<DestinationsSection {...props({ onPointAtMapPois })} />)
    const section = screen.getByRole('region', { name: 'Destinations' })
    fireEvent.mouseEnter(section)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(true)
    fireEvent.mouseLeave(section)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(false)
  })
})
