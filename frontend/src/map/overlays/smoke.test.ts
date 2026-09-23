import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM; this stands in for it and records what opened.
// Hoisted, because `vi.mock` runs before the imports.
const { opened, fetchSmoke } = vi.hoisted(() => ({
  opened: [] as { html: string; options: unknown }[],
  fetchSmoke: vi.fn(),
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    options: unknown
    html = ''
    constructor(options: unknown) {
      this.options = options
    }
    setLngLat() {
      return this
    }
    setHTML(html: string) {
      this.html = html
      return this
    }
    addTo() {
      opened.push({ html: this.html, options: this.options })
      return this
    }
  },
}))

vi.mock('../../utils/smoke', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/smoke')>()),
  fetchSmoke: (signal: AbortSignal) => fetchSmoke(signal),
}))

import { mountSmoke } from './smoke'
import { createMapController } from '../controller'
import { SMOKE_CLICK_ORDER, SMOKE_DENSITIES, smokeLayerId } from '../../utils/smoke'
import { stubMap } from '../../testSupport/stubMap'

const PLUME = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {} }] }

function setup(drawing = false) {
  const stub = stubMap({ canvasWidth: 800 })
  const controller = createMapController({
    drawing,
    results: [],
    modelId: null,
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    fireWarnings: new Map(),
    searchedPlaces: [],
    onAddPoi: () => {},
    onRemovePoi: () => {},
    cameraPadBottomPx: 0,
  })
  const deps = {
    controller,
    restCursor: vi.fn(),
    closeAllPopups: vi.fn(),
    trackPopup: vi.fn(),
  }
  const smoke = mountSmoke(stub.map, deps)
  return { stub, smoke, deps }
}

beforeEach(() => {
  opened.length = 0
  fetchSmoke.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('mountSmoke', () => {
  it('adds one fill per density, lightest lowest, and the outline over them', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([...SMOKE_DENSITIES.map(smokeLayerId), 'smoke-outline'])
  })

  it('fetches once when switched on and clears the plumes when switched off', async () => {
    fetchSmoke.mockResolvedValue(PLUME)
    const { stub, smoke } = setup()
    smoke.update({ show: true })
    smoke.update({ show: true })
    expect(fetchSmoke).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(stub.sources.smoke.data).toBe(PLUME))
    smoke.update({ show: false })
    expect(stub.sources.smoke.data).toEqual({ type: 'FeatureCollection', features: [] })
  })

  // A late answer for a toggle the reader has already undone paints nothing.
  it('drops an answer that arrives after the overlay was switched off', async () => {
    let answer: (fc: unknown) => void = () => {}
    fetchSmoke.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { stub, smoke } = setup()
    smoke.update({ show: true })
    smoke.update({ show: false })
    answer(PLUME)
    await Promise.resolve()
    await Promise.resolve()
    expect(stub.sources.smoke.data).not.toBe(PLUME)
  })

  it('takes the pointer over a plume, except in draw mode', () => {
    const idle = setup(false)
    idle.stub.fire('mouseenter', SMOKE_CLICK_ORDER[0])
    expect(idle.stub.canvas.style.cursor).toBe('pointer')
    const drawing = setup(true)
    drawing.stub.fire('mouseenter', SMOKE_CLICK_ORDER[0])
    expect(drawing.stub.canvas.style.cursor).toBe('')
    drawing.stub.fire('mouseleave', SMOKE_CLICK_ORDER[0])
    expect(drawing.deps.restCursor).toHaveBeenCalled()
  })

  it('opens a popup that clears the board unless it is pinned', () => {
    const { smoke, deps } = setup()
    smoke.openPopup({ density: 'Heavy' }, [0, 0], false)
    expect(deps.closeAllPopups).toHaveBeenCalledTimes(1)
    smoke.openPopup({ density: 'Light' }, [0, 0], true)
    expect(deps.closeAllPopups).toHaveBeenCalledTimes(1)
    expect(deps.trackPopup).toHaveBeenCalledTimes(2)
    expect(opened).toHaveLength(2)
    expect(opened[0].options).toMatchObject({ closeOnClick: false })
  })
})
