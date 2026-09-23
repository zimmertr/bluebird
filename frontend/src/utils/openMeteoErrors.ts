// The Open-Meteo failures the browser tells apart, and the sentences they
// carry. Mirror of `backend/app/services/errors.py`.
//
// A module of their own because two modules throw them: the HTTP client in
// `openMeteo.ts` and the vector-pinned arithmetic in `openMeteoAggregate.ts`,
// which reads a declared unit and refuses one it cannot convert. The client
// imports the arithmetic, so the vocabulary both of them throw cannot live in
// either one without an import cycle.

// Thrown only for failures that mean the browser genuinely cannot talk to
// Open-Meteo: network errors, DNS, a blocked CORS preflight, malformed
// responses. It buys no second path: the browser is the only analysis path
// (#240), so useAnalyze reports it like every other provider failure and the
// analysis fails with its own message rather than pointing a retry at the
// pod's shared quota. It must NEVER cover HTTP 429: rate limiting means the
// service is reachable and the quota is spent, and the 2026-07-29 incident
// (issue #180) was this class swallowing 429s and pointing the retry at a
// server sharing the same exhausted IP.
export class OpenMeteoUnreachable extends Error {}

// Thrown for HTTP 429: reachable, refusing volume. scope names which quota
// tripped (Open-Meteo's 429 body says "Minutely/Hourly/Daily API request
// limit exceeded"), which decides whether waiting can help.
export class OpenMeteoRateLimited extends Error {
  scope: 'minutely' | 'hourly' | 'daily' | 'monthly' | null
  retryAfterS: number
  constructor(message: string, scope: OpenMeteoRateLimited['scope'], retryAfterS: number) {
    super(message)
    this.scope = scope
    this.retryAfterS = retryAfterS
  }
}

// Thrown when a regional model is asked about a location outside its grid.
// Its own class rather than an OpenMeteoHttpError because the status alone
// does not identify it and the remedy is unlike any other failure here: not
// waiting, not a smaller area, but a different model. Measured 2026-08-01,
// `models=gfs_hrrr` at 46.5,8.0 answers HTTP 400 with
// {"error": true, "reason": "No data is available for this location"} — and a
// batch answers the same way if a SINGLE one of its 50 locations is outside,
// so this never identifies which destination was the problem.
// It carries no message: every catch site composes the sentence below from
// the model's own label, which this class does not have, so a message here
// could only ever be a fourth wording nobody reads (#391).
export class OpenMeteoModelCoverage extends Error {
  modelId: string
  constructor(modelId: string) {
    super()
    this.modelId = modelId
  }
}

// What that sentence says after the model's label. The label is the one part
// the two surfaces do not share, so everything after it is spelled here once.
// Mirror of `_coverage_message` in backend/app/services/weather.py.
export const COVERAGE_PHRASE = 'has no forecast coverage for this area.'

// The analysis path adds the remedy; the compare panel does not, because
// unticking the model in its picker is what removes those lines.
export const COVERAGE_MESSAGE_TAIL = `${COVERAGE_PHRASE} Switch to a different model and try again.`

// Thrown when a response ARRIVED and cannot be read: a body that declares a
// unit nothing can convert, for instance. Its own class because the transport
// worked, so `OpenMeteoUnreachable` would name the wrong fault and send the
// reader after a network problem they do not have. The message is the one the
// backend gives any unusable Open-Meteo body, so one provider fault is not
// described two ways across the two paths.
export class OpenMeteoBadBody extends Error {}

// What every unreadable body says, spelled once. A unit nothing can convert
// and a reply that answers a different number of locations than it was asked
// about are one fault to the reader, who can act on neither, so a second
// wording here would only describe that fault two ways (#431).
export const BAD_BODY_MESSAGE = 'Open-Meteo request failed. Try again later.'

// Any other HTTP status: reachable, failed. The server shares the same
// upstream, so a fallback would fail identically — surface it instead.
export class OpenMeteoHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
