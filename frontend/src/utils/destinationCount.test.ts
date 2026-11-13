import { describe, expect, it } from 'vitest'
import {
  COUNT_DEBOUNCE_MS,
  COUNT_SPACING_MS,
  countDelay,
  countOf,
  countRequest,
  countWanted,
  fieldKey,
  knownCount,
  readCount,
} from './destinationCount'
import { discovered, fakeResponse } from '../testSupport/fixtures'
import type { GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}

describe('countWanted', () => {
  it('counts a finished, usable ring with a kind, where the places table answers', () => {
    expect(countWanted('places', RING, true, false, ['peak'])).toBe(true)
  })

  it('never counts on Overpass, which is donated', () => {
    expect(countWanted('overpass', RING, true, false, ['peak'])).toBe(false)
  })

  it('waits for a ring that is finished, usable and searching for something', () => {
    expect(countWanted('places', null, true, false, ['peak'])).toBe(false)
    expect(countWanted('places', RING, false, false, ['peak'])).toBe(false)
    expect(countWanted('places', RING, true, true, ['peak'])).toBe(false)
    expect(countWanted('places', RING, true, false, [])).toBe(false)
  })
})

describe('countRequest', () => {
  it('asks for the ring alone, as a run with no list would', () => {
    expect(countRequest(RING, ['peak', 'lake'], true)).toEqual({
      polygon: RING,
      destination_types: ['peak', 'lake'],
      include_unnamed_peaks: true,
      top_by_elevation: false,
      elevation_lookup: false,
    })
  })

  it('drops the unnamed-peaks toggle without peaks (#803, M9)', () => {
    expect(countRequest(RING, ['lake'], true).include_unnamed_peaks).toBe(false)
  })
})

describe('fieldKey', () => {
  it('is the same discovery whatever order the kinds were ticked in', () => {
    expect(fieldKey(RING, ['peak', 'lake'], false)).toBe(fieldKey(RING, ['lake', 'peak'], false))
  })

  it('tells a ring counted alone from the same ring with a list riding along', () => {
    const list = [{ latitude: 47.5, longitude: -121.8 }]
    expect(fieldKey(RING, ['peak'], false)).not.toBe(fieldKey(RING, ['peak'], false, list))
  })

  it('moves with the unnamed-peaks toggle only while peaks are ticked', () => {
    expect(fieldKey(RING, ['peak'], true)).not.toBe(fieldKey(RING, ['peak'], false))
    expect(fieldKey(RING, ['lake'], true)).toBe(fieldKey(RING, ['lake'], false))
  })
})

describe('readCount', () => {
  it('reads a 200 as the ring field', async () => {
    const rows = [discovered(), discovered({ name: 'Other', latitude: 47.46 })]
    const answer = await readCount(fakeResponse({ destinations: rows, total: 2, total_found: null, truncated: false }))
    expect(answer).toEqual({ kind: 'found', found: { candidates: rows, totalFound: null, truncated: false } })
    expect(countOf(answer!)).toBe(2)
  })

  it("reads the pod's over-cap 400 as a count with no field", async () => {
    const body = {
      detail: 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
      error: { code: 'refusal', retryable: false },
      found: 2613,
      limit: 1500,
    }
    const answer = await readCount(fakeResponse(body, 400))
    expect(answer).toEqual({ kind: 'over', found: 2613, limit: 1500 })
    expect(countOf(answer!)).toBe(2613)
  })

  it('learns nothing from any other answer', async () => {
    expect(await readCount(fakeResponse({ detail: 'Too many requests from this connection.' }, 429))).toBeNull()
    expect(await readCount(fakeResponse({ detail: 'OpenStreetMap is not available. Try again later.' }, 502))).toBeNull()
    expect(await readCount(fakeResponse({ detail: 'bad' }, 400))).toBeNull()
    expect(await readCount(fakeResponse({ raw: '<html>' }, 200))).toBeNull()
    expect(await readCount(fakeResponse({ nothing: true }))).toBeNull()
  })
})

describe('knownCount', () => {
  it('is the list alone with no ring searching', () => {
    expect(knownCount(false, null, 12)).toBe(12)
    expect(knownCount(false, 900, 12)).toBe(12)
  })

  it("adds the ring's count to the list's, and is unknown until the ring is counted", () => {
    expect(knownCount(true, 900, 12)).toBe(912)
    expect(knownCount(true, null, 12)).toBeNull()
  })
})

describe('countDelay', () => {
  it('waits for the ring to be still', () => {
    expect(countDelay(10_000, null)).toBe(COUNT_DEBOUNCE_MS)
  })

  it('never sends two counts closer than the bucket refills', () => {
    expect(countDelay(10_000, 9_900)).toBe(COUNT_SPACING_MS - 100)
    expect(countDelay(10_000, 9_900)).toBeGreaterThan(COUNT_DEBOUNCE_MS)
    expect(countDelay(10_000, 0)).toBe(COUNT_DEBOUNCE_MS)
  })

  it('holds the destinations bucket (30 a minute) at its refill rate', () => {
    expect(60_000 / COUNT_SPACING_MS).toBe(30)
  })
})
