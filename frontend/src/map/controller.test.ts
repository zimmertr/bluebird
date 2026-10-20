import { describe, expect, it, vi } from 'vitest'
import { createMapController } from './controller'
import { closureWarning, fireWarning, mapInputs, resultRow } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'

describe('createMapController', () => {
  it('starts with the first render and follows every update', () => {
    const controller = createMapController(mapInputs({ drawing: true, cameraPadBottomPx: 120 }))
    expect(controller.inputs.drawing).toBe(true)
    expect(controller.inputs.cameraPadBottomPx).toBe(120)
    controller.update(mapInputs({ drawing: false, cameraPadBottomPx: 0 }))
    expect(controller.inputs.drawing).toBe(false)
    expect(controller.inputs.cameraPadBottomPx).toBe(0)
  })

  // The whole reason the object exists: a handler registered once, before an
  // update, must see the update when its event fires.
  it('serves a handler made before an update the values after it', () => {
    const controller = createMapController(mapInputs())
    const handler = () => controller.inputs.drawing
    controller.update(mapInputs({ drawing: true }))
    expect(handler()).toBe(true)
  })

  it('calls the latest POI callbacks', () => {
    const first = vi.fn()
    const second = vi.fn()
    const controller = createMapController(mapInputs({ onRemovePoi: first }))
    const click = () => controller.inputs.onRemovePoi(46.85, -121.76)
    controller.update(mapInputs({ onRemovePoi: second }))
    click()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(46.85, -121.76)
  })

  // Replaced, never merged: the caller hands over every field each time.
  it('holds a copy, so a caller mutating its object changes nothing', () => {
    const next = mapInputs({ drawing: true })
    const controller = createMapController(mapInputs())
    controller.update(next)
    next.drawing = false
    expect(controller.inputs.drawing).toBe(true)
  })
})

describe('resultAt', () => {
  const rainier = resultRow()
  const adams = resultRow({ name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909 })

  it('finds the displayed row at exactly those coordinates', () => {
    const controller = createMapController(mapInputs({ results: [rainier, adams] }))
    expect(controller.resultAt(adams.latitude, adams.longitude)).toBe(adams)
    expect(controller.resultAt(46.2, -121.49)).toBeNull()
  })

  it('reads the rows of the latest update', () => {
    const controller = createMapController(mapInputs({ results: [rainier] }))
    controller.update(mapInputs({ results: [adams] }))
    expect(controller.resultAt(rainier.latitude, rainier.longitude)).toBeNull()
    expect(controller.resultAt(adams.latitude, adams.longitude)).toBe(adams)
  })
})

describe('fireWarningAt', () => {
  it('looks a warning up by the same key the warnings are stored under', () => {
    const warning = fireWarning()
    const controller = createMapController(mapInputs())
    expect(controller.fireWarningAt(46.85, -121.76)).toBeNull()
    controller.update(mapInputs({ fireWarnings: new Map([[geoKey(46.85, -121.76), warning]]) }))
    expect(controller.fireWarningAt(46.85, -121.76)).toBe(warning)
  })
})

describe('closureWarningAt', () => {
  it('looks a closure up by the same key the warnings are stored under', () => {
    const warning = closureWarning()
    const controller = createMapController(mapInputs())
    expect(controller.closureWarningAt(46.85, -121.76)).toBeNull()
    controller.update(mapInputs({ closureWarnings: new Map([[geoKey(46.85, -121.76), warning]]) }))
    expect(controller.closureWarningAt(46.85, -121.76)).toBe(warning)
  })
})
