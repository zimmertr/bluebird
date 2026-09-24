import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import AnalysisOverlay from './AnalysisOverlay'
import { render } from '../testSupport/render'
import type { Progress } from '../hooks/useAnalyze'

const NOOP = () => {}
const QUARTER: Progress = { processed: 1, total: 4, percent: 25 }
const IDLE = { loading: false, statusMessage: null, progress: null, paceRemainingS: null, onCancel: NOOP }
const SEARCHING = { ...IDLE, loading: true, statusMessage: 'Searching' }
const FETCHING = { ...IDLE, loading: true, progress: QUARTER, paceRemainingS: 45 }

describe('AnalysisOverlay', () => {
  it('draws nothing while no analysis runs', () => {
    const { container } = render(<AnalysisOverlay {...IDLE} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the phase line where there is no progress to count', () => {
    render(<AnalysisOverlay {...SEARCHING} />)
    expect(screen.getByRole('status').textContent).toBe('Searching')
    expect(screen.getByText('Elapsed 0s')).toBeTruthy()
  })

  // While the pacer sleeps, the detail line under the heading counts down to
  // when the quota is spent again.
  it('shows the batch percentage and the quota line instead of the clock', () => {
    render(<AnalysisOverlay {...FETCHING} />)
    expect(screen.getByRole('status').textContent).toBe('Retrieving 4 Forecasts…Open-Meteo quota: resuming in 45s')
    expect(screen.getByText('Open-Meteo quota: resuming in 45s')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.queryByText(/^Elapsed/)).toBeNull()
  })

  it('cancels the run', () => {
    const onCancel = vi.fn()
    render(<AnalysisOverlay {...SEARCHING} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  // The clock is the card's own, so it has to count while the card shows and
  // start again from nothing for the next run.
  describe('the elapsed clock', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('counts whole seconds while the card shows, and resets between runs', () => {
      const { rerender } = render(<AnalysisOverlay {...SEARCHING} />)
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      expect(screen.getByText('Elapsed 3s')).toBeTruthy()

      rerender(<AnalysisOverlay {...IDLE} />)
      rerender(<AnalysisOverlay {...SEARCHING} />)
      expect(screen.getByText('Elapsed 0s')).toBeTruthy()
    })
  })
})
