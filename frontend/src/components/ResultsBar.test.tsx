import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import ResultsBar from './ResultsBar'
import { render } from '../testSupport/render'
import { ACTION_GROUP, ACTION_ITEM, BAR_LABEL, MENU_CHEVRON, MENU_TRIGGER } from '../styles'

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
    sheet: false,
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
    const both = screen.getByRole('button', { name: 'Show both chart and table' }) as HTMLButtonElement
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
  // neither of them (#576). Since #687 the word can be hidden on a narrow bar,
  // and a hidden word names nothing, so the label is the word itself.
  it('names Removed and Download CSV by the words they show', () => {
    render(<ResultsBar {...props({ removedCount: 2 })} />)
    for (const name of ['Removed (2)', 'Download CSV']) {
      const button = screen.getByRole('button', { name })
      expect(button.textContent).toBe(name)
      expect(button.getAttribute('aria-label')).toBe(name)
    }
  })

  // One group for the bar's four buttons (#687), in the mode switch's look:
  // each a glyph and a word the width rule can hide, with a divider between
  // each two. The three that open a menu are its triggers in the bar's shape
  // (record 0200), with the chevron after the word at a desk; Download CSV
  // opens nothing and carries none.
  it('draws Columns, Models, Removed and Download CSV as one group of glyph buttons', () => {
    render(<ResultsBar {...props({ removedCount: 2 })} />)
    const menus = ['Choose which columns to display', 'Models', 'Removed (2)'].map((name) => screen.getByRole('button', { name }))
    const download = screen.getByRole('button', { name: 'Download CSV' })
    for (const button of menus) {
      expect(button.className).toBe(MENU_TRIGGER.bar)
      expect(button.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2)
      expect(button.lastElementChild?.getAttribute('class')).toContain(MENU_CHEVRON.bar)
      expect(button.querySelector('span')?.className).toBe(BAR_LABEL)
    }
    expect(MENU_TRIGGER.bar.startsWith(ACTION_ITEM)).toBe(true)
    expect(download.className).toBe(ACTION_ITEM)
    expect(download.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
    expect(download.querySelector('span')?.className).toBe(BAR_LABEL)
    const buttons = [...menus, download]
    const group = buttons[0].parentElement as HTMLElement
    expect(group.className).toBe(ACTION_GROUP)
    for (const button of buttons) expect(button.parentElement).toBe(group)
    // Four buttons, three dividers, in turn.
    expect([...group.children].map((c) => c.tagName)).toEqual(['BUTTON', 'DIV', 'BUTTON', 'DIV', 'BUTTON', 'DIV', 'BUTTON'])
  })

  // A phone's menus are sheets rising from below, so its buttons point
  // nowhere (record 0174's rule for a phone's chips).
  it('draws no chevron on a phone', () => {
    render(<ResultsBar {...props({ removedCount: 2, sheet: true })} />)
    for (const name of ['Choose which columns to display', 'Models', 'Removed (2)']) {
      expect(screen.getByRole('button', { name }).querySelectorAll('svg')).toHaveLength(1)
    }
  })

  // The chevron points the way its menu goes: down while shut, up while open.
  it("turns a button's chevron up while its menu is open", () => {
    const { rerender } = render(<ResultsBar {...props()} />)
    const points = () => COLUMNS.current?.lastElementChild?.querySelector('polyline')?.getAttribute('points')
    const shut = points()
    rerender(<ResultsBar {...props({ columnsOpen: true })} />)
    expect(points()).not.toBe(shut)
    expect(COLUMNS.current?.getAttribute('aria-expanded')).toBe('true')
  })

  it('puts no divider before the first button, whichever stand', () => {
    render(<ResultsBar {...props({ canDownload: false })} />)
    const group = screen.getByRole('button', { name: 'Models' }).parentElement as HTMLElement
    expect([...group.children].map((c) => c.tagName)).toEqual(['BUTTON', 'DIV', 'BUTTON'])
  })

  // The switch's words follow the same width rule as the buttons', so the
  // bar's words come and go together.
  it('hides the switch words by the same rule', () => {
    render(<ResultsBar {...props()} />)
    for (const name of ['Show table only', 'Show chart only', 'Show both chart and table']) {
      expect(screen.getByRole('button', { name }).querySelector('span')?.className).toBe(BAR_LABEL)
    }
  })

  // The credit stands on the map's attribution line now (#687).
  it('carries no link, the Open-Meteo credit having moved to the map', () => {
    render(<ResultsBar {...props()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  // The label holds the word the button shows, which a voice-control reader
  // says to press it (#576, WCAG 2.5.3).
  it('names Both with the word it shows', () => {
    render(<ResultsBar {...props()} />)
    const both = screen.getByRole('button', { name: 'Show both chart and table' })
    expect(both.textContent).toBe('Both')
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
