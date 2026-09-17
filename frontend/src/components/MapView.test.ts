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
 * each one earns its place by needing something this environment does not have.
 * A new name here is the question "can this be plain data in and plain data
 * out?" — if it can, it belongs in `utils/` with a test, not in the component.
 */
const ALLOWED: Record<string, string> = {
  // Read or drive the map itself.
  enhanceBasemap: 'patches the loaded style',
  lakeAnchor: 'queries what the map has drawn',
  setSource: 'sets a source on the map',
  popupOptions: 'measures the canvas',
  updateResults: 'sets a source on the map',
  // Build an image, or read a browser event.
  makeGlowImage: 'draws on a canvas',
  makeArrowImage: 'draws on a canvas',
  rasterImage: 'draws on a canvas',
  isPinning: 'reads the modifier off a DOM event',
  // Return a MapLibre style spec: a declaration of how a layer draws, which
  // belongs beside the `addLayer` call that takes it rather than in a module of
  // its own.
  poiLabelLayout: 'builds a layer layout',
  glowTwin: 'builds a layer spec from another layer spec',
}

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
      expect(mapViewSource, `${name} belongs in utils/, not in MapView`).not.toMatch(
        new RegExp(`function ${name}\\b`),
      )
      expect(mapViewSource, `${name} should be imported`).toContain(name)
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
