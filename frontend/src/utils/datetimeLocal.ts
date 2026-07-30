// Formats a Date as the `datetime-local` string ("YYYY-MM-DDTHH:MM"), in the
// user's local timezone — the shape the URL's legacy start=/end=/at= params
// speak, and the shape a calendar selection resolves to before it is converted
// to UTC for the API (`utils/calendar.ts`).

/** Local `now`, formatted for a datetime-local value. */
export function nowLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}
