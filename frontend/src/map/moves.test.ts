import { describe, expect, it } from 'vitest'
import { createCameraMoves } from './moves'

describe('createCameraMoves', () => {
  it('reads insets given as a function at each move, not when they are set', () => {
    const moves = createCameraMoves()
    let top = 10
    moves.setInsets(() => ({ top, right: 0, bottom: 0, left: 0 }))
    top = 40
    expect(moves.insets.top).toBe(40)
  })

  it('makes a move take no time while instant', () => {
    const moves = createCameraMoves()
    const took: number[] = []
    moves.run(800, (ms) => took.push(ms))
    moves.setInstant(true)
    moves.run(800, (ms) => took.push(ms))
    expect(took).toEqual([800, 0])
  })
})
