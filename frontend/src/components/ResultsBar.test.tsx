import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import ResultsBar from './ResultsBar'
import { render } from '../testSupport/render'

type Props = ComponentProps<typeof ResultsBar>
const NOOP = () => {}
const COLUMNS = createRef<HTMLButtonElement>()
const MODELS = createRef<HTMLButtonElement>()
const REMOVED = createRef<HTMLButtonElement>()

// Before any report: two pending destinations, nothing removed, room for Both.
function props(over: Partial<Props> = {}): Props {
  return {
    sortBy: 'temp_avg_f',
    sortDesc: false,
    pointSample: false,
    rowCount: null,
    pendingCount: 2,
    windowTitle: null,
    resultsCollapsed: false,
    toggleCollapsed: NOOP,
    showResults: true,
    resultsMode: 'table',
    chooseResultsMode: NOOP,
    bothHasRoom: true,
    showTable: true,
    columnsButtonRef: COLUMNS,
    onToggleColumns: NOOP,
    modelsButtonRef: MODELS,
    onToggleModels: NOOP,
    removedButtonRef: REMOVED,
    onToggleRemoved: NOOP,
    removedCount: 0,
    canDownload: true,
    onDownloadCsv: NOOP,
    compareWait: null,
    ...over,
  }
}

describe('ResultsBar', () => {
  // The bar reads the same before and after a report; the zero count says
  // nothing has been ranked yet.
  it('titles the ranking with a zero count before any report', () => {
    render(<ResultsBar {...props()} />)
    expect(screen.getByText(/\(0 of 2\)$/).textContent).toMatch(/^Lowest /)
  })

  it('titles the ranking with the report count and its window once one exists', () => {
    render(<ResultsBar {...props({ sortDesc: true, rowCount: '5 of 5', windowTitle: 'Fri, Sep 25' })} />)
    expect(screen.getByText(/\(5 of 5\)$/).textContent).toMatch(/^Highest /)
    expect(screen.getByText('Fri, Sep 25')).toBeTruthy()
  })

  // Disabled rather than removed, so the two beside it do not move.
  it('keeps Both in the segment and disables it without the room', () => {
    const chooseResultsMode = vi.fn()
    render(<ResultsBar {...props({ bothHasRoom: false, chooseResultsMode })} />)
    const both = screen.getByRole('button', { name: 'Show chart and table' }) as HTMLButtonElement
    expect(both.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show chart only' }))
    expect(chooseResultsMode).toHaveBeenCalledWith('chart')
  })

  it('shows Removed only with something to restore, and Download only with a row', () => {
    const { rerender } = render(<ResultsBar {...props({ canDownload: false })} />)
    expect(screen.queryByRole('button', { name: /Restore removed rows/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    rerender(<ResultsBar {...props({ removedCount: 3 })} />)
    expect(screen.getByRole('button', { name: 'Restore removed rows (3 removed)' }).textContent).toBe('Removed (3)')
    expect(screen.getByRole('button', { name: /Download/ })).toBeTruthy()
  })

  it('opens each popover through its own trigger', () => {
    const onToggleColumns = vi.fn()
    const onToggleModels = vi.fn()
    render(<ResultsBar {...props({ onToggleColumns, onToggleModels })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose which columns to display' }))
    fireEvent.click(screen.getByRole('button', { name: 'Models' }))
    expect(onToggleColumns).toHaveBeenCalledOnce()
    expect(onToggleModels).toHaveBeenCalledOnce()
    expect(COLUMNS.current?.textContent).toBe('Columns')
  })

  it('says the comparison wait on its own line', () => {
    render(<ResultsBar {...props({ compareWait: 'Waiting 12 s' })} />)
    expect(screen.getByText('Waiting 12 s')).toBeTruthy()
  })
})
