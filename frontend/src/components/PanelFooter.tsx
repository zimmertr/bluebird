import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import DocLinks from './DocLinks'
import { BLOCKED, BUTTON_FORECAST, BUTTON_FORECAST_BAR, BUTTON_FORECAST_QUIET, DISABLED, MESSAGE_BADGE, PANEL_EDGE, SENTENCE_BAR, TEXT } from '../styles'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useOpenOnFailure } from '../hooks/useOpenOnFailure'
import { usePopover } from '../hooks/usePopover'
import type { PanelMessages } from '../hooks/usePanelMessages'
import type { ActionWord } from '../utils/analyzeGate'
import MessageBadge, { MessageRegion } from './MessageBadge'
import MessageList from './MessageList'

// The list shut, open from a press or a failed run, or open from a check or
// the basemap failing with the keyboard left where it was (#834).
type ListState = boolean | 'quiet'

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
  /**
   * The map's sentence bar holds the button (record 0309): no rule, no
   * padding and no links, and the button names what it will forecast. The
   * list takes `widthRef`'s width, the bar's chips and button, where the
   * button alone would wrap every line.
   */
  bar?: { label: string; widthRef?: RefObject<HTMLElement | null>; quiet?: boolean }
}

/**
 * The panel's footer: the Analyze button with the message badge at its
 * corner, the list the badge opens over it, and the two document links.
 *
 * The messages used to stand in one block under the button (record 0028).
 * Since record 0208 the button carries a count of them in the worst one's
 * colour, and a press on the badge, or anywhere on the button while a
 * blocker greys it, opens the one list that holds them all, on the one menu's
 * card over the button.
 */
export default function PanelFooter({
  analyzeEnabled,
  word,
  onAnalyze,
  onTutorial,
  tutorialWaits = false,
  messages,
  phone = false,
  bar,
}: Props) {
  // A run disables this button under the keyboard that pressed it, and the
  // overlay's Cancel takes the focus meanwhile; when the run ends and Cancel
  // goes, the focus comes back here rather than to the body (#576).
  const analyzeRef = useRef<HTMLButtonElement>(null)
  useTakeOrphanedFocus(analyzeRef, analyzeEnabled)

  // The list, open or shut. The card stands against the slot the button and
  // its badge share and takes its width (`widthRef`), so it is the button's
  // width whatever its lines want and a long one wraps inside it: as wide as
  // its longest line, the over-cap sentence ran it past the panel's right
  // edge over the map (#803). The badge is its trigger: Escape and Tab out hand the keyboard back there. A press on
  // the button is the button's own (`ownPressRef`), so a blocked button can
  // toggle the list without the press-outside rule closing it first. The
  // card goes with the last message, since there is nothing left to list.
  // The tutorial's Messages card holds it open (`messages.held`), and a run
  // that fails opens it (#803): a failure that showed only as a count read as
  // no failure at all. A check or the basemap failing opens it too, quietly
  // (#834): the keyboard stays where it is, because the line lands while the
  // reader may be typing in a field, and a press or a failed run over it
  // takes the keyboard in. A phone's footer has no list to open.
  const { count, blocked, held } = messages
  const [listState, setListState] = useState<ListState>(false)
  const open = listState !== false || held
  const badgeRef = useRef<HTMLButtonElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const { popoverRef, box, closing } = usePopover({
    open,
    onOpenChange: setListState,
    triggerRef: badgeRef,
    anchorRef: slotRef,
    widthRef: bar?.widthRef ?? slotRef,
    ownPressRef: analyzeRef,
    takeFocus: listState !== 'quiet',
  })
  useEffect(() => {
    if (count === 0) setListState(false)
  }, [count])
  const openList = useCallback(() => setListState(true), [])
  const openQuietly = useCallback(() => setListState((was) => (was === false ? 'quiet' : was)), [])
  useOpenOnFailure(messages.failureSeq, openList, !phone)
  useOpenOnFailure(messages.openingSeq, openQuietly, !phone)
  const toggle = () => setListState((was) => was === false)

  return (
    // The tour's Analyze step lights this footer at a desk; a phone's Analyze
    // is the map's button, which carries the anchor there (`PhoneFoot`). On a
    // phone the wrapper is a plain child of the sheet's body, whose stack
    // draws the rule above it the way it rules off each section.
    <div className={phone || bar ? undefined : `px-4 py-4 border-t ${PANEL_EDGE} space-y-3`} data-tour={phone ? undefined : 'analyze'}>
      {!phone && (
        <div ref={slotRef} className={bar ? SENTENCE_BAR.forecastSlot : MESSAGE_BADGE.slot}>
          {/* Disabled only while busy: a blocker greys the button and leaves
              it live, so a press anywhere on it opens the list that says
              why (the maintainer, 2026-10-21). */}
          <button
            ref={analyzeRef}
            onClick={blocked ? toggle : onAnalyze}
            disabled={!analyzeEnabled && !blocked}
            aria-disabled={blocked || undefined}
            // The bar draws an outline while a press would fetch nothing new
            // and the button is not saying anything else (record 0314).
            className={`${bar ? (bar.quiet && word === 'Analyze' ? BUTTON_FORECAST_QUIET : BUTTON_FORECAST_BAR) : BUTTON_FORECAST} ${DISABLED} ${BLOCKED}`}
          >
            {bar && word === 'Analyze' ? bar.label : word}
          </button>
          <MessageBadge
            ref={badgeRef}
            count={count}
            worst={messages.worst}
            open={open}
            onPress={toggle}
            arrivalSeq={messages.arrivalSeq}
          />
          <MessageRegion messages={messages.messages} />
        </div>
      )}
      {!phone && box && (
        <MessageList
          messages={messages.messages}
          onDismiss={messages.dismiss}
          card={{ box, popoverRef, closing }}
          held={held}
        />
      )}

      {!bar && <DocLinks onTutorial={onTutorial} tutorialWaits={tutorialWaits} className={`${TEXT.caption} text-center`} />}
    </div>
  )
}
