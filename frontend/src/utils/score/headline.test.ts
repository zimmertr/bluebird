import { describe, expect, it } from 'vitest'
import { headline, scoreRange } from './headline'

describe('headline', () => {
  it('counts the places at 80 or better', () => {
    expect(headline([92, 85, 80, 79, null])).toEqual({ bar: 80, count: 3 })
  })

  it('drops the bar to the best ten anything reached on a bad day', () => {
    expect(headline([67, 61, 58, 40])).toEqual({ bar: 60, count: 2 })
  })

  it('has nothing to say with no score', () => {
    expect(headline([null, null])).toBeNull()
  })
})

describe('scoreRange', () => {
  it('stretches from the fifth percentile to the best', () => {
    const scores = Array.from({ length: 40 }, (_, i) => 40 + i)
    expect(scoreRange(scores)).toEqual({ lo: 42, hi: 79 })
  })

  it('is null for a field with no spread', () => {
    expect(scoreRange([70])).toBeNull()
    expect(scoreRange([70, 70, 70])).toBeNull()
  })
})
