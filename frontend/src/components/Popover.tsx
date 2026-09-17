import { createPortal } from 'react-dom'
import type { PopoverBox } from '../utils/listbox'
import { LAYER, SURFACE_CARD, SURFACE_DIVIDER, TEXT } from '../styles'

interface Props {
  /** Where the panel goes, from `usePopover`. */
  box: PopoverBox
  popoverRef: React.RefObject<HTMLDivElement | null>
  /**
   * The overline strip above the rows, for a panel whose contents need naming.
   * A panel that names itself another way (`ModelPicker` heads two groups of
   * chips) passes nothing and draws its own.
   */
  header?: React.ReactNode
  children: React.ReactNode
}

/**
 * The shell every popover in the app wears (#385): the card, the stacking
 * order, the fixed box `usePopover` measured, and the portal out to the body.
 *
 * Portalled rather than rendered in place, and the whole reason the box is
 * fixed: the control panel is an `overflow-y-auto` column, so a panel hanging
 * off a control near the bottom of it would be clipped at the scroll boundary.
 *
 * It owns those four decisions so that no component makes them again —
 * `styles.test.ts` fails a second `position: 'fixed'` or a second copy of the
 * wrapper anywhere under `components/`. Four call sites had spelled all of
 * them, and two had spelled the header row as well.
 */
export default function Popover({ box, popoverRef, header, children }: Props) {
  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        ...box.offset,
      }}
      className={`${SURFACE_CARD} ${LAYER.popover} flex flex-col`}
    >
      {header !== undefined && (
        <div className={`${TEXT.overline} border-b ${SURFACE_DIVIDER} px-3 py-2`}>{header}</div>
      )}
      {children}
    </div>,
    document.body,
  )
}
