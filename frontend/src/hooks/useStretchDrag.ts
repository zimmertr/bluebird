import { type RefObject, useCallback, useEffect, useRef } from 'react'

// How long the pointer must rest before a drag redraws the panels at their
// live size. A redraw is Recharts laying out every line again, about 170ms a
// panel at 200 lines (measured 2026-10-29), so a redraw while the pointer
// moves always stutters; the stretch carries the whole movement, and the
// panels redraw when the reader stops and once on release.
export const PAUSE_MS = 150

/** The attribute that marks a panel's stage, the box its chart is drawn in. */
export const STAGE_ATTR = 'data-chart-stage'

/**
 * Stretch and settle (#499; TJ 2026-10-29): while a split between the
 * chart's panels is dragged, nothing goes through React. `frame` writes the
 * live layout to the DOM once a frame, then stretches each panel's last
 * drawing to its live box with a CSS transform, which costs the browser a
 * composite and Recharts nothing. When the pointer rests `PAUSE_MS`, each
 * stage takes its box's real size, so its ResponsiveContainer redraws once
 * at that size; `end` hands the stages back to the layout, and the caller
 * commits the split to state once.
 *
 * A stage is frozen at a pixel size rather than the chart being handed fixed
 * dimensions, because a ResponsiveContainer given numbers stops measuring
 * and remounts its chart.
 */
export function useStretchDrag(areaRef: RefObject<HTMLElement | null>) {
  const writeRef = useRef<(() => void) | null>(null)
  const frameRef = useRef(0)
  const pauseRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const stages = useCallback(
    () => Array.from(areaRef.current?.querySelectorAll<HTMLElement>(`[${STAGE_ATTR}]`) ?? []),
    [areaRef],
  )

  const settle = (stage: HTMLElement) => {
    const box = stage.parentElement
    if (!box) return
    stage.style.width = `${box.clientWidth}px`
    stage.style.height = `${box.clientHeight}px`
    stage.style.transform = ''
  }

  const stretch = useCallback(() => {
    frameRef.current = 0
    writeRef.current?.()
    for (const stage of stages()) {
      if (!stage.style.width) {
        settle(stage)
        continue
      }
      const box = stage.parentElement
      const w = parseFloat(stage.style.width)
      const h = parseFloat(stage.style.height)
      if (!box || !(w > 0) || !(h > 0)) continue
      stage.style.transform = `scale(${box.clientWidth / w}, ${box.clientHeight / h})`
    }
  }, [stages])

  // The pointer has rested: every stage takes its box's size and redraws.
  const redraw = useCallback(() => {
    for (const stage of stages()) settle(stage)
  }, [stages])

  const begin = useCallback(() => {
    for (const stage of stages()) {
      settle(stage)
      stage.style.willChange = 'transform'
    }
  }, [stages])

  /** Queue `write`, the live layout, for the next frame. */
  const frame = useCallback(
    (write: () => void) => {
      writeRef.current = write
      if (!frameRef.current) frameRef.current = requestAnimationFrame(stretch)
      clearTimeout(pauseRef.current)
      pauseRef.current = setTimeout(redraw, PAUSE_MS)
    },
    [stretch, redraw],
  )

  const end = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    clearTimeout(pauseRef.current)
    writeRef.current?.()
    writeRef.current = null
    for (const stage of stages()) {
      stage.style.width = ''
      stage.style.height = ''
      stage.style.transform = ''
      stage.style.willChange = ''
    }
  }, [stages])

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      clearTimeout(pauseRef.current)
    },
    [],
  )

  return { begin, frame, end }
}
