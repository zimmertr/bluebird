import { describe, expect, it } from 'vitest'
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson'
import type { FireActivityResponse, FireDetectionProps } from '../types'
import { closureFeature } from '../testSupport/fixtures'
import {
  CLOSED_TRAIL_MILES,
  USFS_SOURCE,
  closureSectionAt,
  distanceText,
  hotspotSectionAt,
  smokeSectionAt,
  wildfireSectionAt,
} from './hazardSections'
import { hotspotRows } from './fireActivity'
import { escapeHtml, row, updatedAt } from './popup/popupChrome'
import { observedSpan } from './smoke'
import { FIRE_LINK_ZOOM, WILDFIRE_ROW_LABEL, WILDFIRE_SECTION_LABEL, nifcFireUrl } from './wildfires'
import { CLOSURE_ROW_LABELS, CLOSURE_SECTION_LABELS } from './closures'

// One mile of latitude, so a point a set number of miles due south of an edge
// is easy to spell.
const MILE = 1 / 69

/** A square ring from (west, south) to (east, north), as a polygon. */
function square(west: number, south: number, east: number, north: number): Geometry {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  }
}

function collection(...features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features }
}

function feature(geometry: Geometry, properties: Record<string, unknown> = {}): Feature {
  return { type: 'Feature', geometry, properties }
}

const EMPTY = collection()

describe('distanceText', () => {
  it('says how far to the tenth and which way on the compass', () => {
    expect(distanceText({ miles: 3.24, bearing: 300 })).toBe('3.2 mi NW')
    expect(distanceText({ miles: 0.5, bearing: 0 })).toBe('0.5 mi N')
  })
})

describe('wildfireSectionAt', () => {
  // A fire a tenth of a degree on a side, its south edge at 47.0.
  const PERIMETER = square(-121.1, 47.0, -121.0, 47.1)
  const fires = (props: Record<string, unknown> = { attr_IncidentName: 'Bolt Creek' }) =>
    collection(feature(PERIMETER, props))
  const INSIDE = { lng: -121.05, lat: 47.05, zoom: 8 }
  const south = (miles: number) => ({ lng: -121.05, lat: 47.0 - miles * MILE, zoom: 8 })

  // One fire, so the menu's plural row in the singular (TJ, 2026-11-03).
  it('names the layer, the fire and NIFC', () => {
    const section = wildfireSectionAt(fires(), INSIDE)!
    expect(section.kind).toBe('fire')
    expect(section.layer).toBe('Active wildfire')
    expect(section.layer).toBe(WILDFIRE_SECTION_LABEL)
    expect(WILDFIRE_ROW_LABEL).toBe('Active wildfires')
    expect(section.title).toBe('Bolt Creek')
    expect(section.source).toBe('NIFC')
  })

  // A fire within reach is a reason to stay away, inside it or beside it.
  it('is a warning, inside the perimeter and beside it', () => {
    expect(wildfireSectionAt(fires(), INSIDE)!.warning).toBe(true)
    expect(wildfireSectionAt(fires(), south(3))!.warning).toBe(true)
  })

  // Inside the perimeter the point is on the fire, so no Distance row.
  it('carries no distance for a point inside the perimeter', () => {
    expect(markupRows(wildfireSectionAt(fires(), INSIDE)!)).not.toContain('Distance')
  })

  it('says how far and which way for a fire within ten miles', () => {
    expect(wildfireSectionAt(fires(), south(3))!.rows[0]).toBe(row('Distance', '3.0 mi N'))
  })

  it('is null past ten miles, and with no fires at all', () => {
    expect(wildfireSectionAt(fires(), south(11))).toBeNull()
    expect(wildfireSectionAt(EMPTY, INSIDE)).toBeNull()
  })

  it('takes the nearest of the fires in reach', () => {
    const near = feature(square(-121.1, 46.9, -121.0, 46.95), { attr_IncidentName: 'Near' })
    const far = feature(PERIMETER, { attr_IncidentName: 'Far' })
    expect(wildfireSectionAt(collection(far, near), { lng: -121.05, lat: 46.88, zoom: 8 })!.title).toBe('Near')
  })

  it('reads the size and the containment, each only where NIFC reports it', () => {
    const reported = wildfireSectionAt(fires({ poly_GISAcres: 5649, attr_PercentContained: 55.4 }), INSIDE)!
    expect(reported.rows).toEqual([row('Size', '5,649 acres'), row('Containment', '55%')])
    expect(wildfireSectionAt(fires({ attr_PercentContained: 0 }), INSIDE)!.rows).toEqual([row('Containment', '0%')])
    expect(wildfireSectionAt(fires({}), INSIDE)!.rows).toEqual([])
  })

  it('puts the distance before the size', () => {
    const section = wildfireSectionAt(fires({ poly_GISAcres: 10 }), south(3))!
    expect(section.rows).toEqual([row('Distance', '3.0 mi N'), row('Size', '10 acres')])
  })

  it('falls back to Unnamed fire', () => {
    expect(wildfireSectionAt(fires({}), INSIDE)!.title).toBe('Unnamed fire')
  })

  // Inside, the link opens where the reader clicked, a step closer than the
  // map; beside the fire, it opens on the fire.
  it('links NIFC at the clicked point from inside and at the fire from beside it', () => {
    const inside = wildfireSectionAt(fires(), INSIDE)!
    expect(inside.link).toEqual({ href: nifcFireUrl(-121.05, 47.05, FIRE_LINK_ZOOM + 1), label: 'View on NIFC map' })
    const zoomedIn = wildfireSectionAt(fires(), { ...INSIDE, zoom: 13 })!
    expect(zoomedIn.link!.href).toBe(nifcFireUrl(-121.05, 47.05, 14))
    const beside = wildfireSectionAt(fires(), south(3))!
    expect(beside.link).toEqual({ href: nifcFireUrl(-121.05, 47.05, FIRE_LINK_ZOOM), label: 'View on NIFC map' })
  })

  it("dates the section by NIFC's revision, and not at all without one", () => {
    const revised = Date.UTC(2026, 6, 17)
    expect(wildfireSectionAt(fires({ attr_ModifiedOnDateTime_dt: revised }), INSIDE)!.when).toBe(
      escapeHtml(updatedAt(revised)!),
    )
    expect(wildfireSectionAt(fires(), INSIDE)!).not.toHaveProperty('when')
  })

  it('escapes the name', () => {
    const section = wildfireSectionAt(fires({ attr_IncidentName: '<img src=x>' }), INSIDE)!
    expect(section.title).toBe('&lt;img src=x&gt;')
  })
})

describe('hotspotSectionAt', () => {
  const NOW = Date.parse('2026-10-27T20:00:00Z')
  const HOTSPOT: Feature<Point, FireDetectionProps> = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121, 47] },
    properties: {
      acquired: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
      instrument: 'VIIRS',
      satellite: 'N20',
      confidence: 'nominal',
      frp: 4.26,
    },
  }
  const detections = (over: Partial<FireActivityResponse> = {}): FireActivityResponse => ({
    type: 'FeatureCollection',
    features: [HOTSPOT],
    ...over,
  })
  const south = (miles: number) => ({ lng: -121, lat: 47 - miles * MILE, zoom: 8 })
  const detectionRows = hotspotRows(HOTSPOT, NOW).map(({ label, value }) => row(label, escapeHtml(value)))

  it('names the layer, the hotspot and FIRMS', () => {
    const section = hotspotSectionAt(detections(), south(3), NOW)!
    expect(section.kind).toBe('fire-activity')
    expect(section.layer).toBe('Fire activity')
    expect(section.title).toBe('Hotspot')
    expect(section.source).toBe('NASA FIRMS')
  })

  it('is a warning', () => {
    expect(hotspotSectionAt(detections(), south(3), NOW)!.warning).toBe(true)
  })

  it("puts the distance first and the detection's own lines after it", () => {
    expect(hotspotSectionAt(detections(), south(3), NOW)!.rows).toEqual([row('Distance', '3.0 mi N'), ...detectionRows])
  })

  it('carries no distance for a point on the hotspot', () => {
    expect(hotspotSectionAt(detections(), { lng: -121, lat: 47, zoom: 8 }, NOW)!.rows).toEqual(detectionRows)
  })

  it('is null past ten miles, and with no detections', () => {
    expect(hotspotSectionAt(detections(), south(11), NOW)).toBeNull()
    expect(hotspotSectionAt(detections({ features: [] }), south(3), NOW)).toBeNull()
  })

  // The detection's own time is the Detected row's, so the fine print says
  // when the app fetched them.
  it('dates the section by the fetch, and not at all without one', () => {
    const fetched = Date.parse('2026-10-27T19:30:00Z')
    expect(hotspotSectionAt(detections({ fetched_at: fetched }), south(3), NOW)!.when).toBe(escapeHtml(updatedAt(fetched)!))
    expect(hotspotSectionAt(detections(), south(3), NOW)!).not.toHaveProperty('when')
  })
})

describe('smokeSectionAt', () => {
  // Three nested plumes, listed lightest, densest, middle, so the winner is
  // found by its density rather than by its place in the list.
  const LIGHT = feature(square(-122, 46, -120, 48), { density: 'Light', satellite: 'GOES-WEST' })
  const HEAVY = feature(square(-121.2, 46.8, -120.8, 47.2), { density: 'Heavy', satellite: 'GOES-EAST' })
  const MEDIUM = feature(square(-121.5, 46.5, -120.5, 47.5), { density: 'Medium' })
  const PLUMES = collection(LIGHT, HEAVY, MEDIUM)
  const at = (lng: number, lat: number) => ({ lng, lat, zoom: 8 })

  it('reads the densest plume over the point', () => {
    expect(smokeSectionAt(PLUMES, at(-121, 47))!.title).toBe('Heavy smoke')
    expect(smokeSectionAt(PLUMES, at(-121.4, 47))!.title).toBe('Medium smoke')
    expect(smokeSectionAt(PLUMES, at(-121.9, 47))!.title).toBe('Light smoke')
  })

  // A plume beside the point says nothing about the air over it.
  it('is null outside every plume, and with none', () => {
    expect(smokeSectionAt(PLUMES, at(-119.9, 47))).toBeNull()
    expect(smokeSectionAt(EMPTY, at(-121, 47))).toBeNull()
  })

  it('names the layer and HMS, and the satellite where HMS gives one', () => {
    const section = smokeSectionAt(PLUMES, at(-121, 47))!
    expect(section.kind).toBe('smoke')
    expect(section.layer).toBe('Smoke')
    expect(section.source).toBe('NOAA HMS')
    expect(section.rows).toEqual([row('Satellite', 'GOES-EAST')])
    expect(smokeSectionAt(PLUMES, at(-121.4, 47))!.rows).toEqual([])
  })

  // A plume is weather, as the radar and the snow are: it folds on a ranked
  // card and wears the plain band.
  it('is no warning', () => {
    expect(smokeSectionAt(PLUMES, at(-121, 47))!.warning).toBeUndefined()
  })

  it('dates the section by the window it was traced over, and not at all without one', () => {
    const start = Date.parse('2026-08-04T11:00:00')
    const end = Date.parse('2026-08-04T14:00:00')
    const traced = collection(feature(square(-122, 46, -120, 48), { density: 'Light', observed_start: start, observed_end: end }))
    expect(smokeSectionAt(traced, at(-121, 47))!.when).toBe(escapeHtml(observedSpan(start, end)!))
    expect(smokeSectionAt(PLUMES, at(-121, 47))!).not.toHaveProperty('when')
  })

  it('escapes the satellite', () => {
    const odd = collection(feature(square(-122, 46, -120, 48), { density: 'Light', satellite: '<img src=x>' }))
    expect(smokeSectionAt(odd, at(-121, 47))!.rows).toEqual([row('Satellite', '&lt;img src=x&gt;')])
  })
})

describe('closureSectionAt', () => {
  const START = Date.UTC(2026, 7, 1, 12)
  const END = Date.UTC(2026, 11, 31, 12)
  const medium = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
  // A closed trail running east-west along 45.6, and a closed area around it.
  const TRAIL: Geometry = {
    type: 'LineString',
    coordinates: [
      [-121.95, 45.6],
      [-121.85, 45.6],
    ],
  }
  const AREA = square(-122, 45.5, -121.8, 45.7)
  const trails = (over = {}) => collection(closureFeature(over, TRAIL))
  const areas = (over = {}) => collection(closureFeature(over, AREA))
  const south = (miles: number) => ({ lng: -121.9, lat: 45.6 - miles * MILE, zoom: 10 })
  const ON = { lng: -121.9, lat: 45.6, zoom: 10 }

  // One order each, so the menu's plural rows in the singular (TJ, 2026-11-03).
  it('names each layer by its row in the Layers menu in the singular, the order and the Forest Service', () => {
    const area = closureSectionAt(areas(), 'area', ON)!
    expect(area.kind).toBe('closure-area')
    expect(area.layer).toBe('Area closure')
    expect(CLOSURE_SECTION_LABELS).toEqual({ area: 'Area closure', trail: 'Trail closure' })
    expect(CLOSURE_ROW_LABELS).toEqual({ area: 'Area closures', trail: 'Trail closures' })
    expect(area.title).toBe('Probe Fire Closure')
    expect(area.source).toBe(USFS_SOURCE)
    expect(USFS_SOURCE).toBe('US Forest Service')
    const trail = closureSectionAt(trails(), 'trail', ON)!
    expect(trail.kind).toBe('closure-trail')
    expect(trail.layer).toBe('Trail closure')
  })

  it('is a warning, an area the point is in and a trail beside it', () => {
    expect(closureSectionAt(areas(), 'area', ON)!.warning).toBe(true)
    expect(closureSectionAt(trails(), 'trail', south(0.5))!.warning).toBe(true)
  })

  // An area reaches only the point standing inside it.
  it('reads an area only from inside it', () => {
    expect(closureSectionAt(areas(), 'area', ON)).not.toBeNull()
    expect(closureSectionAt(areas(), 'area', { lng: -121.79, lat: 45.6, zoom: 10 })).toBeNull()
    expect(closureSectionAt(EMPTY, 'area', ON)).toBeNull()
  })

  it('reads a closed trail within a mile, with how far and which way', () => {
    expect(CLOSED_TRAIL_MILES).toBe(1)
    expect(closureSectionAt(trails(), 'trail', south(0.5))!.rows[0]).toBe(row('Distance', '0.5 mi N'))
    expect(closureSectionAt(trails(), 'trail', south(1.5))).toBeNull()
    expect(closureSectionAt(EMPTY, 'trail', ON)).toBeNull()
  })

  it('carries no distance for a point on the trail', () => {
    expect(closureSectionAt(trails(), 'trail', ON)!.rows).toEqual([
      row('Forest', 'Columbia River Gorge NSA'),
      row('Route', 'Eagle Creek 440'),
    ])
  })

  it("gives an area its acres and a trail its route, never the other's", () => {
    expect(closureSectionAt(areas({ GIS_Acres: 4210.4 }), 'area', ON)!.rows).toEqual([
      row('Forest', 'Columbia River Gorge NSA'),
      row('Size', '4,210 acres'),
    ])
    expect(closureSectionAt(areas({ GIS_Acres: null }), 'area', ON)!.rows).toEqual([row('Forest', 'Columbia River Gorge NSA')])
    expect(markupRows(closureSectionAt(trails({ GIS_Acres: 4210 }), 'trail', ON)!)).not.toContain('acres')
  })

  it('joins whichever half of the route exists, and leaves out what the order does not carry', () => {
    expect(closureSectionAt(trails({ RouteName: null }), 'trail', ON)!.rows).toContain(row('Route', '440'))
    expect(closureSectionAt(trails({ RouteNum: null }), 'trail', ON)!.rows).toContain(row('Route', 'Eagle Creek'))
    expect(closureSectionAt(trails({ ForestUnit: null, RouteName: null, RouteNum: null }), 'trail', ON)!.rows).toEqual([])
  })

  // The url is handed on as given: the chrome escapes it into the attribute.
  it('links the order where it has a web address, and nothing else', () => {
    expect(closureSectionAt(areas(), 'area', ON)!.link).toEqual({
      href: 'https://www.fs.usda.gov/r06/alerts/probe',
      label: 'View closure order',
    })
    const amp = 'https://www.fs.usda.gov/alerts?a=1&b=2'
    expect(closureSectionAt(areas({ ClosureURLlink: amp }), 'area', ON)!.link!.href).toBe(amp)
    expect(closureSectionAt(areas({ ClosureURLlink: 'javascript:alert(1)' }), 'area', ON)!).not.toHaveProperty('link')
    expect(closureSectionAt(areas({ ClosureURLlink: null }), 'area', ON)!).not.toHaveProperty('link')
  })

  it("puts the order's own type in the warning line, and nothing where it files none", () => {
    expect(closureSectionAt(areas({ ClosureType: ' Safety Closure ' }), 'area', ON)!.warn).toBe('Safety Closure')
    expect(closureSectionAt(areas(), 'area', ON)!).not.toHaveProperty('warn')
  })

  it('states the span only when both ends exist', () => {
    expect(closureSectionAt(areas(), 'area', ON)!.when).toBe(escapeHtml(`${medium(START)} to ${medium(END)}`))
    expect(closureSectionAt(areas({ ClosureEndDate: null }), 'area', ON)!).not.toHaveProperty('when')
    expect(closureSectionAt(areas({ ClosureStartDate: null }), 'area', ON)!).not.toHaveProperty('when')
  })

  it('escapes every value it prints', () => {
    const section = closureSectionAt(
      trails({ ClosureOrderName: '<img src=x>', ForestUnit: 'A & B', RouteName: '"q"', ClosureType: '<b>' }),
      'trail',
      ON,
    )!
    expect(section.title).toBe('&lt;img src=x&gt;')
    expect(section.warn).toBe('&lt;b&gt;')
    expect(section.rows).toContain(row('Forest', 'A &amp; B'))
    expect(section.rows).toContain(row('Route', '&quot;q&quot; 440'))
  })
})

/** A section's rows as one string, for a test asking only whether a word is there. */
function markupRows(section: { rows: readonly string[] }): string {
  return section.rows.join('')
}
