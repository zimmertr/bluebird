import { type RefObject, useCallback, useEffect, useRef } from 'react'

// How long the pointer must rest before a drag commits the split and the
// panels redraw at their real size. A redraw is the axes, the grid and the
// canvas at a new size, so a drag that redrew while it moved would drop
// frames; the transforms carry the whole movement.
export const PAUSE_MS = 150

/** The attribute that marks a panel's stage, the box its chart is drawn in. */
export const STAGE_ATTR = 'data-chart-stage'
/** The attribute on every panel box a drag moves, in panel order. */
export const BOX_ATTR = 'data-chart-box'
/** The attribute on every handle a drag moves: the stacked grip, the grid's gutters. */
export const HANDLE_ATTR = 'data-drag-handle'

/** A rectangle in the drag area's own pixels. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Where everything stands at one moment of a drag, from the caller's arithmetic. */
export interface DragLayout {
  /** Every panel box's live rect, in `BOX_ATTR` order. */
  boxes: readonly Rect[]
  /** Every handle's move from where it stood at the last commit, in `HANDLE_ATTR` order. */
  handles: readonly { dx: number; dy: number; sy?: number }[]
}

interface Piece {
  el: HTMLElement
  start: Rect
  stage: HTMLElement | null
  stageW: number
  stageH: number
}

/**
 * A split drag on the compositor alone (#499; TJ 2026-10-30). Nothing a
 * frame writes touches layout: at `begin` the boxes, their stages and the
 * handles are measured once and frozen, and each frame moves the boxes and
 * handles with `translate` and stretches each stage's last drawing with
 * `scale`, all on layers of their own (`will-change`) for the drag only. No
 * frame reads a size either; the caller's `layout` is arithmetic over the
 * area measured at `begin`.
 *
 * When the pointer rests `PAUSE_MS`, `onRest` commits the split to state;
 * the caller then calls `rebase`, which drops the transforms over the new
 * layout and lets each stage take its box's size, so the panels redraw.
 * On release, after the caller commits, `settle` hands the stages back to
 * the layout one per frame, the panel under the pointer first, so no one
 * task redraws every panel.
 */
export function useStretchDrag(areaRef: RefObject<HTMLElement | null>, onRest: () => void) {
  const piecesRef = useRef<Piece[]>([])
  const handlesRef = useRef<HTMLElement[]>([])
  const layoutRef = useRef<(() => DragLayout) | null>(null)
  const frameRef = useRef(0)
  // The release's hand-back runs its own frames. It had shared `frameRef`,
  // and the id its last frame left there told the next drag a frame was
  // already queued, so a second drag painted nothing until it rested.
  const settleRef = useRef(0)
  const handBackRef = useRef<(() => void) | null>(null)
  const pauseRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const restRef = useRef(onRest)
  restRef.current = onRest

  const trackPointer = useCallback((e: PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  // Every box and handle as it stands now, and every stage frozen at its
  // box's size: the one place a drag reads layout.
  const measure = useCallback(() => {
    const area = areaRef.current
    if (!area) return
    const origin = area.getBoundingClientRect()
    piecesRef.current = Array.from(area.querySelectorAll<HTMLElement>(`[${BOX_ATTR}]`)).map((el) => {
      const r = el.getBoundingClientRect()
      const stage = el.querySelector<HTMLElement>(`[${STAGE_ATTR}]`)
      const plot = stage?.parentElement
      const stageW = plot?.clientWidth ?? 0
      const stageH = plot?.clientHeight ?? 0
      el.style.transform = ''
      el.style.willChange = 'transform'
      if (stage) {
        stage.style.width = `${stageW}px`
        stage.style.height = `${stageH}px`
        stage.style.transform = ''
        stage.style.willChange = 'transform'
      }
      return { el, start: { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }, stage, stageW, stageH }
    })
    handlesRef.current = Array.from(area.querySelectorAll<HTMLElement>(`[${HANDLE_ATTR}]`))
    for (const h of handlesRef.current) {
      h.style.transform = ''
      h.style.willChange = 'transform'
    }
  }, [areaRef])

  const paint = useCallback(() => {
    frameRef.current = 0
    const layout = layoutRef.current?.()
    if (!layout) return
    piecesRef.current.forEach((p, i) => {
      const live = layout.boxes[i]
      if (!live) return
      p.el.style.transform = `translate(${live.x - p.start.x}px, ${live.y - p.start.y}px)`
      if (p.stage && p.stageW > 0 && p.stageH > 0) {
        // The box's heading and axis room stay their size; the plot takes the rest.
        const w = p.stageW + live.w - p.start.w
        const h = p.stageH + live.h - p.start.h
        p.stage.style.transform = `scale(${Math.max(0, w) / p.stageW}, ${Math.max(0, h) / p.stageH})`
      }
    })
    handlesRef.current.forEach((el, i) => {
      const m = layout.handles[i]
      if (!m) return
      el.style.transform = `translate(${m.dx}px, ${m.dy}px)${m.sy !== undefined ? ` scaleY(${m.sy})` : ''}`
    })
  }, [])

  const begin = useCallback(() => {
    // A drag that starts while the last release is still handing panels
    // back finishes that first, so it measures the real layout.
    cancelAnimationFrame(settleRef.current)
    settleRef.current = 0
    handBackRef.current?.()
    handBackRef.current = null
    measure()
    document.addEventListener('pointermove', trackPointer)
  }, [measure, trackPointer])

  /** Queue `layout`, the drag's arithmetic, for the next frame. */
  const frame = useCallback(
    (layout: () => DragLayout) => {
      layoutRef.current = layout
      if (!frameRef.current) frameRef.current = requestAnimationFrame(paint)
      clearTimeout(pauseRef.current)
      pauseRef.current = setTimeout(() => restRef.current(), PAUSE_MS)
    },
    [paint],
  )

  /** After a commit mid-drag: the layout is real again, so measure it afresh. */
  const rebase = useCallback(() => measure(), [measure])

  /** The pointer is up: stop the frames; the caller commits, then calls `settle`. */
  const end = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    clearTimeout(pauseRef.current)
    document.removeEventListener('pointermove', trackPointer)
  }, [trackPointer])

  /**
   * After the release's commit: the boxes stand in the real layout, each
   * stage still frozen at its old size and stretched to its new one; one
   * stage a frame is handed back, so its chart redraws alone.
   */
  const settle = useCallback(() => {
    const pieces = piecesRef.current
    piecesRef.current = []
    layoutRef.current = null
    for (const h of handlesRef.current) {
      h.style.transform = ''
      h.style.willChange = ''
    }
    handlesRef.current = []
    const stages: HTMLElement[] = []
    for (const p of pieces) {
      p.el.style.transform = ''
      p.el.style.willChange = ''
      const plot = p.stage?.parentElement
      if (!p.stage || !plot || !(p.stageW > 0) || !(p.stageH > 0)) continue
      p.stage.style.transform = `scale(${plot.clientWidth / p.stageW}, ${plot.clientHeight / p.stageH})`
      stages.push(p.stage)
    }
    const at = pointerRef.current
    pointerRef.current = null
    if (at) {
      const under = stages.findIndex((s) => {
        const r = s.parentElement!.getBoundingClientRect()
        return at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom
      })
      if (under > 0) stages.unshift(...stages.splice(under, 1))
    }
    const handBack = (stage: HTMLElement) => {
      stage.style.width = ''
      stage.style.height = ''
      stage.style.transform = ''
      stage.style.willChange = ''
    }
    const next = () => {
      settleRef.current = 0
      const stage = stages.shift()
      if (!stage) return
      handBack(stage)
      if (stages.length) settleRef.current = requestAnimationFrame(next)
      else handBackRef.current = null
    }
    handBackRef.current = () => {
      for (const stage of stages.splice(0)) handBack(stage)
    }
    next()
  }, [])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      cancelAnimationFrame(settleRef.current)
      clearTimeout(pauseRef.current)
      document.removeEventListener('pointermove', trackPointer)
    },
    [trackPointer],
  )

  return { begin, frame, rebase, end, settle }
}
