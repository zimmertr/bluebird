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
  'bboxAreaKm2',
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
})
