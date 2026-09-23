import { describe, it, expect } from 'vitest'
import { gridLegendLine, pitchLabel } from './forecastGridLegend'

describe('pitchLabel', () => {
  it('formats a distance the way the model picker does, and keeps a decimal below 10 km', () => {
    // GEM's finest grid is 2.5 km. Rounding that to "3 km" would contradict the
    // number the model picker prints beside its own name.
    expect(pitchLabel(2.5)).toBe('2.5 km')
    expect(pitchLabel(3)).toBe('3 km')
    expect(pitchLabel(13.27)).toBe('13 km')
    expect(pitchLabel(25)).toBe('25 km')
  })
})

describe('gridLegendLine', () => {
  it('reads as one row in every state: same label, always a value', () => {
    // The label names the LAYER, not the value, and matches the checkbox that
    // switched it on. Every state fills the right-hand column too, statuses
    // included — a column with one row breaking it reads as a fault rather
    // than as a distinction.
    const states = [
      gridLegendLine(true, 3, null),
      gridLegendLine(false, 3, null),
      gridLegendLine(false, 3, 45),
      gridLegendLine(false, 3, null, true),
    ]
    for (const state of states) {
      expect(state.label).toBe('Forecast grid')
      expect(state.value).not.toBe('')
    }
  })

  it('names each state in the value, and the wait carries its countdown', () => {
    expect(gridLegendLine(true, 3, null).value).toBe('3 km')
    expect(gridLegendLine(false, 3, null).value).toBe('Loading')
    // The countdown is what makes the word explain itself and visibly not be
    // frozen (TJ, 2026-08-21); App's one-second tick moves it.
    expect(gridLegendLine(false, 3, 45).value).toBe('Waiting · 45s')
    // Past 99 seconds the wait reads in minutes: three-digit seconds are both
    // harder to read and the one spelling that outgrows the legend box.
    expect(gridLegendLine(false, 3, 154).value).toBe('Waiting · 3m')
    expect(gridLegendLine(false, 3, null, true).value).toBe('Unavailable')
  })

  it('marks the settled pitch as the value and everything transient as status', () => {
    // The caller colors by this: amber for the states, accent for the pitch,
    // so a stall catches the eye and a settled field reads as the app's own.
    expect(gridLegendLine(true, 3, null).kind).toBe('pitch')
    expect(gridLegendLine(false, 3, null).kind).toBe('status')
    expect(gridLegendLine(false, 3, 45).kind).toBe('status')
    // Unavailable is the one state that already failed: error red, not amber.
    expect(gridLegendLine(false, 3, null, true).kind).toBe('error')
    expect(gridLegendLine(true, 3, 45, false, false).kind).toBe('status')
  })

  it('says Waiting for a partial field stalled behind the pacer, pitch once whole', () => {
    // A half-painted field labelled with its pitch claims a picture it does
    // not fully have (#288 review): the reader watches a frozen semicircle
    // while the legend asserts all is well. Incomplete and pacing → Waiting;
    // incomplete but actively filling → the pitch (progress is visible);
    // complete → the pitch even through a later pace.
    expect(gridLegendLine(true, 3, 45, false, false).value).toBe('Waiting · 45s')
    expect(gridLegendLine(true, 3, null, false, false).value).toBe('3 km')
    expect(gridLegendLine(true, 3, 45, false, true).value).toBe('3 km')
  })

  it('stays one row even though the grid paints 10 m wind under adjusted markers (#257)', () => {
    // The measurement-height difference is documented in DATA.md; a second
    // legend line was tried and rejected for its vertical cost.
    expect(Object.keys(gridLegendLine(true, 3, null))).toEqual(['label', 'value', 'kind'])
  })

  it('ranks the four states so the most specific answer wins', () => {
    // Painted outranks everything: a field that drew and then lost a later
    // chunk is still a field, and calling it unavailable would contradict what
    // the reader can see.
    expect(gridLegendLine(true, 3, 45, true).value).toBe('3 km')
    // A failure outranks a wait, because waiting is over once it has failed.
    expect(gridLegendLine(false, 3, 45, true).value).toBe('Unavailable')
    // And a wait outranks a plain load, being the more specific answer to the
    // same question. A countdown that has run out is not a wait worth naming.
    expect(gridLegendLine(false, 3, 0).value).toBe('Loading')
  })
})
