import { SortBy } from '../types'

// Hex anchors — still used for the legend dots
export const MARKER_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'] as const

// RGB equivalents of MARKER_COLORS for smooth interpolation
const ANCHOR_RGB: [number, number, number][] = [
  [34, 197, 94],   // green  #22c55e
  [132, 204, 22],  // lime   #84cc16
  [234, 179, 8],   // yellow #eab308
  [249, 115, 22],  // orange #f97316
  [239, 68, 68],   // red    #ef4444
]

type MetricConfig = {
  thresholds: [number, number, number, number]
  label: string
  legendLabels: [string, string, string, string, string]
  group: string[]
}

// Scales are anchored to absolute conditions (green = dry/calm/cold/clean),
// not to the chosen ranking direction — ranking "highest" simply surfaces the
// red end of the same scale first.
export const METRIC_CONFIG: Record<SortBy, MetricConfig> = {
  precip_total_in: {
    thresholds: [0.01, 0.10, 0.25, 0.50],
    label: 'Total Precip',
    legendLabels: ['≤ 0.01"', '0.01 – 0.10"', '0.10 – 0.25"', '0.25 – 0.50"', '> 0.50"'],
    group: ['precip_total_in', 'precip_avg_in_hr', 'precip_max_in_hr'],
  },
  wind_avg_mph: {
    thresholds: [5, 15, 25, 35],
    label: 'Avg Wind',
    legendLabels: ['≤ 5 mph', '5 – 15 mph', '15 – 25 mph', '25 – 35 mph', '> 35 mph'],
    group: ['wind_min_mph', 'wind_avg_mph', 'wind_max_mph'],
  },
  temp_avg_f: {
    thresholds: [30, 45, 55, 65],
    label: 'Avg Temp',
    legendLabels: ['≤ 30°F', '30 – 45°F', '45 – 55°F', '55 – 65°F', '> 65°F'],
    group: ['temp_min_f', 'temp_avg_f', 'temp_max_f'],
  },
  // Thresholds are the US EPA AQI category boundaries (Good / Moderate /
  // Sensitive / Unhealthy / worse) — they map 1:1 onto the green→red anchors.
  aqi_avg: {
    thresholds: [50, 100, 150, 200],
    label: 'Avg AQI (PM2.5)',
    legendLabels: ['≤ 50', '50 – 100', '100 – 150', '150 – 200', '> 200'],
    group: ['aqi_avg', 'aqi_max'],
  },
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

function mix(
  ca: [number, number, number],
  cb: [number, number, number],
  f: number,
): [number, number, number] {
  return [lerp(ca[0], cb[0], f), lerp(ca[1], cb[1], f), lerp(ca[2], cb[2], f)]
}

function interpolateRgb(value: number, sortBy: SortBy): [number, number, number] {
  const [t0, t1, t2, t3] = METRIC_CONFIG[sortBy].thresholds
  const [c0, c1, c2, c3, c4] = ANCHOR_RGB as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
  if (value <= t0) return [...c0] as [number, number, number]
  if (value <= t1) return mix(c0, c1, (value - t0) / (t1 - t0))
  if (value <= t2) return mix(c1, c2, (value - t1) / (t2 - t1))
  if (value <= t3) return mix(c2, c3, (value - t2) / (t3 - t2))
  // Extrapolate orange → red for one additional segment past the last anchor
  return mix(c3, c4, Math.min(1, (value - t3) / (t3 - t2)))
}

export function markerColor(value: number, sortBy: SortBy): string {
  const [r, g, b] = interpolateRgb(value, sortBy)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function cellStyle(
  value: number,
  sortBy: SortBy,
): { backgroundColor: string; color: string } {
  const [r, g, b] = interpolateRgb(value, sortBy)
  return {
    backgroundColor: `rgba(${r},${g},${b},0.2)`,
    color: `rgb(${r},${g},${b})`,
  }
}
