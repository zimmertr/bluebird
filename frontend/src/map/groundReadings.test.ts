import { describe, expect, it, vi } from 'vitest'
import { createGroundReadings } from './groundReadings'
import type { DemTiles } from './terrain'
import type { GroundReading } from '../utils/slopeAngle'

const DEM = {} as DemTiles
const READING: GroundReading = { elevationM: 2198, degrees: 33.1, aspect: 315 }

function setup(answer: () => Promise<GroundReading | null> = async () => READING) {
  const terrain = { demTiles: vi.fn(async () => DEM), credit: vi.fn() }
  const read = vi.fn(answer)
  const ground = createGroundReadings(terrain, read)
  const redraw = vi.fn()
  ground.onRead(redraw)
  return { terrain, read, ground, redraw }
}

describe('createGroundReadings', () => {
  it('reads nothing with no elevation to read from', () => {
    const ground = createGroundReadings(undefined)
    expect(ground.at(46.85844, -121.66287)).toEqual({ kind: 'none' })
    ground.hold()()
  })

  it('stands pending until the read lands, then redraws the cards with it', async () => {
    const { ground, read, redraw } = setup()
    expect(ground.at(46.85844, -121.66287)).toEqual({ kind: 'pending' })
    await vi.waitFor(() => expect(redraw).toHaveBeenCalledOnce())
    expect(ground.at(46.85844, -121.66287)).toEqual({ kind: 'read', reading: READING })
    expect(read).toHaveBeenCalledWith(DEM, 46.85844, -121.66287, expect.any(AbortController))
  })

  // The ground does not change while the page is open, however many cards
  // open on the point.
  it('reads a point once', async () => {
    const { ground, read, redraw } = setup()
    ground.at(46.85844, -121.66287)
    ground.at(46.85844, -121.66287)
    await vi.waitFor(() => expect(redraw).toHaveBeenCalled())
    ground.at(46.85844, -121.66287)
    expect(read).toHaveBeenCalledOnce()
  })

  // Open ocean, or a fetch that failed: the card says nothing, and a redraw
  // does not ask again in a loop.
  it('says nothing where the read finds no ground or fails, and keeps that', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ocean = setup(async () => null)
    ocean.ground.at(0, -140)
    await vi.waitFor(() => expect(ocean.redraw).toHaveBeenCalled())
    expect(ocean.ground.at(0, -140)).toEqual({ kind: 'none' })

    const failed = setup(async () => {
      throw new Error('offline')
    })
    failed.ground.at(46.85844, -121.66287)
    await vi.waitFor(() => expect(failed.redraw).toHaveBeenCalled())
    expect(failed.ground.at(46.85844, -121.66287)).toEqual({ kind: 'none' })
    expect(failed.read).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  // CC BY 4.0 asks for the credit wherever the data is shown.
  it('holds the credit for each open card, and lets each go once', () => {
    const { ground, terrain } = setup()
    const first = ground.hold()
    const second = ground.hold()
    first()
    first()
    second()
    expect(terrain.credit.mock.calls.map((c) => c[0])).toEqual([true, true, false, false])
  })
})
