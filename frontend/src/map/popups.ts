/**
 * The popups on the map: which click keeps the ones already open, how wide a
 * new one is, and the board that closes them all.
 *
 * Every popup the map opens goes on one board, through the one factory in
 * `map/mapPopups.ts`, because `closeOnClick` is fixed when a popup is made and so
 * cannot tell a popup to survive the shift-click that pins a second one. A
 * click without shift clears the board, pinned popups included, which is the
 * one way back to a clean map once anything was pinned.
 *
 * MapLibre is imported for its types only, so a node test can load this file.
 */
import type * as maplibregl from 'maplibre-gl'
import type { MapTarget } from '../utils/mapClick'
import { popupWidth, resultPopupWidth } from '../utils/popupChrome'

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

/**
 * The width option a popup opening on this map should take. A ranked
 * destination's popup has a rule of its own, because its grid needs more room
 * than any other popup's text (`resultPopupWidth`).
 */
export function popupOptions(map: maplibregl.Map, { result = false }: { result?: boolean } = {}) {
  const canvasWidth = map.getCanvas().clientWidth
  return { maxWidth: result ? resultPopupWidth(canvasWidth) : popupWidth(canvasWidth) }
}

/** The part of a MapLibre popup the board needs. */
export type BoardPopup = Pick<maplibregl.Popup, 'remove' | 'on'>

export interface PopupBoard {
  /**
   * Put a popup on the board, so the next `closeAll` takes it down. `owner` is
   * the kind of thing it describes, so an overlay switched off can take down
   * its own popups and leave the rest.
   */
  track(popup: BoardPopup, owner?: MapTarget): void
  /** Close every popup on the board, or every one this kind of thing owns. */
  closeAll(owner?: MapTarget): void
}

export function createPopupBoard(): PopupBoard {
  let open: { popup: BoardPopup; owner?: MapTarget }[] = []
  return {
    track(popup, owner) {
      open.push({ popup, owner })
      // MapLibre fires this for its own close button and for closeOnClick, so
      // the board empties itself rather than growing for the session.
      popup.on('close', () => {
        open = open.filter((p) => p.popup !== popup)
      })
    },
    closeAll(owner) {
      const closing = open.filter((p) => owner === undefined || p.owner === owner)
      open = open.filter((p) => !closing.includes(p))
      for (const { popup } of closing) popup.remove()
    },
  }
}
