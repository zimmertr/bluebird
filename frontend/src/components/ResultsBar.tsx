import type { RefObject } from 'react'
import { rankedNoun } from '../metrics'
import type { ResultsMode } from '../utils/viewPrefs'
import type { SortBy } from '../types'
import { IconChart, IconChartTable, IconChevron, IconTable } from './icons'
import {
  ACCENT,
  CAPTION_LIFTED,
  CONTROL_SIZE,
  DISABLED,
  ICON_BUTTON,
  LINK,
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
  /** The three popovers' triggers and their presses. */
  columnsButtonRef: RefObject<HTMLButtonElement | null>
  onToggleColumns: () => void
  modelsButtonRef: RefObject<HTMLButtonElement | null>
  onToggleModels: () => void
  removedButtonRef: RefObject<HTMLButtonElement | null>
  onToggleRemoved: () => void
  /** How many rows the reader removed; the Removed button hides at zero. */
  removedCount: number
  /** Whether there is a row to write, and the press that writes the file. */
  canDownload: boolean
  onDownloadCsv: () => void
  /** The comparison's wait, when the chart cannot say it. */
  compareWait: string | null
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
  columnsButtonRef,
  onToggleColumns,
  modelsButtonRef,
  onToggleModels,
  removedButtonRef,
  onToggleRemoved,
  removedCount,
  canDownload,
  onDownloadCsv,
  compareWait,
}: ResultsBarProps) {
  return (
    <div className={`@container flex-shrink-0 px-3 py-1.5 bg-slate-700 border-b border-slate-600`}>
      <div className="flex flex-col gap-1 @4xl:flex-row @4xl:items-center @4xl:gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {/* Before the first analysis the title is the same ranked
              phrase the sidebar has selected, with a zero count —
              "Lowest Total Precipitation (0 of 2)" — so the bar reads
              the same before and after and the zero says nothing has
              been ranked yet. The window timestamp joins once a
              report exists (windowTitle below). */}
          <span className={`${TEXT.subheading} min-w-0 truncate`}>
            {`${sortDesc ? 'Highest' : 'Lowest'} ${rankedNoun(sortBy, pointSample)} (${
              rowCount ?? `0 of ${pendingCount}`
            })`}
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
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* Mode switch: table, chart, or both — fluid width, since
              three icon-plus-label halves cannot fit the panel's
              144px column (SEGMENT_FLUID exists because this shipped
              clipped). */}
          {showResults && (
            <div data-tour="results-mode" className={SEGMENT_FLUID}>
              <button
                onClick={() => chooseResultsMode('table')}
                className={`${SEGMENT_ITEM} ${resultsMode === 'table' ? ACCENT.fill : SEGMENT_IDLE}`}
                aria-pressed={resultsMode === 'table'}
                aria-label="Show table only"
              >
                <IconTable className="flex-shrink-0" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <div className={SEGMENT_DIVIDER} />
              <button
                onClick={() => chooseResultsMode('chart')}
                className={`${SEGMENT_ITEM} ${resultsMode === 'chart' ? ACCENT.fill : SEGMENT_IDLE}`}
                aria-pressed={resultsMode === 'chart'}
                aria-label="Show chart only"
              >
                <IconChart className="flex-shrink-0" />
                <span className="hidden sm:inline">Chart</span>
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
                aria-label="Show chart and table"
              >
                <IconChartTable className="flex-shrink-0" />
                <span className="hidden sm:inline">Both</span>
              </button>
            </div>
          )}
          {/* Columns button opens picker popover. Present from the
              first pending row, not only once a report exists: the
              bar keeping its full membership is what makes it read
              as one control surface (#242 review).

              This and the three beside it read at `TEXT.control`, the
              size of every other control in the app. The micro step is
              for text that is present but never first — a credit, a
              timestamp, an overflow count — and these are buttons the
              reader is meant to press. */}
          {showTable && (
            <button
              ref={columnsButtonRef}
              data-tour="columns"
              onClick={onToggleColumns}
              aria-label="Choose which columns to display"
              className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
            >
              Columns
            </button>
          )}
          {/* Which of the selected models the chart draws (#232). A
              bar member rather than a control on the chart, for the
              reason every other comparison control is in one place:
              the chart is read, not operated. Standing, under exactly
              the condition Columns stands under, because a bar that
              gains and loses members is a bar a reader has to look for
              (#242 review) — and the question it asks is about the
              panel's selection, which does not wait on a fetch. */}
          {showTable && (
            <button
              ref={modelsButtonRef}
              onClick={onToggleModels}
              className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
            >
              Models
            </button>
          )}
          {/* Removed rows (#241): a removal's only undo, so it is a
              standing bar member rather than a transient toast —
              removals persist across live knobs and refreshes, and so
              does the way back. Hidden at zero: nothing to restore. */}
          {removedCount > 0 && (
            <button
              ref={removedButtonRef}
              onClick={onToggleRemoved}
              aria-label={`Restore removed rows (${removedCount} removed)`}
              className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
            >
              Removed ({removedCount})
            </button>
          )}
          {canDownload && (
            <button
              data-tour="download"
              onClick={onDownloadCsv}
              aria-label="Download these results as a CSV file"
              className={`${TEXT.control} ${LINK} cursor-pointer whitespace-nowrap`}
            >
              Download CSV
            </button>
          )}
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className={`${TEXT.control} ${LINK} whitespace-nowrap`}
          >
            Open-Meteo.com
          </a>
          <button
            onClick={toggleCollapsed}
            aria-label={resultsCollapsed ? 'Expand results' : 'Collapse results'}
            className={`${ICON_BUTTON} hidden @4xl:flex`}
          >
            <IconChevron up={resultsCollapsed} />
          </button>
        </div>
      </div>
      {/* One line under the bar, never beside a control in it: the
          wait is about the whole comparison, where every member of the
          row above is about one thing the reader can press. */}
      {compareWait !== null && (
        <div className={`mt-1 ${CONTROL_SIZE} ${STATUS.warn}`}>{compareWait}</div>
      )}
    </div>
  )
}
