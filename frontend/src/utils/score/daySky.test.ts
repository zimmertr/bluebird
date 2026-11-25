import { describe, expect, it } from 'vitest'
import { daySky, SKY_BLOCKS } from './daySky'
import { resultRow } from '../../testSupport/fixtures'

// The day strip's sky (record 0323): three-hour blocks by local day, each the
// score the best tenth of the field reaches at the block's first hour.
describe('daySky', () => {
  // Vitest runs in America/Los_Angeles: Saturday midnight local, hourly for
  // a day and a hour.
  const sat0 = Date.parse('2026-11-21T00:00:00-08:00')
  const times = Array.from({ length: 25 }, (_, h) => sat0 + h * 3_600_000)

  it('keys each local day, with a block every three hours from the best tenth of the field', () => {
    const rows = Array.from({ length: 10 }, (_, k) =>
      resultRow({ name: `P${k}`, score_hours: times.map(() => k * 10) }),
    )
    const sky = daySky(rows, times)
    expect([...sky.keys()]).toEqual(['2026-11-21', '2026-11-22'])
    const sat = sky.get('2026-11-21')!
    expect(sat).toHaveLength(SKY_BLOCKS)
    // Ten rows scoring 0 to 90: the best tenth is the second best, 80.
    expect(sat.every((v) => v === 80)).toBe(true)
    expect(sky.get('2026-11-22')![0]).toBe(80)
    expect(sky.get('2026-11-22')![1]).toBeNull()
  })

  it('reads nothing from a row off the field\'s grid, or one with no score', () => {
    const rows = [resultRow({ score_hours: [1, 2] }), resultRow()]
    expect([...daySky(rows, times).values()].flat().every((v) => v === null)).toBe(true)
  })
})
