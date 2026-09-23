/**
 * The popups on the map: which click keeps the ones already open, how wide a
 * new one is, and the board that closes them all.
 *
 * Every popup the map opens (a result, a basemap feature, a smoke plume) goes
 * on one board, because `closeOnClick` is fixed when a popup is made and so
 * cannot tell a popup to survive the shift-click that pins a second one. A
 * click without shift clears the board, pinned popups included, which is the
 * one way back to a clean map once anything was pinned.
 *
 * MapLibre is imported for its types only, so a node test can load this file.
 */
import type * as maplibregl from 'maplibre-gl'
import { popupWidth } from '../utils/popupChrome'

/**
 * Whether a click should keep the popups already open.
 *
 * One popup at a time is the right default, because you are usually looking at
 * one destination, but comparing two is a real thing to want. Shift is the
 * pinning modifier here for the same reason it is in a file list: it means "and
 * this one too" everywhere else the user has met it.
 */
export function isPinning(e: { originalEvent?: MouseEvent | { shiftKey?: boolean } }): boolean {
  return Boolean((e.originalEvent as { shiftKey?: boolean } | undefined)?.shiftKey)
}

/** The width option a popup opening on this map should take. */
export function popupOptions(map: maplibregl.Map) {
  return { maxWidth: popupWidth(map.getCanvas().clientWidth) }
}

/** The part of a MapLibre popup the board needs. */
export type BoardPopup = Pick<maplibregl.Popup, 'remove' | 'on'>

export interface PopupBoard {
  /** Put a popup on the board, so the next `closeAll` takes it down. */
  track(popup: BoardPopup): void
  /** Close every popup on the board. */
  closeAll(): void
}

export function createPopupBoard(): PopupBoard {
  let open: BoardPopup[] = []
  return {
    track(popup) {
      open.push(popup)
      // MapLibre fires this for its own close button and for closeOnClick, so
      // the board empties itself rather than growing for the session.
      popup.on('close', () => {
        open = open.filter((p) => p !== popup)
      })
    },
    closeAll() {
      const closing = open
      open = []
      for (const popup of closing) popup.remove()
    },
  }
}
