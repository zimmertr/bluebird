import type { Theme } from '../viewPrefs'
import { CHART_CHROME, CROWDED_PAST, LINE_DRAW } from './chartColors'
import type { ChartPoint } from './chartData'

/**
 * How one series line is drawn: the props a Recharts `<Line>` took, kept in
 * its spelling so the canvas draws what the SVG did (#499). `dot` is a point
 * sample's fill, or false for a line.
 */
export interface LineStroke {
  dataKey: string
  name: string
  stroke: string
  strokeWidth: number
  strokeOpacity: number
  dot: false | { r: number; stroke: 'none'; fill: string; fillOpacity: number }
}

/**
 * Every line's stroke, in drawing order: the focused line wider, the rest at
 * half strength while it is, and every line thinner past `CROWDED_PAST`
 * (`LINE_DRAW`, #801). The caller hands the lines with the focused one last,
 * so it draws over the rest.
 */
export function lineStrokes(
  ordered: readonly { key: string; label: string; color: string }[],
  focusedKey: string | null,
  pointGrid: boolean,
): LineStroke[] {
  const crowded = ordered.length > CROWDED_PAST
  return ordered.map((line) => {
    const focused = focusedKey === line.key
    const opacity = focusedKey != null && !focused ? LINE_DRAW.dimmedOpacity : 1
    return {
      dataKey: line.key,
      name: line.label,
      stroke: line.color,
      strokeWidth: focused ? LINE_DRAW.focusedWidth : crowded ? LINE_DRAW.crowdedWidth : LINE_DRAW.width,
      strokeOpacity: opacity,
      // The fill alone: a dot in the line's colour stands 3:1 off the panel
      // by itself (#801).
      dot: pointGrid ? { r: focused ? 4.5 : 3.5, stroke: 'none', fill: line.color, fillOpacity: opacity } : false,
    }
  })
}

/**
 * A line's colour in one theme. A line carries both themes' at once as
 * `light-dark()` (`themed`, #786), which a canvas cannot parse, so the canvas
 * takes the half its theme names.
 */
export function canvasColor(color: string, theme: Theme): string {
  const pair = color.match(/^light-dark\((.+), (.+)\)$/)
  return pair ? (theme === 'light' ? pair[1] : pair[2]) : color
}

/** The theme the root is painted in, which is what the canvas draws in. */
export function rootTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

type Row = ChartPoint
type Scale = (v: number) => number | undefined

/**
 * Draw the series onto a canvas laid over the plot band (#499): every line a
 * path through its hours in order, broken at a missing hour as
 * `connectNulls={false}` broke it, or a dot per hour on a point sample. The
 * context is already scaled to device pixels and moved to the plot's origin.
 */
export function drawLines(ctx: CanvasRenderingContext2D, data: readonly Row[], strokes: readonly LineStroke[], x: Scale, y: Scale, theme: Theme) {
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  for (const s of strokes) {
    const color = canvasColor(s.stroke, theme)
    if (s.dot) {
      ctx.globalAlpha = s.dot.fillOpacity
      ctx.fillStyle = color
      for (const row of data) {
        const v = row[s.dataKey]
        const px = x(row.t)
        const py = v == null ? undefined : y(v)
        if (px === undefined || py === undefined) continue
        ctx.beginPath()
        ctx.arc(px, py, s.dot.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = s.strokeOpacity
    ctx.strokeStyle = color
    ctx.lineWidth = s.strokeWidth
    ctx.beginPath()
    let pen = false
    for (const row of data) {
      const v = row[s.dataKey]
      const px = x(row.t)
      const py = v == null ? undefined : y(v)
      if (px === undefined || py === undefined) {
        pen = false
        continue
      }
      if (pen) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
      pen = true
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/**
 * The hover dots at one hour, Recharts' active dot redrawn: the line's colour
 * ringed in the panel's own, so each stands off whatever line it sits on.
 */
export function drawActiveDots(ctx: CanvasRenderingContext2D, row: Row, strokes: readonly LineStroke[], x: Scale, y: Scale, theme: Theme) {
  const px = x(row.t)
  if (px === undefined) return
  ctx.lineWidth = 2
  ctx.strokeStyle = CHART_CHROME[theme].surface
  for (const s of strokes) {
    const v = row[s.dataKey]
    const py = v == null ? undefined : y(v)
    if (py === undefined) continue
    ctx.fillStyle = canvasColor(s.stroke, theme)
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
