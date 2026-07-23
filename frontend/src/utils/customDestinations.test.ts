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

  // The Bulger List (examples/bulger-list.csv) is the reference paste target, and
  // its names embed a comma inside the elevation — "(14,411ft)". Guards that the
  // rejoin keeps such names whole rather than truncating at the elevation comma.
  describe('Bulger List shape', () => {
    it('keeps the elevation comma inside a peak name', () => {
      expect(parseCustomCsv('46.8529, -121.7604, 01. Mt Rainier (14,411ft)')[0]).toEqual({
        name: '01. Mt Rainier (14,411ft)',
        latitude: 46.8529,
        longitude: -121.7604,
      })
    })

    it('parses a multi-row block past the "#" header, high-precision coords intact', () => {
      const block = [
        '# The Bulger List — Washington’s 100 highest peaks.',
        '46.8529, -121.7604, 01. Mt Rainier (14,411ft)',
        '48.11184813909771, -121.1140579915405, 05. Glacier Peak (10,520ft)',
        '48.831261391245064, -121.60283126931154, 10. Mt Shuksan (9,131ft)',
      ].join('\n')
      const out = parseCustomCsv(block)
      expect(out).toHaveLength(3)
      expect(out.every((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude))).toBe(true)
      expect(out[1]).toEqual({
        name: '05. Glacier Peak (10,520ft)',
        latitude: 48.11184813909771,
        longitude: -121.1140579915405,
      })
    })
  })
})
