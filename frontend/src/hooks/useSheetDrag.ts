import { useRef } from 'react'
import { useGripDrag } from './useGripDrag'
import { type SheetStops, sheetDragPx, sheetRelease } from '../utils/sheetDrag'

export interface SheetDragOptions {
  /**
   * Read when a drag begins: the height the sheet stands at now, and its
   * stops. Read then rather than at render, because a menu's own height is
   * whatever its rows measure to on screen.
   */
  measure: () => SheetStops & { startPx: number }
  /** The height to hold the sheet at, or null to give it back its own. */
  onHeight: (px: number | null) => void
  /** Let go closed, or flicked down: what Done does. */
  onClose: () => void
}

/**
 * A phone sheet's grip and title under a finger (#696; record 0146): a drag
 * moves the sheet between closed and full, a release lands it by
 * `sheetRelease`, and a double press gives it back its own height. The gesture
 * is the results sheet's grips' (`useGripDrag`), so the two answer a finger
 * the same way; the heights are the sheet's.
 */
export function useSheetDrag({ measure, onHeight, onClose }: SheetDragOptions) {
  const dragRef = useRef<(SheetStops & { startPx: number }) | null>(null)
  return useGripDrag({
    onReset: () => onHeight(null),
    onDragStart: () => {
      dragRef.current = measure()
    },
    onDrag: (up) => {
      const drag = dragRef.current
      if (drag) onHeight(sheetDragPx(drag.startPx, up, drag.fullPx))
    },
    onDragEnd: (up, velocity) => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      const release = sheetRelease(sheetDragPx(drag.startPx, up, drag.fullPx), velocity, drag)
      if (release.kind === 'close') {
        onHeight(null)
        onClose()
      } else onHeight(release.kind === 'rest' ? null : release.px)
    },
  })
}
