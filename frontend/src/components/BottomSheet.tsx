import { useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../hooks/useDialog'
import { useSheetDrag } from '../hooks/useSheetDrag'
import { BOTTOM_SHEET, CONTROLS_SHEET, SHEET_ASIDE } from '../styles'
import { type DragHeight, type SheetHeight, heldShare, sharePx } from '../utils/sheetDrag'

/**
 * The Controls sheet's terms (`AppDrawer`, record 0207): a sheet that is
 * mounted for good and told whether it is open, at a height its caller holds.
 */
export interface KeptSheet {
  /** Open over the dim, or shut: slid below the map's foot and inert. */
  open: boolean
  /**
   * The tutorial runs: its card keeps the keyboard, so the sheet neither takes
   * it nor traps it while a step holds it open (#536).
   */
  tourRuns: boolean
  /** Where a drag left it, or null for its own share of the map. */
  held: SheetHeight | null
  /** Its own share, which a release near it or a double press gives back (record 0146). */
  restPx: number
  /** Holds it where a drag left it, or null for its own share. */
  onHeld: (held: SheetHeight | null) => void
  /** A control beside Done in its title row: the theme switch (#706). */
  actions?: ReactNode
}

interface Props {
  /**
   * The sheet's own word: the chip's or the button's that opened it. Not
   * `title`, which is a tooltip's attribute and which the tooltip count in
   * `styles.test.ts` reads as one.
   */
  heading: string
  /** Done, Escape, a press on the dimmed map, or the grip let go closed. */
  onClose: () => void
  /** The rows, which the sheet's body scrolls; the Controls sheet's panel, which scrolls itself. */
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
  /** The Controls sheet, which never unmounts (`KeptSheet`); a menu sheet leaves it out. */
  kept?: KeptSheet
  /**
   * The sheet steps aside for the map under it (record 0250): the dim lifts
   * and the card goes, all but the rows that wear `SHEET_ASIDE.keep`.
   * The Layers sheet, while a finger drags one of its opacity sliders.
   */
  aside?: boolean
}

/**
 * A sheet on a phone (#696; record 0136): one card rising from the screen's
 * bottom edge, with a grip, its title and Done, over a dimmed map. Layers and
 * Legend from the chip row open in it, and so do the results bar's Columns,
 * Models and Removed, so a phone has one menu shape where a desk joins each
 * menu to its control (record 0134). The Controls sheet is one too (record
 * 0207), so the summary chip opens the same shape as the chips beside it.
 *
 * A menu sheet is mounted only while open, which is what `useDialog` is
 * written for: it takes the keyboard into the card when the sheet mounts and
 * hands it back to whatever had it when the sheet goes, closes on Escape, and
 * keeps Tab inside the card, which is what makes the sheet modal. Portalled
 * to the end of the body for the reason `Popover` is: the results bar that
 * opens three of these is inside the results sheet, which clips what it holds.
 *
 * The Controls sheet (`kept`) differs where the panel needs it to. It stays
 * mounted, because the panel's state and the notice block it portals onto
 * the map must outlive a close, so it is modal while open and inert while
 * shut. It renders in place on the panel's layers rather than portalled on
 * the menus', so the notice band can stand between its dim and a sheet
 * opened from inside it (`CONTROLS_SHEET`). And its height is its caller's,
 * because `MapStage` stands the band on its edge.
 */
export default function BottomSheet({ heading, onClose, children, outside, tourAnchor, kept, aside = false }: Props) {
  const headingId = useId()
  const open = kept ? kept.open : true
  const panelRef = useDialog(onClose, open && (kept ? !kept.tourRuns : tourAnchor === undefined))
  // The height a drag left a menu sheet at, or null for its rows' own (#696;
  // record 0146). Every sheet rises as high as the screen, under the status
  // bar's band (record 0290): the ceiling is read when a drag begins, off the
  // box the card stands in (the screen for a menu sheet, the app's frame for
  // the Controls sheet) less that band, which only CSS can read. A menu
  // sheet's own height is its rows' under the cap it opens at; the Controls
  // sheet's is its caller's.
  const [menuHeld, setMenuHeld] = useState<SheetHeight | null>(null)
  const held = kept ? kept.held : menuHeld
  const setHeld = kept ? kept.onHeld : setMenuHeld
  const topBandRef = useRef<HTMLSpanElement>(null)
  // Its rows' own height under the cap it opens at: the card as it stands
  // with nothing held, for one read.
  const measureOwn = () => {
    const card = panelRef.current!
    const shape = card.className
    const share = card.style.getPropertyValue(SHARE_VAR)
    card.className = menuCard(null, aside)
    card.style.removeProperty(SHARE_VAR)
    const px = card.offsetHeight
    card.className = shape
    if (share) card.style.setProperty(SHARE_VAR, share)
    return px
  }
  const dragFull = useRef(0)
  const onGripDown = useSheetDrag({
    measure: () => {
      const card = panelRef.current!
      const box = card.offsetParent as HTMLElement | null
      const fullPx = Math.max(0, (box ? box.clientHeight : window.innerHeight) - (topBandRef.current?.offsetHeight ?? 0))
      const restPx = kept ? kept.restPx : measureOwn()
      dragFull.current = fullPx
      const startPx = held === null ? restPx : held === 'full' ? fullPx : sharePx(held, fullPx)
      return { startPx: Math.min(startPx, fullPx), restPx, fullPx }
    },
    onHeight: (px: DragHeight | null) => setHeld(typeof px === 'number' ? heldShare(px, dragFull.current) : px),
    onClose,
  })
  const sheet = (
    <>
      {/* The whole screen catches a press outside the card and is dimmed,
          the search row and the chips included. No name and out of the tree:
          the sheet's own Done is the way out a keyboard and a screen reader
          use. */}
      {open && (
        <div className={kept ? CONTROLS_SHEET.scrim : BOTTOM_SHEET.scrim} onClick={onClose} aria-hidden="true">
          <div className={`${BOTTOM_SHEET.dim}${aside ? ` ${SHEET_ASIDE.dim}` : ''}`} />
        </div>
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        inert={!open}
        className={
          kept
            ? `${CONTROLS_SHEET.card} ${BOTTOM_SHEET.ceiling}${heldClass(held)} ${open ? '' : CONTROLS_SHEET.shut}`
            : menuCard(held, aside)
        }
        style={heightStyle(held, kept?.restPx)}
        data-tour={tourAnchor}
      >
        <SheetTop
          heading={heading}
          headingId={headingId}
          onClose={onClose}
          onGripDown={onGripDown}
          actions={kept?.actions}
        />
        <div className={kept ? CONTROLS_SHEET.panel : BOTTOM_SHEET.body}>{children}</div>
        {outside}
        <span ref={topBandRef} aria-hidden="true" className={BOTTOM_SHEET.topBand} />
      </div>
    </>
  )
  return kept ? sheet : createPortal(sheet, document.body)
}

/** The custom property a held sheet's share of the ceiling rides on (`BOTTOM_SHEET.held`). */
const SHARE_VAR = '--sheet-share'

/** The class that sizes a held sheet: full, a share of the ceiling, or none for its own height. */
function heldClass(held: SheetHeight | null): string {
  return held === null ? '' : held === 'full' ? ` ${BOTTOM_SHEET.full}` : ` ${BOTTOM_SHEET.held}`
}

/**
 * A menu sheet's card: under the cap it opens at until a drag holds it, then
 * under the ceiling alone, at its share of it or full (record 0290). Classes
 * rather than a number, so a rotation re-sizes it: a held sheet keeps its
 * share of the room the screen now gives it, and a full sheet stays full,
 * its grip never past the screen's top.
 */
function menuCard(held: SheetHeight | null, aside: boolean): string {
  const fit = held === null ? BOTTOM_SHEET.opening : BOTTOM_SHEET.ceiling
  return `${BOTTOM_SHEET.card} ${fit}${heldClass(held)}${aside ? ` ${SHEET_ASIDE.card}` : ''}`
}

/**
 * The card's inline style: a held sheet's share for `BOTTOM_SHEET.held`, or
 * the Controls sheet's own height in px, which its caller works out. Full
 * and a menu sheet's own height are its CSS's alone.
 */
function heightStyle(held: SheetHeight | null, restPx: number | undefined): CSSProperties | undefined {
  if (held !== null && held !== 'full') return { [SHARE_VAR]: held.share } as CSSProperties
  return held === null && restPx !== undefined ? { height: restPx } : undefined
}

interface SheetTopProps {
  heading: string
  /** The id the sheet's label points at. */
  headingId: string
  /** Done. */
  onClose: () => void
  /** A press on the grip or the title, which drags the sheet (`useSheetDrag`). */
  onGripDown: (e: PointerEvent) => void
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
 * alone is 20px tall.
 */
function SheetTop({ heading, headingId, onClose, onGripDown, actions }: SheetTopProps) {
  const done = (
    <button type="button" onClick={onClose} className={BOTTOM_SHEET.done}>
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
