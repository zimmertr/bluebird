import type { Ref } from 'react'
import { MESSAGE_BADGE, SR_ONLY } from '../styles'
import type { FooterMessage, NoticeSeverity } from '../utils/notices'

/** The badge's accessible name: the count and the word, since the digit alone names nothing. */
export function messagesLabel(count: number): string {
  return `${count} message${count === 1 ? '' : 's'}`
}

interface Props {
  /** How many messages are current; none draws no badge. */
  count: number
  /** The worst of them, which colours the badge; null with none. */
  worst: NoticeSeverity | null
  /** Whether the list is open, which the badge says as a trigger does. */
  open: boolean
  /** Opens or closes the list. */
  onPress: () => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * The count the Analyze button wears while the panel has something to say
 * (#786; record 0208): a disc at the button's corner in the worst message's
 * colour, which opens the list holding every message. The same badge on the
 * panel's button at a desk and on the map's on a phone, each in a slot
 * (`MESSAGE_BADGE.slot`, `MAP_FAB_SLOT`) the badge stands in beside the
 * button, so a blocked button's grey leaves the count whole.
 *
 * A badge is the one summary a reader gets without a press, so it says the
 * two things that matter at a glance, how many and how bad, and nothing
 * else: the words are in the list.
 */
export default function MessageBadge({ count, worst, open, onPress, ref }: Props) {
  if (count === 0 || worst === null) return null
  return (
    <button
      ref={ref}
      type="button"
      aria-label={messagesLabel(count)}
      aria-expanded={open}
      onClick={onPress}
      // The tutorial's Messages card, which the tour skips while there is no
      // badge to point at.
      data-tour="messages"
      className={`${MESSAGE_BADGE.base} ${MESSAGE_BADGE[worst]}`}
    >
      {count}
    </button>
  )
}

/**
 * The one live region, mounted for good beside the badge and holding every
 * message current, out of sight: a box that arrives already holding its text
 * is not announced by most screen readers, which is what each box's own
 * `role="status"` did (#576), and the list is mounted only while it is open.
 * So a screen reader hears each message as it arrives whether or not the
 * list is up, and the list is a second copy of the same words for the eye.
 * One region on the page, in the slot the one Analyze button of the width
 * stands in; the linter's `style-live-region` check holds it to this file.
 */
export function MessageRegion({ messages }: { messages: readonly FooterMessage[] }) {
  return (
    <div role="status" className={SR_ONLY}>
      {messages.map((m) => (
        <p key={m.key}>{m.text}</p>
      ))}
    </div>
  )
}
