import { describe, expect, it } from 'vitest'
import { SNOW_OPACITY, mountSnow, snowBeneath } from './snow'
import { SNOW_LAYER_ID, SNOW_SOURCE_ID } from '../../utils/snowDepth'
import { stubMap } from '../../testSupport/stubMap'

const SMOKE_FIRST = 'smoke-fill-Light'
const RADAR_OLDEST = 'radar-50'

describe('snowBeneath', () => {
  it('goes under the radar loop when the loop is up', () => {
    expect(snowBeneath((id) => [RADAR_OLDEST, SMOKE_FIRST].includes(id))).toBe(RADAR_OLDEST)
  })

  it('goes under the smoke fills otherwise, where the loop would go', () => {
    expect(snowBeneath((id) => id === SMOKE_FIRST)).toBe(SMOKE_FIRST)
  })

  it('goes on top when neither is there', () => {
    expect(snowBeneath(() => false)).toBeUndefined()
  })
})

describe('mountSnow', () => {
  it('adds nothing until it is switched on', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountSnow(stub.map)
    expect(stub.stack).toEqual([SMOKE_FIRST])
  })

  it('sits under the radar whichever is switched on first', () => {
    const stub = stubMap({ layers: ['forecast-grid-fill', RADAR_OLDEST, SMOKE_FIRST] })
    mountSnow(stub.map).update({ show: true })
    expect(stub.stack).toEqual(['forecast-grid-fill', SNOW_LAYER_ID, RADAR_OLDEST, SMOKE_FIRST])
    expect(stub.paint[SNOW_LAYER_ID]['raster-opacity']).toBe(SNOW_OPACITY)
  })

  it('removes its layer and source when switched off, and adds them again', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const snow = mountSnow(stub.map)
    snow.update({ show: true })
    snow.update({ show: false })
    expect(stub.stack).toEqual([SMOKE_FIRST])
    expect(stub.sources[SNOW_SOURCE_ID]).toBeUndefined()
    snow.update({ show: true })
    expect(stub.stack).toEqual([SNOW_LAYER_ID, SMOKE_FIRST])
  })

  it('does nothing for a repeat of the same state', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const snow = mountSnow(stub.map)
    snow.update({ show: true })
    const before = stub.calls.length
    snow.update({ show: true })
    expect(stub.calls.length).toBe(before)
  })
})
