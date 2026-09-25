import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import WelcomeModal from './WelcomeModal'
import { render } from '../testSupport/render'

describe('WelcomeModal', () => {
  it('closes from Search now without starting the tutorial', () => {
    const onDismiss = vi.fn()
    const onStartTour = vi.fn()
    render(<WelcomeModal onDismiss={onDismiss} onStartTour={onStartTour} />)
    screen.getByRole('button', { name: 'Search now' }).click()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onStartTour).not.toHaveBeenCalled()
  })

  // The tutorial is offered, never started unasked (#536).
  it('starts the tutorial only from its own button', () => {
    const onDismiss = vi.fn()
    const onStartTour = vi.fn()
    render(<WelcomeModal onDismiss={onDismiss} onStartTour={onStartTour} />)
    expect(onStartTour).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'Take the tutorial' }).click()
    expect(onStartTour).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
