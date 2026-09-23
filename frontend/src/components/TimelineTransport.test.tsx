import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import TimelineTransport from './TimelineTransport'
import { render } from '../testSupport/render'

type Props = ComponentProps<typeof TimelineTransport>

// The transport is wiring: `utils/timeline.ts` decides every frame, reading
// and axis. What is left to pin is that each control reports to its callback
// and draws the state it is given.
function props(over: Partial<Props> = {}): Props {
  return {
    axis: 'forecast',
    axes: ['forecast'],
    onAxisChange: () => {},
    index: 2,
    frameCount: 5,
    onIndexChange: () => {},
    playing: false,
    onPlayingChange: () => {},
    readout: 'Tue 14:00',
    scale: ['Mon', 'Tue', 'Wed'],
    forecastLabel: 'Forecast',
    liftPx: 0,
    ...over,
  }
}

describe('TimelineTransport', () => {
  it('plays from pause and pauses from play', async () => {
    const onPlayingChange = vi.fn()
    const { user, rerender } = render(<TimelineTransport {...props({ onPlayingChange })} />)
    await user.click(screen.getByRole('button', { name: 'Play the timeline' }))
    expect(onPlayingChange).toHaveBeenLastCalledWith(true)
    rerender(<TimelineTransport {...props({ onPlayingChange, playing: true })} />)
    await user.click(screen.getByRole('button', { name: 'Pause the timeline' }))
    expect(onPlayingChange).toHaveBeenLastCalledWith(false)
  })

  it('scrubs to a frame and reads the position out', () => {
    const onIndexChange = vi.fn()
    render(<TimelineTransport {...props({ onIndexChange })} />)
    const scrubber = screen.getByRole('slider', { name: 'Forecast time' })
    expect(scrubber.getAttribute('max')).toBe('4')
    expect(scrubber.getAttribute('aria-valuetext')).toBe('Tue 14:00')
    fireEvent.change(scrubber, { target: { value: '4' } })
    expect(onIndexChange).toHaveBeenLastCalledWith(4)
  })

  it('names the one axis there is instead of offering a choice', () => {
    render(<TimelineTransport {...props()} />)
    expect(screen.queryByRole('button', { name: 'Radar' })).toBeNull()
    expect(screen.getByText('Forecast')).toBeTruthy()
  })

  it('switches between two axes', async () => {
    const onAxisChange = vi.fn()
    const { user } = render(
      <TimelineTransport {...props({ axes: ['radar', 'forecast'], onAxisChange })} />,
    )
    expect(screen.getByRole('button', { name: 'Forecast' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Radar' }))
    expect(onAxisChange).toHaveBeenLastCalledWith('radar')
  })

  it('draws the scale marks it is given', () => {
    render(<TimelineTransport {...props()} />)
    for (const mark of ['Mon', 'Tue', 'Wed']) expect(screen.getByText(mark)).toBeTruthy()
  })
})
