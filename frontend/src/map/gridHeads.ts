/**
 * The heads of a card's forecast grid, which a reader drags (TJ 2026-10-30):
 * a head carried onto another moves the table's aggregate columns, which
 * every card's columns follow, and a head's edge sizes its column on every
 * card. Shared by the ranked marker's card (`resultsLayer.ts`) and the
 * right-click card (`coordinatePopup.ts`, #832), so a grid is one grid
 * whichever card draws it: the widths a reader set on one are the widths of
 * all, and a resize on either redraws both.
 */
import type { Popup } from 'maplibre-gl'
import { AGGREGATE } from '../metrics'
import { DRAG } from '../styles'
import { DRAG_THRESHOLD_PX, ghostLeft, travel } from '../utils/columnDrag'
import { clamp } from '../utils/numbers'
import { GRID_AGG_ATTR, GRID_EDGE_ATTR } from '../utils/popup/popupChrome'
import type { MapController } from './controller'

// The narrowest and widest a reader may drag a card's grid column: a
// three-digit value, and about half a phone's card.
const GRID_COL_MIN_PX = 36
const GRID_COL_MAX_PX = 160

export interface GridHeads {
  /** The column widths a reader dragged, kept for the session. */
  widths(): Readonly<Record<string, number>>
  /**
   * Wires a card's heads to the drag and the resize. A write of the card's
   * markup replaces the heads, which then need wiring again.
   */
  arm(popup: Popup): void
  /** Called when a resize ends, so every card redraws at the new width. */
  onResize(redraw: () => void): void
}

export function createGridHeads(controller: MapController): GridHeads {
  let widths: Readonly<Record<string, number>> = {}
  const redraws: (() => void)[] = []

  return {
    widths: () => widths,
    onResize(redraw) {
      redraws.push(redraw)
    },
    arm(popup) {
      const el = popup.getElement()
      // Optional, as a remove's lookup is: a test's stub popup has no DOM.
      el?.querySelectorAll?.<HTMLElement>(`th[${GRID_AGG_ATTR}]`).forEach((th) => {
        const agg = th.getAttribute(GRID_AGG_ATTR)!
        th.querySelector<HTMLElement>(`[${GRID_EDGE_ATTR}]`)?.addEventListener('pointerdown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const w0 = th.getBoundingClientRect().width
          const x0 = e.clientX
          const move = (ev: PointerEvent) => {
            const w = Math.round(clamp(w0 + ev.clientX - x0, GRID_COL_MIN_PX, GRID_COL_MAX_PX))
            widths = { ...widths, [agg]: w }
            th.style.width = `${w}px`
            th.style.minWidth = `${w}px`
          }
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            for (const redraw of redraws) redraw()
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        })
        if (agg === AGGREGATE.total) return
        th.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return
          const x0 = e.clientX
          const y0 = e.clientY
          let ghost: HTMLElement | null = null
          const over = (ev: PointerEvent) =>
            document
              .elementFromPoint(ev.clientX, ev.clientY)
              ?.closest<HTMLElement>(`th[${GRID_AGG_ATTR}]`)
              ?.getAttribute(GRID_AGG_ATTR)
          const move = (ev: PointerEvent) => {
            if (!ghost && travel(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) return
            if (!ghost) {
              ghost = document.createElement('div')
              ghost.className = DRAG.ghost
              ghost.textContent = agg
              document.body.appendChild(ghost)
            }
            ghost.style.left = `${ghostLeft(ev.clientX, window.innerWidth)}px`
            ghost.style.top = `${ev.clientY - 10}px`
          }
          const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            if (!ghost) return
            ghost.remove()
            const to = over(ev)
            if (to && to !== agg && to !== AGGREGATE.total) controller.inputs.onMoveAggregate(agg, to)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        })
      })
    },
  }
}
