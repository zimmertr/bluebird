import { type RefObject, useCallback, useEffect, useRef } from 'react'

// How often a drag lets the panels redraw at their live size. Each redraw is
// Recharts laying out every line again, about 170ms a panel at 200 lines
// (measured 2026-10-29), so one per pointer move queued seconds of work
// behind a four-panel drag; the stretch carries the frames between.
export const REDRAW_MS = 100

/** The attribute that marks a panel's stage, the box its chart is drawn in. */
export const STAGE_ATTR = 'data-chart-stage'

/**
 * Stretch and settle (#499; TJ 2026-10-29): while a split between the
 * chart's panels is dragged, nothing goes through React. `frame` writes the
 * live layout to the DOM once a frame, then stretches each panel's last
 * drawing to its live box with a CSS transform, which costs the browser a
 * composite and Recharts nothing. Every `REDRAW_MS` a stage takes its box's
 * real size, so its ResponsiveContainer redraws once at that size; `end`
 * hands the stages back to the layout, and the caller commits the split to
 * state once.
 *
 * A stage is frozen at a pixel size rather than the chart being handed fixed
 * dimensions, because a ResponsiveContainer given numbers stops measuring
 * and remounts its chart.
 */
export function useStretchDrag(areaRef: RefObject<HTMLElement | null>) {
  const writeRef = useRef<(() => void) | null>(null)
  const frameRef = useRef(0)
  const redrawnRef = useRef(0)

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

  const paint = useCallback(() => {
    frameRef.current = 0
    writeRef.current?.()
    const now = performance.now()
    const redraw = now - redrawnRef.current >= REDRAW_MS
    if (redraw) redrawnRef.current = now
    for (const stage of stages()) {
      if (redraw || !stage.style.width) {
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

  const begin = useCallback(() => {
    redrawnRef.current = performance.now()
    for (const stage of stages()) settle(stage)
  }, [stages])

  /** Queue `write`, the live layout, for the next frame. */
  const frame = useCallback(
    (write: () => void) => {
      writeRef.current = write
      if (!frameRef.current) frameRef.current = requestAnimationFrame(paint)
    },
    [paint],
  )

  const end = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    writeRef.current?.()
    writeRef.current = null
    for (const stage of stages()) {
      stage.style.width = ''
      stage.style.height = ''
      stage.style.transform = ''
    }
  }, [stages])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  return { begin, frame, end }
}
