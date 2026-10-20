---
name: add-destination-type
description: Add a new destination type (the OSM feature kinds Bluebird Forecast discovers and ranks, e.g. peaks, crags, lakes, trailheads) end to end across the backend enum, the OSM rules the places table and Overpass share, and the frontend controls. Use when asked to make Bluebird Forecast find a new kind of place, or when adding a value to DestinationType.
---

# Adding a new destination type

1. Add the type to the `DestinationType` enum in `backend/app/models/common.py`.
2. Add its rule to `backend/app/services/osm/rules.py`, the one definition the Overpass
   query, the planet fill and the daily update all read (#760). Each rule is spelled
   twice there, side by side. Its Overpass QL clauses go in `CLAUSES`, which
   `query.py` reads as `_CLAUSES`. These are clause **fragments**, not a whole query:
   they are unioned with whatever else was asked for, because `destination_types` is
   a set and Overpass is donated, so an analysis is one request no matter how many
   types it names. Then teach `classify` to recognize the tags they match on, so an
   element is tagged with what it *is* rather than what was asked for. Add the kind's
   constant to `KINDS`, and keep the module standard library only: the fill image
   copies it in with none of the app's dependencies. Bump `RULES_VERSION`, because the
   daily update applies a new rule only to features edited after it ships, and the
   version change is what makes the next fill rebuild the table. Finally add the type
   to `IMPLEMENTED_TYPES` in `backend/app/services/osm/query.py`, which
   `GET /api/capabilities` publishes, so nothing further is needed to advertise it.
3. Let the places table hold it. `places.kind` carries a `CHECK` naming every kind
   (`backend/app/db/migrations/0001_cache.sql`), so add a numbered migration beside it
   that widens the constraint; editing `0001` changes nothing on a database that has
   already applied it. Then check `CANDIDATE_FILTERS` in `fill/fill.py`: the fill's
   first pass keeps only what those `osmium tags-filter` expressions match, so a tag
   they miss never reaches `classify`.
4. Add the type's noun to `_NOUNS` in `backend/app/services/ranking.py` and to its twin
   `NOUNS` in `frontend/src/utils/clientAnalyze.ts` (mirror row 18 in `CLAUDE.md`), so an
   over-cap refusal names it rather than saying "destinations".
5. Add the value to `DestinationType` in `frontend/src/types.ts` (`DiscoveryType` derives
   from it), add the corresponding checkbox to `DESTINATION_TYPES` in
   `frontend/src/components/DestinationsSection.tsx`, and add the type to `DISCOVERY_TYPES`
   in `frontend/src/utils/urlParams.ts`, which decides what a `type=` link may name. The
   checkbox label is a user-facing string: confirm it with the maintainer first.
6. If the type links somewhere of its own, add the rule to `frontend/src/utils/destinationUrl.ts`
   and the host to `LINK_ONLY_HOSTS` in `backend/tests/test_security_headers.py`.
7. Nothing on the frontend decides where a type is looked up: every polygon search reads
   the places table, or Overpass when the table cannot answer. Map markers are separate.
   Trailheads and crags draw from `GET /api/landmarks` because the basemap tiles carry
   neither, and a type that should draw the same way joins `LANDMARK_KINDS` in
   `backend/app/services/places/__init__.py`, `LandmarkKind` and `LANDMARK_LAYERS` in
   `frontend/src/utils/landmarks.ts`, and the layer loop in
   `frontend/src/map/landmarks.ts`, which picks each kind's icon. The head comments of
   both `landmarks.ts` files and of `frontend/src/utils/basemapPoi.ts` name the kinds.
8. Check every sentence that lists the types: the destinations step in
   `frontend/src/utils/tourSteps.ts`, the Overpass line in `backend/app/routes/capabilities.py`,
   `_DESCRIPTION` in `backend/app/main.py`, and the README. Since #715 they name no type, and
   any that does again is a user-facing string to confirm first.

## Before you call it done

- **Ship tests with the behavior.** pytest in `backend/tests/test_osm_rules.py` for the rule:
  add tagged examples to its table, which holds `CLAUSES` and `classify` to the same
  answers. `test_osm.py` covers the query, `test_models.py` the enum's members and
  `test_analyze.py` the noun. The fill's suite checks that `CANDIDATE_FILTERS` keeps
  everything `classify` keeps. Vitest covers the URL-state round trip (`urlState.test.ts`),
  the noun (`clientAnalyze.test.ts`), the checkbox (`DestinationsSection.test.tsx`) and any
  link (`destinationUrl.test.ts`). Every suite runs in Docker (`make test-backend`,
  `make test-backend-db`, `make test-fill`, `make test-frontend`); see
  [`docs/DEVELOPMENT.md`](../../../docs/DEVELOPMENT.md).
- **Regenerate the OpenAPI snapshot**, since the enum is part of the request contract:
  `cd backend && python scripts/generate_openapi.py`, and commit `backend/openapi.json`.
  Then `cd frontend && npm run generate:api` and commit `frontend/src/api-schema.d.ts`.
  `pr.yml` fails the PR on a stale copy of either.
- **Update the docs.** [`docs/USAGE.md`](../../../docs/USAGE.md) owns the destination-type
  table, which clickable kinds there are, and the Type column's values;
  [`docs/DATA.md`](../../../docs/DATA.md) owns the type's provider caveats (coverage,
  elevation) and where its link goes; `docs/ARCHITECTURE.md` and the root `CLAUDE.md`'s
  Architecture step 2 describe discovery; and the nested `CLAUDE.md` bullets for each
  file above.
- **Add a decision record** under [`docs/decisions/`](../../../docs/decisions/README.md)
  saying why this type, and link it from Architecture step 2 in the root `CLAUDE.md`.
