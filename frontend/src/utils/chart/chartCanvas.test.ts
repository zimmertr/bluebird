import { describe, expect, it } from 'vitest'
import { canvasColor, drawActiveDots, drawLines, lineStrokes } from './chartCanvas'
import { CHART_CHROME, CROWDED_PAST, LINE_DRAW } from './chartColors'
import type { ChartPoint } from './chartData'

// A context that writes down what it is told, in order.
function recorder() {
  const calls: (string | number)[][] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => (name in target ? target[name] : (...args: number[]) => calls.push([name, ...args])),
    set: (target, name: string, value) => {
      target[name] = value
      calls.push([`=${name}`, value])
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}
const x = (t: number) => t * 10
const y = (v: number) => 100 - v
const LINES = [
  { key: 'a', label: 'Alpha', color: 'light-dark(#111111, #eeeeee)' },
  { key: 'b', label: 'Beta', color: '#2c80b6' },
]

describe('lineStrokes', () => {
  it('draws every line at the lab widths, the focused one wider and the rest dimmed', () => {
    expect(lineStrokes(LINES, null, false).map((s) => [s.strokeWidth, s.strokeOpacity, s.dot])).toEqual([
      [LINE_DRAW.width, 1, false],
      [LINE_DRAW.width, 1, false],
    ])
    const focused = lineStrokes(LINES, 'b', false)
    expect(focused.map((s) => [s.dataKey, s.strokeWidth, s.strokeOpacity])).toEqual([
      ['a', LINE_DRAW.width, LINE_DRAW.dimmedOpacity],
      ['b', LINE_DRAW.focusedWidth, 1],
    ])
  })

  it('thins a crowd and dots a point sample', () => {
    const crowd = Array.from({ length: CROWDED_PAST + 1 }, (_, i) => ({ key: `k${i}`, label: '', color: '#000000' }))
    expect(lineStrokes(crowd, null, false)[0].strokeWidth).toBe(LINE_DRAW.crowdedWidth)
    expect(lineStrokes(LINES, 'a', true).map((s) => s.dot && s.dot.r)).toEqual([4.5, 3.5])
  })
})

describe('canvasColor', () => {
  it('takes the theme half of a light-dark pair and passes a plain colour', () => {
    expect(canvasColor('light-dark(#111111, #eeeeee)', 'light')).toBe('#111111')
    expect(canvasColor('light-dark(#111111, #eeeeee)', 'dark')).toBe('#eeeeee')
    expect(canvasColor('#2c80b6', 'light')).toBe('#2c80b6')
  })
})

describe('drawLines', () => {
  const data: ChartPoint[] = [
    { t: 0, a: 10, b: 5 },
    { t: 1, a: null, b: 6 },
    { t: 2, a: 30, b: 7 },
    { t: 3, a: 40, b: null },
  ]

  it('breaks a line at a missing hour and draws in the theme the root wears', () => {
    const { ctx, calls } = recorder()
    drawLines(ctx, data, lineStrokes(LINES, null, false), x, y, 'dark')
    const pen = calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo' || c[0] === '=strokeStyle')
    expect(pen).toEqual([
      ['=strokeStyle', '#eeeeee'],
      ['moveTo', 0, 90],
      ['moveTo', 20, 70],
      ['lineTo', 30, 60],
      ['=strokeStyle', '#2c80b6'],
      ['moveTo', 0, 95],
      ['lineTo', 10, 94],
      ['lineTo', 20, 93],
    ])
  })

  it('dots every hour of a point sample', () => {
    const { ctx, calls } = recorder()
    drawLines(ctx, [{ t: 0, a: 10, b: null }], lineStrokes(LINES, null, true), x, y, 'light')
    expect(calls.filter((c) => c[0] === 'arc')).toEqual([['arc', 0, 90, 3.5, 0, Math.PI * 2]])
  })

  it('rings each hover dot in the panel colour', () => {
    const { ctx, calls } = recorder()
    drawActiveDots(ctx, data[0], lineStrokes(LINES, null, false), x, y, 'light')
    expect(calls).toContainEqual(['=strokeStyle', CHART_CHROME.light.surface])
    expect(calls.filter((c) => c[0] === 'arc')).toHaveLength(2)
  })
})
