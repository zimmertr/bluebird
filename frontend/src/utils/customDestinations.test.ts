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
})
