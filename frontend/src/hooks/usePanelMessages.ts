import { useCallback, useEffect, useState } from 'react'
import type { Refusal, RunError } from './analyzeTypes'
import type { ForecastModelOption } from './useCapabilities'
import type { DiscoveryType, SortBy } from '../types'
import { analyzeBlockers, analyzeGateFor, canAnalyze, ringAddsNothing } from '../utils/analyzeGate'
import { type ForecastSelection, selectionLocalWindow } from '../utils/calendar'
import { type WindowLimits, windowSource } from '../utils/forecastWindow'
import {
  type EventNoticeKind,
  type FooterMessage,
  type NoticeSeverity,
  blockerOf,
  eventKindOf,
  isDismissed,
  pruneDismissals,
  worstSeverity,
} from '../utils/notices'
import { type BlockerHome, blockerLines, panelMessages } from '../utils/panelMessages'
import type { CommitReason } from '../utils/present'
import { classifyAqiCoverage } from '../utils/urlState'

/**
 * Everything the panel's messages are derived from, as App holds it. The
 * Analyze gate reads most of the same inputs, which is why the gate is built
 * here too: the panel's Analyze and the phone's are one command on one gate
 * (record 0135), and the blockers are the gate's reasons spelled out.
 */
export interface PanelMessageState {
  selection: ForecastSelection
  /** The selection is unservable, or its narrowed hours run backwards. */
  windowWarning: 'past' | 'future' | 'order' | null
  /** The last model change trimmed the window under its reach. */
  modelClamped: boolean
  forecastModel: string
  comparedModels: readonly string[]
  forecastModels: readonly ForecastModelOption[]
  polygonAreaKm2: number | null
  maxAreaKm2: number
  drawPointCount: number
  drawing: boolean
  destinationTypes: readonly DiscoveryType[]
  /** Whether the coordinates box parses to at least one row. */
  hasCustom: boolean
  /** Whether at least one place has been searched by name. */
  hasPins: boolean
  sortBy: SortBy
  loading: boolean
  error: RunError | null
  refusal: Refusal | null
  /** Every knob that has stopped applying live, in `commitNeeded`'s order. */
  commitReasons: readonly CommitReason[]
  /** Whether a report is on screen at all. */
  hasReport: boolean
  /** Every displayed row has null AQI although the window is inside the horizon. */
  aqiAllNull: boolean
  /** The wildfire or closure check failed for the displayed report, while its layer is on (`checkNoticeDue`). */
  wildfireCheckFailed: boolean
  closureCheckFailed: boolean
  /** The basemap style is failing to load (#580). */
  basemapFailed: boolean
  archiveDays: number
  aqiForecastDays: number
  windowLimits: WindowLimits
  /** Dismissing the run error or the refusal clears the event (`useAnalysisRun.dismissEvent`, #736). */
  dismissEvent: (kind: EventNoticeKind) => void
}

/**
 * What the panel, the Analyze button and the phone's map read of the
 * messages (record 0208): the list as the reader sees it, its count and its
 * worst severity for the badge, the blockers' lines by the field each stands
 * under, and the gate's own answers, which the panel's sections draw.
 */
export interface PanelMessages {
  /** Every message current and not dismissed, in `panelMessages`'s order. */
  messages: readonly FooterMessage[]
  count: number
  /** The worst severity current, which colours the badge; null with none. */
  worst: NoticeSeverity | null
  /**
   * Dismisses one message by its key: an event's clears its state, a derived
   * line's joins the ledger, and a blocker's is passed over, since a blocker
   * is the field's state until the reader supplies what it asks.
   */
  dismiss: (key: string) => void
  /** The blockers' lines by home, every home present and most of them empty. */
  blockers: Readonly<Record<BlockerHome, FooterMessage[]>>
  /** The gate's answer, which the panel's button and the phone's share. */
  analyzeEnabled: boolean
  /** Shut for a reason the reader can act on, as against busy: a press opens the list. */
  blocked: boolean
  /** The ring is over the area cap, which the polygon block's readout colours by. */
  areaTooLarge: boolean
  /** How many more points the ring needs, which the draw counter prints. */
  pointsNeeded: number
  /** The selected window is one the archive answers, where no model applies. */
  modelDisabled: boolean
}

/**
 * The panel's messages and the Analyze gate from the panel's own inputs,
 * with the dismissal ledger (#253), in one place for both widths.
 *
 * It used to be `ControlPanel`'s: the panel derived its gate and its lines and
 * `PanelFooter` kept the ledger, and a phone's map borrowed the block through
 * a portal. Since record 0208 the messages are read on the map's Analyze
 * button as well as the panel's, as a count and a list, so the derivation
 * lives above both, as App's. The pure halves stay where they were:
 * `analyzeGate.ts` decides the gate, `panelMessages.ts` which lines exist,
 * `notices.ts` how a dismissal is keyed and when it expires; this hook is the
 * wiring and the one piece of state, the ledger.
 *
 * The ledger is state here on purpose: a dismissal is presentation, not part
 * of the analysis, and `pruneDismissals` retires a dismissal the moment its
 * key stops being active, which is what makes a cleared-then-retriggered
 * warning return while panning, sorting and knob twiddling, which change no
 * key, resurface nothing. The two event notices are not in it: dismissing the
 * run error or the refusal clears the event itself (`dismissEvent`, #736), so
 * the Analyze button that read `Try again` off the error reads `Analyze`
 * again in the same render.
 */
export function usePanelMessages(s: PanelMessageState): PanelMessages {
  // Falls back to the id so a link naming a model this deployment stopped
  // publishing still reads as something rather than as an empty gap in a
  // sentence.
  const modelLabel = s.forecastModels.find((m) => m.id === s.forecastModel)?.label ?? s.forecastModel
  // The gate the two Analyze buttons read (#696): one function from the same
  // inputs, so the two cannot disagree about whether a run may start.
  const { gate, freezeGaps } = analyzeGateFor({
    selection: s.selection,
    hasWindowWarning: s.windowWarning !== null,
    loading: s.loading,
    polygonAreaKm2: s.polygonAreaKm2,
    maxAreaKm2: s.maxAreaKm2,
    drawPointCount: s.drawPointCount,
    destinationTypes: s.destinationTypes,
    hasCustom: s.hasCustom,
    hasPins: s.hasPins,
    sortBy: s.sortBy,
    forecastModels: s.forecastModels,
    forecastModel: s.forecastModel,
    comparedModels: s.comparedModels,
  })
  const analyzeEnabled = canAnalyze(gate)
  const blockers = analyzeBlockers({ ...gate, drawPointCount: s.drawPointCount })
  const ringIgnored = ringAddsNothing({ ...gate, drawPointCount: s.drawPointCount, drawing: s.drawing })

  // The selection as the datetime pair the warnings read. The calendar marks
  // days past the air-quality horizon in the grid; the AQI line is the
  // sentence that explains the mark once a selection actually crosses it.
  const now = new Date()
  const window = selectionLocalWindow(s.selection, now)
  const windowMs =
    window === null ? null : { startMs: new Date(window.start).getTime(), endMs: new Date(window.end).getTime() }
  // Informational only, never a blocker: AQI simply degrades to a dash. The
  // current hour is always inside the ~5-day horizon, and a dateless Dates
  // arm has no window to warn about.
  const aqiCoverage =
    s.selection.kind === 'now' || window === null
      ? 'full'
      : classifyAqiCoverage(window.start, window.end, now, s.aqiForecastDays)
  // Which endpoint answers the SELECTED window (#123). A window the archive
  // answers names no model, so the picker does not apply and is faded rather
  // than left looking like an input to a fetch that ignores it. A window
  // crossing the boundary keeps the picker: the forecast half is the chosen
  // model's, and the seam line says where that half begins.
  const source = windowMs === null ? null : windowSource(windowMs.startMs, windowMs.endMs, now.getTime(), s.windowLimits)
  const pointsNeeded = Math.max(0, 3 - s.drawPointCount)

  const all = panelMessages({
    loading: s.loading,
    error: s.error,
    refusal: s.refusal,
    commitReasons: s.commitReasons,
    modelLabel,
    modelClamped: s.modelClamped,
    windowWarning: s.windowWarning,
    window: windowMs,
    source,
    aqiCoverage,
    blockers,
    ringIgnored,
    pointsNeeded,
    freezeGaps,
    maxAreaKm2: s.maxAreaKm2,
    archiveDays: s.archiveDays,
    aqiForecastDays: s.aqiForecastDays,
    windowLimits: s.windowLimits,
    hasReport: s.hasReport,
    aqiAllNull: s.aqiAllNull,
    wildfireCheckFailed: s.wildfireCheckFailed,
    closureCheckFailed: s.closureCheckFailed,
    basemapFailed: s.basemapFailed,
    now,
  })

  // The dismissal ledger for the derived lines, keyed on their conditions.
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const activeKeySig = all.map((m) => m.key).join('\u0000')
  useEffect(() => {
    setDismissed((prev) => pruneDismissals(prev, activeKeySig.split('\u0000')))
  }, [activeKeySig])
  const messages = all.filter((m) => !isDismissed(m.key, dismissed))

  const { dismissEvent } = s
  const dismiss = useCallback(
    (key: string) => {
      if (blockerOf(key)) return
      const event = eventKindOf(key)
      if (event) dismissEvent(event)
      else setDismissed((prev) => [...prev, key])
    },
    [dismissEvent],
  )

  return {
    messages,
    count: messages.length,
    worst: worstSeverity(messages),
    dismiss,
    blockers: blockerLines(all),
    analyzeEnabled,
    // Busy is the button's own news; a blocker is a reason the reader can
    // act on, and the list is where every reason is.
    blocked: !analyzeEnabled && !s.loading,
    areaTooLarge: gate.areaTooLarge,
    pointsNeeded,
    modelDisabled: source === 'archive',
  }
}
