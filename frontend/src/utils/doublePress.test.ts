import { describe, expect, it } from 'vitest'
import { DOUBLE_PRESS_MS, DOUBLE_PRESS_SLOP_PX, isSecondPress, type PressClock, secondPress } from './doublePress'

const at = (ms: number, x = 100, y = 400) => ({ timeStamp: ms, clientX: x, clientY: y })

describe('isSecondPress', () => {
  const first = { at: 1000, x: 100, y: 400 }

  it('counts a press inside the window at the same spot', () => {
    expect(isSecondPress(first, { ...first, at: 1000 + DOUBLE_PRESS_MS - 1 })).toBe(true)
  })

  it('counts nothing with no press before it, or once the window has passed', () => {
    expect(isSecondPress(null, first)).toBe(false)
    expect(isSecondPress(first, { ...first, at: 1000 + DOUBLE_PRESS_MS })).toBe(false)
  })

  // A drag moved the handle, and the press after it grabbed the handle where
  // the drag left it: a drag of its own.
  it('counts a press inside the slop on either axis, and none past it', () => {
    const soon = 1000 + DOUBLE_PRESS_MS / 2
    expect(isSecondPress(first, { at: soon, x: 100 + DOUBLE_PRESS_SLOP_PX, y: 400 - DOUBLE_PRESS_SLOP_PX })).toBe(true)
    expect(isSecondPress(first, { at: soon, x: 100 + DOUBLE_PRESS_SLOP_PX + 1, y: 400 })).toBe(false)
    expect(isSecondPress(first, { at: soon, x: 100, y: 400 - DOUBLE_PRESS_SLOP_PX - 1 })).toBe(false)
  })

  // A test's or a synthetic event can carry no time or place: never a double.
  it('counts nothing for a press with no time or place', () => {
    expect(isSecondPress(first, { at: Number.NaN, x: 100, y: 400 })).toBe(false)
    expect(isSecondPress(first, { at: 1100, x: Number.NaN, y: 400 })).toBe(false)
  })
})

describe('secondPress', () => {
  it('records every press, so the second of a pair counts and a press long after starts again', () => {
    const clock: PressClock = { current: null }
    expect(secondPress(clock, at(1000))).toBe(false)
    expect(clock.current).toEqual({ at: 1000, x: 100, y: 400 })
    expect(secondPress(clock, at(1200))).toBe(true)
    expect(secondPress(clock, at(5000))).toBe(false)
  })

  it('keeps one clock per handle', () => {
    const one: PressClock = { current: null }
    const other: PressClock = { current: null }
    secondPress(one, at(1000))
    expect(secondPress(other, at(1100))).toBe(false)
    expect(secondPress(one, at(1150))).toBe(true)
  })
})
