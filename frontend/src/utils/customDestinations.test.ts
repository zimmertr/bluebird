import { describe, it, expect } from 'vitest'
import { parseCustomCsv } from './customDestinations'
import bulgerCsv from '../../../examples/washington-bulger-list.csv?raw'

describe('parseCustomCsv', () => {
  it('names each destination by its coordinate pair', () => {
    expect(parseCustomCsv('46.8529,-121.7604')).toEqual([
      { name: '46.8529, -121.7604', latitude: 46.8529, longitude: -121.7604 },
    ])
  })

  it('parses multiple rows', () => {
    const out = parseCustomCsv('46.8529, -121.7604\n48.1122, -121.1139')
    expect(out.map((d) => d.name)).toEqual(['46.8529, -121.7604', '48.1122, -121.1139'])
  })

  it('normalizes the coordinate label (trailing zeros, whitespace)', () => {
    expect(parseCustomCsv('  46.85290 , -121.76040 ')[0].name).toBe('46.8529, -121.7604')
  })

  it('handles integer coordinates', () => {
    expect(parseCustomCsv('47,-120')[0].name).toBe('47, -120')
  })

  it('skips blank lines and "#" comments', () => {
    const out = parseCustomCsv('# header\n\n46.85, -121.76\n   \n# trailing')
    expect(out).toHaveLength(1)
  })

  it('drops malformed rows (missing or non-numeric fields)', () => {
    expect(parseCustomCsv('46.85\nfoo,bar\n46.85, -121.76')).toEqual([
      { name: '46.85, -121.76', latitude: 46.85, longitude: -121.76 },
    ])
  })

  it('drops a row outside the valid coordinate range', () => {
    const csv = [
      '95.5,-121.1',
      '-90.01,0',
      '45,-221',
      '0,180.5',
      '9999,0',
      'Infinity,0',
      '46.85, -121.76',
    ].join('\n')
    expect(parseCustomCsv(csv)).toEqual([
      { name: '46.85, -121.76', latitude: 46.85, longitude: -121.76 },
    ])
  })

  it('keeps a row exactly on a coordinate bound', () => {
    expect(parseCustomCsv('90,180\n-90,-180').map((d) => [d.latitude, d.longitude])).toEqual([
      [90, 180],
      [-90, -180],
    ])
  })

  it('uses an optional third column as the name', () => {
    expect(parseCustomCsv('46.8529, -121.7604, Mount Rainier')[0]).toEqual({
      name: 'Mount Rainier',
      latitude: 46.8529,
      longitude: -121.7604,
    })
  })

  it('keeps commas inside the name', () => {
    expect(parseCustomCsv('46.85, -121.76, Camp Muir, WA')[0].name).toBe('Camp Muir, WA')
  })

  it('falls back to the coordinate pair when the name field is blank', () => {
    expect(parseCustomCsv('46.85, -121.76,   ')[0].name).toBe('46.85, -121.76')
  })

  // The "Custom (CSV)" destination type must accept a real, full-sized paste.
  // It reads examples/washington-bulger-list.csv itself, so the test follows the
  // file a reader actually pastes rather than a hand-kept copy of a few rows.
  describe('Custom (CSV) with the example Bulger List', () => {
    const out = parseCustomCsv(bulgerCsv)

    it('reads all 100 peaks and skips the "#" headline', () => {
      expect(out).toHaveLength(100)
      expect(out.some((d) => d.name.startsWith('#'))).toBe(false)
    })

    it('reads every data row as a finite coordinate pair', () => {
      expect(out.every((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude))).toBe(true)
    })

    // The results table numbers its rows itself, so a list number in the name
    // would read "1 23. Foobar Mountain".
    it('names each peak without a list number', () => {
      expect(out[0].name).toBe('Mount Rainier')
      expect(out.filter((d) => /^\d+\.\s/.test(d.name))).toEqual([])
    })
  })
})
