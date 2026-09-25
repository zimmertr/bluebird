// The tutorial's story (#536): which places it adds and how, the example fire
// and its smoke, the air quality around them, and the state the demo app stands
// in before each step.
//
// Pure, so every number the demo shows can be tested without a browser. The
// weather is recorded (`tools/tour-demo/capture.ts`); everything here is made
// up, deterministic, and named as an example wherever the reader can see it.
//
// The cast is chosen so ranking by air quality tells one story. Glacier Peak
// (searched), Kennedy Peak (pasted) and Gamma Peak (inside the drawn ring)
// stand beside the fire. Dome Peak (clicked), Mount Misch (pasted) and the
// ring's three northern peaks are far from it and breathe clean air.
import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { DiscoveredDestination, GeoPolygon } from '../types'
import { dayKey } from '../utils/calendarDates'
import { type Place, placeFromNominatimRow } from '../utils/geocode'
import { TOUR_STEPS, stepIndex } from '../utils/tourSteps'
import type { ShareableState } from '../utils/urlState'

/** One peak's hourly answer from Open-Meteo, as the API sends it. */
export interface RecordedHours {
  latitude: number
  longitude: number
  hourly: Record<string, (number | null)[]>
  hourly_units?: Record<string, string>
  [key: string]: unknown
}

/** Everything `capture.ts` records. */
export interface DemoData {
  capturedAt: string
  capabilities: unknown
  geocode: Parameters<typeof placeFromNominatimRow>[0][]
  pool: DiscoveredDestination[]
  snowAnalysisDate: string | null
  weather: { latitude: number; longitude: number; forecast: RecordedHours; cloud: RecordedHours }[]
}

/** The model the demo switches to: HRRR's 3 km grid covers the whole window. */
export const DEMO_MODEL = 'gfs_hrrr'
export const SEARCH_QUERY = 'Glacier Peak'

/** Where `capture.ts` discovers the peaks the demo can reach. */
export const POOL_POLYGON: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.25, 48.05], [-120.95, 48.05], [-120.95, 48.35], [-121.25, 48.35], [-121.25, 48.05]]],
}
export const POOL_NAMES: readonly string[] = [
  'Glacier Peak', 'Dome Peak', 'Kennedy Peak', 'Gamma Peak', 'Helmet Butte', 'Plummer Mountain',
  'Sitting Bull Mountain', 'Bannock Mountain', 'Mount Misch', 'Sulphur Mountain', 'Sinister Peak',
  'Spire Point', 'Gunsight Peak', 'Agnes Mountain', 'Lizard Mountain', 'Disappointment Peak',
  'Tenpeak Mountain', 'Clark Mountain', 'Green Mountain', 'Downey Mountain', 'Lime Mountain',
  'Fire Mountain',
]

/** The peak the map step clicks, and the zoom its label shows at. */
export const CLICKED = { name: 'Dome Peak', zoom: 12.5 } as const

/**
 * The ring the draw step places, as [lng, lat] corners. It holds Gamma Peak
 * beside the fire, Helmet Butte at the plume's edge, and Plummer, Sitting Bull
 * and Bannock to the north, and it leaves out the two peaks the other steps
 * add, so no destination arrives twice.
 */
export const RING: readonly [number, number][] = [
  [-121.1, 48.135],
  [-120.94, 48.135],
  [-120.94, 48.29],
  [-121.1, 48.29],
]

export const RING_POLYGON: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[...RING.map(([lng, lat]) => [lng, lat]), [RING[0][0], RING[0][1]]]],
}

/** What the paste step pastes: one peak far from the fire, one beside it. */
export const PASTED = '48.3437,-121.2005,Mount Misch\n48.132,-121.1253,Kennedy Peak'

/** The hours the window step narrows to, on the next day. */
export const HOURS = { start: '06:00', end: '18:00' } as const

// ── The example fire and its smoke ─────────────────────────────────────────

const KM_PER_DEG_LAT = 111.32

/** The fire's middle, between Glacier Peak and Gamma Peak. */
export const FIRE_AT = { lat: 48.118, lon: -121.078 } as const
/** Where the plume drifts to, south-east and away from the northern peaks. */
export const PLUME_TO = { lat: 48.04, lon: -120.9 } as const

function kmBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const kx = KM_PER_DEG_LAT * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180)
  return Math.hypot((aLat - bLat) * KM_PER_DEG_LAT, (aLon - bLon) * kx)
}

// A ring of `n` points around a centre, its radius wobbled by a fixed pattern
// so the shape reads as a burn scar or a plume rather than a circle.
function blob(lat: number, lon: number, rKm: number, n: number, stretch = 1, turn = 0): number[][] {
  const kx = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  const pts: number[][] = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const r = rKm * (1 + 0.18 * Math.sin(3 * a) + 0.1 * Math.cos(5 * a))
    const x = r * stretch * Math.cos(a)
    const y = r * Math.sin(a)
    const xr = x * Math.cos(turn) - y * Math.sin(turn)
    const yr = x * Math.sin(turn) + y * Math.cos(turn)
    pts.push([+(lon + xr / kx).toFixed(5), +(lat + yr / KM_PER_DEG_LAT).toFixed(5)])
  }
  pts.push(pts[0])
  return pts
}

function feature<P>(ring: number[][], properties: P): Feature<Polygon, P> {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties }
}

/** The fire, in the shape `GET /api/wildfires` answers with. */
export function exampleFire(nowMs: number): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      feature(blob(FIRE_AT.lat, FIRE_AT.lon, 1.6, 24, 1.3, 0.4), {
        attr_IncidentName: 'Example fire',
        poly_IncidentName: 'Example fire',
        poly_GISAcres: 2410,
        attr_PercentContained: 15,
        attr_ModifiedOnDateTime_dt: nowMs - 3 * 3_600_000,
        attr_FireDiscoveryDateTime: nowMs - 2 * 86_400_000,
      }),
    ],
  }
}

/** The plume, in the shape `GET /api/smoke` answers with, densest by the fire. */
export function exampleSmoke(nowMs: number): FeatureCollection {
  const turn = Math.atan2(PLUME_TO.lat - FIRE_AT.lat, (PLUME_TO.lon - FIRE_AT.lon) * Math.cos((FIRE_AT.lat * Math.PI) / 180))
  const along = (f: number) => ({
    lat: FIRE_AT.lat + (PLUME_TO.lat - FIRE_AT.lat) * f,
    lon: FIRE_AT.lon + (PLUME_TO.lon - FIRE_AT.lon) * f,
  })
  const observed = { satellite: null, observed_start: nowMs - 5 * 3_600_000, observed_end: nowMs - 3_600_000 }
  const light = along(0.55)
  const medium = along(0.35)
  const heavy = along(0.15)
  return {
    type: 'FeatureCollection',
    features: [
      feature(blob(light.lat, light.lon, 5.5, 28, 2.4, turn), { density: 'Light', ...observed }),
      feature(blob(medium.lat, medium.lon, 3.6, 24, 2.2, turn), { density: 'Medium', ...observed }),
      feature(blob(heavy.lat, heavy.lon, 2.2, 20, 1.8, turn), { density: 'Heavy', ...observed }),
    ],
  }
}

// How far a point is from the plume's axis, and how far along it.
function plumeReach(lat: number, lon: number): { off: number; along: number } {
  const kx = KM_PER_DEG_LAT * Math.cos((FIRE_AT.lat * Math.PI) / 180)
  const ax = (PLUME_TO.lon - FIRE_AT.lon) * kx
  const ay = (PLUME_TO.lat - FIRE_AT.lat) * KM_PER_DEG_LAT
  const px = (lon - FIRE_AT.lon) * kx
  const py = (lat - FIRE_AT.lat) * KM_PER_DEG_LAT
  const len2 = ax * ax + ay * ay
  const t = Math.max(0, Math.min(1, (px * ax + py * ay) / len2))
  return { off: Math.hypot(px - t * ax, py - t * ay), along: t }
}

/**
 * The US AQI at a place in the demo's `hour`th hour: a clean background, a
 * fall-off from the fire, and the plume on top, rising through the afternoon as
 * smoke does when the day heats. Deterministic, so a test can hold it.
 */
export function aqiAt(lat: number, lon: number, hour: number): number {
  const background = 16 + 6 * (0.5 + 0.5 * Math.sin(lat * 97 + lon * 41))
  const fire = 150 * Math.exp(-kmBetween(lat, lon, FIRE_AT.lat, FIRE_AT.lon) / 6)
  const { off, along } = plumeReach(lat, lon)
  const plume = 80 * Math.exp(-off / 4) * (1 - 0.6 * along)
  const day = 0.8 + 0.4 * Math.sin((Math.PI * Math.min(hour, 12)) / 12)
  return Math.round(Math.min(300, background + (fire + plume) * day))
}

// ── The state before each step ─────────────────────────────────────────────

/** The two places the search and map steps add, as the app would hold them. */
export function castPlaces(demo: DemoData): { searched: Place; clicked: Place } {
  const dome = demo.pool.find((d) => d.name === CLICKED.name)
  if (!dome) throw new Error(`the recorded pool has no ${CLICKED.name}`)
  return {
    searched: placeFromNominatimRow(demo.geocode[0]),
    clicked: {
      label: dome.name,
      description: '',
      kind: 'peak',
      lat: dome.latitude,
      lon: dome.longitude,
      ...(dome.elevation_ft !== null ? { elevationFt: dome.elevation_ft } : {}),
    },
  }
}

/** Where the demo app starts when it is mounted at a step. */
export interface StepState {
  initial: Partial<ShareableState>
  autoAnalyze: boolean
}

/**
 * The state the demo app stands in before step `index`: every earlier step's
 * action applied, and nothing of this one's. Mounting the app here and playing
 * the step is the same screen a walk from the start reaches, which is what lets
 * Previous and a Next pressed mid-action jump rather than replay.
 *
 * The player is switched on from the start, on a phone too, so the player step
 * has a player to light wherever the tutorial is opened.
 */
export function stateBefore(index: number, demo: DemoData, nowMs: number): StepState {
  const done = (key: string) => stepIndex(key) < index
  const { searched, clicked } = castPlaces(demo)
  const tomorrow = dayKey(new Date(nowMs + 86_400_000))
  const initial: Partial<ShareableState> = { showPlayer: true }
  const pins: Place[] = []
  if (done('search')) pins.push(searched)
  if (done('map')) pins.push(clicked)
  if (pins.length > 0) initial.pins = pins
  if (done('polygon')) {
    initial.polygon = RING_POLYGON
    initial.destinationTypes = ['peak']
  }
  if (done('coordinates')) initial.customCsv = PASTED
  if (done('model')) {
    initial.forecastModel = DEMO_MODEL
    initial.compareModels = []
  }
  if (done('calendar')) {
    initial.selection = { kind: 'days', startDate: tomorrow, endDate: tomorrow, hours: { ...HOURS } }
  }
  if (done('layers')) {
    initial.showWildfires = true
    initial.showSmoke = true
  }
  return { initial, autoAnalyze: done('analyze') }
}

/** Steps whose screen holds something no link can: the popup the row step opened. */
export function opensPopup(index: number): boolean {
  return index === stepIndex('popup')
}

export const STEP_COUNT = TOUR_STEPS.length
