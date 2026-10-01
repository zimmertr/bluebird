# 0076. SemVer 1.0 covers the HTTP API and share links, and a request body refuses a field it does not declare

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #563 (Option B, strict reader; then "refuse, as proposed" for an inverted pair, "accept and ignore bbox", and "may add codes")
- Issues and PRs: #563
- Cited in code as: #563
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, the bullet "Regenerate the OpenAPI snapshot", the sentence "Since 1.0 that contract is SemVer's"

## Context

Before 1.0 nothing said what the version number promised to a program that calls the API. The one contract sentence was in `docs/API.md`: `detail` may be reworded, and the `error` object is contract. No request model set `extra`, so Pydantic dropped a field it did not know, and a typo such as `max_wind: 20` answered an unfiltered `200` that read as a filtered one. `AnalyzeResponse.error` was always null and shared its name with the failure bodies' `error` object. Both were cheap to change only before the tag (Round 5 readiness review, D6-2 to D6-5, R-C07-1 to R-C07-5, 2026-10-01).

## Decision

From 1.0, SemVer covers the HTTP API and share links: the documented routes and the statuses each declares, every request and response field in the schema, the `error` object on a failure, and share-link URL parameters. It does not cover `detail` or `message` wording, the numbers `GET /api/capabilities` publishes, the forecasts, or field order. `docs/API.md`, "What version 1.0 promises", is the statement callers read.

Every request body model and every model nested in one refuses an unknown field with Pydantic's stock `422` (`extra_forbidden`): `_REQUEST_CONFIG` in `backend/app/models/common.py`, set on `_DiscoveryFields` (so on `AnalyzeRequest` and `DestinationsRequest`), `CustomDestination` and `GeoPolygon`. The one exception is a polygon's RFC 7946 `bbox`, which `GeoPolygon` declares as an optional list of numbers and never reads: the area, the Overpass query and the discovery cache key all come from `coordinates`. URL parsing is untouched: a share link's unknown parameter still parses to nothing.

A minimum above its maximum is refused with a `422` whose message is `{min field} must not be above {max field}.`, field names as on the wire, from `no_range_inverted` on `_DiscoveryFields`. The pairs are read off each model (every `min_X` with a `max_X` beside it), so they are the nine on `AnalyzeRequest` (the eight forecast bounds and the elevation band) and the elevation band on `DestinationsRequest`. An equal pair is allowed.

Response fields are additive, and every response model in the analyze and destinations families marks every field required in the schema (`_RESPONSE_CONFIG`), because the serializer sends each one. A minor release may also add an `error.code`; a caller branches on the codes it knows and falls back on `retryable` for any other. `AnalyzeResponse.error` is removed.

## Evidence

Measured 2026-10-01 in the backend suite: before the change, each of the six bodies in `test_every_request_shape_refuses_a_field_it_does_not_declare` (a misspelled bound, a stray field on each request body, on a custom row and on a polygon) validated, with the stray field dropped; after it, each fails with `extra_forbidden`, and `POST /api/analyze` with `max_wind: 20` answers `422` naming `["body", "max_wind"]`. What could start failing was checked the same day: the web app sends only declared fields (`buildCustomList` and `refreshEchoRows` project every custom row to the four wire fields, and the polygon is built as `{type, coordinates}`), the browser suite answers `/api/destinations` from fixtures, and the Argo Rollouts release probe (`analysisTemplate-apiTest.yml` in `Kubernetes-Manifests`) sends `destination_types`, `forecast_mode`, `limit` and `polygon`, all declared.

## Alternatives rejected

- Option A, the tolerant reader: document that unknown fields are ignored and keep `error` as a documented null. Nothing breaks, but a mistyped field still answers a plausible `200`, and after 1.0 forbidding it would be a major release.
- Refuse a polygon's `bbox` like any other unknown member. GeoJSON allows it on every object and mapping tools add it, so a valid polygon would have been refused for a member the API has no use for.
- Keep answering an inverted pair with an empty `200`, as the elevation band did before. Nothing can match it, so the empty answer read as "nothing qualifies" rather than as the mistake it is.
- Promise the closed set of error codes for all of 1.x. A new failure would then have to wait for a major release or hide under an existing code.
- Forbid unknown fields on the URL parameters of a share link too. A link outlives the release that made it, so a link must keep opening after the app stops reading one of its parameters.

## Consequences

`test_a_minimum_above_its_maximum_is_refused_by_name` in `test_models.py` runs every pair against an explicit list, `test_a_polygons_bbox_is_neither_queried_nor_keyed` in `test_osm.py` holds the bbox out of the discovery key, and `test_every_request_body_refuses_fields_it_does_not_declare` in `test_openapi.py` walks every schema a request body reaches and fails a new object without `additionalProperties: false`, and `test_every_response_field_the_api_sends_is_required` holds the response side. A caller that sent a stray field before 1.0 now gets a `422`, which is why this shipped before the tag. A body written for a newer release is refused by an older self-hosted instance, rather than half-applied.
