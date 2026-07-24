import { describe, it, expect } from 'vitest'
import { buildCustomList, pinKey } from './customList'
import { CustomDestination } from '../types'
import { Place } from './geocode'

const csv: CustomDestination[] = [
  { name: 'Mount Rainier', latitude: 46.8529, longitude: -121.7604 },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281 },
]

function place(label: string, lat: number, lon: number, elevationFt?: number): Place {
  return { label, description: '', kind: 'peak', lat, lon, ...(elevationFt ? { elevationFt } : {}) }
}

describe('pinKey', () => {
  it('rounds to 5 decimals (~1 m) so near-identical coords collide', () => {
    expect(pinKey(46.852891, -121.760408)).toBe(pinKey(46.85289, -121.76041))
  })
})

describe('buildCustomList', () => {
  it('unions CSV rows with searched places, CSV first', () => {
    const out = buildCustomList(csv, [place('Glacier Peak', 48.1122, -121.1139)])
    expect(out.map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams', 'Glacier Peak'])
  })

  it('a searched place wins a coordinate collision with a CSV row', () => {
    const out = buildCustomList(csv, [place('Rainier (searched)', 46.8529, -121.7604, 14411)])
    expect(out.map((d) => d.name)).toEqual(['Mount Adams', 'Rainier (searched)'])
    expect(out[1].elevation_ft).toBe(14411)
  })

  it('carries a searched place elevation and leaves it absent when unknown', () => {
    const out = buildCustomList([], [place('A', 1, 2, 5000), place('B', 3, 4)])
    expect(out[0].elevation_ft).toBe(5000)
    expect(out[1].elevation_ft).toBeUndefined()
  })

  it('handles either side empty', () => {
    expect(buildCustomList([], [])).toEqual([])
    expect(buildCustomList(csv, []).map((d) => d.name)).toEqual(['Mount Rainier', 'Mount Adams'])
    expect(buildCustomList([], [place('X', 1, 2)]).map((d) => d.name)).toEqual(['X'])
  })
})
