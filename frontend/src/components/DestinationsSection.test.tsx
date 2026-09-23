import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import DestinationsSection from './DestinationsSection'
import { render } from '../testSupport/render'

// The section's own behavior: the draw counter beside the polygon, the button
// that enters and leaves draw mode, the type set and the unnamed-peaks knob
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

const coordinates = () => screen.getByRole('textbox', { name: /^Custom destination coordinates/ })

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
      expect(screen.getByText('4 points placed. Press Done when ready.')).toBeTruthy()
    })

    it('reads the area, and the cap beside it once the area is over it', () => {
      render(
        <DestinationsSection
          {...props({ drawPointCount: 4, pointsNeeded: 0, polygonAreaKm2: 120_000, areaTooLarge: true })}
        />,
      )
      expect(screen.getByText(/~120,000 km² \(max 100,000 km²\)/)).toBeTruthy()
    })

    it('warns a large area that is still under the cap', () => {
      render(<DestinationsSection {...props({ drawPointCount: 4, pointsNeeded: 0, polygonAreaKm2: 50_000 })} />)
      expect(screen.getByText('Large polygon areas may be slow and hit limits.')).toBeTruthy()
    })
  })

  describe('the draw button', () => {
    it('enters draw mode, and offers Edit and Clear once there is a ring', async () => {
      const onStartDrawing = vi.fn()
      const onCancelDrawing = vi.fn()
      const { user, rerender } = render(<DestinationsSection {...props({ onStartDrawing })} />)
      await user.click(screen.getByRole('button', { name: 'Draw polygon' }))
      expect(onStartDrawing).toHaveBeenCalledOnce()
      rerender(<DestinationsSection {...props({ drawPointCount: 3, pointsNeeded: 0, onCancelDrawing })} />)
      expect(screen.getByRole('button', { name: 'Edit polygon' })).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Clear' }))
      expect(onCancelDrawing).toHaveBeenCalledOnce()
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
      const { user } = render(<DestinationsSection {...props({ setDestinationTypes })} />)
      await user.click(screen.getByRole('checkbox', { name: 'Lakes' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith(['peak', 'lake'])
      await user.click(screen.getByRole('checkbox', { name: 'Peaks' }))
      expect(setDestinationTypes).toHaveBeenLastCalledWith([])
    })

    // Unnamed peaks widens a peak search, so asking for it with Peaks off
    // asks for the peak search too.
    it('ticks Peaks when unnamed peaks is ticked without it', async () => {
      const setDestinationTypes = vi.fn()
      const setIncludeUnnamedPeaks = vi.fn()
      const { user } = render(
        <DestinationsSection
          {...props({ destinationTypes: ['lake'], setDestinationTypes, setIncludeUnnamedPeaks })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: 'Include unnamed peaks' }))
      expect(setIncludeUnnamedPeaks).toHaveBeenCalledWith(true)
      expect(setDestinationTypes).toHaveBeenCalledWith(['lake', 'peak'])
    })

    it('leaves the set alone when Peaks is already ticked', async () => {
      const setDestinationTypes = vi.fn()
      const { user } = render(<DestinationsSection {...props({ setDestinationTypes })} />)
      await user.click(screen.getByRole('checkbox', { name: 'Include unnamed peaks' }))
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

    it('never moves the camera for typing', async () => {
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
  })

  it('points at the map while the Map group is hovered', () => {
    const onPointAtSearch = vi.fn()
    const onPointAtMapPois = vi.fn()
    render(<DestinationsSection {...props({ onPointAtSearch, onPointAtMapPois })} />)
    const group = screen.getByText('Search by name, or click any peak or lake.').parentElement as HTMLElement
    fireEvent.mouseEnter(group)
    expect(onPointAtSearch).toHaveBeenLastCalledWith(true)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(true)
    fireEvent.mouseLeave(group)
    expect(onPointAtSearch).toHaveBeenLastCalledWith(false)
    expect(onPointAtMapPois).toHaveBeenLastCalledWith(false)
  })
})
