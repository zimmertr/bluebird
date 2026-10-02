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
    columnsOpen: false,
    modelsButtonRef: MODELS,
    onToggleModels: NOOP,
    modelsOpen: false,
    removedButtonRef: REMOVED,
    onToggleRemoved: NOOP,
    removedOpen: false,
    removedCount: 0,
    canDownload: true,
    onDownloadCsv: NOOP,
    compareWait: null,
    compareNotes: [],
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
    expect(screen.queryByRole('button', { name: /Removed/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    rerender(<ResultsBar {...props({ removedCount: 3 })} />)
    expect(screen.getByRole('button', { name: 'Removed (3)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy()
  })

  // WCAG 2.5.3: a voice-control reader says the words on the button, so the
  // name has to be those words. Both buttons once carried a label that held
  // neither of them (#576).
  it('names Removed and Download CSV by the words they show', () => {
    render(<ResultsBar {...props({ removedCount: 2 })} />)
    for (const name of ['Removed (2)', 'Download CSV']) {
      const button = screen.getByRole('button', { name })
      expect(button.textContent).toBe(name)
      expect(button.getAttribute('aria-label')).toBeNull()
    }
  })

  // A trigger says whether its panel is open, so a screen reader hears
  // "collapsed" or "expanded" on it (#576).
  it('tells each popover trigger whether its panel is open', () => {
    const { rerender } = render(<ResultsBar {...props({ removedCount: 1 })} />)
    for (const ref of [COLUMNS, MODELS, REMOVED]) expect(ref.current?.getAttribute('aria-expanded')).toBe('false')
    rerender(<ResultsBar {...props({ removedCount: 1, columnsOpen: true, modelsOpen: true, removedOpen: true })} />)
    for (const ref of [COLUMNS, MODELS, REMOVED]) expect(ref.current?.getAttribute('aria-expanded')).toBe('true')
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

  // A table-only reader loses a model's rows with the chart's note out of
  // sight, so the bar carries it, one line per model, under the wait.
  it('says each compared model note on its own line under the wait', () => {
    render(
      <ResultsBar
        {...props({
          compareWait: 'Waiting 12 s',
          compareNotes: [
            { id: 'icon_seamless', note: 'DWD ICON note' },
            { id: 'gfs_hrrr', note: 'NOAA HRRR note' },
          ],
        })}
      />,
    )
    const wait = screen.getByText('Waiting 12 s')
    const first = screen.getByText('DWD ICON note')
    const second = screen.getByText('NOAA HRRR note')
    expect(wait.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says the comparison wait on its own line', () => {
    render(<ResultsBar {...props({ compareWait: 'Waiting 12 s' })} />)
    expect(screen.getByText('Waiting 12 s')).toBeTruthy()
  })
})
