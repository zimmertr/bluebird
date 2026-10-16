import { useId, useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../hooks/useDialog'
import { useSheetDrag } from '../hooks/useSheetDrag'
import { useHoldSheetOpen } from '../hooks/useSheetOpen'
import { BOTTOM_SHEET } from '../styles'

interface Props {
  /**
   * The sheet's own word: the chip's or the button's that opened it. Not
   * `title`, which is a tooltip's attribute and which the tooltip count in
   * `styles.test.ts` reads as one.
   */
  heading: string
  /** Done, Escape, a press on the dimmed map, or the grip let go closed. */
  onClose: () => void
  /** The rows, which the sheet's body scrolls. */
  children: ReactNode
  /**
   * What the sheet holds outside its scrolling rows, so it takes neither a
   * row's height nor the rule between rows: the hidden text a row points at,
   * and a drag's ghost and its line.
   */
  outside?: ReactNode
  /**
   * The tutorial holds the sheet open for a step and frames it under this
   * anchor (#696): the tour's card keeps the keyboard, so the sheet neither
   * takes it nor traps it.
   */
  tourAnchor?: string
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
export default function BottomSheet({ heading, onClose, children, outside, tourAnchor }: Props) {
  const headingId = useId()
  const panelRef = useDialog(onClose, tourAnchor === undefined)
  // The Analyze button hides under the dim while any sheet is open.
  useHoldSheetOpen()
  // The height a drag left the sheet at, or null for its rows' own (#696;
  // record 0146). Its own height and its full one are read off the card when
  // a drag begins: the rows' height with no height set, and the cap its role
  // sets, one inset under the chip row.
  const [heldPx, setHeldPx] = useState<number | null>(null)
  const onGripDown = useSheetDrag({
    measure: () => {
      const card = panelRef.current!
      const startPx = card.offsetHeight
      const held = card.style.height
      card.style.height = ''
      const restPx = card.offsetHeight
      card.style.height = held
      return { startPx, restPx, fullPx: parseFloat(getComputedStyle(card).maxHeight) || restPx }
    },
    onHeight: setHeldPx,
    onClose,
  })
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
        style={heldPx === null ? undefined : { height: heldPx }}
        data-tour={tourAnchor}
      >
        <SheetTop heading={heading} headingId={headingId} onClose={onClose} onGripDown={onGripDown} />
        <div className={BOTTOM_SHEET.body}>{children}</div>
        {outside}
      </div>
    </>,
    document.body,
  )
}

interface SheetTopProps {
  heading: string
  /** The id the sheet's label points at. */
  headingId: string
  /** Done. */
  onClose: () => void
  /** A press on the grip or the title, which drags the sheet (`useSheetDrag`). */
  onGripDown: (e: PointerEvent) => void
  /** Done, for a sheet that hands it the keyboard (the Controls sheet). */
  doneRef?: Ref<HTMLButtonElement>
  /**
   * A control beside Done, which only the Controls sheet fills: its theme
   * switch (#706). Every menu sheet leaves it empty, so its title row is as
   * it was.
   */
  actions?: ReactNode
}

/**
 * The top of every phone sheet: the grip, and the sheet's title with Done
 * beside it. A finger on the grip or anywhere on the title row but Done drags
 * the sheet (#696; record 0146): the row is the bigger target, and the grip
 * alone is 20px tall. Its own component because the Controls sheet
 * (`AppDrawer`, record 0141) wears the same top over a sheet that is not
 * modal and never unmounts.
 */
export function SheetTop({ heading, headingId, onClose, onGripDown, doneRef, actions }: SheetTopProps) {
  const done = (
    <button ref={doneRef} type="button" onClick={onClose} className={BOTTOM_SHEET.done}>
      Done
    </button>
  )
  return (
    <>
      <div className={BOTTOM_SHEET.grip} aria-hidden="true" onPointerDown={onGripDown}>
        <span />
      </div>
      <div
        className={BOTTOM_SHEET.head}
        onPointerDown={(e) => {
          // Done is a button, not a handle, and so is anything beside it.
          if ((e.target as Element).closest('button')) return
          onGripDown(e)
        }}
      >
        <h2 id={headingId} className={BOTTOM_SHEET.title}>
          {heading}
        </h2>
        {actions ? (
          <div className={BOTTOM_SHEET.actions}>
            {actions}
            {done}
          </div>
        ) : (
          done
        )}
      </div>
    </>
  )
}
