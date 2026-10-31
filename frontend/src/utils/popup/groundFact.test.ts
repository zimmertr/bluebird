import { describe, expect, it } from 'vitest'
import { markupText } from '../../testSupport/markupText'
import { SLOPE_BANDS } from '../slopeAngle'
import { slopeFact } from './groundFact'
import { colorSwatch, pendingValue } from './popupChrome'

const read = (degrees: number, aspect: number | null) =>
  slopeFact({ kind: 'read', reading: { elevationM: 2000, degrees, aspect } })

describe('slopeFact', () => {
  it('says the slope in its band and the way it falls', () => {
    expect(markupText(read(33.1, 315))).toBe('33° NW')
    expect(read(33.1, 315)).toContain(colorSwatch(SLOPE_BANDS[2].color))
  })

  // Each band holds its lower edge, so the whole degree under the angle names
  // the band the swatch is drawn in, and below 27 there is none.
  it('reads the degree under the angle, with no swatch below 27', () => {
    expect(markupText(read(26.9, 180))).toBe('26° S')
    expect(read(26.9, 180)).not.toContain('background:')
    expect(read(27, 180)).toContain(colorSwatch(SLOPE_BANDS[0].color))
  })

  // A lake reads flat: there is no way down to name (TJ, 2026-10-31).
  it('names no direction for ground with no fall', () => {
    expect(markupText(read(0, null))).toBe('0°')
  })

  it('stands a bar while it reads, and says nothing where there is no ground', () => {
    expect(slopeFact({ kind: 'pending' })).toBe(pendingValue())
    expect(slopeFact({ kind: 'none' })).toBe('')
    expect(slopeFact(undefined)).toBe('')
  })
})
