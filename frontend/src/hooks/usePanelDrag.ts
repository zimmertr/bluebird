import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useRef } from 'react'
import { CHART_PANEL_TITLE } from '../styles'
import { DRAG_THRESHOLD_PX, travel } from '../utils/columnDrag'
import { GHOST_SCALE, dropBar, ghostTransform, slotAt } from '../utils/chart/panelTitle'
import { BOX_ATTR, type Rect, STAGE_ATTR } from './useStretchDrag'

// The pointer's raw updates where the browser sends them, read as
// `useGripDrag` reads them: `pointermove` until the first raw update
// arrives, because a window can advertise the event and never send it.
const RAW = 'pointerrawupdate'

// The accent bar's thickness, `CHART_PICKER.drop`'s 2px.
const BAR_PX = 2

/**
 * A picture of a panel box for the ghost (#846): the box cloned, each canvas
 * copied in (a cloned canvas is blank), and every id and data mark stripped,
 * so nothing that finds a panel, a stage or a card by its mark finds this.
 * The lines are a canvas (record 0256) and the axes small SVG, so the copy is
 * cheap and looks like the panel.
 */
function pictureOf(box: HTMLElement, w: number, h: number): HTMLElement {
  const ghost = box.cloneNode(true) as HTMLElement
  const from = box.querySelectorAll('canvas')
  ghost.querySelectorAll('canvas').forEach((canvas, i) => {
    const source = from[i]
    if (!source || !(source.width > 0) || !(source.height > 0)) return
    // jsdom has no 2D context, so a test DOM copies nothing.
    canvas.getContext('2d')?.drawImage(source, 0, 0)
  })
  for (const el of [ghost, ...Array.from(ghost.querySelectorAll('*'))]) {
    el.removeAttribute('id')
    for (const attr of Array.from(el.attributes)) if (attr.name.startsWith('data-')) el.removeAttribute(attr.name)
  }
  ghost.removeAttribute('style')
  ghost.className = CHART_PANEL_TITLE.ghost
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.width = `${w}px`
  ghost.style.height = `${h}px`
  ghost.style.willChange = 'transform'
  return ghost
}

/**
 * A desk panel's title drag (#846; TJ 2026-11-03): a press past
 * `DRAG_THRESHOLD_PX` lifts a ghost of the panel under the pointer, an accent
 * bar marks where it will land, and the release moves it there through the
 * chart's `onMove`, the one the picker grip and the pinned card's heads call.
 * Modelled on `useStretchDrag`: the boxes are measured once, when the drag
 * lifts, and each frame writes the ghost's transform from a ref and hit-tests
 * against that frozen measure, so no move reads layout, sets state or renders.
 * The bar is written only when the slot under the pointer changes. A cancel
 * or Escape drops the ghost and changes nothing.
 *
 * `areaRef` is the panels' area, which holds the boxes (`BOX_ATTR`, in slot
 * order) and the one bar (`barRef`); `grow` is how far a box reaches into the
 * gutter beside it.
 */
export function usePanelDrag(areaRef: RefObject<HTMLElement | null>, onMove: (from: number, to: number) => void, grow: number) {
  const barRef = useRef<HTMLSpanElement>(null)
  const moveRef = useRef(onMove)
  moveRef.current = onMove
  // A drag still in flight when the chart unmounts lets go of everything.
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])

  const onTitleDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, from: number) => {
      if (e.button !== 0 || from < 1 || !areaRef.current) return
      // No text selection and no compatibility mouse events from the press.
      e.preventDefault()
      stopRef.current?.()
      const area = areaRef.current
      const title = e.currentTarget
      const pointerId = e.pointerId
      title.setPointerCapture?.(pointerId)
      const x0 = e.clientX
      const y0 = e.clientY
      const pointer = { x: x0, y: y0 }
      let lifted: { origin: { x: number; y: number }; boxes: Rect[]; movable: boolean[]; grab: { x: number; y: number }; ghost: HTMLElement } | null = null
      let target: number | null = null
      let frame = 0
      let raw = false

      // The one place a drag reads layout: every box, where it stands in the
      // area, and whether it is drawn, once.
      const lift = () => {
        const at = area.getBoundingClientRect()
        const els = Array.from(area.querySelectorAll<HTMLElement>(`[${BOX_ATTR}]`))
        const boxes = els.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.left - at.left, y: r.top - at.top, w: r.width, h: r.height }
        })
        const box = boxes[from]
        const el = els[from]
        if (!box || !el) return
        const ghost = pictureOf(el, box.w, box.h)
        const grab = { x: x0 - at.left - box.x, y: y0 - at.top - box.y }
        ghost.style.transform = ghostTransform(pointer, grab, GHOST_SCALE)
        document.body.appendChild(ghost)
        // A panel too small to draw keeps its box and has no stage.
        lifted = { origin: { x: at.left, y: at.top }, boxes, movable: els.map((b, i) => i > 0 && b.querySelector(`[${STAGE_ATTR}]`) !== null), grab, ghost }
      }

      const aim = () => {
        if (!lifted) return
        const over = slotAt(lifted.boxes, lifted.movable, pointer.x - lifted.origin.x, pointer.y - lifted.origin.y, grow)
        const next = over === from ? null : over
        if (next === target) return
        target = next
        const bar = barRef.current
        if (!bar) return
        const r = next === null ? null : dropBar(lifted.boxes, from, next, BAR_PX)
        if (!r) {
          bar.hidden = true
          return
        }
        bar.style.left = `${r.x}px`
        bar.style.top = `${r.y}px`
        bar.style.width = `${r.w}px`
        bar.style.height = `${r.h}px`
        bar.hidden = false
      }

      const paint = () => {
        frame = 0
        if (!lifted) return
        lifted.ghost.style.transform = ghostTransform(pointer, lifted.grab, GHOST_SCALE)
        aim()
      }

      const onPointer = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        pointer.x = ev.clientX
        pointer.y = ev.clientY
        if (!lifted) {
          if (travel(pointer.x - x0, pointer.y - y0) < DRAG_THRESHOLD_PX) return
          lift()
        }
        if (!frame) frame = requestAnimationFrame(paint)
      }
      const onRaw = (ev: Event) => {
        raw = true
        onPointer(ev as PointerEvent)
      }
      const onCoalesced = (ev: PointerEvent) => {
        if (!raw) onPointer(ev)
      }

      const stop = () => {
        stopRef.current = null
        cancelAnimationFrame(frame)
        frame = 0
        document.removeEventListener(RAW, onRaw)
        document.removeEventListener('pointermove', onCoalesced)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey, true)
        if (title.hasPointerCapture?.(pointerId)) title.releasePointerCapture(pointerId)
        lifted?.ghost.remove()
        if (barRef.current) barRef.current.hidden = true
      }
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const was = lifted
        if (was) {
          pointer.x = ev.clientX
          pointer.y = ev.clientY
          aim()
        }
        const to = target
        stop()
        if (was && to !== null) moveRef.current(from, to)
      }
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) stop()
      }
      // Escape lets the drag go, and only the drag: captured on the window
      // ahead of the pinned cards' Escape on the document, which would close
      // a card the reader never meant to.
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !lifted) return
        ev.stopPropagation()
        ev.preventDefault()
        stop()
      }

      document.addEventListener(RAW, onRaw)
      document.addEventListener('pointermove', onCoalesced)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey, true)
      stopRef.current = stop
    },
    [areaRef, grow],
  )

  return { onTitleDown, barRef }
}
