// Formats a Date as the `datetime-local` input value ("YYYY-MM-DDTHH:MM"),
// in the user's local timezone — the shape the forecast-window inputs and
// URL state (start=/end=) both speak.

/** Local "now" shifted by offsetHours, formatted for a datetime-local input. */
export function nowLocal(offsetHours = 0): string {
  const d = new Date(Date.now() + offsetHours * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// A fresh session's End pre-fill: Start stays "now", End lands three days out,
// so the first Analyze is a real multi-day window instead of the single-hour
// snapshot start == end produces (valid, but it reads as an all-zero table to
// a first-time user).
export const DEFAULT_WINDOW_HOURS = 72
