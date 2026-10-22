import { describe, expect, it } from 'vitest'
import outlines from './usStateOutlines.json'
import { decodeUsStates, usStateAt, type UsStateOutlines } from './usStates'

const STATES = decodeUsStates(outlines as UsStateOutlines)

// Mountain Project's top level, read off its route guide on 2026-10-22: the
// fifty states, spelled as the Census spells them, and International, which
// the outlines answer as no state.
const MOUNTAIN_PROJECT_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
]

describe('the generated outlines', () => {
  it('hold every state Mountain Project files areas under, by its name there', () => {
    expect(STATES.map((s) => s.name)).toEqual(MOUNTAIN_PROJECT_STATES)
  })
})

describe('usStateAt', () => {
  it.each([
    // The crag #715's link missed: Family Wall at Little Si.
    ['Family Wall', 47.48886, -121.75024, 'Washington'],
    // Either bank of the Columbia, a river border under 2 km wide.
    ['Beacon Rock', 45.6286, -122.0219, 'Washington'],
    ['Broughton Bluff', 45.5436, -122.3721, 'Oregon'],
    // Lake Tahoe's east shore, 4 km over the line from California.
    ['Cave Rock', 39.0442, -119.9483, 'Nevada'],
    ['Seneca Rocks', 38.834, -79.366, 'West Virginia'],
    ['Hueco Tanks', 31.919, -106.042, 'Texas'],
    ['Seward Highway', 60.98, -149.53, 'Alaska'],
    ['Honolulu', 21.3, -157.85, 'Hawaii'],
    // A sea cliff, on a coast the outlines keep to 1 km.
    ['Otter Cliffs', 44.3086, -68.1898, 'Maine'],
  ])('puts %s in %s', (_name, lat, lon, state) => {
    expect(usStateAt(STATES, lat, lon)).toBe(state)
  })

  it.each([
    ['Squamish', 49.6817, -123.153],
    ['El Potrero Chico', 25.95, -100.48],
    ['the Pacific', 40, -140],
  ])('puts %s in no state', (_name, lat, lon) => {
    expect(usStateAt(STATES, lat, lon)).toBeNull()
  })
})

// Two unit squares side by side, quantized at a tenth of a degree: West is
// x 0..1 with a hole at 0.4..0.6, East is x 1..2. Arc 0 is their shared edge,
// which East walks backwards (~0). West's coast reaches 1 km, East's 3 km.
const SQUARES: UsStateOutlines = {
  scale: [0.1, 0.1],
  translate: [0, 0],
  arcs: [
    [10, 0, 0, 10],
    [10, 10, -10, 0, 0, -10, 10, 0],
    [10, 0, 10, 0, 0, 10, -10, 0],
    [4, 4, 2, 0, 0, 2, -2, 0, 0, -2],
  ],
  states: [
    ['West', 1000, [[0, 1], [3]]],
    ['East', 3000, [[2, ~0]]],
  ],
}

describe('decodeUsStates and usStateAt on two squares', () => {
  const squares = decodeUsStates(SQUARES)

  it('decodes deltas into rings, walking a reversed arc backwards', () => {
    const east = squares.find((s) => s.name === 'East')!
    expect(east.rings[0].points).toEqual([
      [1, 0], [2, 0], [2, 1], [1, 1], [1, 0],
    ])
  })

  it('reads a point by the state it is inside, and a hole as outside', () => {
    expect(usStateAt(squares, 0.2, 0.2)).toBe('West')
    expect(usStateAt(squares, 0.5, 1.5)).toBe('East')
    // The hole's middle is over 10 km from any edge, so no reach claims it.
    expect(usStateAt(squares, 0.5, 0.5)).toBeNull()
  })

  it("gives a point off a coast to that state within the coast's own reach and no further", () => {
    // 0.005 degrees of latitude is 556 m: inside West's 1 km, as is East's.
    expect(usStateAt(squares, -0.005, 0.5)).toBe('West')
    // 0.015 degrees, 1.7 km: past West's reach, inside East's 3 km.
    expect(usStateAt(squares, -0.015, 0.5)).toBeNull()
    expect(usStateAt(squares, -0.015, 1.5)).toBe('East')
  })
})
