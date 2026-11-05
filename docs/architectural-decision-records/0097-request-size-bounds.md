# 0097. A request body is capped by size before it is read, every request list has a maximum, and a ring's point cap is published

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issues #618 (option A, the cap at 8 MiB, the `413` sentence and the reuse of `validation`) and #619 (option A, 1,000 positions, `bbox` at 6), and on the two schema-only bounds (`coordinates` at 10, `destination_types` at 10)
- Issues and PRs: #618, #619, #595
- Cited in code as: #618, #619
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Key constraints, the sentence "Since #619 it carries the ring cap too"; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/body_limit.py` bullet

## Context

The security review in #595 found that nothing bounded the size of a request. FastAPI reads a whole body and parses it as JSON before a route's dependencies run, the per-address rate limit among them. The review measured the parse at about 16 bytes of Python objects per body byte, so one body near Cloudflare's 100 MB forward limit could take a pod's 2 GiB. No list in a request model had a maximum length, and the custom-list cap was a validator that ran only after every row had been validated. Separately, a polygon's ring could carry any number of positions. The area cap reads only the box around a ring, and every position is copied into every clause of the Overpass query (up to nine), so a dense ring inside a small box became a multi-megabyte query to donated servers, sent from the pod's one address. Decision 0076 puts every request field's schema under SemVer from 1.0, so a new `maxItems` added after the tag would be a breaking change.

## Decision

A pure-ASGI middleware (`app/body_limit.py`) answers `413` to a body over `MAX_REQUEST_BYTES`. A declared `Content-Length` is refused without reading a byte, and a chunked body is counted as it streams and refused at the byte that passes the cap. The body is the app's existing error shape, `{"detail": "Request body is too large. Maximum is {cap:,} bytes.", "error": {"code": "validation", "retryable": false}}`, rendered by `api_error_handler` in both cases. The middleware is added second, just outside the encoded-slash check of #620, which puts it inside every other layer rather than outermost. None of the layers outside it read a body, so it still refuses before routing, before any dependency and before the parse, and its refusal leaves with the CORS header, the security headers, an access-log line and a metrics sample like any other 4xx. The three POST routes declare the `413` in the schema.

Every list a request body carries has a `maxItems`. The ring is capped at `MAX_POLYGON_POINTS` positions, the closing repeat included. `coordinates` is capped at 10 rings, `bbox` at 6 numbers (its own description says four or six), `destination_types` at 10 (loose, because a duplicate is accepted and ignored) and `custom_destinations` at `MAX_ANALYZE_PEAKS`. The bounds use Pydantic's own `422` messages, except the custom list, which keeps its approved sentence through a wrap validator.

`GET /api/capabilities` publishes both numbers, as `limits.max_request_bytes` and `limits.max_polygon_points`, so they can move later without a major release (0076 excludes published numbers). The browser reads the ring cap through `useCapabilities.ts`, with `MAX_POLYGON_POINTS` in `drawGeometry.ts` as the mirrored fallback (mirror row 30). The draw tool places no point at the cap and grabs no midpoint, without saying anything. A shared link whose ring is over the cap opens without its polygon, the way a malformed one does. The browser does not read the body cap, because nothing it builds comes near it.

## Evidence

Measured 2026-10-06 with the request models themselves, in `python:3.14-slim`: 1,500 custom destinations with 255-character names, plus every analyze field, a 1,000-position ring and a six-number `bbox`. The body is 0.57 MiB with ASCII names, 1.29 MiB with three-byte names sent as raw UTF-8 and 1.65 MiB with four-byte names sent that way (the browser's encoding), and 4.59 MiB with the same four-byte names written as `\u` escape pairs (Python's `json.dumps` default). Every one of those bodies validated, so 1 MiB would have refused requests the schema accepts. 8 MiB clears the largest by about three quarters. `test_the_largest_body_the_models_accept_fits_under_the_cap` sends that body and expects `200`.

The ring cap's ceiling is the share link: Cloudflare's URL limit of about 16 KB at about 20 bytes a position holds a link to about 800 positions, and a ring drawn by hand needs dozens.

On main, before the fix, each of these answered `200` with the route having run: a body one byte over the cap, sent with a declared length or chunked; a ring of 1,001 positions; eleven rings; a seven-number `bbox`; and eleven destination types. No array in a request schema carried `maxItems`, and the draw tool and the link parser both kept going past the cap. The tests are in `backend/tests/test_request_bounds.py`, `frontend/src/map/drawRing.test.ts`, `frontend/src/utils/urlState.test.ts` and `frontend/src/hooks/useCapabilities.test.ts`.

## Alternatives rejected

- 1 MiB, the figure the review computed for ASCII names. It refuses a full list of long non-ASCII names, which the schema accepts.
- The cap as the outermost middleware, as the issue proposed. It protects no more, because nothing outside it reads a body, and it would have sent the refusal without CORS (so a cross-origin caller could not read it), without the security headers, unlogged and uncounted.
- Bounding the lists alone (#618 option B). `json.loads` would still run over the whole body before validation and before the rate limit.
- The cap at the edge alone, as an Envoy buffer filter (#618 option C). A port-forward, an in-cluster caller and every self-hosted instance would stay exposed.
- Simplifying an over-long ring on the server (#619 option B). It silently changes what the caller drew and states no contract.
- A new error code for the `413`. `validation` already means "only the caller can change the outcome", which is what an oversized body is, and the closed vocabulary stays as it was.
- Publishing the ring count and the type count. Only one outer ring is read and three types exist, so both are schema statements that stop a list from growing to the body cap. Neither is a tunable limit.

## Consequences

`test_every_list_a_request_body_carries_has_a_maximum_length` in `test_request_bounds.py` walks every schema a request body reaches and fails on an array without `maxItems`, so a list field added later has to state a maximum. A new route that takes a body is covered by the middleware without any work of its own, but has to declare `413: body_limit.TOO_LARGE_RESPONSE` itself. Raising `MAX_REQUEST_BYTES` is free in the schema. Raising `MAX_POLYGON_POINTS` moves `maxItems` as well, which a published number permits.
