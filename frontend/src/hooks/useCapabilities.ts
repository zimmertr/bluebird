import { useEffect, useState } from 'react'
import { apiJson } from '../utils/apiFetch'
import { AQI_LIMIT_DAYS } from '../utils/calendar'
import { MAX_ANALYZE_DESTINATIONS } from '../utils/clientAnalyze'
import { FALLBACK_WINDOW_LIMITS, type WindowLimits } from '../utils/forecastWindow'

// The live limits this deployment enforces, from GET /api/capabilities. The
// SPA reads its ceilings (analysis cap, results-knob maximum) from here so a
// server-side recalibration never needs a coordinated frontend release; the
// compiled constants are only the fallback for the moments before the fetch
// answers, or a deployment where it fails.
/** One selectable weather model, as /api/capabilities describes it. */
export interface ForecastModelOption {
  id: string
  label: string
  /**
   * One line on when to pick this model. Empty when the server did not send
   * one, which the picker renders as no line rather than as a gap — a
   * deployment on an older build should look plainer, not broken.
   */
  summary: string
  /**
   * The finest grid this model offers anywhere, in km. Shown beside the name.
   * Zero when the server did not send one, which the row renders as nothing.
   */
  finestGridKm: number
  /** Hours ahead of now this model still has data for. Bounds the calendar. */
  forecastHours: number
  /** Run over part of the world, so some destinations are outside it. */
  regional: boolean
  /**
   * Serves a fine regional model for a day or two and a coarse global one
   * after that, so one line changes model partway along. Read from the server
   * rather than from the `_seamless` suffix, which is a naming habit rather
   * than a contract. False when the server did not send it, which draws no
   * mark rather than a wrong one.
   */
  blend: boolean
}

export interface Capabilities {
  maxDestinations: number
  maxLimit: number
  maxPolygonAreaKm2: number
  /** Days back the calendar may offer, which is the archive endpoint's reach. */
  archiveDays: number
  /** Days ahead air quality is available. Marks days in the calendar grid. */
  aqiForecastDays: number
  /**
   * The bounds a window is validated against, and where the archive endpoint
   * takes over. One object because that is the shape `forecastWindow.ts` takes:
   * three day counts of similar magnitude, which as bare arguments would
   * transpose silently.
   */
  windowLimits: WindowLimits
  /** Best first, in the order the server ranked them. Render as given. */
  forecastModels: readonly ForecastModelOption[]
  defaultForecastModel: string
}

// Fallback for the polygon-area gate. Lives here rather than beside the map
// because nothing computes with it: it is only ever the stand-in until
// /api/capabilities answers with what this deployment actually enforces. It
// used to be a hand-synced mirror of MAX_POLYGON_AREA_KM2 in
// backend/app/models.py, which is the duplication issue #152 set out to end.
// Sized to where Cascades-density terrain starts timing Overpass out
// (measured: ~103k km2 answered in ~26s, ~151k km2 drew a 504).
const FALLBACK_POLYGON_AREA_KM2 = 100_000

// Fallback for the calendar's near edge, and the same kind of stand-in: nothing
// computes with it, it only holds the band until /api/capabilities answers with
// the reach this deployment actually validates. A year, matching
// `ARCHIVE_DATA_DAYS` in backend/app/models.py — the archive holds decades, and
// the reach is a product choice about how far a calendar should page (#123).
const FALLBACK_ARCHIVE_DAYS = 365

// Fallback for the model picker. One entry, not a compiled copy of the server's
// list: this stands in only for the moment before /api/capabilities answers,
// and a stale list of models would be worse than a short one — picking a model
// this deployment has since dropped fails the analysis, where picking the
// default cannot. The hours are GFS's floor from backend/app/models.py.
export const FALLBACK_FORECAST_MODEL: ForecastModelOption = {
  id: 'gfs_seamless',
  label: 'NOAA GFS',
  summary:
    'The longest reach, and fine detail across the US. Works anywhere.' +
    ' Blends in the HRRR model.',
  finestGridKm: 3,
  forecastHours: 384,
  regional: false,
  blend: true,
}

const FALLBACK: Capabilities = {
  maxDestinations: MAX_ANALYZE_DESTINATIONS,
  maxLimit: MAX_ANALYZE_DESTINATIONS,
  maxPolygonAreaKm2: FALLBACK_POLYGON_AREA_KM2,
  archiveDays: FALLBACK_ARCHIVE_DAYS,
  // The four below are imported rather than respelled, for the same reason
  // `maxDestinations` is: each is the browser's half of a mirrored pair, pinned
  // against the backend constant by `utils/mirroredConstants.test.ts`, and a
  // second spelling here could only ever disagree with the pin. What #393
  // changed is not where they live but what they are — the value held until
  // `/api/capabilities` answers, rather than the value the app computes with.
  aqiForecastDays: AQI_LIMIT_DAYS,
  windowLimits: FALLBACK_WINDOW_LIMITS,
  forecastModels: [FALLBACK_FORECAST_MODEL],
  defaultForecastModel: FALLBACK_FORECAST_MODEL.id,
}

/**
 * The models a body advertises, in the order given, dropping any entry missing
 * the two fields that make one usable. Order is preserved deliberately: the
 * server ranks them for mountain terrain and that ranking is not derivable
 * from any field here. A deployment running an older build publishes no
 * `forecast_models` at all, which has to leave the picker on its fallback
 * rather than empty: an empty dropdown is a dead control, and the default model
 * works whether or not the server described it.
 */
function parseModels(body: unknown): Pick<
  Capabilities,
  'forecastModels' | 'defaultForecastModel'
> {
  // Only the two model fields, never the whole FALLBACK object: this result is
  // spread over the parsed limits, so returning more would overwrite ceilings
  // the body did publish with compiled ones it did not.
  const fallback = {
    forecastModels: FALLBACK.forecastModels,
    defaultForecastModel: FALLBACK.defaultForecastModel,
  }
  const raw = (body as { forecast_models?: unknown } | null)?.forecast_models
  if (!Array.isArray(raw)) return fallback
  const models: ForecastModelOption[] = []
  let fallbackDefault = ''
  for (const entry of raw) {
    const e = entry as Record<string, unknown>
    if (typeof e?.id !== 'string' || typeof e?.forecast_hours !== 'number') continue
    models.push({
      id: e.id,
      label: typeof e.label === 'string' ? e.label : e.id,
      summary: typeof e.summary === 'string' ? e.summary : '',
      finestGridKm: typeof e.finest_grid_km === 'number' ? e.finest_grid_km : 0,
      forecastHours: e.forecast_hours,
      regional: e.regional === true,
      blend: e.blend === true,
    })
    if (e.default === true) fallbackDefault = e.id
  }
  if (models.length === 0) return fallback
  return {
    forecastModels: models,
    // A list with no entry flagged default still has to name one, or the panel
    // would land on nothing selected.
    defaultForecastModel: fallbackDefault || models[0].id,
  }
}

/**
 * How far ahead a model reaches, for a model id that may not be in the list —
 * an old link, or a deployment that stopped publishing one.
 *
 * Falls back to the shortest reach on offer rather than the longest. An unknown
 * model that turns out to be short-range would otherwise have the calendar
 * offering days it cannot answer, and a day drawn as available and returned
 * empty is a worse failure than a day drawn as unavailable that would have
 * worked.
 */
export function modelForecastHours(
  models: readonly ForecastModelOption[],
  id: string,
): number {
  const found = models.find((m) => m.id === id)
  if (found) return found.forecastHours
  return models.reduce(
    (min, m) => Math.min(min, m.forecastHours),
    FALLBACK_FORECAST_MODEL.forecastHours,
  )
}

/**
 * The finest grid a model offers, as the picker prints it. Empty for a
 * deployment that publishes none, so the row simply omits it.
 */
export function gridLabel(km: number): string {
  return km > 0 ? `${km} km` : ''
}

/**
 * How far ahead a model reaches, as the picker prints it.
 *
 * Rendered from `forecast_hours` rather than written into the summary prose,
 * which is the point: this is the same number that bounds the calendar, so the
 * picker cannot promise a reach the grid below then refuses to offer.
 *
 * Rounded to whole days because that is the unit a trip is planned in, and the
 * underlying figure is a floor under a value that moves with every model run —
 * printing "1.75 days" would spend precision the number does not have.
 */
export function reachLabel(hours: number): string {
  if (hours <= 0) return ''
  const days = Math.max(Math.round(hours / 24), 1)
  return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * Map a /api/capabilities body onto the ceilings the SPA enforces, falling back
 * per field. Split out of the hook so the fallback behavior is testable without
 * a DOM: a deployment running an older build publishes a subset of these keys,
 * and a missing key must leave that ceiling alone rather than land as undefined
 * in a Math.min.
 */
export function parseCapabilities(body: unknown): Capabilities {
  const limits = (body as { limits?: Record<string, unknown> } | null)?.limits
  if (!limits) return FALLBACK
  const num = (key: string, fallback: number): number =>
    typeof limits[key] === 'number' ? (limits[key] as number) : fallback
  return {
    maxDestinations: num('max_destinations', FALLBACK.maxDestinations),
    maxLimit: num('max_limit', FALLBACK.maxLimit),
    maxPolygonAreaKm2: num('max_polygon_area_km2', FALLBACK.maxPolygonAreaKm2),
    archiveDays: num('archive_days', FALLBACK.archiveDays),
    aqiForecastDays: num('aqi_forecast_days', FALLBACK.aqiForecastDays),
    // Per field here too, not per object: a deployment on an older build
    // publishes some of these three and not others, and a missing key must
    // leave that bound on its fallback rather than drop the two beside it.
    windowLimits: {
      maxPastDays: num('max_past_days', FALLBACK.windowLimits.maxPastDays),
      maxFutureDays: num('max_future_days', FALLBACK.windowLimits.maxFutureDays),
      pastDataDays: num('past_data_days', FALLBACK.windowLimits.pastDataDays),
    },
    ...parseModels(body),
  }
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(FALLBACK)

  useEffect(() => {
    // Aborted rather than flagged: an unmount should stop the request, not
    // just ignore the answer it is still paying for.
    const controller = new AbortController()
    apiJson<{ limits?: unknown }>('/api/capabilities', { signal: controller.signal })
      .then((body) => {
        if (!body?.limits) return
        setCaps(parseCapabilities(body))
      })
      .catch(() => {
        // Metadata only: the fallback constants keep everything working.
        // An abort lands here too, which is the same nothing.
      })
    return () => controller.abort()
  }, [])

  return caps
}
