import { Fragment, type RefObject } from 'react'
import type { CompareNote } from '../hooks/useChartCompare'
import { resultsHeading } from '../metrics'
import type { ResultsMode } from '../utils/viewPrefs'
import type { SortBy } from '../types'
import { MenuButton } from './Menu'
import {
  IconChart,
  IconChartTable,
  IconChevron,
  IconColumns,
  IconDownload,
  IconModels,
  IconRestore,
  IconTable,
} from './icons'
import {
  ACCENT,
  ACTION_GROUP,
  ACTION_ITEM,
  BAR_LABEL,
  CAPTION_LIFTED,
  CONTROL_SIZE,
  DISABLED,
  ICON_BUTTON,
  SEGMENT_DIVIDER,
  SEGMENT_FLUID,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  STATUS,
  TEXT,
} from '../styles'

interface ResultsBarProps {
  /** The ranking and its direction, which the title names. */
  sortBy: SortBy
  sortDesc: boolean
  /** Whether the report is one hour, which drops the aggregate from the title. */
  pointSample: boolean
  /** The bar's element, which `useResultsLayout` measures for the docked map's floor. */
  barRef?: RefObject<HTMLDivElement | null>
  /** "N of M", or null before any report. */
  rowCount: string | null
  /** Destinations no analysis has covered, counted in the title before the first report. */
  pendingCount: number
  /** The report's window caption, or null before any report. */
  windowTitle: string | null
  /** Whether the panels are folded away, and the press that folds them. */
  resultsCollapsed: boolean
  toggleCollapsed: () => void
  /** Whether a report is on screen, which is when the mode switch shows. */
  showResults: boolean
  /** The panels shown, the press that picks them, and whether Both fits. */
  resultsMode: ResultsMode
  chooseResultsMode: (mode: ResultsMode) => void
  bothHasRoom: boolean
  /** Whether the results area shows, which is when Columns and Models stand. */
  showTable: boolean
  /**
   * A phone (#696), where each menu is a bottom sheet rising from below, so
   * its button carries no chevron (record 0174's rule for a phone's chips).
   */
  sheet: boolean
  /** The three menus' triggers, their presses, and whether each is open. */
  columnsButtonRef: RefObject<HTMLButtonElement | null>
  onToggleColumns: () => void
  columnsOpen: boolean
  modelsButtonRef: RefObject<HTMLButtonElement | null>
  onToggleModels: () => void
  modelsOpen: boolean
  removedButtonRef: RefObject<HTMLButtonElement | null>
  onToggleRemoved: () => void
  removedOpen: boolean
  /** How many rows the reader removed; the Removed button hides at zero. */
  removedCount: number
  /** Whether there is a row to write, and the press that writes the file. */
  canDownload: boolean
  onDownloadCsv: () => void
  /** The comparison's wait, when the chart cannot say it. */
  compareWait: string | null
  /** Why a compared model has no rows, when the chart cannot say it. */
  compareNotes: readonly CompareNote[]
}

/**
 * Shared header bar for all results views. A container query, not
 * a viewport one: the bar's width is the viewport minus the docked
 * sidebar, so a viewport breakpoint would fold it on a window that
 * never changed size. Wide, everything sits on one line; narrow,
 * it folds to exactly two — the title row (which keeps the
 * collapse chevron) and the actions row — never a vertical stack
 * (#242 review). The fold sits at the 896px container step;
 * re-measure if a member joins or leaves.
 */
export default function ResultsBar({
  barRef,
  sortBy,
  sortDesc,
  pointSample,
  rowCount,
  pendingCount,
  windowTitle,
  resultsCollapsed,
  toggleCollapsed,
  showResults,
  resultsMode,
  chooseResultsMode,
  bothHasRoom,
  showTable,
  sheet,
  columnsButtonRef,
  onToggleColumns,
  columnsOpen,
  modelsButtonRef,
  onToggleModels,
  modelsOpen,
  removedButtonRef,
  onToggleRemoved,
  removedOpen,
  removedCount,
  canDownload,
  onDownloadCsv,
  compareWait,
  compareNotes,
}: ResultsBarProps) {
  // The bar's buttons, in order, each present under its own condition, so the
  // group can put one divider between each two that stand.
  //
  // Each is named by its word (`aria-label`), because where the bar is narrow
  // the word is hidden and a hidden word names nothing: a voice-control reader
  // says what the button shows, so the name is that word (#576, WCAG 2.5.3).
  // Columns keeps the longer label it always had, which holds its word.
  //
  // The three that open a menu are its triggers in the bar's shape (record
  // 0200): the chevron after the word at a desk, down while shut and up while
  // open, lit while their menu is out. Download CSV opens nothing and takes
  // neither.
  const actions = [
    // Columns opens the picker popover. Present from the first pending row,
    // not only once a report exists: the bar keeping its full membership is
    // what makes it read as one control surface (#242 review).
    showTable && {
      key: 'columns',
      node: (
        <MenuButton
          ref={columnsButtonRef}
          shape="bar"
          open={columnsOpen}
          chevron={!sheet}
          onClick={onToggleColumns}
          aria-label="Choose which columns to display"
        >
          <IconColumns className="flex-shrink-0" />
          <span className={BAR_LABEL}>Columns</span>
        </MenuButton>
      ),
    },
    // Which of the selected models the chart draws (#232). A bar member
    // rather than a control on the chart, for the reason every other
    // comparison control is in one place: the chart is read, not operated.
    // Standing under exactly the condition Columns stands under, because a bar
    // that gains and loses members is a bar a reader has to look for (#242
    // review), and the question it asks is about the panel's selection, which
    // does not wait on a fetch.
    showTable && {
      key: 'models',
      node: (
        <MenuButton
          ref={modelsButtonRef}
          shape="bar"
          open={modelsOpen}
          chevron={!sheet}
          onClick={onToggleModels}
          aria-label="Models"
        >
          <IconModels className="flex-shrink-0" />
          <span className={BAR_LABEL}>Models</span>
        </MenuButton>
      ),
    },
    // Removed rows (#241): a removal's only undo, so it is a standing bar
    // member rather than a transient toast; removals persist across live knobs
    // and refreshes, and so does the way back. Hidden at zero: nothing to
    // restore.
    removedCount > 0 && {
      key: 'removed',
      node: (
        <MenuButton
          ref={removedButtonRef}
          shape="bar"
          open={removedOpen}
          chevron={!sheet}
          onClick={onToggleRemoved}
          aria-label={`Removed (${removedCount})`}
        >
          <IconRestore className="flex-shrink-0" />
          <span className={BAR_LABEL}>Removed ({removedCount})</span>
        </MenuButton>
      ),
    },
    canDownload && {
      key: 'download',
      node: (
        <button onClick={onDownloadCsv} aria-label="Download CSV" className={ACTION_ITEM}>
          <IconDownload className="flex-shrink-0" />
          <span className={BAR_LABEL}>Download CSV</span>
        </button>
      ),
    },
  ].filter((action) => action !== false)
  return (
    <div ref={barRef} className={`@container flex-shrink-0 px-3 py-1.5 bg-raised border-b border-frame`}>
      <div className="flex flex-col gap-1 @4xl:flex-row @4xl:items-center @4xl:gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {/* Before the first analysis the title is the same ranked
              phrase the sidebar has selected, with a zero count —
              "Lowest Total Precipitation (0 of 2)" — so the bar reads
              the same before and after and the zero says nothing has
              been ranked yet. The window timestamp joins once a
              report exists (windowTitle below). */}
          <span className={`${TEXT.subheading} min-w-0 truncate`}>
            {resultsHeading(sortBy, sortDesc, pointSample, rowCount, pendingCount)}
          </span>
          {windowTitle !== null && (
            <span className={`${CAPTION_LIFTED} truncate`}>
              {windowTitle}
            </span>
          )}
          {/* The chevron rides the title row when the bar is folded so
              collapsing never needs the second row; its wide twin sits
              at the end of the actions row below. */}
          <button
            onClick={toggleCollapsed}
            aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
            className={`${ICON_BUTTON} ml-auto @4xl:hidden`}
          >
            <IconChevron up={resultsCollapsed} />
          </button>
        </div>
        {/* Two groups: the mode switch at the left and the buttons at the
            right, with a gap between them that reads as a separation rather
            than a word space (#687, the maintainer on #709). On one line they
            sit at the bar's right end 24px apart (gap-x-6). Folded, the row
            spans the bar and the groups stand at its two ends, at least 16px
            apart (gap-x-4): at 360px the two glyph groups leave the line 19px,
            which 24 would have wrapped. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 @4xl:gap-x-6">
          {/* Mode switch: table, chart, or both — fluid width, since
              three icon-plus-label halves cannot fit the panel's
              144px column (SEGMENT_FLUID exists because this shipped
              clipped). */}
          {showResults && (
            <div className={SEGMENT_FLUID}>
              <button
                onClick={() => chooseResultsMode('table')}
                className={`${SEGMENT_ITEM} ${resultsMode === 'table' ? ACCENT.fill : SEGMENT_IDLE}`}
                aria-pressed={resultsMode === 'table'}
                aria-label="Show table only"
              >
                <IconTable className="flex-shrink-0" />
                <span className={BAR_LABEL}>Table</span>
              </button>
              <div className={SEGMENT_DIVIDER} />
              <button
                onClick={() => chooseResultsMode('chart')}
                className={`${SEGMENT_ITEM} ${resultsMode === 'chart' ? ACCENT.fill : SEGMENT_IDLE}`}
                aria-pressed={resultsMode === 'chart'}
                aria-label="Show chart only"
              >
                <IconChart className="flex-shrink-0" />
                <span className={BAR_LABEL}>Chart</span>
              </button>
              <div className={SEGMENT_DIVIDER} />
              {/* Disabled rather than removed where the viewport
                  cannot hold two panels (#430): a member that comes
                  and goes moves the two beside it and has to be found
                  again, which is the same call Clear filters made. */}
              <button
                onClick={() => chooseResultsMode('both')}
                disabled={!bothHasRoom}
                className={`${SEGMENT_ITEM} ${DISABLED} ${resultsMode === 'both' ? ACCENT.fill : SEGMENT_IDLE}`}
                aria-pressed={resultsMode === 'both'}
                // Holds the word the button shows, for a reader using voice
                // control (#576); the word itself is hidden on a phone, so the
                // button needs a label of its own.
                aria-label="Show both chart and table"
              >
                <IconChartTable className="flex-shrink-0" />
                <span className={BAR_LABEL}>Both</span>
              </button>
            </div>
          )}
          {/* The buttons' group, a sibling of the switch in its look (#687,
              the maintainer on #709): one bordered well, a divider between
              items, each its glyph and, where the bar can hold every word on
              one line, its word (`BAR_LABEL`). Removed joins it whenever it
              shows, and the wide chevron stands after it. */}
          {/* At the row's right end. On one line `justify-between` stands it
              there already; where a three-digit Removed count wraps it onto a
              line of its own (beside the docked panel at 1024, #714) the
              margin keeps it there rather than at the line's start. Not before
              a report, where it is the row's only member. */}
          <div className={`flex items-center gap-2 ${showResults ? 'ml-auto' : ''}`}>
            <div className={ACTION_GROUP}>
              {actions.map((action, i) => (
                <Fragment key={action.key}>
                  {i > 0 && <div className={SEGMENT_DIVIDER} />}
                  {action.node}
                </Fragment>
              ))}
            </div>
            {/* The Open-Meteo credit stands on the map's attribution line since
                #687, rather than a fifth member here that took a line of its
                own on a phone. */}
            <button
              onClick={toggleCollapsed}
              aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
              className={`${ICON_BUTTON} hidden @4xl:flex`}
            >
              <IconChevron up={resultsCollapsed} />
            </button>
          </div>
        </div>
      </div>
      {/* One line under the bar, never beside a control in it: the
          wait is about the whole comparison, where every member of the
          row above is about one thing the reader can press. */}
      {compareWait !== null && (
        <div className={`mt-1 ${CONTROL_SIZE} ${STATUS.warn}`}>{compareWait}</div>
      )}
      {/* Under the wait, as beside the chart: a wait is about every model,
          where a note is about one. */}
      {compareNotes.map(({ id, note }) => (
        <div key={id} className={`mt-1 ${CONTROL_SIZE} ${STATUS.warn}`}>
          {note}
        </div>
      ))}
    </div>
  )
}
