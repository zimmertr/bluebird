import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePlotArea } from 'recharts'
import { type LineStroke, drawActiveDots, drawLines, rootTheme } from '../utils/chart/chartCanvas'
import type { ChartPoint } from '../utils/chart/chartData'
import type { Theme } from '../utils/viewPrefs'

// The canvas lets the pointer through to the chart under it, whose hover and
// click read the hour.
const PASS_THROUGH = { pointerEvents: 'none' } as const

/**
 * The series lines of one chart panel, drawn on a canvas rather than as one
 * SVG `<Line>` per destination (#499; record 0256). Rendered inside the
 * LineChart, so it reads the panel's own plot area and scales, and stands in
 * the SVG between the grid and the reference lines (Recharts' z order puts a
 * plain child at 0, the grid at -100 and the reference lines at 400). A
 * second canvas carries the hover dots, so a hover redraws a handful of
 * circles rather than every line.
 */
export default function ChartLines({
  data,
  strokes,
  yDomain,
  at,
}: {
  data: readonly ChartPoint[]
  strokes: readonly LineStroke[]
  /** The y axis's domain, which the panel hands its YAxis too. */
  yDomain: readonly [number, number]
  /**
   * The hour the dots stand on, or null for none (TJ 2026-10-30): the chart's
   * one hour, shared by every panel, rather than Recharts' hover state, which
   * each panel kept for itself and kept past a finger's lift.
   */
  at: number | null
}) {
  const area = usePlotArea()
  const linesRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<HTMLCanvasElement>(null)
  // The theme the root wears: a switch repaints the canvas, which `light-dark()`
  // does for the SVG without a render.
  const [theme, setTheme] = useState<Theme>(rootTheme)
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(rootTheme()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watch.disconnect()
  }, [])

  const w = area?.width ?? 0
  const h = area?.height ?? 0
  const left = area?.x ?? 0
  const top = area?.y ?? 0
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  // The axes' own maps, spelled linearly over the plot area: the x axis spans
  // the first hour to the last (`dataMin`/`dataMax`) and the y axis the
  // panel's domain, both linear, which is what Recharts' time and number
  // scales are. Read from the props rather than Recharts' scale hooks, which
  // answered nothing for the time axis (2026-10-30).
  const [y0, y1] = yDomain
  const t0 = data.length ? data[0].t : 0
  const t1 = data.length ? data[data.length - 1].t : 0
  const x = useMemo(() => linear(t0, t1, left, left + w), [t0, t1, left, w])
  const y = useMemo(() => linear(y0, y1, top + h, top), [y0, y1, top, h])

  const prepare = (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return null
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (canvas.width !== pw) canvas.width = pw
    if (canvas.height !== ph) canvas.height = ph
    ctx.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr)
    ctx.clearRect(left, top, w, h)
    return ctx
  }

  useLayoutEffect(() => {
    if (w <= 0 || h <= 0) return
    const ctx = prepare(linesRef.current)
    if (ctx) drawLines(ctx, data, strokes, x, y, theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, strokes, x, y, w, h, left, top, dpr, theme])

  useLayoutEffect(() => {
    const ctx = prepare(dotsRef.current)
    if (!ctx || at === null || strokes.some((s) => s.dot)) return
    const row = data.find((r) => r.t === at)
    if (row) drawActiveDots(ctx, row, strokes, x, y, theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, data, strokes, x, y, w, h, left, top, dpr, theme])

  if (!area || w <= 0 || h <= 0) return null
  return (
    <foreignObject x={left} y={top} width={w} height={h} style={PASS_THROUGH}>
      <div className="relative h-full w-full">
        <canvas ref={linesRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={dotsRef} className="absolute inset-0 h-full w-full" />
      </div>
    </foreignObject>
  )
}

/** `d0..d1` onto `r0..r1`; a one-hour grid stands at the range's middle. */
function linear(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0
  return (v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))
}
