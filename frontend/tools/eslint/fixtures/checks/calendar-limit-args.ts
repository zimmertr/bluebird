// Must trip: a band with no reach, and a horizon that reads a module constant.
const AQI_DAYS = 5
export interface Band {
  pastDays: string
}
export function aqiHorizon(now: Date): string {
  return new Date(now.getTime() + AQI_DAYS).toISOString()
}
