# 0004. The browser fetches air quality for the whole field, and the pod fetches it lazily

- Status: Accepted
- Date: 2026-07-29 (git: the merge of #189). The lazy fetch on the pod came with #181 the same day.
- Decider: TJ (git: author and merger of #189)
- Issues and PRs: #180, #181, #189
- Cited in code as: #180, #181
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, step 3 of `POST /api/analyze`, and the bullet "The browser fetches AQI for the whole field, concurrently with weather"

## Context

Open-Meteo bills weighted calls per service, so air quality spends a budget that the weather fetch cannot touch. On the pod that budget is shared across every visitor. In the browser it is the visitor's own.

## Decision

The pod fetches US AQI lazily: for the displayed rows only, unless `sort_by` is an AQI key or an AQI bound is set. The browser fetches AQI for the whole field, at the same time as the weather. On both paths AQI is best effort: a failure or the short horizon gives a null AQI and never fails the analysis.

## Evidence

No dated measurement. At 971fede the guide gave weather forecasts about 16 days and air quality about 5. `GET /api/capabilities` publishes the air-quality horizon as `limits.aqi_forecast_days`.

## Alternatives rejected

- A lazy fetch in the browser: an AQI ranking would then need another Analyze.
- An eager fetch on the pod: it spends the shared budget on rows no one sees.

## Consequences

In the app an AQI ranking is a presentation knob, and the overlap costs no extra wall clock. On the server path an AQI bound promotes the fetch to eager, since a bound on an unfetched value would drop nothing.
