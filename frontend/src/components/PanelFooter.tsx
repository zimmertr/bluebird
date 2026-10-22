import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { TUTORIAL_PATH } from '../utils/tourSteps'
import { BLOCKED, BUTTON_PRIMARY, DISABLED, LINK, LINK_INERT, MESSAGE_BADGE, PANEL_EDGE, TEXT } from '../styles'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { usePopover } from '../hooks/usePopover'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { ActionWord } from '../utils/analyzeGate'
import MessageBadge, { MessageRegion } from './MessageBadge'
import MessageList from './MessageList'

interface Props {
  analyzeEnabled: boolean
  // What the button reads (#736, `actionWord`): `Analyze`, `Analyzing…`
  // while a run is up, or `Try again` while the last run's failure stands and
  // the panel still describes the request that failed. Decided above the
  // panel, because the phone's floating button reads the same word.
  word: ActionWord
  onAnalyze: () => void
  /** Open the guided tutorial (#536). */
  onTutorial: () => void
  /** The tour cannot start now (a draw or a run is under way), so the link is inert. */
  tutorialWaits?: boolean
  // Every message the panel has to say, with its count, its worst severity
  // and its dismissals (`usePanelMessages`). This file decides only where the
  // badge and the list stand.
  messages: PanelMessages
  // A phone, where the map's floating button is the one Analyze (record
  // 0135) and wears the badge, so the footer is the document links alone,
  // the last thing in the Controls sheet's scrolling body.
  phone?: boolean
}

/**
 * The panel's footer: the Analyze button with the message badge at its
 * corner, the list the badge opens over it, and the two document links.
 *
 * The messages used to stand in one block under the button (record 0028).
 * Since record 0208 the button carries a count of them in the worst one's
 * colour, and a press on the badge, or anywhere on the button while a
 * blocker greys it, opens the one list that holds them all, on the one menu's
 * card over the button. A blocker's sentence stands under its field as well
 * (`BlockerLine`), so what stops Analyze reads where the fix is.
 */
export default function PanelFooter({
  analyzeEnabled,
  word,
  onAnalyze,
  onTutorial,
  tutorialWaits = false,
  messages,
  phone = false,
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

  // A run disables this button under the keyboard that pressed it, and the
  // overlay's Cancel takes the focus meanwhile; when the run ends and Cancel
  // goes, the focus comes back here rather than to the body (#576).
  const analyzeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(analyzeRef, analyzeEnabled)

  // The list, open or shut. The card stands against the slot the button and
  // its badge share, so it is at least the button's width, and the badge is
  // its trigger: Escape and Tab out hand the keyboard back there. A press on
  // the button is the button's own (`ownPressRef`), so a blocked button can
  // toggle the list without the press-outside rule closing it first. The
  // card goes with the last message, since there is nothing left to list.
  const { count, blocked } = messages
  const [open, setOpen] = useState(false)
  const badgeRef = useRef<HTMLButtonElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const { popoverRef, box, closing } = usePopover({
    open,
    onOpenChange: setOpen,
    triggerRef: badgeRef,
    anchorRef: slotRef,
    ownPressRef: analyzeRef,
  })
  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])
  const toggle = () => setOpen((o) => !o)

  return (
    // The tour's Analyze step lights this footer at a desk; a phone's Analyze
    // is the map's button, which carries the anchor there (`PhoneFoot`). On a
    // phone the wrapper is a plain child of the sheet's body, whose stack
    // draws the rule above it the way it rules off each section.
    <div className={phone ? undefined : `px-4 py-4 border-t ${PANEL_EDGE} space-y-3`} data-tour={phone ? undefined : 'analyze'}>
      {!phone && (
        <div ref={slotRef} className={MESSAGE_BADGE.slot}>
          {/* Disabled only while busy: a blocker greys the button and leaves
              it live, so a press anywhere on it opens the list that says
              why (the maintainer, 2026-10-21). */}
          <button
            ref={analyzeRef}
            onClick={blocked ? toggle : onAnalyze}
            disabled={!analyzeEnabled && !blocked}
            aria-disabled={blocked || undefined}
            className={`${BUTTON_PRIMARY} ${DISABLED} ${BLOCKED}`}
          >
            {word}
          </button>
          <MessageBadge ref={badgeRef} count={count} worst={messages.worst} open={open} onPress={toggle} />
          <MessageRegion messages={messages.messages} />
        </div>
      )}
      {!phone && box && (
        <MessageList
          messages={messages.messages}
          onDismiss={messages.dismiss}
          card={{ box, popoverRef, closing }}
        />
      )}

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
