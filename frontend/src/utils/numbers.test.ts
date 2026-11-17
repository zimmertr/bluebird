import { describe, expect, it } from 'vitest'
import { clamp, grouped, isFiniteNumber, roundTo } from './numbers'

describe('clamp', () => {
  it('bounds a number to the range, and leaves one inside it alone', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(12, 0, 10)).toBe(10)
  })

  // Every inline shape it replaced that could meet an inverted range gave
  // the floor, so the helper does too.
  it('gives the floor when the range is inverted', () => {
    expect(clamp(5, 10, 0)).toBe(10)
  })

  it('passes a NaN through, and never hands back a negative zero at a zero floor', () => {
    expect(clamp(Number.NaN, 0, 1)).toBeNaN()
    expect(Object.is(clamp(-0, 0, 1), 0)).toBe(true)
  })
})

describe('isFiniteNumber', () => {
  it('is true for a finite number and nothing else, coercing nothing', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(-121.5)).toBe(true)
    for (const v of [null, undefined, Number.NaN, Infinity, -Infinity, '5', '', true, {}]) {
      expect(isFiniteNumber(v)).toBe(false)
    }
  })
})

describe('roundTo', () => {
  it('rounds to the places asked for', () => {
    expect(roundTo(1.23456, 2)).toBe(1.23)
    expect(roundTo(2.5, 0)).toBe(3)
    expect(roundTo(7, 2)).toBe(7)
  })

  // The bare `Math.round(x * 10 ** n) / 10 ** n` it replaced gives
  // -121.01562 here: it rounds a negative tie toward zero.
  it('rounds a tie away from zero on either side of it', () => {
    expect(roundTo(-121.015625, 5)).toBe(-121.01563)
    expect(roundTo(121.015625, 5)).toBe(121.01563)
    expect(roundTo(-2.5, 0)).toBe(-3)
  })

  // Not `Number(x.toFixed(n))`, which reads the binary value just under the
  // tie and prints a 1.45 km pitch as 1.4.
  it('gives the answer the app printed before it for a non-negative value', () => {
    expect(roundTo(1.45, 1)).toBe(1.5)
    expect(roundTo(4.35, 1)).toBe(4.4)
  })
})

describe('grouped', () => {
  it('groups a whole number in the reader’s own locale', () => {
    expect(grouped(1500)).toBe((1500).toLocaleString())
    expect(grouped(12281)).toBe((12281).toLocaleString())
    expect(grouped(42)).toBe('42')
  })
})
