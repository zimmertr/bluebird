import { describe, expect, it } from 'vitest'
import { LAKE_CLASS, POI_LAYERS, POI_MATCH_M, poiFromFeature, poiToPlace, samePoi } from './basemapPoi'
import { isPeakKind } from './geocode'
// `?raw` gives the component's text without executing it, so this stays a pure
// node test with no DOM and no MapLibre.
import mapViewSource from '../components/MapView.tsx?raw'

const RAINIER: [number, number] = [-121.7604, 46.8529]

describe('poiFromFeature', () => {
  // The tile carries 14410 in its own precomputed feet and 4392 metres; the
  // metres win, and 4392 x 3.28084 rounds to 14409. That one-foot gap is the
  // whole reason this prefers metres — see FEET_PER_METER.
  it('reads a peak’s name and converts its elevation from metres', () => {
    expect(
      poiFromFeature('ofm-peaks', { name: 'Mount Rainier', class: 'volcano', ele: 4392, ele_ft: 14410 }, RAINIER),
    ).toEqual({
      name: 'Mount Rainier',
      kind: 'volcano',
      lat: 46.8529,
      lon: -121.7604,
      elevationFt: 14409,
    })
  })

  it('converts from meters, the way the server does', () => {
    const poi = poiFromFeature('ofm-peaks', { name: 'Glacier Peak', ele: 3213 }, RAINIER)
    expect(poi?.elevationFt).toBe(10541)
  })

  // The tile's own precomputed feet is a second rounding of the same metres and
  // lands a foot away often enough to matter — an unnamed summit is NAMED from
  // this number, so a disagreement is two destinations for one mountain.
  it('ignores the tile precomputed feet when metres are available', () => {
    const poi = poiFromFeature('ofm-peaks', { name: 'X', ele: 3213, ele_ft: 99999 }, RAINIER)
    expect(poi?.elevationFt).toBe(10541)
  })

  it('falls back to the precomputed feet when there are no metres', () => {
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

  it('omits elevation entirely rather than carrying an undefined one', () => {
    const place = poiToPlace({ name: 'Snow Lake', kind: 'lake', lat: 47.4, lon: -121.4 })
    expect('elevationFt' in place).toBe(false)
  })
})

// The map is the other half of this module: it draws the layers whose features
// arrive here. Vitest has no DOM and cannot instantiate MapLibre, so the pair
// is checked by reading the component as text — the same `?raw` idiom
// metrics.test.ts uses to keep a vocabulary from drifting out of its surfaces.
describe('the layers this module reads', () => {
  it('are the ones the map actually adds', () => {
    for (const layer of POI_LAYERS) {
      expect(mapViewSource).toContain(`id: '${layer}'`)
    }
  })

  // A lake drawn by our layer AND by the style's would put two labels on one
  // point, with only insertion order deciding which survives collision. One
  // class name governs both halves, so neither can move without the other.
  it('leave the style no chance to label a lake a second time', () => {
    expect(mapViewSource).toContain(`['==', ['get', 'class'], LAKE_CLASS]`)
    expect(mapViewSource).toContain(`['!=', ['get', 'class'], LAKE_CLASS]`)
    expect(mapViewSource).toContain(`'water_name_point_label'`)
  })

  // Lakes were added on the same terms as peaks (#119): one floor and one
  // label recipe, both named rather than spelled twice, so neither kind of
  // destination can quietly become clickable at a zoom the other is not, or
  // stop looking like the other.
  it('give lakes and peaks one floor and one look', () => {
    expect(mapViewSource.match(/minzoom: POI_MINZOOM,/g) ?? []).toHaveLength(POI_LAYERS.length)
    expect(mapViewSource.match(/paint: POI_LABEL_PAINT,/g) ?? []).toHaveLength(POI_LAYERS.length)
    // Peaks build from the shared layout directly; the two lake layers share
    // one recipe between them, so it is spelled once and spread twice.
    expect(mapViewSource.match(/poiLabelLayout\(/g) ?? []).toHaveLength(3)
  })

  // The long lakes only render at all because their layer places labels along
  // the line, and only look like the rest because it pins them upright.
  it('draw a line-labelled lake upright, like every other destination', () => {
    expect(mapViewSource).toContain("'symbol-placement': 'line-center'")
    expect(mapViewSource).toContain("'text-rotation-alignment': 'viewport'")
    expect(mapViewSource).toContain("'icon-rotation-alignment': 'viewport'")
  })

  // Hovering the panel's "Specify by Click" section lights every feature a
  // click could add. Each label's halo is generated from that label's own spec,
  // so the two cannot come to light different features — which would be worse
  // than no glow at all.
  it('give every clickable label a halo built from its own spec', () => {
    expect(mapViewSource).toContain('glowTwin(layer)')
    // Derived from the layer it belongs to, never re-declared per layer.
    expect(mapViewSource.match(/id: `\$\{layer\.id\}-glow`/g) ?? []).toHaveLength(1)
    for (const key of ['filter: layer.filter', 'minzoom: layer.minzoom']) {
      expect(mapViewSource).toContain(key)
    }
  })

  // A halo that took part in collision would make hovering the panel *remove*
  // the labels it is pointing at.
  it('keep the halo out of label collision entirely', () => {
    expect(mapViewSource).toContain("'icon-ignore-placement': true")
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
        mapViewSource.match(new RegExp(`${marker}[\\s\\S]*?'text-offset': \\[0, ([\\d.]+)\\]`))![1],
      )
    expect(offsetAfter("id: 'ofm-lakes-line'") - offsetAfter('function poiLabelLayout')).toBeCloseTo(
      0.5,
    )
  })

  // The one thing that legitimately differs, and only because the tiles differ:
  // `mountain_peak` carries `ele_ft`, `water_name` carries no elevation at all.
  it('let only peaks print an elevation', () => {
    expect(mapViewSource).toContain("['has', 'ele_ft']")
    expect(mapViewSource.match(/'icon-image': icon/g) ?? []).toHaveLength(1)
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
})
