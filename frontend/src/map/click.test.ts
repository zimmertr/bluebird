import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountMapClick } from './click'
import { createMapController, type MapInputs } from './controller'
import { fireLinkAt, WILDFIRE_FILL_LAYER } from './overlays/wildfires'
import { RESULT_MARKER_LAYER } from './resultsLayer'
import { POI_LAYERS } from '../utils/basemapPoi'
import { SMOKE_CLICK_ORDER } from '../utils/smoke'
import { stubMap } from '../testSupport/stubMap'

const open = vi.fn()
beforeEach(() => {
  open.mockReset()
  vi.stubGlobal('window', { open })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

// Every layer the click asks about exists; `under` is what is drawn beneath
// the pointer, bottom first, as layer ids.
function setup({ drawing = false, under = [] as string[], layers = [] as string[] } = {}) {
  const asked: string[][] = []
  const stub = stubMap({
    layers: layers.length > 0 ? layers : [...POI_LAYERS, RESULT_MARKER_LAYER, ...SMOKE_CLICK_ORDER, WILDFIRE_FILL_LAYER],
    rendered: (_point, opts) => {
      asked.push((opts as { layers: string[] }).layers)
      return under.map((id) => ({ layer: { id }, properties: { density: id } }))
    },
  })
  const inputs = { drawing } as MapInputs
  const deps = {
    controller: createMapController(inputs),
    popups: { closeAll: vi.fn(), track: vi.fn() },
    drawRing: { addPoint: vi.fn() },
    smoke: { openPopup: vi.fn() },
  }
  mountMapClick(stub.map, deps)
  const click = (shiftKey = false) =>
    stub.fire('click', undefined, {
      point: { x: 1, y: 2 },
      lngLat: { lng: -121.5, lat: 47.5 },
      originalEvent: { shiftKey },
    })
  return { stub, deps, asked, click }
}

describe('mountMapClick', () => {
  it('registers one click for the whole map', () => {
    expect(setup().stub.handlerCount('click')).toBe(1)
  })

  it('asks only about the layers the map has drawn', () => {
    const { asked, click } = setup({ layers: [RESULT_MARKER_LAYER, WILDFIRE_FILL_LAYER] })
    click()
    expect(asked).toEqual([[RESULT_MARKER_LAYER, WILDFIRE_FILL_LAYER]])
  })

  it('places a point in draw mode', () => {
    const { deps, click } = setup({ drawing: true })
    click()
    expect(deps.drawRing.addPoint).toHaveBeenCalledWith([-121.5, 47.5])
  })

  it('opens the fire under the pointer, even in draw mode', () => {
    const { stub, deps, click } = setup({ drawing: true, under: [WILDFIRE_FILL_LAYER] })
    click()
    expect(open).toHaveBeenCalledWith(
      fireLinkAt(stub.map, { lng: -121.5, lat: 47.5 }),
      '_blank',
      'noopener,noreferrer',
    )
    expect(deps.drawRing.addPoint).not.toHaveBeenCalled()
  })

  it('opens the plume the rule picks, and keeps the others on a shift-click', () => {
    const { deps, click } = setup({ under: [SMOKE_CLICK_ORDER[0]] })
    click(true)
    expect(deps.smoke.openPopup).toHaveBeenCalledWith(
      { density: SMOKE_CLICK_ORDER[0] },
      { lng: -121.5, lat: 47.5 },
      true,
    )
    expect(deps.popups.closeAll).not.toHaveBeenCalled()
  })

  it('clears the popups on a click on bare map, and leaves them for a marker', () => {
    const bare = setup()
    bare.click()
    expect(bare.deps.popups.closeAll).toHaveBeenCalledTimes(1)
    const marker = setup({ under: [RESULT_MARKER_LAYER] })
    marker.click()
    expect(marker.deps.popups.closeAll).not.toHaveBeenCalled()
  })
})
