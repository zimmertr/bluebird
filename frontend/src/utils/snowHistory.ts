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
