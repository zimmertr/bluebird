import type { RefObject } from 'react'
import Menu from './Menu'
import { IconClose } from './icons'
import { MESSAGE_LIST, NOTICE, NOTICE_DISMISS, NOTICE_DIVIDER, STATUS } from '../styles'
import type { PopoverBox } from '../utils/listbox'
import { type FooterMessage, type NoticeSeverity, blockerOf, noticeBoxes } from '../utils/notices'

/** The sheet's heading on a phone, and the list's name to a screen reader (the maintainer, 2026-10-21). */
export const MESSAGES_HEADING = 'Messages'

/**
 * One message in a box, with its × unless it is a blocker: a blocker is the
 * field's state, standing inline beside the field as well, and a dismissed
 * one would leave a greyed button with nothing to say for itself (record
 * 0208). Which dismissal the × triggers is `utils/notices.ts`'s.
 */
function MessageRow({ message, onDismiss }: { message: FooterMessage; onDismiss: () => void }) {
  return (
    <div className={NOTICE_DISMISS.row}>
      <span className="flex-1">{message.text}</span>
      {blockerOf(message.key) === null && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notice" className={NOTICE_DISMISS.button}>
          <span className={NOTICE_DISMISS.pill}>
            <IconClose size="micro" />
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * One box per severity, the messages of that severity ruled apart inside it
 * (`NOTICE_DIVIDER`). The colour lives on the box rather than on each line
 * inside it, so a message that grows a second line cannot forget it; `NOTICE`
 * sets a size and no colour and `STATUS` a colour and no size, which is what
 * lets the two compose without a stylesheet-order race. The one place a
 * `NOTICE` box is built, which the linter's `style-message-list` check holds.
 */
function MessageBox({
  severity,
  messages,
  onDismiss,
}: {
  severity: NoticeSeverity
  messages: readonly FooterMessage[]
  onDismiss: (key: string) => void
}) {
  return (
    <div className={`${NOTICE[severity]} ${STATUS[severity]}`}>
      <div className={NOTICE_DIVIDER[severity]}>
        {messages.map((m) => (
          <MessageRow key={m.key} message={m} onDismiss={() => onDismiss(m.key)} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  /** Every message current, in order, which the boxes group by severity. */
  messages: readonly FooterMessage[]
  onDismiss: (key: string) => void
  /** A desk: the card `usePopover` placed over the Analyze button, and its exit. */
  card?: { box: PopoverBox; popoverRef: RefObject<HTMLDivElement | null>; closing: boolean }
  /** A phone: a bottom sheet headed Messages, closed by the sheet's own ways out. */
  sheet?: { onClose: () => void }
}

// A sheet places itself, so `Menu` reads no ref for it.
const NO_REF: RefObject<HTMLDivElement | null> = { current: null }

/**
 * The list every message is in (#786; record 0208), which the Analyze
 * button's badge opens: the severity boxes in error, warn, info order, each
 * message whole with its × and its remedy being the button the list hangs
 * from. On the one menu (`Menu.tsx`): a card over the panel's button at a
 * desk, at least the button's width, and a bottom sheet on a phone, so a
 * phone reader with four messages sees all four rather than the first and no
 * sign of the rest, which is the failure the band on the map's foot had.
 */
export default function MessageList({ messages, onDismiss, card, sheet }: Props) {
  return (
    <Menu
      box={card?.box ?? null}
      popoverRef={card?.popoverRef ?? NO_REF}
      closing={card?.closing ?? false}
      sheet={sheet ? { heading: MESSAGES_HEADING, onClose: sheet.onClose } : undefined}
    >
      <div role="group" aria-label={MESSAGES_HEADING} className={sheet ? MESSAGE_LIST.sheet : MESSAGE_LIST.card}>
        {noticeBoxes(messages).map((box) => (
          <MessageBox key={box.severity} severity={box.severity} messages={box.messages} onDismiss={onDismiss} />
        ))}
      </div>
    </Menu>
  )
}
