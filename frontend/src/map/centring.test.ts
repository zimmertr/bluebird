import { describe, expect, it, vi } from 'vitest'
import { createCentring } from './centring'
import { stubMap } from '../testSupport/stubMap'

// A clock the test moves by hand, so "the time the flight had left" is a
// number the test can state.
function clock(start = 1_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('createCentring', () => {
  it('flies a centring still in the air again after a resize, in the time it had left', () => {
    const stub = stubMap()
    const time = clock()
    const centring = createCentring(time.now)
    const aim = vi.fn()
    centring.fly(stub.map, 800, aim)
    // The press's own flight, which opens the card.
    expect(aim).toHaveBeenLastCalledWith(800, false)
    time.advance(300)
    centring.reaim()
    expect(aim).toHaveBeenCalledTimes(2)
    // Sent again, so it opens only a card that still stands.
    expect(aim).toHaveBeenLastCalledWith(500, true)
    // The second flight is the one kept, and its end is the first one's.
    time.advance(200)
    centring.reaim()
    expect(aim).toHaveBeenLastCalledWith(300, true)
  })

  it('forgets a flight at its moveend, so a resize never moves a camera at rest', () => {
    const stub = stubMap()
    const time = clock()
    const centring = createCentring(time.now)
    const aim = vi.fn()
    centring.fly(stub.map, 800, aim)
    time.advance(100)
    // Landed, stopped by another camera move, or taken by the reader's hand:
    // MapLibre ends each one with a moveend.
    stub.fire('moveend')
    centring.reaim()
    expect(aim).toHaveBeenCalledTimes(1)
    expect(stub.handlerCount('moveend')).toBe(0)
  })

  it('keeps no flight past the time it was given', () => {
    const stub = stubMap()
    const time = clock()
    const centring = createCentring(time.now)
    const aim = vi.fn()
    centring.fly(stub.map, 800, aim)
    time.advance(800)
    centring.reaim()
    expect(aim).toHaveBeenCalledTimes(1)
  })

  it('keeps no cut, which has landed before a resize can come', () => {
    const stub = stubMap()
    const centring = createCentring(clock().now)
    const aim = vi.fn()
    centring.fly(stub.map, 0, aim)
    centring.reaim()
    expect(aim).toHaveBeenCalledTimes(1)
    expect(stub.handlerCount('moveend')).toBe(0)
  })

  it('aims the newest centring, whose start ends the one before it', () => {
    const stub = stubMap()
    const time = clock()
    const centring = createCentring(time.now)
    const first = vi.fn()
    // Starting a flight stops the one in the air, which fires its moveend
    // inside the new flight's start.
    const second = vi.fn(() => stub.fire('moveend'))
    centring.fly(stub.map, 800, first)
    time.advance(100)
    centring.fly(stub.map, 800, second)
    time.advance(100)
    centring.reaim()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith(700, true)
    expect(stub.handlerCount('moveend')).toBe(1)
  })
})
