import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useOpenOnFailure } from '../hooks/useOpenOnFailure'
import type { PanelMessages } from '../hooks/usePanelMessages'
import { BLOCKED, DISABLED, MAP_FOOT } from '../styles'
import type { ActionWord } from '../utils/analyzeGate'
import { UP_TO_DATE } from '../utils/sentenceBar'
import MessageBadge, { MessageRegion } from './MessageBadge'
import MessageList from './MessageList'

interface PhoneFootProps {
  /** Where the foot's bottom edge stands (`fabBottomPx`), which `MapStage` works out from the sheet's lift. */
  fabBottomPx: number
  /** The day strip's days (`DayStrip` bare), over the button, or null. */
  strip?: ReactNode
  /** The panel's Analyze gate (`analyzeGateFor`), which the button shares. */
  analyzeEnabled: boolean
  /** What the button reads (#736, `actionWord`), the same word as the panel's. */
  word: ActionWord
  /** What the button says while the word is Analyze (`forecastLabel`), as the desk's bar does (record 0328). */
  label?: string
  /** The panel's Analyze command itself, never a second path to it. */
  onAnalyze: () => void
  /** The panel's messages (`usePanelMessages`): the badge's count and colour, and the sheet's rows. */
  messages: PanelMessages
  /** A full-screen results sheet stands over the button (#837), which is out of reach until it comes down. */
  covered?: boolean
}

/**
 * The foot of a phone's map (record 0329): one card across the map holding
 * the day strip and the full-width Forecast button under it, the button
 * wearing the message badge at its corner (record 0208), which opens the
 * panel's messages as a bottom sheet headed Messages. It was a floating
 * Analyze button at the bottom right until then (record 0135).
 *
 * One thing moves the button and nothing else: the results sheet, whose top
 * edge it rides. No sheet moves the button or changes it: every phone sheet
 * opens over it, and its dim and its modality keep the button from a press
 * (record 0207). The notice band that stood on the sheet's edge and raised
 * the button by its height went with the badge: on touch it showed one
 * message and no sign of the rest.
 */
export default function PhoneFoot({
  fabBottomPx,
  strip = null,
  analyzeEnabled,
  word,
  label,
  onAnalyze,
  messages,
  covered = false,
}: PhoneFootProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // A run disables the button under the finger that pressed it, and the
  // overlay's Cancel holds the focus meanwhile; when the run ends the focus
  // comes back here, as it does to the panel's Analyze (#576).
  useTakeOrphanedFocus(buttonRef, analyzeEnabled)

  // The sheet, open or shut: the badge opens it, and so does a press anywhere
  // on the button while a blocker greys it (the maintainer, 2026-10-21). It
  // goes with the last message, since there is nothing left to list. The
  // tutorial's Messages card holds it open (`messages.held`), and a run that
  // fails opens it, as the panel's list opens at a desk (#803). So does a
  // check or the basemap failing (#834), and the sheet takes the keyboard
  // then as it always does: it is modal, and a modal that left the keyboard
  // behind it would leave it on a page a screen reader cannot reach (the
  // maintainer, 2026-10-30).
  const { count, blocked, held } = messages
  const [pressedOpen, setOpen] = useState(false)
  const open = pressedOpen || held
  useEffect(() => {
    if (count === 0) setOpen(false)
  }, [count])
  const openSheet = useCallback(() => setOpen(true), [])
  useOpenOnFailure(messages.failureSeq, openSheet)
  useOpenOnFailure(messages.openingSeq, openSheet)
  const toggle = () => setOpen((o) => !o)
  const shown = label !== undefined && word === 'Analyze' ? label : word
  const quiet = shown === UP_TO_DATE

  return (
    <>
      <div
        // A card keeps clear of the button and its badge, as it does of the
        // rows and the player (`map/mapPopups.ts` finds every
        // `data-map-overlay`), so a card a tap opens never hangs its foot
        // behind the one Analyze a phone has.
        data-map-overlay=""
        className={MAP_FOOT.card}
        // A drag on the results sheet moves the button with it, as a
        // transform (`--sheet-shift`, #837); a full-screen sheet covers it,
        // and nothing under the sheet takes a press or the keyboard.
        style={{ bottom: fabBottomPx, transform: 'translateY(var(--sheet-shift, 0px))' }}
        inert={covered}
      >
        {strip && <div className={MAP_FOOT.days}>{strip}</div>}
        <div className={MAP_FOOT.slot}>
          <button
            ref={buttonRef}
            onClick={blocked ? toggle : onAnalyze}
            disabled={!analyzeEnabled && !blocked}
            aria-disabled={blocked || undefined}
            // Outlined while a press would fetch nothing new, as the desk's is.
            className={`${quiet ? MAP_FOOT.quiet : MAP_FOOT.button} ${DISABLED} ${BLOCKED}`}
            // The tour's Analyze step (#536): a phone's one Analyze is this.
            data-tour="analyze"
          >
            {shown}
          </button>
          <MessageBadge
            count={count}
            worst={messages.worst}
            open={open}
            onPress={toggle}
            arrivalSeq={messages.arrivalSeq}
          />
        </div>
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
