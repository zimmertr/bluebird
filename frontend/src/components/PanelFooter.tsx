import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { TUTORIAL_PATH } from '../utils/tourSteps'
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  DISABLED,
  LINK,
  LINK_INERT,
  NOTICE,
  NOTICE_DIVIDER,
  NOTICE_DISMISS,
  PANEL_EDGE,
  STATUS,
  TEXT,
} from '../styles'
import { IconClose } from './icons'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import {
  type FooterMessage,
  type NoticeSeverity,
  isDismissed,
  noticeBoxes,
  pruneDismissals,
} from '../utils/notices'

/**
 * One shape for every message under the Analyze button.
 *
 * There were two shapes and the difference said nothing. A commit cue was
 * centred, unboxed, amber text; a blocker was a left-aligned amber box; the two
 * appeared together, so the panel showed one warning as a caption and the next
 * as a notice for no reason a reader could act on. Severity is the only thing
 * that varies now, and it varies by hue, which is what hue means everywhere
 * else in this app.
 *
 * The colour lives on the box rather than on each line inside it, so a notice
 * that grows a second paragraph cannot forget it. `NOTICE` sets a size and no
 * colour and `STATUS` sets a colour and no size, which is what lets the two
 * compose without the stylesheet-order collision this file keeps warning about.
 */
function NoticeMessage({
  text,
  onDismiss,
}: {
  text: string
  onDismiss: () => void
}) {
  return (
    <div className={NOTICE_DISMISS.row}>
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className={NOTICE_DISMISS.button}
      >
        <span className={NOTICE_DISMISS.pill}>
          <IconClose size="micro" />
        </span>
      </button>
    </div>
  )
}

function FooterNotice({
  severity,
  messages,
  children,
  onDismiss,
}: {
  severity: NoticeSeverity
  // Whatever this severity currently has to say, one entry per message. Each
  // message carries its own X (`NoticeMessage`); `children` is the box-wide
  // action below them all — the error box's retry.
  messages: readonly FooterMessage[]
  children?: React.ReactNode
  // Dismisses ONE message by its key — a message for the event notices, a
  // condition for the derived lines — which `utils/notices.ts` owns.
  onDismiss: (key: string) => void
}) {
  return (
    <div className={`${NOTICE[severity]} ${STATUS[severity]} space-y-2`}>
      {/* Every message renders the same way, alone or one of several: a row
          under a row, separated by the rule `NOTICE_DIVIDER` draws in the box's
          own border tint. A bulleted list did the separating before and spent
          16px of the text column on the indent and the marker, which is more
          than a message written to fit one line at 360px can give up — so the
          second message arriving used to wrap the first. A lone message gets no
          rule, because there is nothing to separate it from. */}
      <div className={NOTICE_DIVIDER[severity]}>
        {messages.map((m) => (
          <NoticeMessage key={m.key} text={m.text} onDismiss={() => onDismiss(m.key)} />
        ))}
      </div>
      {children}
    </div>
  )
}

interface Props {
  analyzeEnabled: boolean
  loading: boolean
  onAnalyze: () => void
  onRetry: () => void
  /** Open the guided tutorial (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so the link is inert. */
  tutorialWaits?: boolean
  // Every message the panel has to say, in order (`utils/panelMessages.ts`).
  // This file decides only how they are boxed and which are dismissed.
  messages: readonly FooterMessage[]
}

/**
 * The panel's footer: the Analyze button, the one notice block under it, and
 * the two document links. The block is here and nowhere else, so a message
 * about any section of the panel still reads in the one place the rule puts it.
 */
export default function PanelFooter({
  analyzeEnabled,
  loading,
  onAnalyze,
  onRetry,
  onTutorial,
  tutorialWaits = false,
  messages,
}: Props) {
  // A plain click starts the tour over this page; a modified click or a
  // middle click is the browser's, and opens the path like any link. While
  // the tour waits the link answers no click at all, the new-tab ones
  // included, since the page it would open starts the tour the same way.
  function startTour(e: MouseEvent<HTMLAnchorElement>) {
    if (tutorialWaits) {
      e.preventDefault()
      return
    }
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onTutorial()
  }
  // The dismissal ledger (#253): every footer message is dismissable, each
  // alone. `pruneDismissals` retires a dismissal the moment its key stops
  // being active, which is what makes an identical error return after the
  // next Analyze (`useAnalysisRun.clearEvents` nulls both event states
  // before it fetches)
  // and a cleared-then-retriggered warning return — while panning, sorting
  // and knob twiddling, which change no key, resurface nothing. Local state
  // on purpose: the panel stays mounted while closed, and a dismissal is
  // presentation, not part of the analysis.
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const activeKeySig = messages
    .map((m) => m.key)
    .join('\u0000')
  useEffect(() => {
    setDismissed((prev) => pruneDismissals(prev, activeKeySig.split('\u0000')))
  }, [activeKeySig])
  const footerBoxes = noticeBoxes(messages.filter((m) => !isDismissed(m.key, dismissed)))

  // A run disables this button under the keyboard that pressed it, and the
  // overlay's Cancel takes the focus meanwhile; when the run ends and Cancel
  // goes, the focus comes back here rather than to the body (#576).
  const analyzeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(analyzeRef, analyzeEnabled)

  return (
    <div className={`px-4 py-4 border-t ${PANEL_EDGE} space-y-3`} data-tour="analyze">
      <button
        ref={analyzeRef}
        onClick={onAnalyze}
        disabled={!analyzeEnabled}
        className={`${BUTTON_PRIMARY} ${DISABLED}`}
      >
        {loading ? 'Analyzing…' : 'Analyze'}
      </button>

      {/* One live region for every box, mounted for good: a box that
          arrives already holding its text is not announced by most screen
          readers, which is what each box's own role="status" did (#576).
          Collapsed while empty, so it adds no gap under the button. */}
      <div role="status" className="space-y-3 empty:mb-0">
      {footerBoxes.map((box) => (
        <FooterNotice
          key={box.severity}
          severity={box.severity}
          messages={box.messages}
          onDismiss={(key) => setDismissed((prev) => [...prev, key])}
        >
          {/* One retry for the whole box, at the bottom (TJ, 2026-08-22):
              it re-runs the analysis, so a message whose condition clears
              drops out and the box closes when none remain. Only a failed
              run summons it — a state problem alone, like an oversized
              polygon, cannot be retried into working. */}
          {box.messages.some((m) => m.retry) && (
            <button onClick={onRetry} disabled={loading} className={BUTTON_DANGER}>
              Try again
            </button>
          )}
        </FooterNotice>
      ))}
      </div>

      {/* Two labels, two pages, and each label goes where it says. The
          privacy copy used to open a dialog here, which meant it had no URL
          and the Terms link next to it pointed at the privacy page anyway.
          Both open in a new tab so reading either never costs you a drawn
          polygon and its results. */}
      <p className={`${TEXT.caption} text-center`}>
        {/* A real link to the tour's path, so it can be copied or opened in
            a new tab like the two beside it; a plain click starts the tour
            over this page instead of reloading it, and the tour writes the
            same path to the address bar (#536). */}
        <a
          href={TUTORIAL_PATH}
          onClick={startTour}
          aria-disabled={tutorialWaits || undefined}
          className={`${LINK} ${LINK_INERT}`}
        >
          Tutorial
        </a>
        {' · '}
        <a href="/privacy" target="_blank" rel="noreferrer" className={LINK}>
          Privacy
        </a>
        {' · '}
        <a href="/terms" target="_blank" rel="noreferrer" className={LINK}>
          Terms
        </a>
      </p>
    </div>
  )
}
