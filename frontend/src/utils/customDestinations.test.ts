import { describe, it, expect } from 'vitest'
import { parseCustomCsv } from './customDestinations'

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
  // examples/bulger-list.csv (the Bulger List — Washington's 100 highest peaks)
  // is the canonical example dataset; this feeds a representative slice of it
  // through the parser to prove the destination type handles that data. The
  // slice mirrors the real file's shape — a "#" header, a blank line, six-decimal
  // coordinates, and an elevation comma embedded in every name — and the
  // assertions are about parser behavior, not any particular peak's numbers.
  describe('Custom (CSV) with example Bulger List data', () => {
    const sample = [
      "# The Bulger List — Washington's 100 highest peaks, ordered highest to lowest.",
      '# into the "Custom (CSV)" destination type. Format: Latitude, Longitude, Name',
      '',
      '46.851731, -121.760395, 1. Mount Rainier (14,406 ft)',
      '46.202494, -121.490746, 2. Mount Adams (12,280 ft)',
      '48.111844, -121.114120, 5. Glacier Peak (10,550 ft)',
      '48.507000, -120.488130, 22. Gardner Mountain (8,902 ft)',
    ].join('\n')

    it('skips the "#" header and blank lines, keeping only the data rows', () => {
      const out = parseCustomCsv(sample)
      expect(out).toHaveLength(4)
      expect(out.some((d) => d.name.startsWith('#'))).toBe(false)
    })

    it('reads every data row as a finite coordinate pair', () => {
      const out = parseCustomCsv(sample)
      expect(out.every((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude))).toBe(true)
    })

    it('keeps each name whole even though its elevation contains a comma', () => {
      expect(parseCustomCsv(sample).map((d) => d.name)).toEqual([
        '1. Mount Rainier (14,406 ft)',
        '2. Mount Adams (12,280 ft)',
        '5. Glacier Peak (10,550 ft)',
        '22. Gardner Mountain (8,902 ft)',
      ])
    })
  })
})
