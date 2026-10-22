import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import DestinationsSection from './DestinationsSection'
import { render } from '../testSupport/render'
import type { DiscoveryType } from '../types'

// The section's own behavior: the draw counter beside the polygon, the buttons
// that enter and leave draw mode, the type set and the unnamed-peaks knob
// that widens it, and the coordinates box that frames a paste but never a
// keystroke.

type Props = ComponentProps<typeof DestinationsSection>

function props(over: Partial<Props> = {}): Props {
  const noop = () => {}
  return {
    drawing: false,
    onStartDrawing: noop,
    onFinishDrawing: noop,
    onCancelDrawing: noop,
    onClearDrawing: noop,
    drawPointCount: 0,
    pointsNeeded: 3,
    areaTooLarge: false,
    polygonAreaKm2: null,
    maxAreaKm2: 100_000,
    onPointAtSearch: noop,
    onPointAtMapPois: noop,
    destinationTypes: ['peak'],
    setDestinationTypes: noop,
    includeUnnamedPeaks: false,
    setIncludeUnnamedPeaks: noop,
    customCsv: '',
    setCustomCsv: noop,
    parsedCount: 0,
    onCsvPasted: noop,
    ...over,
  }
}

// A ring a search can use: the types and the unnamed-peaks knob are greyed
// without one.
const RING = { drawPointCount: 3, pointsNeeded: 0 } as const

const coordinates = () => screen.getByRole('textbox', { name: /^Custom destination coordinates/ })
// The Polygon block's buttons, in order, apart from the box above it.
const polygonBlock = () => screen.getByRole('heading', { name: 'Polygon search' }).parentElement!
const polygonButtons = () =>
  within(polygonBlock())
    .getAllByRole('button')
    .map((b) => b.textContent)
const disabled = (name: string) => (screen.getByRole('button', { name }) as HTMLButtonElement).disabled

describe('DestinationsSection', () => {
  describe('the draw counter', () => {
    it('is absent before the first point', () => {
      render(<DestinationsSection {...props()} />)
      expect(screen.queryByText(/placed/)).toBeNull()
    })

    it('counts down the points a ring still needs while drawing', () => {
      render(<DestinationsSection {...props({ drawing: true, drawPointCount: 1, pointsNeeded: 2 })} />)
      expect(screen.getByText(/1 point placed, 2 more needed\./)).toBeTruthy()
    })

    it('says when the ring is ready while drawing', () => {
      render(<DestinationsSection {...props({ drawing: true, drawPointCount: 4, pointsNeeded: 0 })} />)
      expect(screen.getByText('4 points placed. Press Done or Analyze.')).toBeTruthy()
    })

    it('reads the area, and the cap beside it once the area is over it', () => {
      render(
        <DestinationsSection
          {...props({ drawPointCount: 4, pointsNeeded: 0, polygonAreaKm2: 120_000, areaTooLarge: true })}
        />,
      )
      expect(screen.getByText(/~120,000 km² \(max 100,000 km²\)/)).toBeTruthy()
    })

    // The counter and the area share the line under the subheading, the
    // area right-justified (#687), and neither breaks inside itself.
    it("puts the area on the counter's line", () => {
      render(<DestinationsSection {...props({ drawing: true, drawPointCount: 3, pointsNeeded: 0, polygonAreaKm2: 779 })} />)
      const counter = screen.getByText('3 points placed. Press Done or Analyze.')
      const area = screen.getByText('~779 km²')
      expect(area.parentElement).toBe(counter.parentElement)
      // Right-justified beside the counter by `justify-between`, which also
      // puts it at the left when it has to take a line of its own.
      expect(area.parentElement!.className).toContain('justify-between')
      expect(area.parentElement!.className).toContain('flex-wrap')
      expect(area.className).not.toContain('ml-auto')
      for (const el of [counter, area]) expect(el.className).toContain('whitespace-nowrap')
      expect(screen.getByRole('heading', { name: 'Polygon search' }).nextElementSibling!.contains(counter)).toBe(true)
    })

    it('warns a large area that is still under the cap', () => {
      render(<DestinationsSection {...props({ drawPointCount: 4, pointsNeeded: 0, polygonAreaKm2: 50_000 })} />)
      expect(screen.getByText('Large polygon areas may be slow and hit limits.')).toBeTruthy()
    })
  })

  describe('the draw button', () => {
    // The row is always the same three (#687), with a button that does
    // nothing yet greyed rather than missing.
    it('shows Draw polygon, Cancel and Clear before any ring, with only the first live', () => {
      render(<DestinationsSection {...props()} />)
      expect(polygonButtons()).toEqual(['Draw polygon', 'Cancel', 'Clear'])
      expect(disabled('Draw polygon')).toBe(false)
      expect(disabled('Cancel')).toBe(true)
      expect(disabled('Clear')).toBe(true)
    })

    it('enters draw mode, and offers Edit and Clear once there is a ring', async () => {
      const onStartDrawing = vi.fn()
      const onClearDrawing = vi.fn()
      const { user, rerender } = render(<DestinationsSection {...props({ onStartDrawing })} />)
      await user.click(screen.getByRole('button', { name: 'Draw polygon' }))
      expect(onStartDrawing).toHaveBeenCalledOnce()
      rerender(<DestinationsSection {...props({ drawPointCount: 3, pointsNeeded: 0, onClearDrawing })} />)
      expect(polygonButtons()).toEqual(['Edit polygon', 'Cancel', 'Clear'])
      expect(disabled('Cancel')).toBe(true)
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      expect(onClearDrawing).toHaveBeenCalledOnce()
    })

    // A phone has no Escape key, so before the first point Cancel is its only
    // way out of the mode.
    it('offers Cancel beside a disabled Done and Clear before the first point', async () => {
      const onCancelDrawing = vi.fn()
      const { user } = render(<DestinationsSection {...props({ drawing: true, onCancelDrawing })} />)
      expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
      expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(true)
      expect(polygonButtons()).toEqual(['Done', 'Cancel', 'Clear'])
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancelDrawing).toHaveBeenCalledOnce()
    })

    // A press that greys the button it landed on hands the keyboard to the
    // first button that can still act, rather than the body (#576).
    it('hands the keyboard to Cancel on entering the mode and back to Draw on leaving it', async () => {
      const { user, rerender } = render(<DestinationsSection {...props()} />)
      await user.click(screen.getByRole('button', { name: 'Draw polygon' }))
      rerender(<DestinationsSection {...props({ drawing: true })} />)
      // Done is disabled before three points, so Cancel is the first that can take it.
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      rerender(<DestinationsSection {...props()} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Draw polygon' }))
    })

    // Clear disables itself under the press that empties the ring, so the
    // first control that can still act takes the keyboard (#576).
    it('hands the keyboard on when Clear empties the ring', async () => {
      const { user, rerender } = render(<DestinationsSection {...props({ drawing: true, drawPointCount: 2, pointsNeeded: 1 })} />)
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      rerender(<DestinationsSection {...props({ drawing: true })} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))

      rerender(<DestinationsSection {...props({ drawPointCount: 3, pointsNeeded: 0 })} />)
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      rerender(<DestinationsSection {...props()} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Draw polygon' }))
    })

    // Done turns back into Edit polygon on the same button, which is still
    // live, so the keyboard stays where the press put it.
    it('keeps the keyboard on the mode button when Done leaves the mode', async () => {
      const { user, rerender } = render(
        <DestinationsSection {...props({ drawing: true, drawPointCount: 3, pointsNeeded: 0 })} />,
      )
      await user.click(screen.getByRole('button', { name: 'Done' }))
      rerender(<DestinationsSection {...props({ drawPointCount: 3, pointsNeeded: 0 })} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit polygon' }))
    })

    // Clear starts the ring over; only Cancel leaves the mode.
    it('clears inside draw mode without cancelling it', async () => {
      const onCancelDrawing = vi.fn()
      const onClearDrawing = vi.fn()
      const { user } = render(
        <DestinationsSection
          {...props({ drawing: true, drawPointCount: 2, pointsNeeded: 1, onCancelDrawing, onClearDrawing })}
        />,
      )
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      expect(onClearDrawing).toHaveBeenCalledOnce()
      expect(onCancelDrawing).not.toHaveBeenCalled()
    })

    it('leaves draw mode on Done, which waits for three points', async () => {
      const onFinishDrawing = vi.fn()
      const { user, rerender } = render(
        <DestinationsSection {...props({ drawing: true, drawPointCount: 2, pointsNeeded: 1, onFinishDrawing })} />,
      )
      expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
      rerender(
        <DestinationsSection {...props({ drawing: true, drawPointCount: 3, pointsNeeded: 0, onFinishDrawing })} />,
      )
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(onFinishDrawing).toHaveBeenCalledOnce()
    })
  })

  describe('the destination types', () => {
    it('adds and removes a type from the set', async () => {
      const setDestinationTypes = vi.fn()
      const { user } = render(<DestinationsSection {...props({ ...RING, setDestinationTypes })} />)
      await user.click(screen.getByRole('checkbox', { name: 'Lakes' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak', 'lake'])
      await user.click(screen.getByRole('checkbox', { name: 'Peaks' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith([])
    })

    it('offers Crags between Peaks and Lakes, and ticks it into the set', async () => {
      const setDestinationTypes = vi.fn()
      const { user } = render(<DestinationsSection {...props({ ...RING, setDestinationTypes })} />)
      const labels = screen
        .getAllByRole('checkbox')
        .filter((box) => (box as HTMLInputElement).name === 'destination_types')
        .map((box) => box.closest('label')?.textContent)
      expect(labels).toEqual(['Peaks', 'Crags', 'Lakes', 'Trailheads'])
      await user.click(screen.getByRole('checkbox', { name: 'Crags' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak', 'crag'])
    })

    // A type with no usable ring discovers nothing, so the row is greyed until
    // there is one and greyed again when it is cleared or grows past the cap;
    // the ticks survive the grey (the maintainer, 2026-10-15).
    const typeBoxes = () =>
      ['Peaks', 'Crags', 'Lakes', 'Trailheads', 'Include unnamed peaks'].map(
        (name) => screen.getByRole('checkbox', { name }) as HTMLInputElement,
      )

    it('greys the types and the knob until the ring is usable, keeping the ticks', () => {
      const { rerender } = render(
        <DestinationsSection {...props({ destinationTypes: ['peak', 'crag'], includeUnnamedPeaks: true })} />,
      )
      expect(typeBoxes().map((b) => b.disabled)).toEqual([true, true, true, true, true])
      expect(typeBoxes().map((b) => b.checked)).toEqual([true, true, false, false, true])

      // Two points while drawing is not a ring yet.
      rerender(
        <DestinationsSection
          {...props({ drawing: true, drawPointCount: 2, pointsNeeded: 1, destinationTypes: ['peak', 'crag'], includeUnnamedPeaks: true })}
        />,
      )
      expect(typeBoxes().every((b) => b.disabled)).toBe(true)

      rerender(<DestinationsSection {...props({ ...RING, destinationTypes: ['peak', 'crag'], includeUnnamedPeaks: true })} />)
      expect(typeBoxes().some((b) => b.disabled)).toBe(false)
    })

    it('greys them again when the ring is cleared or grows past the cap', () => {
      const ticked = { destinationTypes: ['peak'] as DiscoveryType[] }
      const { rerender } = render(<DestinationsSection {...props({ ...RING, ...ticked })} />)
      expect(typeBoxes().some((b) => b.disabled)).toBe(false)

      rerender(
        <DestinationsSection {...props({ ...RING, ...ticked, polygonAreaKm2: 120_000, areaTooLarge: true })} />,
      )
      expect(typeBoxes().every((b) => b.disabled)).toBe(true)

      rerender(<DestinationsSection {...props(ticked)} />)
      expect(typeBoxes().every((b) => b.disabled)).toBe(true)
      expect(typeBoxes()[0].checked).toBe(true)
    })

    // Unnamed peaks widens a peak search, so with no peak search there is
    // nothing for it to widen and the row is not drawn (#687).
    it('shows unnamed peaks only while Peaks is ticked', () => {
      const { rerender } = render(<DestinationsSection {...props({ destinationTypes: ['lake'] })} />)
      expect(screen.queryByRole('checkbox', { name: 'Include unnamed peaks' })).toBeNull()
      rerender(<DestinationsSection {...props({ destinationTypes: ['lake', 'peak'] })} />)
      expect(screen.getByRole('checkbox', { name: 'Include unnamed peaks' })).toBeTruthy()
    })

    // Hidden is not cleared: ticking Peaks again shows what the reader had.
    it('keeps the knob ticked while Peaks is off and back', () => {
      const { rerender } = render(
        <DestinationsSection {...props({ destinationTypes: [], includeUnnamedPeaks: true })} />,
      )
      expect(screen.queryByRole('checkbox', { name: 'Include unnamed peaks' })).toBeNull()
      rerender(<DestinationsSection {...props({ destinationTypes: ['peak'], includeUnnamedPeaks: true })} />)
      expect((screen.getByRole('checkbox', { name: 'Include unnamed peaks' }) as HTMLInputElement).checked).toBe(
        true,
      )
    })

    it('ticks unnamed peaks and leaves the type set alone', async () => {
      const setDestinationTypes = vi.fn()
      const setIncludeUnnamedPeaks = vi.fn()
      const { user } = render(
        <DestinationsSection {...props({ ...RING, setDestinationTypes, setIncludeUnnamedPeaks })} />,
      )
      await user.click(screen.getByRole('checkbox', { name: 'Include unnamed peaks' }))
      expect(setIncludeUnnamedPeaks).toHaveBeenCalledWith(true)
      expect(setDestinationTypes).not.toHaveBeenCalled()
    })
  })

  describe('the coordinates box', () => {
    it('frames a pasted list on the map', async () => {
      const onCsvPasted = vi.fn()
      const setCustomCsv = vi.fn()
      const { user } = render(<DestinationsSection {...props({ onCsvPasted, setCustomCsv })} />)
      await user.click(coordinates())
      await user.paste('46.8529,-121.7604,Mount Rainier')
      expect(setCustomCsv).toHaveBeenLastCalledWith('46.8529,-121.7604,Mount Rainier')
      expect(onCsvPasted).toHaveBeenCalledOnce()
      expect(onCsvPasted.mock.calls[0][0]).toHaveLength(1)
    })

    it('never moves the camera for typing', () => {
      const onCsvPasted = vi.fn()
      const setCustomCsv = vi.fn()
      render(<DestinationsSection {...props({ onCsvPasted, setCustomCsv })} />)
      fireEvent.keyDown(coordinates())
      fireEvent.change(coordinates(), { target: { value: '46.8529,-121.7604' } })
      expect(setCustomCsv).toHaveBeenCalledWith('46.8529,-121.7604')
      expect(onCsvPasted).not.toHaveBeenCalled()
    })

    it('counts what the box parses to once it holds text', () => {
      const { rerender } = render(<DestinationsSection {...props()} />)
      expect(screen.queryByText(/parsed$/)).toBeNull()
      rerender(<DestinationsSection {...props({ customCsv: '1,2\n3,4', parsedCount: 2 })} />)
      expect(screen.getByText('2 destinations parsed')).toBeTruthy()
      rerender(<DestinationsSection {...props({ customCsv: '1,2', parsedCount: 1 })} />)
      expect(screen.getByText('1 destination parsed')).toBeTruthy()
    })

    // Two rows tall at rest, so a reader sees that several rows go in, with
    // the format and one row that follows it as the placeholder.
    it('stands two rows tall with the format and one example row', () => {
      render(<DestinationsSection {...props()} />)
      expect(coordinates().getAttribute('rows')).toBe('2')
      expect(coordinates().getAttribute('placeholder')).toBe(
        '# Lat,Lon or Lat,Lon,Name\n46.8529,-121.7604,Mount Rainier',
      )
    })
  })

  // Map, Coordinates, Polygon (#687, record 0137): the two full-width inputs
  // together, the polygon's buttons and boxes last. Each subheading says its
  // row searches (#710, record 0156).
  it('orders the three ways in as Map search, Coordinate search, Polygon search', () => {
    render(<DestinationsSection {...props()} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Map search', 'Coordinate search', 'Polygon search'])
    expect(screen.getByText('Search by name, or select a destination from the map.')).toBeTruthy()
  })

  it('points at the map while the Map group is hovered', () => {
    const onPointAtSearch = vi.fn()
    const onPointAtMapPois = vi.fn()
    render(<DestinationsSection {...props({ onPointAtSearch, onPointAtMapPois })} />)
    const group = screen.getByRole('heading', { name: 'Map search' }).parentElement as HTMLElement
    fireEvent.mouseEnter(group)
    expect(onPointAtSearch).toHaveBeenLastCalledWith(true)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(true)
    fireEvent.mouseLeave(group)
    expect(onPointAtSearch).toHaveBeenLastCalledWith(false)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(false)
  })
})
