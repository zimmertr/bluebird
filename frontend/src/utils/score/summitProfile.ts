import type { DestinationResult } from '../../types'
import { CLOUD_DECK_CEILING_FT } from '../openMeteoAggregate'
import { COLUMNS } from '../tableColumns'
import { NO_VALUE_MARK } from '../unavailableCell'
import { forecastDayLabel } from '../timeline'
import { bestWhen } from './headline'
import { clamp } from '../numbers'

/**
 * An opened row's summit against the cloud (record 0327), the prototype's
 * profile: the window's hours across, height up, the summit a line, each
 * hour's cloud deck a band from its base to its top, the freezing level a
 * path, nights shaded and the best four hours boxed. Pure and in fractions of
 * the box, so the picture's one rule, what stands where, is pinned in node and
 * the component only scales it.
 */
interface ProfileHour {
  /** The hour's left edge and width, as fractions of the box's width. */
  x: number
  w: number
  /** Daylight, as the score read it (`score_lit`). */
  lit: boolean
  /** The deck's band, as fractions of the box's height from the top, or null for a dry or unanswered hour. */
  cloud: { top: number; base: number } | null
}

export interface Profile {
  hours: ProfileHour[]
  /** The summit's height, as a fraction of the box's height from the top. */
  summit: number
  /** The freezing level, one step per hour that answered: its edge, width and height, in fractions. */
  freeze: { x: number; w: number; y: number }[]
  /** The best four hours' span, in fractions of the width, or null. */
  best: { x0: number; x1: number } | null
  /** Where each local day after the first begins, and its name. */
  days: { x: number; label: string }[]
}

/**
 * The box's height in feet: half again the summit, so the summit stands two
 * thirds of the way up, raised to hold a freezing level or a deck top above
 * that, but never past two and a half summits, where a dry column's ceiling
 * or a high freezing level would press the summit flat.
 */
function heightFt(row: DestinationResult): number {
  const elev = row.elevation_ft ?? 0
  const s = row.series
  let top = elev * 1.5
  for (const v of [...(s?.freeze_ft ?? []), ...(s?.cloud_top_ft ?? [])]) {
    if (v !== null && v < CLOUD_DECK_CEILING_FT && v > top) top = v
  }
  return clamp(top * 1.05, 1000, Math.max(elev, 1000) * 2.5)
}

export function summitProfile(row: DestinationResult, grid: readonly number[]): Profile | null {
  const s = row.series
  const times = row.series_times ?? grid
  const n = times.length
  if (!s || n === 0 || row.elevation_ft == null) return null
  const max = heightFt(row)
  const y = (ft: number) => 1 - clamp(ft, 0, max) / max
  const lit = row.score_lit ?? []
  const base = s.cloud_deck_ft ?? []
  const top = s.cloud_top_ft ?? []
  const hours: ProfileHour[] = times.map((_, i) => {
    const b = base[i] ?? null
    // A dry column reads the ceiling for its base (record 0113), so it draws no band.
    const dry = b === null || b >= CLOUD_DECK_CEILING_FT
    const t = top[i] ?? b
    return {
      x: i / n,
      w: 1 / n,
      lit: lit[i] ?? false,
      cloud: dry || t === null ? null : { top: y(Math.max(t, b)), base: y(b) },
    }
  })
  const freeze: { x: number; w: number; y: number }[] = []
  ;(s.freeze_ft ?? []).forEach((v, i) => {
    if (v !== null && i < n) freeze.push({ x: i / n, w: 1 / n, y: y(v) })
  })
  const best = row.score_best ? { x0: row.score_best[0] / n, x1: row.score_best[1] / n } : null
  const days: { x: number; label: string }[] = []
  for (let i = 1; i < n; i++) {
    if (new Date(times[i]).getDate() !== new Date(times[i - 1]).getDate()) {
      days.push({ x: i / n, label: forecastDayLabel(times[i]) })
    }
  }
  return { hours, summit: y(row.elevation_ft), freeze, best, days }
}

/** How many of the window's daylight hours the summit stands inside the deck. */
export function hoursInCloud(row: DestinationResult): number {
  const s = row.series
  const elev = row.elevation_ft
  if (!s || elev == null) return 0
  const lit = row.score_lit ?? []
  let n = 0
  ;(s.cloud_deck_ft ?? []).forEach((b, i) => {
    if (!lit[i] || b === null || b >= CLOUD_DECK_CEILING_FT || b > elev) return
    const t = s.cloud_top_ft?.[i] ?? null
    if (t === null || t >= elev) n++
  })
  return n
}

type FactKey = 'temp_min_f' | 'wind_max_mph' | 'freeze_min_ft' | 'precip_total_in' | 'snowfall_total_in' | 'aqi_max'

/** A value as its column prints it, with the column's unit, the degree sign set close. */
function columnValue(row: DestinationResult, key: FactKey): string {
  const col = COLUMNS.find((c) => c.key === key)
  const v = row[key]
  if (!col || v === null || v === undefined) return NO_VALUE_MARK
  const text = col.format ? col.format(v) : String(v)
  const unit = col.unit ?? ''
  if (unit === '') return text
  return unit.startsWith('°') ? `${text}${unit}` : `${text} ${unit}`
}

/** The opened row's facts, in the prototype's order: two rows of four. */
export function profileFacts(row: DestinationResult): { label: string; value: string }[] {
  return [
    { label: 'Best hours', value: bestWhen(row.best_start_ms, row.best_end_ms) ?? NO_VALUE_MARK },
    { label: 'Low', value: columnValue(row, 'temp_min_f') },
    { label: 'Wind', value: columnValue(row, 'wind_max_mph') },
    { label: 'In cloud', value: `${hoursInCloud(row)} h of daylight` },
    { label: 'Freezing', value: columnValue(row, 'freeze_min_ft') },
    { label: 'Precip', value: columnValue(row, 'precip_total_in') },
    { label: 'New snow', value: columnValue(row, 'snowfall_total_in') },
    { label: 'AQI', value: columnValue(row, 'aqi_max') },
  ]
}
