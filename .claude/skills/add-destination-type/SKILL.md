---
name: add-destination-type
description: Add a new destination type (the OSM feature kinds Bluebird discovers and ranks, e.g. peaks, trailheads, lakes) end to end across the backend enum, the Overpass clauses, and the frontend controls. Use when asked to make Bluebird find a new kind of place, or when adding a value to DestinationType.
---

# Adding a new destination type

1. Add the type to the `DestinationType` enum in `backend/app/models.py`.
2. Add its Overpass QL clauses to `_CLAUSES` in `backend/app/services/osm.py`. These
   are clause **fragments**, not a whole query: they are unioned with whatever else
   was asked for, because `destination_types` is a set and Overpass is donated, so an
   analysis is one request no matter how many types it names. Then teach `_classify`
   to recognize the tags they match on, so a returned element is tagged with what it
   *is* rather than what was asked for. Finally add the type to `IMPLEMENTED_TYPES`,
   which `GET /api/capabilities` publishes, so nothing further is needed to advertise it.
3. Add the corresponding checkbox in `frontend/src/components/ControlPanel.tsx` and add
   the type to `DISCOVERY_TYPES` in `frontend/src/utils/urlState.ts`, which decides what
   a `type=` link may name.

## Before you call it done

- **Ship tests with the behavior.** pytest under `backend/tests/` for discovery and
  classification, Vitest under `frontend/src/utils/*.test.ts` for the URL-state round trip.
  Both run in Docker; see [`docs/DEVELOPMENT.md`](../../../docs/DEVELOPMENT.md).
- **Regenerate the OpenAPI snapshot**, since the enum is part of the request contract:
  `cd backend && python scripts/generate_openapi.py`, and commit `backend/openapi.json`.
  `pr.yml` fails the PR otherwise.
- **Update [`docs/USAGE.md`](../../../docs/USAGE.md)**, which owns the destination-type
  walkthrough, and [`docs/DATA.md`](../../../docs/DATA.md) if the new type carries a
  provider caveat of its own.
