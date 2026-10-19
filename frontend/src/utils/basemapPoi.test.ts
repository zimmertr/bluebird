import { describe, expect, it } from 'vitest'
import {
  isPoiFeature,
  LAKE_CLASS,
  PLACE_CLASSES,
  PLACE_LAYERS,
  PLACE_MATCH_M,
  POI_LAYERS,
  POI_MATCH_M,
  poiFromFeature,
  poiToPlace,
  samePoi,
} from './basemapPoi'
import { isPeakKind } from './geocode'
import { LANDMARK_LAYERS } from './landmarks'
// `?raw` gives the map modules' text without executing them, so this stays a
// pure node test with no DOM and no MapLibre.
import basemapSource from '../map/basemap.ts?raw'
import landmarksSource from '../map/landmarks.ts?raw'

const RAINIER: [number, number] = [-121.7604, 46.8529]

describe('poiFromFeature', () => {
  // The tile carries 14410 in its own precomputed feet and 4392 metres; the
  // feet win, because Planetiler computes them from OSM's raw metres, which is
  // what the server converts. 4392 x 3.28084 would round to 14409.
  it('reads a peak’s name and its elevation in the tile’s own feet', () => {
    expect(
      poiFromFeature('ofm-peaks', { name: 'Mount Rainier', class: 'volcano', ele: 4392, ele_ft: 14410 }, RAINIER),
    ).toEqual({
      name: 'Mount Rainier',
      kind: 'volcano',
      lat: 46.8529,
      lon: -121.7604,
      elevationFt: 14410,
    })
  })

  it('converts from meters, the way the server does', () => {
    const poi = poiFromFeature('ofm-peaks', { name: 'Glacier Peak', ele: 3213 }, RAINIER)
    expect(poi?.elevationFt).toBe(10541)
  })

  // #581: Agnes Mountain, raw OSM `ele` 2473.4 m. Discovery converts the raw
  // metres (2473.4 x 3.28084 = 8114.8) and names it Peak 8115. The tile rounds
  // `ele` to 2473, which converts to 8114, but its `ele_ft` comes from the raw
  // metres and says 8115. An unnamed summit is NAMED from this number, so the
  // click must read the feet, or one mountain is two destinations.
  it('names a clicked summit the way discovery names it', () => {
    const poi = poiFromFeature('ofm-peaks', { class: 'peak', ele: 2473, ele_ft: 8115 }, RAINIER)
    expect(poi?.name).toBe('Peak 8115')
    expect(poi?.elevationFt).toBe(8115)
  })

  it('reads the precomputed feet when there are no metres', () => {
    expect(poiFromFeature('ofm-peaks', { name: 'X', ele_ft: 9000 }, RAINIER)?.elevationFt).toBe(9000)
  })

  it('leaves elevation absent when OSM never tagged one', () => {
    const poi = poiFromFeature('ofm-peaks', { name: 'Unnamed Bump', class: 'peak' }, RAINIER)
    expect(poi?.elevationFt).toBeUndefined()
  })

  // The kind is the tile's word, not a category of ours, because the
  // destination link is chosen from it.
  it('carries a class through so the Peakbagger link still resolves', () => {
    expect(isPeakKind(poiFromFeature('ofm-peaks', { name: 'A', class: 'volcano' }, RAINIER)!.kind)).toBe(true)
    expect(poiFromFeature('ofm-peaks', { name: 'A', class: 'saddle' }, RAINIER)!.kind).toBe('saddle')
    expect(poiFromFeature('ofm-peaks', { name: 'A' }, RAINIER)!.kind).toBe('peak')
  })

  // No elevation: `water_name` carries none, so the field is absent rather
  // than zero, and the next Analyze fills it from OSM.
  it('accepts a named lake and gives it no elevation', () => {
    expect(poiFromFeature('ofm-lakes', { name: 'Snow Lake', class: LAKE_CLASS }, RAINIER)).toEqual({
      name: 'Snow Lake',
      kind: LAKE_CLASS,
      lat: 46.8529,
      lon: -121.7604,
    })
  })

  // The `ofm-lakes` layer filters to LAKE_CLASS, so this can only fire if that
  // filter and this module disagree — which is the pair they exist to keep in
  // step. An ocean label sits at a centroid hundreds of miles offshore, so it
  // is a span rather than a place to forecast.
  it('refuses any other water class, whatever the layer let through', () => {
    expect(poiFromFeature('ofm-lakes', { name: 'Pacific Ocean', class: 'ocean' }, RAINIER)).toBeNull()
    expect(poiFromFeature('ofm-lakes', { name: 'Puget Sound', class: 'bay' }, RAINIER)).toBeNull()
    expect(poiFromFeature('ofm-lakes', { name: 'Unclassed Water' }, RAINIER)).toBeNull()
  })

  it('falls back through the tile’s other name fields', () => {
    expect(poiFromFeature('ofm-peaks', { 'name:latin': 'Denali' }, RAINIER)?.name).toBe('Denali')
    expect(poiFromFeature('ofm-peaks', { name: '  ', name_en: 'Denali' }, RAINIER)?.name).toBe('Denali')
  })

  // The map draws these as a bare elevation, because that is all OSM knows.
  // Refusing the click made the hover glow a promise the map did not keep: it
  // lit every peak, and half of them then did nothing.
  it('names an unnamed summit after the elevation it is drawn with', () => {
    expect(poiFromFeature('ofm-peaks', { class: 'peak', ele_ft: 5961 }, RAINIER)).toEqual({
      name: 'Peak 5961',
      kind: 'peak',
      lat: 46.8529,
      lon: -121.7604,
      elevationFt: 5961,
    })
  })

  // Unpunctuated on purpose: an identifier, not a measurement.
  it('leaves that name unpunctuated even in the thousands', () => {
    expect(poiFromFeature('ofm-peaks', { ele_ft: 12345 }, RAINIER)?.name).toBe('Peak 12345')
  })

  // A lake with no name has nothing to fall back on — its elevation is not in
  // the tiles either — so it stays unclickable.
  it('does not invent a name for an unnamed lake', () => {
    expect(poiFromFeature('ofm-lakes', { class: LAKE_CLASS }, RAINIER)).toBeNull()
  })

  it('refuses an unnamed summit with no elevation, a bad coordinate, and a foreign layer', () => {
    expect(poiFromFeature('ofm-peaks', { class: 'peak' }, RAINIER)).toBeNull()
    expect(poiFromFeature('ofm-peaks', { name: 'A' }, [NaN, 46.8])).toBeNull()
    expect(poiFromFeature('ofm-trails', { name: 'Wonderland Trail' }, RAINIER)).toBeNull()
  })
})

// The pod's trailheads and crags (#734), as `GET /api/landmarks` answers
// them: OSM's own coordinates, the object's id, and an elevation or null.
describe('poiFromFeature on a landmark', () => {
  const MAILBOX: [number, number] = [-121.7437, 47.4875]
  const trailhead = { name: 'Mailbox Peak Trailhead', kind: 'trailhead', osm_id: 'node/4578891234', elevation_ft: null }
  const crag = { name: 'Lower Town Wall', kind: 'crag', osm_id: 'relation/1234', elevation_ft: null }

  it('reads a trailhead with its OSM id, and no elevation where the route sends none', () => {
    expect(poiFromFeature('landmark-trailheads', trailhead, MAILBOX)).toEqual({
      name: 'Mailbox Peak Trailhead',
      kind: 'trailhead',
      lat: 47.4875,
      lon: -121.7437,
      osmId: 'node/4578891234',
    })
  })

  it('reads an elevation where the route carries one', () => {
    expect(poiFromFeature('landmark-trailheads', { ...trailhead, elevation_ft: 820 }, MAILBOX)?.elevationFt).toBe(820)
  })

  // A crag's link is Mountain Project's, by name (`destinationUrl`), so the
  // kind is the type that link keys on.
  it('reads a crag as a crag', () => {
    expect(poiFromFeature('landmark-crags', crag, MAILBOX)).toEqual({
      name: 'Lower Town Wall',
      kind: 'crag',
      lat: 47.4875,
      lon: -121.7437,
      osmId: 'relation/1234',
    })
  })

  // Each layer filters on its own kind, so this fires only if the filter and
  // this module come out of step.
  it('refuses a kind its layer does not draw, and an unnamed one', () => {
    expect(poiFromFeature('landmark-crags', trailhead, MAILBOX)).toBeNull()
    expect(poiFromFeature('landmark-trailheads', crag, MAILBOX)).toBeNull()
    expect(poiFromFeature('landmark-trailheads', { ...trailhead, kind: undefined }, MAILBOX)).toBeNull()
    expect(poiFromFeature('landmark-trailheads', { ...trailhead, name: ' ' }, MAILBOX)).toBeNull()
  })

  it('carries the OSM id through to the place a pin keeps', () => {
    const place = poiToPlace(poiFromFeature('landmark-trailheads', { ...trailhead, elevation_ft: 820 }, MAILBOX)!)
    expect(place.osmId).toBe('node/4578891234')
    expect(place.elevationFt).toBe(820)
    expect(place.kind).toBe('trailhead')
  })

  it('is two of the layers a click reads', () => {
    for (const layer of LANDMARK_LAYERS) expect(POI_LAYERS).toContain(layer)
  })
})

// The style's own place labels (#710). North Bend is `class=town` in the
// `place` layer of z14/2649/5729, with a hamlet beside it (2026-10-15).
describe('poiFromFeature on a place label', () => {
  const NORTH_BEND: [number, number] = [-121.7868, 47.4957]

  it('accepts every settlement class, with the class as its kind and no elevation', () => {
    const cases: [string, string][] = [
      ['label_city', 'city'],
      ['label_city_capital', 'city'],
      ['label_town', 'town'],
      ['label_village', 'village'],
      ['label_other', 'hamlet'],
    ]
    for (const [layer, kind] of cases) {
      expect(poiFromFeature(layer, { name: 'North Bend', class: kind, rank: 11 }, NORTH_BEND)).toEqual({
        name: 'North Bend',
        kind,
        lat: 47.4957,
        lon: -121.7868,
      })
    }
  })

  // `label_other` labels every class the style names no layer for, and only
  // the hamlets among them are settlements.
  it('refuses a suburb, a neighbourhood or an island on label_other', () => {
    for (const kind of ['suburb', 'neighbourhood', 'island', 'quarter']) {
      expect(poiFromFeature('label_other', { name: 'Capitol Hill', class: kind }, NORTH_BEND)).toBeNull()
    }
  })

  it('refuses an unnamed place rather than inventing a name', () => {
    expect(poiFromFeature('label_town', { class: 'town', rank: 11 }, NORTH_BEND)).toBeNull()
  })

  it('reads the same answer without a position, for the cursor', () => {
    expect(isPoiFeature('label_other', { name: 'Harman Heights', class: 'hamlet' })).toBe(true)
    expect(isPoiFeature('label_other', { name: 'Capitol Hill', class: 'suburb' })).toBe(false)
    expect(isPoiFeature('ofm-peaks', { class: 'peak' })).toBe(false)
  })

  it('is one of the layers a click reads, all five of them', () => {
    expect(PLACE_LAYERS).toHaveLength(5)
    for (const layer of PLACE_LAYERS) expect(POI_LAYERS).toContain(layer)
    expect(PLACE_CLASSES).toEqual(['city', 'town', 'village', 'hamlet'])
  })
})

describe('poiToPlace', () => {
  it('produces a searched place with no OSM id for the backend to fill', () => {
    const poi = poiFromFeature('ofm-peaks', { name: 'Mount Rainier', class: 'volcano', ele_ft: 14410 }, RAINIER)!
    expect(poiToPlace(poi)).toEqual({
      label: 'Mount Rainier',
      description: '',
      kind: 'volcano',
      lat: 46.8529,
      lon: -121.7604,
      elevationFt: 14410,
    })
  })

  it('omits elevation and the OSM id entirely rather than carrying undefined ones', () => {
    const place = poiToPlace({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 })
    expect('elevationFt' in place).toBe(false)
    expect('osmId' in place).toBe(false)
  })
})

// The map is the other half of this module: it draws the layers whose features
// arrive here, in `map/basemap.ts` and `map/landmarks.ts`. Vitest has no DOM and cannot instantiate
// MapLibre, so the pair is checked by reading that module as text, the same
// `?raw` idiom metrics.test.ts uses to keep a vocabulary from drifting out of
// its surfaces. What the file must say on its own is the `map-basemap-layers`
// check in tools/eslint/checks/map.js; what stays here compares it with this
// module's exports, or measures it.
describe('the layers this module reads', () => {
  // The place labels are the style's own, so the map adds a glow under each
  // and no label; the landmark layers are added from their list by id; every
  // other layer here is one the basemap patch spells.
  it('are the ones the map actually adds', () => {
    for (const layer of POI_LAYERS) {
      if ((PLACE_LAYERS as readonly string[]).includes(layer)) continue
      if ((LANDMARK_LAYERS as readonly string[]).includes(layer)) continue
      expect(basemapSource).toContain(`id: '${layer}'`)
    }
    expect(basemapSource).toContain('for (const id of PLACE_LAYERS)')
    expect(landmarksSource).toContain('for (const id of LANDMARK_LAYERS)')
    expect(landmarksSource).toMatch(/\{\s*id,\s*type: 'symbol'/)
  })

  // Line placement will not honour the shared `top` anchor, so the line layer
  // restates the anchor and its offset. The two spellings have to describe the
  // same gap or a long lake's name would sit at a different height from every
  // other label: `top` measures to the text's upper edge, `center` to its
  // middle, and the text is one line tall.
  it('space a line-labelled name exactly as far from its icon as a peak', () => {
    // Scoped to the two blocks that matter — the result and pending markers
    // carry offsets of their own and are not part of this pair.
    const offsetAfter = (marker: string) =>
      Number(
        basemapSource.match(new RegExp(`${marker}[\\s\\S]*?'text-offset': \\[0, ([\\d.]+)\\]`))![1],
      )
    expect(offsetAfter("id: 'ofm-lakes-line'") - offsetAfter('function poiLabelLayout')).toBeCloseTo(
      0.5,
    )
  })
})

describe('samePoi', () => {
  const poi = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604 }

  // The case this exists for: the same summit clicked at two zooms comes back
  // on two different tile grid cells.
  it('matches the same feature across a tile-grid shift', () => {
    expect(samePoi(poi, { label: 'Mount Rainier', lat: 46.85307, lon: -121.76062 })).toBe(true)
  })

  it('is case-insensitive on the name', () => {
    expect(samePoi(poi, { label: 'mount rainier', lat: 46.8529, lon: -121.7604 })).toBe(true)
  })

  it('rejects a different name at the same spot', () => {
    expect(samePoi(poi, { label: 'Liberty Cap', lat: 46.8529, lon: -121.7604 })).toBe(false)
  })

  it('rejects the same name beyond the match radius', () => {
    // ~111 m north, comfortably outside POI_MATCH_M.
    expect(samePoi(poi, { label: 'Mount Rainier', lat: 46.8539, lon: -121.7604 })).toBe(false)
    expect(POI_MATCH_M).toBeLessThan(111)
  })

  // A city is labelled from z3, where one tile grid cell is 1.22 km at the
  // equator, so the same city clicked at two zooms can land a kilometre apart.
  it('matches a place across the grid of the zoom it is first labelled at', () => {
    const cell = (360 / (2 ** 3 * 4096)) * 111_320
    expect(cell).toBeCloseTo(1223, 0)
    expect(PLACE_MATCH_M).toBeGreaterThan(3 * cell)
    const town = { name: 'North Bend', kind: 'town', lat: 47.4957, lon: -121.7868 }
    // ~1.1 km north: the same town from a coarser tile.
    expect(samePoi(town, { label: 'North Bend', lat: 47.5057, lon: -121.7868 })).toBe(true)
    // ~11 km north: another place of the same name.
    expect(samePoi(town, { label: 'North Bend', lat: 47.5957, lon: -121.7868 })).toBe(false)
    // A summit keeps its own tight radius at the same distance.
    expect(samePoi({ ...town, kind: 'peak' }, { label: 'North Bend', lat: 47.5057, lon: -121.7868 })).toBe(false)
  })
})
