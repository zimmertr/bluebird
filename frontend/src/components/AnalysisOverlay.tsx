import { useEffect, useState } from 'react'
import { logoUrl } from '../logo'
import type { Progress } from '../hooks/useAnalyze'
import { ACCENT, BUTTON_SECONDARY, LAYER, PROSE, RADIUS, SURFACE_CARD, TEXT } from '../styles'
import { composeOverlay } from '../utils/analyzeOverlay'

interface AnalysisOverlayProps {
  /** Whether an analysis is in flight; the card shows exactly while it is. */
  loading: boolean
  /** The run's latest phase line. */
  statusMessage: string | null
  /** The weather batches done and in all, once the total is known. */
  progress: Progress | null
  /** Seconds until the client pacer spends quota again, while it sleeps. */
  paceRemainingS: number | null
  /** Stops the analysis in flight. */
  onCancel: () => void
}

/**
 * The loading card over the map while an analysis runs (#409 cut it out of
 * `App.tsx`).
 *
 * Above the drawer, not under it. The drawer now stays open for the
 * length of a run, and an analysis with no visible progress is the
 * thing this overlay exists to prevent — so it takes the layer that
 * clears the drawer rather than the one that sits under it. On
 * desktop nothing moves: there is no drawer for it to clear.
 */
export default function AnalysisOverlay({
  loading,
  statusMessage,
  progress,
  paceRemainingS,
  onCancel,
}: AnalysisOverlayProps) {
  // Elapsed-time counter for phases with no countable progress (the OSM
  // search). It lives here, beside the one card that shows it, so its 250 ms
  // tick re-renders the card rather than the whole page. The composition
  // reads it to stage the "Still searching…" reassurance line.
  const [elapsed, setElapsed] = useState(0)
  const overlay = composeOverlay({
    analyzeLoading: loading,
    statusMessage,
    elapsedS: elapsed,
    rankedProgress: progress ? { processed: progress.processed, total: progress.total } : null,
    // Live countdown while the client pacer sleeps off a quota deficit;
    // `usePacedFetch` ticks it.
    paceRemainingS,
  })

  useEffect(() => {
    if (!overlay.visible) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(id)
  }, [overlay.visible])

  if (!overlay.visible) return null
  return (
    <div className={`absolute inset-0 bg-slate-900/60 ${LAYER.popover} flex items-center justify-center`}>
      <div className={`${SURFACE_CARD} px-6 py-5 text-center w-[280px]`}>
        <img
          src={logoUrl}
          width={256}
          height={256}
          alt=""
          className={`w-12 h-12 ${RADIUS.surface} object-cover mx-auto mb-3 animate-pulse`}
        />
        {/* role=status + aria-live: without it, the analysis phase is
            the one moment the app goes completely silent for screen
            readers — announce each status line as it changes. The
            wrapper covers the detail line too, so failover news
            ("Trying backup map server…") is announced as well. */}
        <div role="status" aria-live="polite">
          <p className={`${PROSE.heading} leading-snug`}>{overlay.message}</p>
          {overlay.detail && (
            <p className={`${TEXT.caption} mt-1 leading-snug`}>{overlay.detail}</p>
          )}
        </div>
        {overlay.progress ? (
          // Weather phase — countable batch progress (the union count is
          // already in the "(x/y)" headline, so the bar just visualizes it).
          <div className="mt-3">
            <div className={`h-2 w-full ${RADIUS.pill} bg-slate-700 overflow-hidden`}>
              <div
                className={`h-full ${ACCENT.mark} transition-all duration-300 ease-out`}
                style={{ width: `${overlay.progress.percent}%` }}
              />
            </div>
            <p className={`mt-1.5 ${TEXT.caption} font-mono`}>
              {overlay.progress.percent}%
            </p>
          </div>
        ) : (
          // Search / analyzing phase — no countable progress; show activity.
          <div className="mt-3">
            <div className={`h-2 w-full ${RADIUS.pill} bg-slate-700 overflow-hidden`}>
              <div className={`h-full w-1/3 ${RADIUS.pill} ${ACCENT.mark} animate-indeterminate`} />
            </div>
            <p className={`mt-1.5 ${TEXT.caption} font-mono`}>
              Elapsed {elapsed}s
            </p>
          </div>
        )}
        <button
          onClick={onCancel}
          // `w-fit mx-auto` rather than leaning on the card's text
          // alignment: TAP.action makes every button a flex container,
          // which is block-level and fills its parent, so the label
          // centres inside a full-width box and the box itself has no
          // alignment left to inherit. Shrinking it to its content is
          // what gives `mx-auto` something to centre.
          className={`${BUTTON_SECONDARY} mt-4 w-fit mx-auto`}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
