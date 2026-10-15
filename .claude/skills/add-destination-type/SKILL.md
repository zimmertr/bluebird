---
name: add-destination-type
description: Add a new destination type (the OSM feature kinds Bluebird Forecast discovers and ranks, e.g. peaks, crags, lakes, trailheads) end to end across the backend enum, the Overpass clauses, and the frontend controls. Use when asked to make Bluebird Forecast find a new kind of place, or when adding a value to DestinationType.
---

# Adding a new destination type

1. Add the type to the `DestinationType` enum in `backend/app/models/common.py`.
2. Add its Overpass QL clauses to `_CLAUSES` in `backend/app/services/osm/query.py`. These
   are clause **fragments**, not a whole query: they are unioned with whatever else
   was asked for, because `destination_types` is a set and Overpass is donated, so an
   analysis is one request no matter how many types it names. Then teach `_classify`
   to recognize the tags they match on, so a returned element is tagged with what it
   *is* rather than what was asked for. Finally add the type to `IMPLEMENTED_TYPES`,
   which `GET /api/capabilities` publishes, so nothing further is needed to advertise it.
3. Add the type's noun to `_NOUNS` in `backend/app/services/ranking.py` and to its twin
   `NOUNS` in `frontend/src/utils/clientAnalyze.ts` (mirror row 18 in `CLAUDE.md`), so an
   over-cap refusal names it rather than saying "destinations".
4. Add the value to `DestinationType` in `frontend/src/types.ts` (`DiscoveryType` derives
   from it), add the corresponding checkbox to `DESTINATION_TYPES` in
   `frontend/src/components/DestinationsSection.tsx`, and add the type to `DISCOVERY_TYPES`
   in `frontend/src/utils/urlParams.ts`, which decides what a `type=` link may name. The
   checkbox label is a user-facing string: confirm it with the maintainer first.
5. If the type links somewhere of its own, add the rule to `frontend/src/utils/destinationUrl.ts`
   and the host to `LINK_ONLY_HOSTS` in `backend/tests/test_security_headers.py`.
6. If the basemap's zoom-14 tiles carry the type, it can join `TILE_TYPES` in
   `frontend/src/utils/tileDiscovery.ts`; if not, `splitTypes` already sends it to the pod,
   and the comments that name what the pod is asked for need it: the `TILE_TYPES` comment
   and head comment in `tileDiscovery.ts`, the header of `frontend/src/utils/basemapPoi.ts`,
   and `discoverFromTilesFirst`'s doc comment in `frontend/src/utils/analysisPipeline.ts`.
7. Check every sentence that lists the types: the destinations step in
   `frontend/src/utils/tourSteps.ts`, the Overpass line in `backend/app/routes/capabilities.py`,
   `_DESCRIPTION` in `backend/app/main.py`, and the README. Since #715 they name no type, and
   any that does again is a user-facing string to confirm first.

## Before you call it done

- **Ship tests with the behavior.** pytest in `backend/tests/test_osm.py` for the clauses
  and classification, `test_models.py` for the enum's members and `test_analyze.py` for the
  noun; Vitest for the URL-state round trip (`urlState.test.ts`), the noun
  (`clientAnalyze.test.ts`), the checkbox (`DestinationsSection.test.tsx`) and any link
  (`destinationUrl.test.ts`). Both run in Docker; see
  [`docs/DEVELOPMENT.md`](../../../docs/DEVELOPMENT.md).
- **Regenerate the OpenAPI snapshot**, since the enum is part of the request contract:
  `cd backend && python scripts/generate_openapi.py`, and commit `backend/openapi.json`.
  Then `cd frontend && npm run generate:api` and commit `frontend/src/api-schema.d.ts`.
  `pr.yml` fails the PR on a stale copy of either.
- **Update the docs.** [`docs/USAGE.md`](../../../docs/USAGE.md) owns the destination-type
  table, which clickable kinds there are, and the Type column's values;
  [`docs/DATA.md`](../../../docs/DATA.md) owns the type's provider caveats (coverage,
  elevation) and where its link goes; `docs/ARCHITECTURE.md`, `docs/TRAFFIC.md` and the
  root `CLAUDE.md`'s Architecture step 2 say which types reach Overpass; and the nested
  `CLAUDE.md` bullets for each file above.
- **Add a decision record** under [`docs/decisions/`](../../../docs/decisions/README.md)
  saying why this type, and link it from Architecture step 2 in the root `CLAUDE.md`.
