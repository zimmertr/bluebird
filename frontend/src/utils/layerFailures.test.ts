import { describe, expect, it } from 'vitest'
import { LAYER_FAILURES, NO_FAILING_LAYERS, withLayerFailure } from './layerFailures'

// Record 0344: which pod layers are on and failing.
describe('withLayerFailure', () => {
  it('marks a layer failing and clears it again', () => {
    const failing = withLayerFailure(NO_FAILING_LAYERS, 'smoke', true)
    expect([...failing]).toEqual(['smoke'])
    expect(withLayerFailure(failing, 'smoke', false)).toBe(NO_FAILING_LAYERS)
  })

  // The setter's answer is the state, so an unchanged set renders nothing.
  it('hands back the same set when nothing changes', () => {
    const failing = withLayerFailure(NO_FAILING_LAYERS, 'wildfires', true)
    expect(withLayerFailure(failing, 'wildfires', true)).toBe(failing)
    expect(withLayerFailure(failing, 'smoke', false)).toBe(failing)
  })
})

describe('LAYER_FAILURES', () => {
  it('names every layer once, under keys of its own', () => {
    const layers = LAYER_FAILURES.flatMap((f) => f.layers)
    expect(new Set(layers).size).toBe(layers.length)
    expect([...layers].sort()).toEqual(['area-closures', 'fire-activity', 'landmarks', 'smoke', 'trail-closures', 'wildfires'])
    expect(new Set(LAYER_FAILURES.map((f) => f.key)).size).toBe(LAYER_FAILURES.length)
  })
})
