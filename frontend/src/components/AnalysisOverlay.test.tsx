import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import AnalysisOverlay from './AnalysisOverlay'
import { render } from '../testSupport/render'
import type { OverlayView } from '../utils/analyzeOverlay'

const HIDDEN: OverlayView = { visible: false }
const SEARCHING: OverlayView = { visible: true, message: 'Searching', detail: null, progress: null }
const FETCHING: OverlayView = {
  visible: true,
  message: 'Fetching',
  detail: 'A detail',
  progress: { processed: 1, total: 4, percent: 25 },
}
const NOOP = () => {}

describe('AnalysisOverlay', () => {
  it('draws nothing while no analysis runs', () => {
    const { container } = render(<AnalysisOverlay overlay={HIDDEN} elapsed={0} onCancel={NOOP} />)
    expect(container.innerHTML).toBe('')
  })

  // A phase with nothing to count says how long it has run instead.
  it('counts seconds where there is no progress to count', () => {
    render(<AnalysisOverlay overlay={SEARCHING} elapsed={7} onCancel={NOOP} />)
    expect(screen.getByRole('status').textContent).toBe('Searching')
    expect(screen.getByText('Elapsed 7s')).toBeTruthy()
  })

  it('shows the batch percentage and the detail line', () => {
    render(<AnalysisOverlay overlay={FETCHING} elapsed={7} onCancel={NOOP} />)
    expect(screen.getByRole('status').textContent).toBe('FetchingA detail')
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.queryByText('Elapsed 7s')).toBeNull()
  })

  it('cancels the run', () => {
    const onCancel = vi.fn()
    render(<AnalysisOverlay overlay={SEARCHING} elapsed={0} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
