import type * as maplibregl from 'maplibre-gl'

// The one stand-in for a MapLibre map, for the modules under `src/map/`.
//
// MapLibre needs WebGL, which neither Vitest project has, so a map module is
// tested against this instead: the part of the map's surface those modules
// touch, keeping the layer stack in order and recording every call. The stack
// is the thing most worth asserting, because layer order is load-bearing and a
// module that inserts in the wrong place draws the wrong thing on top.
//
// Both projects may load it: it touches no DOM of its own.

export type StubCall = [string, ...unknown[]]

export interface StubSource {
  setData: (data: unknown) => void
  updateImage?: (options: unknown) => void
  data?: unknown
}

type Handler = (event: unknown) => void

export interface StubMapOptions {
  /** The loaded style's own layers, as `getStyle()` reports them. */
  styleLayers?: { id: string; type: string }[]
  /** Layer ids present before the module runs, on top of `styleLayers`. */
  layers?: string[]
  filters?: Record<string, unknown>
  sources?: Record<string, StubSource>
  rendered?: (arg: unknown, opts?: unknown) => unknown[]
  canvasWidth?: number
  zoom?: number
  bounds?: { west: number; south: number; east: number; north: number }
  /** Whether a source reports its tiles loaded. Everything is, by default. */
  sourceLoaded?: (id: string) => boolean
}

export function stubMap(opts: StubMapOptions = {}) {
  const calls: StubCall[] = []
  const stack: string[] = [
    ...(opts.styleLayers ?? []).map((l) => l.id),
    ...(opts.layers ?? []),
  ]
  const sources: Record<string, StubSource> = { ...(opts.sources ?? {}) }
  const layout: Record<string, Record<string, unknown>> = {}
  const paint: Record<string, Record<string, unknown>> = {}
  const handlers: { type: string; layer?: string; fn: Handler }[] = []
  const canvas = {
    clientWidth: opts.canvasWidth ?? 0,
    style: { cursor: '' },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }
  const dragPan = { enabled: true, disable: () => (dragPan.enabled = false), enable: () => (dragPan.enabled = true) }
  const b = opts.bounds ?? { west: -122, south: 47, east: -121, north: 48 }

  const map = {
    getStyle: () => ({ layers: opts.styleLayers ?? [] }),
    hasImage: () => false,
    addImage: (id: string) => calls.push(['addImage', id]),
    addLayer: (
      layer: { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> },
      before?: string,
    ) => {
      const at = before === undefined ? -1 : stack.indexOf(before)
      if (at < 0) stack.push(layer.id)
      else stack.splice(at, 0, layer.id)
      layout[layer.id] = { ...(layer.layout ?? {}) }
      paint[layer.id] = { ...(layer.paint ?? {}) }
      calls.push(['addLayer', layer.id, before])
    },
    removeLayer: (id: string) => {
      stack.splice(stack.indexOf(id), 1)
      calls.push(['removeLayer', id])
    },
    getLayer: (id: string) => (stack.includes(id) ? { id } : undefined),
    addSource: (id: string, spec: unknown) => {
      const source: StubSource = {
        setData: (data) => {
          source.data = data
          calls.push(['setData', id])
        },
        updateImage: (o) => calls.push(['updateImage', id, o]),
      }
      sources[id] = source
      calls.push(['addSource', id, spec])
    },
    removeSource: (id: string) => {
      delete sources[id]
      calls.push(['removeSource', id])
    },
    getSource: (id: string) => sources[id],
    getFilter: (id: string) => opts.filters?.[id],
    setFilter: (id: string, filter: unknown) => calls.push(['setFilter', id, filter]),
    setLayoutProperty: (id: string, key: string, value: unknown) => {
      layout[id] = { ...(layout[id] ?? {}), [key]: value }
      calls.push(['setLayoutProperty', id, key, value])
    },
    setPaintProperty: (id: string, key: string, value: unknown) => {
      paint[id] = { ...(paint[id] ?? {}), [key]: value }
      calls.push(['setPaintProperty', id, key, value])
    },
    on: (type: string, layerOrFn: string | Handler, fn?: Handler) => {
      if (typeof layerOrFn === 'function') handlers.push({ type, fn: layerOrFn })
      else handlers.push({ type, layer: layerOrFn, fn: fn! })
    },
    off: (type: string, fn: Handler) => {
      const i = handlers.findIndex((h) => h.type === type && h.fn === fn)
      if (i >= 0) handlers.splice(i, 1)
    },
    queryRenderedFeatures: (arg: unknown, o?: unknown) => opts.rendered?.(arg, o) ?? [],
    getCanvas: () => canvas,
    getZoom: () => opts.zoom ?? 8,
    getBounds: () => ({
      getWest: () => b.west,
      getSouth: () => b.south,
      getEast: () => b.east,
      getNorth: () => b.north,
    }),
    isSourceLoaded: (id: string) => opts.sourceLoaded?.(id) ?? true,
    triggerRepaint: () => calls.push(['triggerRepaint']),
    dragPan,
    // Screen pixels read back as degrees one to one, so a drag to (x, y)
    // leaves the vertex at [x, y] and a test can say where it went.
    unproject: ([x, y]: [number, number]) => ({ lng: x, lat: y }),
  }

  return {
    map: map as unknown as maplibregl.Map,
    calls,
    /** The layer ids in draw order, bottom first. */
    stack,
    sources,
    dragPan,
    layout,
    paint,
    canvas,
    /** Run every handler registered for this event, on this layer if named. */
    fire(type: string, layer?: string, event: unknown = {}) {
      for (const h of handlers.filter((h) => h.type === type && h.layer === layer)) h.fn(event)
    },
    handlerCount(type: string, layer?: string) {
      return handlers.filter((h) => h.type === type && h.layer === layer).length
    },
  }
}
