# 0017. Smoke comes from NOAA's own daily KML, dated in Eastern time

- Status: Accepted
- Date: 2026-08-04 (git: the merge of #245)
- Decider: TJ (git: author and merger of #245)
- Issues and PRs: #121, #203, #245
- Cited in code as: #121, #203, #245
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/hms.py` bullet

## Context

NOAA's Hazard Mapping System publishes smoke plumes. An ArcGIS mirror of the same data would bring back the shared-organization quota failure that #203 removed from the fire overlay.

## Decision

The pod reads one dated KML a day from NOAA's own file server. The date is Eastern, because that is the shift the analysts work. A 404 falls back one day. Density comes from the placemark's `styleUrl`, and an unrecognized style renders as Light with the raw value kept.

## Evidence

NOAA has changed the density vocabulary once, from numeric to named, on 2022-07-19. The feed `ospo.noaa.gov/data/land/fire/smoke.kml` is advertised as current and has been frozen since 2022-07-18.

## Alternatives rejected

- An ArcGIS mirror: the shared quota.
- A UTC date: it asks for tomorrow's file for five hours every evening.
- The `ospo.noaa.gov` KML: frozen since 2022-07-18. Do not use it.
- Dropping a placemark with an unknown style.

## Consequences

A 404 every morning is the normal state, not an outage. `snodas.py` copies the one-day fallback: see [0054](0054-snodas-snow-depth.md).
