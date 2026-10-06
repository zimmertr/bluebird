# 0107. An exception nothing converted is answered innermost, as the `internal` error, so it leaves with every header

- Status: Accepted
- Date: 2026-10-06
- Decider: Claude, in the security fix pass on issue #631 (option A for finding BR-9), with the maintainer not monitoring; the choice is flagged for the maintainer's review on the pull request
- Issues and PRs: #631, #595, #132, #153
- Cited in code as: #631
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the keyed analyze API bullet under Architecture; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/main.py` bullet

## Context

`docs/TRAFFIC.md` promises the security headers on every response the pod sends (#132). Starlette writes the `500` for an unhandled exception from `ServerErrorMiddleware`, which it always places outside every middleware the app adds, and an exception handler registered for `Exception` or `500` is run from that same layer. So the exception unwound past the security headers, the cache headers, CORS, the access log and the metrics layer before the `500` was written: it left with none of those headers, as `text/plain` `Internal Server Error`, and with no access-log line. The security review found it (#595, finding BR-9).

## Decision

`InternalErrorMiddleware` in `app/main.py` is added first, so it sits innermost, just outside FastAPI's own exception layer. When the inner app raises an exception and no response has started, it logs the traceback on `bluebird_forecast.errors` and answers a `500` with the `internal` body every other error shape uses: `{detail, error: {code: "internal", retryable: true}}`, where `detail` is `INTERNAL_DETAIL` in `app/error_codes.py`, the sentence the analyze stream already sent for the same failure. Every other layer then wraps that answer like any other error. When the response has already started, the exception is raised on and the server ends the connection as before; its headers left with the start of the response. The exception's text never reaches the caller.

## Evidence

On main at `4b8361b` (2026-10-06), through the test client, `GET /api/version` with its build-identity read stubbed to raise answered `500` with no `X-Content-Type-Options` header and a body that was not JSON, and wrote no access-log line (`test_an_unhandled_exception_*` in `test_security_headers.py`, failing before the fix). Starlette's `build_middleware_stack` places `ServerErrorMiddleware(handler=<the Exception or 500 handler>)` first and the app's own middleware after it, which is why a handler alone does not help.

## Alternatives rejected

- Wrapping the finished app at the ASGI level (`SecurityHeadersMiddleware(CacheHeadersMiddleware(app))`) and pointing uvicorn at the wrapper (the issue's first form of option A). It covers the security and cache headers but not CORS or the access log, it changes the `Dockerfile` command and every test client that imports `app`, and the `500` stays `text/plain` outside the API's error vocabulary.
- An exception handler for `Exception` that sets the headers itself. It runs from `ServerErrorMiddleware`, so it would copy the security, cache and CORS headers by hand, a second place that has to learn every header the middlewares add.
- Narrowing the docs to "every response the app produces" (option B). The docs become true and the gap stays.

## Consequences

`test_security_headers.py` holds it: the stubbed crash answers `500` with every header in `BASE_HEADERS`, the app's policy, the revalidate `Cache-Control` and the CORS origin, with the `internal` body and none of the exception's text, and writes one ERROR record with the traceback and an access-log line; an exception after a streamed response has started is still raised. A route's `500` is now counted in the metrics under its route by the ordinary path; `metrics_middleware` keeps its own count for an exception that escapes a middleware layer, which is the one failure still answered by Starlette's outermost layer without these headers. `docs/API.md` lists `internal` on `500` for every route rather than for the stream alone. No route declares the `500` in `openapi.json`, so the contract snapshot is unchanged.
