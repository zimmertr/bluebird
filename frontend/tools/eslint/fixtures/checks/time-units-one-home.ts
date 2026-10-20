// Must trip: an hour spelled in milliseconds, and an instant floored by hand.
const HOUR_MS = 3_600_000
export const floored = (ms: number) => ms - (ms % HOUR_MS)
