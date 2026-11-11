# 0183. PR previews read production's shared cache through a login that can only read, and only while it holds public data

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: previews read the production database with a read-only login, "acceptable only because the database is a cache: if it ever holds user data, previews and CI must not touch it". The `DATABASE_READ_ONLY` mode and what a read-only pod skips are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/db/` bullet; [`docs/CICD.md`](../CICD.md), PR preview environments; [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0110 (a preview lives while its PR is labelled), 0175 (the shared cache and its three modes), 0181 (a read-only pod counts on its own)

## Context

A preview runs a PR's image in a namespace of its own (0110). With a database of its own it would need its own planet fill, a 95 GB download and hours of work, before it showed a single trailhead. With none it would search Overpass and draw no markers, which leaves nothing of #760 to review. Production's database holds only public data that the fill and the refreshes rebuild.

## Decision

**A preview reads production's database and runs none of its own.** The `bluebird-pr` ApplicationSet sets `database.enabled: false`, `existingSecret: bluebird-database-preview` and `readOnly: true`. The pod connects as `bluebird_preview`, a login granted `pg_read_all_data` and nothing else, which the CloudNativePG cluster manages from the `bluebird-database-preview` Secret in `bluebird-system`. A Secret of the same name in the preview namespace holds the connection string as `uri`.

**A read-only pod (`DATABASE_READ_ONLY`) reads and never writes.** It reads the places table and the overlay snapshots. It applies no migrations, runs no refresh, and keeps its rate counts, Nominatim gate, Open-Meteo budgets and search cache per pod: its login cannot write them, and a preview's traffic is not production's to spend. A preview whose schema is newer than production's runs as if it had no database, since its queries would name tables production does not have yet.

**The condition travels with the setting.** The ApplicationSet and production's values both say it: once the database holds anything but cached public data, previews and CI must not touch it.

## Evidence

No measurement: this is a call about what a preview may read. The planet file it would otherwise fill from was 95.4 GB on 2026-10-15.

## Alternatives rejected

- **A database and a fill per preview.** A 95 GB download and hours of work for each.
- **A preview with no database.** Overpass discovery and no markers, so the preview shows none of what a #760 change does.
- **The app's own login.** A preview could write production's counters, snapshots and places.

## Consequences

A preview shows production's places and overlays as soon as it starts, with no fill. A preview of a schema change runs without the database until production's schema catches up. The two preview Secrets are created by hand (the Kubernetes-Manifests README). The day the database is to hold anything about a person, this record has to be revisited before that change merges.
