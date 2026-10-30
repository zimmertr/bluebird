import { useCallback, useEffect, useRef, useState } from 'react'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useOpenOnFailure } from '../hooks/useOpenOnFailure'
import type { PanelMessages } from '../hooks/usePanelMessages'
import { BLOCKED, DISABLED, MAP_FAB, MAP_FAB_SLOT, MAP_FAB_WORDS } from '../styles'
import { ACTION_WORDS, type ActionWord } from '../utils/analyzeGate'
import MessageBadge, { MessageRegion } from './MessageBadge'
import MessageList from './MessageList'

interface PhoneFootProps {
  /** Where the button's bottom edge stands (`fabBottomPx`), which `MapStage` works out from the sheet's lift. */
  fabBottomPx: number
  /**
   * Receives the button's width when it is measured: the wider word's in the
   * phone's own face, which the opened credit line stops short of (map.css).
   */
  onFabPx: (px: number) => void
  /** The panel's Analyze gate (`analyzeGateFor`), which the button shares. */
  analyzeEnabled: boolean
  /** What the button reads (#736, `actionWord`), the same word as the panel's. */
  word: ActionWord
  /** The panel's Analyze command itself, never a second path to it. */
  onAnalyze: () => void
  /** The panel's messages (`usePanelMessages`): the badge's count and colour, and the sheet's rows. */
  messages: PanelMessages
}

/**
 * The foot of a phone's map (#696): the Analyze button at the bottom right
 * (record 0135), Material's extended floating action button, wearing the
 * message badge at its corner (record 0208), which opens the panel's
 * messages as a bottom sheet headed Messages.
 *
 * One thing moves the button and nothing else: the results sheet, whose top
 * edge it rides. No sheet moves the button or changes it: every phone sheet
 * opens over it, and its dim and its modality keep the button from a press
 * (record 0207). The notice band that stood on the sheet's edge and raised
 * the button by its height went with the badge: on touch it showed one
 * message and no sign of the rest.
 */
export default function PhoneFoot({ fabBottomPx, onFabPx, analyzeEnabled, word, onAnalyze, messages }: PhoneFootProps) {
  // The button's width is the widest word's whichever it reads, so it moves
  // only with the face, the size or the zoom; observed for those. It is
  // mounted for as long as the foot is, so a ref is enough.
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const button = buttonRef.current
    if (!button) return
    const report = () => onFabPx(button.getBoundingClientRect().width)
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(button)
    return () => observer.disconnect()
  }, [onFabPx])
  // A run disables the button under the finger that pressed it, and the
  // overlay's Cancel holds the focus meanwhile; when the run ends the focus
  // comes back here, as it does to the panel's Analyze (#576).
  useTakeOrphanedFocus(buttonRef, analyzeEnabled)

  // The sheet, open or shut: the badge opens it, and so does a press anywhere
  // on the button while a blocker greys it (the maintainer, 2026-10-21). It
  // goes with the last message, since there is nothing left to list. The
  // tutorial's Messages card holds it open (`messages.held`), and a run that
  // fails opens it, as the panel's list opens at a desk (#803).
  const { count, blocked, held } = messages
  const [pressedOpen, setOpen] = useState(false)
  const open = pressedOpen || held
  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])
  const openSheet = useCallback(() => setOpen(true), [])
  useOpenOnFailure(messages.failureSeq, openSheet)
  const toggle = () => setOpen((o) => !o)

  return (
    <>
      <div className={MAP_FAB_SLOT} style={{ bottom: fabBottomPx }}>
        <button
          ref={buttonRef}
          onClick={blocked ? toggle : onAnalyze}
          disabled={!analyzeEnabled && !blocked}
          aria-disabled={blocked || undefined}
          className={`${MAP_FAB} ${DISABLED} ${BLOCKED}`}
          // The tour's Analyze step (#536): a phone's one Analyze is this.
          data-tour="analyze"
        >
          {/* Every word in one cell, so the button is the widest one's width
              whichever it reads; the others are invisible and unread. */}
          <span className={MAP_FAB_WORDS.cell}>
            <span>{word}</span>
            {ACTION_WORDS.filter((w) => w !== word).map((w) => (
              <span key={w} aria-hidden="true" className={MAP_FAB_WORDS.hidden}>
                {w}
              </span>
            ))}
          </span>
        </button>
        <MessageBadge count={count} worst={messages.worst} open={open} onPress={toggle} />
        <MessageRegion messages={messages.messages} />
      </div>
      {open && (
        <MessageList
          messages={messages.messages}
          onDismiss={messages.dismiss}
          sheet={{ onClose: () => setOpen(false) }}
          held={held}
        />
      )}
    </>
  )
}
