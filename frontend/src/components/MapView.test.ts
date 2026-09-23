import { describe, expect, it } from 'vitest'
// The `?raw` idiom the other drift guards use (`useCapabilities.test.ts`,
// `metrics.test.ts`): the file is read as text, so this stays a node test with
// no DOM — which is the whole reason the guard has to be written this way.
import mapViewSource from './MapView.tsx?raw'

/**
 * MapView.tsx is the map's wiring and cannot be tested any other way.
 *
 * Vitest here runs with no DOM and MapLibre needs a canvas, so a function
 * declared in that file is unreachable from every test in this suite. Two of
 * them mattered — the polygon-area check behind the "too large" blocker, and
 * the order a click resolves its layers in — and both were invisible to the
 * suite for as long as they lived there (#383).
 *
 * So this is the list of functions that file may declare at the top level, and
 * it is empty: a helper that needs a map, a canvas or an event goes to
 * `map/basemap.ts`, whose own test keeps the same list for that file, and one
 * that is plain data in and plain data out belongs in `utils/` with a test.
 */
const ALLOWED: Record<string, string> = {}

// Where the logic that used to live in the component went. Named so a re-import
// of one of these under a new copy in the component is caught as well.
const MOVED = [
  'featureRow',
  'framePadding',
  'makeDrawData',
  'pendingFC',
  'polygonsOf',
  'resolveMapClick',
  'ringToPts',
]

// The map helpers that need a map, a canvas or an event, and live in
// `map/basemap.ts` now. The component calls each of them, so each is imported.
const MOVED_TO_MAP = [
  'enhanceBasemap',
  'isPinning',
  'lakeAnchor',
  'popupOptions',
  'setSource',
  'updateResults',
]

// The component and every map module under `src/map/`, read as one: a helper
// such as `polygonsOf` or `makeDrawData` is imported by whichever module took
// its caller, and the rule is only that it is imported somewhere and declared
// nowhere in the wiring.
const mapModules = import.meta.glob(['../map/**/*.ts', '!../map/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const wiringSource = [mapViewSource, ...Object.values(mapModules)].join('\n')

describe('MapView declares nothing the tests cannot reach', () => {
  it('declares only the helpers that need a map, a canvas or an event', () => {
    // Column zero: anything nested is a closure over the map or a ref, which is
    // wiring by construction.
    const declared = [...mapViewSource.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)]
      .map((m) => m[1])
      .sort()
    expect(declared).toEqual(Object.keys(ALLOWED).sort())
  })

  it('imports the plain-data helpers rather than declaring them again', () => {
    for (const name of MOVED) {
      expect(wiringSource, `${name} belongs in utils/, not in the map wiring`).not.toMatch(
        new RegExp(`function ${name}\\b`),
      )
      expect(wiringSource, `${name} should be imported`).toContain(name)
    }
  })

  it('imports the map helpers from map/basemap.ts rather than declaring them again', () => {
    for (const name of MOVED_TO_MAP) {
      expect(mapViewSource, `${name} belongs in map/basemap.ts, not in MapView`).not.toMatch(
        new RegExp(`function ${name}\\b`),
      )
      expect(mapViewSource, `${name} should be imported`).toMatch(
        new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\.\\./map/basemap'`),
      )
    }
  })

  // The area check is the one helper that left this file rather than moving out
  // of it. The map can only report an area once it has loaded, which is why a
  // ring restored from a link had none, so `App.tsx` derives it from the
  // polygon instead (#429). A measurement taken here would be a second answer.
  it('leaves the area of the ring to App.tsx', () => {
    expect(mapViewSource, 'the area is derived from the polygon in App.tsx').not.toContain(
      'bboxAreaKm2',
    )
  })
})

/**
 * The ring a `?poly=` link opens with is read twice — once to frame the camera
 * and once to hydrate the drawing points — and both reads happen when MapLibre
 * fires `load`, which behind the welcome modal is long after mount. Clear can
 * land in between. While the ring was a constant captured at mount, the load
 * handler put it back: the panel counted points the app no longer held and the
 * camera framed a ring the reader had removed (#453).
 *
 * So the rule is that one ref carries it, nothing reads that ref before `load`,
 * and `cancelDrawing` is what empties it.
 */
describe('MapView reads the restored ring when the map loads', () => {
  const at = mapViewSource.indexOf("map.on('load'")
  const beforeLoad = mapViewSource.slice(0, at)
  const loadHandler = mapViewSource.slice(at)
  // Every mention of the ref except the write, which is the one thing above the
  // load handler allowed to touch it.
  const READ = /restoredPolygonRef\.current(?!\s*=[^=])/

  it('reads the ring inside the load handler', () => {
    expect(loadHandler, 'the load handler reads the ref').toMatch(READ)
  })

  it('snapshots the ring nowhere above the load handler', () => {
    expect(beforeLoad, 'a value read before `load` cannot see a Clear').not.toMatch(READ)
    expect(beforeLoad, 'the ring is not captured off the prop either').not.toMatch(
      /=\s*polygon\s*$/m,
    )
  })

  it('empties the ring when the drawing is cancelled', () => {
    expect(mapViewSource, 'cancelDrawing clears the restored ring').toMatch(
      /cancelDrawing\(\)\s*\{\s*restoredPolygonRef\.current = null/,
    )
  })
})

/**
 * A handler MapLibre registers once, on load, closes over the first render's
 * props for the session. The component used to answer that with one mirror ref
 * per prop, kept current by four effects that did nothing else. Those props now
 * live in `map/controller.ts`, written by one effect and read at event time, so
 * a fifth mirror is a sign the controller was missed.
 */
describe('MapView mirrors no prop in a ref', () => {
  const props = (() => {
    const open = mapViewSource.indexOf('forwardRef<MapViewHandle, Props>(')
    const list = mapViewSource.slice(open, mapViewSource.indexOf('ref,', open))
    return [...list.matchAll(/^\s+(\w+),$/gm)].map((m) => m[1])
  })()

  it('found the props', () => {
    expect(props.length, 'the destructured prop list was not found').toBeGreaterThan(20)
    expect(props).toContain('cameraPadBottomPx')
  })

  // The restored ring is the one ref seeded from a prop, and it is not a
  // mirror: nothing keeps it current, and Clear empties it (see above).
  it('seeds no ref from a prop but the restored ring', () => {
    const seeded = [...mapViewSource.matchAll(/useRef(?:<[^>]*>)?\((\w+)\)/g)]
      .map((m) => m[1])
      .filter((name) => props.includes(name))
    expect(seeded).toEqual(['polygon'])
  })

  it('keeps no effect that only copies a value into a ref', () => {
    expect(mapViewSource).not.toMatch(/useEffect\(\(\) => \{\s*(?:\w+Ref\.current = \w+\s+)+\}/)
  })

  it('writes the controller in one effect, and reads it rather than copying it', () => {
    expect(mapViewSource.match(/controller\.update\(/g)).toHaveLength(1)
    // A handler that copied the inputs when it was registered would hold the
    // first render's values, which is the bug the controller exists to fix.
    expect(mapViewSource).not.toMatch(/const \{[^}]*\} = controller\.inputs/)
  })
})

/**
 * The overlays are feature modules under `map/overlays/`, each owning its
 * sources, layers, popups, fetches and timers. The load handler mounts them in
 * stacking order and the toggle effects hand them props; nothing here builds
 * an overlay layer or listens on one, or its teardown would be split again.
 */
describe('MapView mounts the overlays rather than wiring them', () => {
  const at = mapViewSource.indexOf("map.on('load'")
  const loadHandler = mapViewSource.slice(at)

  it('mounts each overlay in the load handler, lowest first', () => {
    const order = ['mountForecastGrid(', 'mountSmoke(', 'mountWildfires(', 'mountSnow(', 'mountRadar(']
    const positions = order.map((call) => loadHandler.indexOf(call))
    expect(positions.every((p) => p >= 0), 'every overlay is mounted on load').toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('adds no overlay source or layer of its own', () => {
    for (const id of ['forecast-grid', 'forecast-grid-arrows', 'smoke', 'wildfires']) {
      expect(mapViewSource).not.toContain(`addSource('${id}'`)
    }
    for (const builder of ['radarTileUrl', 'snowTileUrl', 'gridRaster(', 'fetchWildfires', 'fetchSmoke']) {
      expect(mapViewSource, `${builder} belongs to its overlay module`).not.toContain(builder)
    }
  })

  it('listens on no overlay layer', () => {
    expect(mapViewSource).not.toMatch(/map\.on\('\w+', (?:WILDFIRE_FILL_LAYER|'wildfire-fill')/)
    expect(mapViewSource).not.toMatch(/for \(const layer of SMOKE_CLICK_ORDER\)/)
  })
})

/**
 * The drawn ring is `map/drawRing.ts`: its source and layers, the vertex and
 * midpoint drags, and the remove-point popup. The component keeps the points,
 * which exist before the map loads, and hands them to the module.
 */
describe('MapView mounts the drawn ring rather than wiring it', () => {
  const at = mapViewSource.indexOf("map.on('load'")
  const loadHandler = mapViewSource.slice(at)

  it('mounts the ring on load, above the overlays and below the results', () => {
    const overlays = loadHandler.indexOf('mountRadar(')
    const ring = loadHandler.indexOf('mountDrawRing(')
    const results = loadHandler.indexOf("addSource('results'")
    expect(ring, 'the ring is mounted on load').toBeGreaterThan(-1)
    expect(overlays).toBeLessThan(ring)
    expect(ring).toBeLessThan(results)
  })

  it('adds no draw layer and listens on no handle', () => {
    expect(mapViewSource).not.toContain("addSource('draw'")
    expect(mapViewSource).not.toMatch(/map\.on\('\w+', 'draw-(?:vertices|midpoints)'/)
    expect(mapViewSource).not.toContain('startVertexDrag')
    expect(mapViewSource).not.toContain('DRAW_COLOR')
  })
})
