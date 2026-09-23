// Must trip: a thrown message and a thrown template without the standing tail.
// The cancel is exempt and must not report.
class OpenMeteoUnreachable extends Error {}
export function fail(status: number, aborted: boolean) {
  if (aborted) throw new DOMException('Aborted', 'AbortError')
  if (status > 500) throw new OpenMeteoUnreachable(`Open-Meteo failed with ${status} of 3 batches.`)
  throw new OpenMeteoUnreachable('Cannot reach Open-Meteo.')
}
