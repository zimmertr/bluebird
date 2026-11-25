import type { DestinationResult, SnowDepthAtPoint, SnowDepthResponse } from '../types'
import { isAbort } from './abort'
import { apiFetch } from './apiFetch'
import { geoKey } from './points'

/**
 * Snow depth over the analyzed window, from the pod's year of NOHRSC analyses
 * (#849).
 *
 * One request per analysis for the whole field: the pod answers from its own
 * database and asks no upstream, so it costs neither Open-Meteo budget and
 * rides beside the weather rather than after it. Each day of the window up to
 * the newest day analyzed reads its own depth, and every later day reads that
 * newest depth, so a trip next week ranks on the snow there now (TJ,
 * 2026-11-12). Best effort, like air quality: a failed request leaves the rows
 * reading N/A and fails nothing else.
 */
export async function fetchSnowDepth(
  points: readonly { latitude: number; longitude: number }[],
  startMs: number,
  endMs: number,
  signal?: AbortSignal,
): Promise<Map<string, SnowDepthAtPoint> | null> {
  if (points.length === 0) return new Map()
  try {
    const res = await apiFetch('/api/snow-depth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
        start_datetime: new Date(startMs).toISOString(),
        end_datetime: new Date(endMs).toISOString(),
      }),
      signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as SnowDepthResponse
    const out = new Map<string, SnowDepthAtPoint>()
    points.forEach((p, i) => {
      const at = body.points[i]
      if (at) out.set(geoKey(p.latitude, p.longitude), at)
    })
    return out
  } catch (e) {
    if (isAbort(e)) throw e
    return null
  }
}

/**
 * A row with its snow depth: the window's three aggregates, and an hourly
 * series that gives each hour its UTC day's depth and stops at the newest day
 * analyzed, so the chart draws only what was measured. `times` is the grid
 * the row's series is drawn on when it carries no grid of its own.
 */
export function withSnowDepth(
  row: DestinationResult,
  at: SnowDepthAtPoint | undefined,
  times: readonly number[],
): DestinationResult {
  const next: DestinationResult = {
    ...row,
    snow_depth_avg_in: at?.avg_in ?? null,
    snow_depth_min_in: at?.min_in ?? null,
    snow_depth_max_in: at?.max_in ?? null,
  }
  if (row.series) {
    const byDay = new Map((at?.days ?? []).map((d) => [d.day, d.depth_in]))
    const hours = row.series_times ?? times
    next.series = {
      ...row.series,
      snow_depth_in: hours.map((t) => byDay.get(new Date(t).toISOString().slice(0, 10)) ?? null),
    }
  }
  return next
}

/**
 * The snow depth answer that came after the report committed (record 0341):
 * the depths by `geoKey`, or null when the request failed, and the grid the
 * rows' series are drawn on.
 */
export interface LateSnow {
  depths: ReadonlyMap<string, SnowDepthAtPoint> | null
  times: readonly number[]
}

/**
 * The rows a late snow depth answer fills in, each through `withSnowDepth`.
 * Only the rows it has a depth for: a failed request fills nothing, so the
 * columns stay N/A, and a row the run did not ask about keeps what it has.
 */
export function snowFilled(rows: readonly DestinationResult[], late: LateSnow): DestinationResult[] {
  const { depths, times } = late
  if (!depths) return []
  const out: DestinationResult[] = []
  for (const r of rows) {
    const at = depths.get(geoKey(r.latitude, r.longitude))
    if (at) out.push(withSnowDepth(r, at, times))
  }
  return out
}

/**
 * `row` wearing the snow depth `from` carries, for a row rebuilt from a copy
 * taken before the depth landed (an elevation lookup's patch, record 0341).
 * The depth is the coordinate's and not the height's, so it carries over as
 * it stands. The same object when the two already agree, so a patch that
 * changes nothing about the depth redraws nothing more.
 */
export function withSnowOf(row: DestinationResult, from: DestinationResult): DestinationResult {
  const sameSeries = (row.series?.snow_depth_in ?? null) === (from.series?.snow_depth_in ?? null)
  if (
    row.snow_depth_avg_in === from.snow_depth_avg_in &&
    row.snow_depth_min_in === from.snow_depth_min_in &&
    row.snow_depth_max_in === from.snow_depth_max_in &&
    (sameSeries || !row.series)
  ) {
    return row
  }
  const next: DestinationResult = {
    ...row,
    snow_depth_avg_in: from.snow_depth_avg_in,
    snow_depth_min_in: from.snow_depth_min_in,
    snow_depth_max_in: from.snow_depth_max_in,
  }
  if (row.series && from.series?.snow_depth_in) {
    next.series = { ...row.series, snow_depth_in: from.series.snow_depth_in }
  }
  return next
}
