import { describe, expect, it } from 'vitest'
import { forecastLabel, kindsPhrase, whenWord, whereLabel, wherePhrases } from './sentenceBar'

describe('kindsPhrase', () => {
  it('names the kinds in one order, joined the way a sentence is', () => {
    expect(kindsPhrase(['peak'])).toBe('Peaks')
    expect(kindsPhrase(['lake', 'peak'])).toBe('Peaks and lakes')
    expect(kindsPhrase(['trailhead', 'crag', 'peak'])).toBe('Peaks, crags and trailheads')
  })
})

describe('whereLabel', () => {
  it('says where a Forecast searches', () => {
    expect(whereLabel(['peak'], 'view', 0)).toBe('Peaks in this view')
    expect(whereLabel(['peak', 'lake'], 'drawn', 0)).toBe('Peaks and lakes in your area')
  })

  it('names a list, and asks for a kind with nothing to find', () => {
    expect(whereLabel(['peak'], 'list', 12)).toBe('Your list')
    expect(whereLabel([], 'view', 0)).toBe('Choose what to find')
  })
})

describe('wherePhrases', () => {
  it('splits the kinds from the place, and keeps a list whole', () => {
    expect(wherePhrases(['peak'], 'view', 0)).toEqual({ what: 'Peaks', area: 'this view' })
    expect(wherePhrases(['peak', 'lake'], 'drawn', 0)).toEqual({ what: 'Peaks and lakes', area: 'your area' })
    expect(wherePhrases(['peak'], 'list', 12)).toEqual({ what: 'Your list', area: null })
    expect(wherePhrases([], 'view', 0)).toEqual({ what: 'Choose what to find', area: null })
  })
})

describe('whenWord', () => {
  it('says on before days and nothing before Current', () => {
    expect(whenWord({ kind: 'now' })).toBeNull()
    expect(whenWord({ kind: 'days', startDate: '2026-11-21', endDate: '2026-11-22' })).toBe('on')
  })
})

describe('forecastLabel', () => {
  it('names the spend ahead of a first run', () => {
    expect(forecastLabel({ count: 247, fresh: null, noun: 'peak' })).toBe('Forecast 247 peaks')
    expect(forecastLabel({ count: 1, fresh: null, noun: 'peak' })).toBe('Forecast 1 peak')
    expect(forecastLabel({ count: 1500, fresh: null, noun: 'destination' })).toBe('Forecast 1,500 destinations')
  })

  it('names only what is new once a report holds the rest', () => {
    expect(forecastLabel({ count: 247, fresh: 31, noun: 'peak' })).toBe('Forecast 31 new')
    expect(forecastLabel({ count: 247, fresh: 0, noun: 'peak' })).toBe('Up to date')
  })

  it('says Forecast while the count is unknown', () => {
    expect(forecastLabel({ count: null, fresh: null, noun: 'peak' })).toBe('Forecast')
  })
})
