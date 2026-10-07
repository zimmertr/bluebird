import { describe, expect, it } from 'vitest'
import type { DiscoveredDestination } from '../types'
import {
  LOOKUP_DEBOUNCE_MS,
  LOOKUP_RETRY_MS,
  NO_IDENTITY,
  learn,
  rowsKey,
  unanswered,
  withIdentity,
  withLearnedElevation,
} from './elevationLookup'
import { discovered, place } from '../testSupport/fixtures'
import { geoKey } from './points'

const A = { name: 'A', latitude: 47.1, longitude: -121.1 }
const B = { name: 'B', latitude: 47.2, longitude: -121.2 }
const KEY_A = geoKey(A.latitude, A.longitude)
const KEY_B = geoKey(B.latitude, B.longitude)
const answered = (over: Partial<DiscoveredDestination>) =>
  discovered({ type: 'custom', elevation_ft: null, osm_id: null, ...over })

describe('unanswered', () => {
  it('names every distinct row with no elevation and no answer', () => {
    const rows = unanswered([A, B, { ...A, name: 'A again' }], [], NO_IDENTITY, 100)
    expect(rows.map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('leaves out a row that carries its elevation, and one already answered', () => {
    const known = new Map([[KEY_A, { elevation_ft: null, osm_id: null }]])
    const rows = unanswered([A, { ...B, elevation_ft: 5000 }], [], known, 100)
    expect(rows).toEqual([])
  })

  it('includes a searched place with no elevation, and not one with', () => {
    const rows = unanswered([], [place({ label: 'P', lat: 47.3, lon: -121.3, elevationFt: undefined }), place({ label: 'Q', lat: 47.4, lon: -121.4, elevationFt: 900 })], NO_IDENTITY, 100)
    expect(rows.map((r) => r.name)).toEqual(['P'])
  })

  it('asks nothing above the cap, where the analysis would refuse the list', () => {
    expect(unanswered([A, B], [], NO_IDENTITY, 1)).toEqual([])
  })
})

describe('learn', () => {
  it('keeps every answer when the lookup finished, a no-peak null included', () => {
    const next = learn(NO_IDENTITY, [answered({ ...A, elevation_ft: 5000, osm_id: 'node/1' }), answered({ ...B, elevation_ft: null, osm_id: null })], true)
    expect(next.get(KEY_A)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
    expect(next.get(KEY_B)).toEqual({ elevation_ft: null, osm_id: null })
  })

  it('keeps only the placed rows when the lookup gave up, so the rest can be asked again', () => {
    const next = learn(NO_IDENTITY, [answered({ ...A, elevation_ft: 5000, osm_id: 'node/1' }), answered({ ...B })], false)
    expect(next.has(KEY_A)).toBe(true)
    expect(next.has(KEY_B)).toBe(false)
  })

  it('never takes a known elevation away', () => {
    const known = new Map([[KEY_A, { elevation_ft: 5000, osm_id: 'node/1' }]])
    expect(learn(known, [answered({ ...A })], true).get(KEY_A)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
  })
})

describe('rowsKey', () => {
  it('reads the same for the same rows in any order, and differently for another set', () => {
    expect(rowsKey([A, B])).toBe(rowsKey([B, A]))
    expect(rowsKey([A])).not.toBe(rowsKey([A, B]))
    expect(rowsKey([])).toBe('')
  })
})

describe('withIdentity and withLearnedElevation', () => {
  const known = new Map([[KEY_A, { elevation_ft: 5000, osm_id: 'node/1' }]])

  it('fills a candidate row with what was learned and leaves the rest', () => {
    const [a, b] = withIdentity([answered(A), answered(B)], known)
    expect([a.elevation_ft, a.osm_id]).toEqual([5000, 'node/1'])
    expect([b.elevation_ft, b.osm_id]).toEqual([null, null])
  })

  it('sends the elevation alone on the wire, never the OSM id', () => {
    const [a, b] = withLearnedElevation([A, B], known)
    expect(a).toEqual({ ...A, elevation_ft: 5000 })
    expect(b).toBe(B)
  })

  it('keeps an elevation the row already carries', () => {
    expect(withLearnedElevation([{ ...A, elevation_ft: 1 }], known)[0].elevation_ft).toBe(1)
  })
})

describe('the two delays', () => {
  it('sends after the box has been still for under a second, and retries a give-up after twenty', () => {
    expect(LOOKUP_DEBOUNCE_MS).toBe(800)
    expect(LOOKUP_RETRY_MS).toBe(20_000)
  })
})
