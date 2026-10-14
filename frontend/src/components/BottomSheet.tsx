import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../hooks/useDialog'
import { useHoldSheetOpen } from '../hooks/useSheetOpen'
import { BOTTOM_SHEET } from '../styles'

/**
 * How far down the grip a swipe has to travel before the sheet lets go: past
 * a slip of the thumb, well short of the sheet's own height.
 */
export const SWIPE_CLOSE_PX = 48

interface Props {
  /**
   * The sheet's own word: the chip's or the button's that opened it. Not
   * `title`, which is a tooltip's attribute and which the tooltip count in
   * `styles.test.ts` reads as one.
   */
  heading: string
  /** Done, Escape, a press on the dimmed map or a swipe down the grip. */
  onClose: () => void
  /** The rows, which the sheet's body scrolls. */
  children: ReactNode
  /**
   * What the sheet holds outside its scrolling rows, so it takes neither a
   * row's height nor the rule between rows: the hidden text a row points at,
   * and a drag's ghost and its line.
   */
  outside?: ReactNode
}

/**
 * A menu on a phone (#696; record 0136): one card rising from the screen's
 * bottom edge, with a grip, its title and Done, over a dimmed map. Layers and
 * Legend from the chip row open in it, and so do the results bar's Columns,
 * Models and Removed, so a phone has one menu shape where a desk joins each
 * menu to its control (record 0134).
 *
 * Mounted only while open, which is what `useDialog` is written for: it takes
 * the keyboard into the card when the sheet mounts and hands it back to
 * whatever had it when the sheet goes, closes on Escape, and keeps Tab inside
 * the card, which is what makes the sheet modal. Portalled to the end of the
 * body for the reason `Popover` is: the results bar that opens three of these
 * is inside the results sheet, which clips what it holds.
 */
export default function BottomSheet({ heading, onClose, children, outside }: Props) {
  const headingId = useId()
  const panelRef = useDialog(onClose)
  // The Analyze button hides under the dim while any sheet is open.
  useHoldSheetOpen()
  // Where a press on the grip began, while one is down.
  const swipeRef = useRef<number | null>(null)
  return createPortal(
    <>
      {/* The whole screen catches a press outside the card and is dimmed,
          the search row and the chips included. No name and out of the tree:
          the sheet's own Done is the way out a keyboard and a screen reader
          use. */}
      <div className={BOTTOM_SHEET.scrim} onClick={onClose} aria-hidden="true">
        <div className={BOTTOM_SHEET.dim} />
      </div>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={BOTTOM_SHEET.card}
      >
        <div
          className={BOTTOM_SHEET.grip}
          aria-hidden="true"
          onPointerDown={(e) => {
            swipeRef.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerUp={(e) => {
            const from = swipeRef.current
            swipeRef.current = null
            if (from !== null && e.clientY - from >= SWIPE_CLOSE_PX) onClose()
          }}
          onPointerCancel={() => {
            swipeRef.current = null
          }}
        >
          <span />
        </div>
        <div className={BOTTOM_SHEET.head}>
          <h2 id={headingId} className={BOTTOM_SHEET.title}>
            {heading}
          </h2>
          <button type="button" onClick={onClose} className={BOTTOM_SHEET.done}>
            Done
          </button>
        </div>
        <div className={BOTTOM_SHEET.body}>{children}</div>
        {outside}
      </div>
    </>,
    document.body,
  )
}
