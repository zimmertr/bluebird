# 0184. The planet fill runs as a weekly CronJob from an image of its own, which every release builds, pushes and scans beside the app's

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: the first fill from the planet file in a Kubernetes job with a temporary 120 GB scratch volume deleted after, the app's own rules imported rather than copied, and CI run with the database off, the database code tested in a job that runs in parallel. A weekly check rather than a daily one is the maintainer's too (2026-10-18), because every check creates and deletes the 120Gi scratch volume and only a release that changes the rules needs a refill. The image, the CronJob's settings, the scratch StorageClass and the CI and release jobs are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760
- Cited in code as: #760
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands, and the Python and TypeScript mirrors (`fill.lock_key` and `fill.USER_AGENT`); the [`fill/`](../../fill/CLAUDE.md) guide; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md); [`docs/CICD.md`](../CICD.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md); [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md)
- Related: 0176 (the places table), 0179 (where a relation stands), 0105 (production moves only onto a scanned digest), 0126 (the app's image takes its OS fixes on every build)

## Context

The planet file was 95.4 GB on 2026-10-15 (`planet-latest.osm.pbf`), republished weekly with an MD5. A cluster worker has 51 GB of ephemeral storage, and the app's pod has a read-only root and no scratch. A lake's centre needs its points, which come before the lake in the file, so the file is read more than once, and a Python dict of every point would need tens of GB.

## Decision

**The fill is `fill/fill.py`, in its own image, `zimmertr/bluebird-fill`.** `fill/Dockerfile` builds it on Debian trixie-slim, pinned by digest, with osmium-tool, pyosmium and psycopg2 from Debian, so nothing is compiled, and it runs as uid 10001. The build copies the app's `rules.py` into the image, because the image carries none of the app's dependencies. `fill.lock_key` and `fill.USER_AGENT` spell the app's own again, and `tests/test_fill.py` holds each pair together.

**The pipeline**: `osmium tags-filter -R` keeps every element carrying a tag some rule reads; `rules.classify` picks the ids to keep; `osmium getid -r` copies those elements out with everything they reference; and each one is placed at the centre of its bounding box from an on-disk node index (`sparse_file_array`), with relations placed by 0179. The rows load by COPY into a new table, which swaps in for the live one in one transaction and keeps its owner, grants and index names. The swap waits at most 10 s for the live table's lock and tries six times, so it never holds every search up behind it. Any failure leaves the live table as it was.

**It fills only when it must**: on the first run, when the table was filled under another `RULES_VERSION`, or with `FORCE_FILL`. Otherwise it checks and exits. It holds the `planet-fill` advisory lock for the whole run, waits up to ten minutes for the app's migrations on a new database, and refuses a download the scratch volume cannot hold. It verifies the planet's MD5, reading the `.md5` once more on a mismatch since the planet is republished weekly under one name, and resumes a dropped download with a Range request, up to five attempts. It records the day file to resume from as one day before the planet's own timestamp: replaying a change rewrites a row, where missing one leaves it wrong.

**The chart runs it as a CronJob** (`fill.*`, rendered only with `database.enabled`): `17 9 * * 0` (Sundays), `concurrencyPolicy: Forbid`, no retry within the week, a 12-hour deadline, 500m CPU and 4Gi requested with a 6Gi limit, and an ephemeral 120Gi scratch volume created and deleted with its pod. Production puts that volume on `proxmox-datapool-scratch`, a new StorageClass on DataPool whose volumes are deleted with their claim.

**Every release builds it.** `release.yml` builds and pushes it beside the app's image at the same version for amd64 and arm64, and the release scan covers both images on both platforms, so a fixable finding in either holds production (0105). `image-scan.yml` scans both every week. The image has no layer cache, so each release installs what Debian publishes that day, as the app's `apk upgrade` layer does (0197). The repository on Docker Hub must be public, because the scan job does not log in.

**CI runs the database code in jobs of its own.** `pr.yml` gains Database Tests (`pytest -m db` against PostgreSQL 17 with PostGIS, built from `backend/tests/db`) and Planet Fill (hadolint, the image, its suite against the same database, and a Trivy gate), each in parallel with the rest. `make test-backend-db` and `make test-fill` run the same steps locally, `make test-backend` skips the `db` tests, and Python Lint covers `fill/`.

## Evidence

Washington's extract (364.8 MB), 2026-10-18, in Docker on the maintainer's Mac:

| Step | Wall | Peak RSS |
|---|---|---|
| Copy and MD5 | 0.8 s | 46 MB |
| `tags-filter -R` | 1.2 s | 123 MB |
| Rules | 0.1 s | 56 MB |
| `getid -r` | 4.1 s | 3,574 MB |
| Centres | 0.9 s | 69 MB |
| Load and swap | 0.1 s | |
| Total | 8 s | 3,779 MB for the container |

9,049 rows, a 1.9 MB table. `make test-fill` passed 26 tests, 20 unit and 6 end to end against PostGIS, and Trivy 0.69.3 found no fixable Critical, High or Medium issue in the arm64 image.

The planet's run is not measured yet. Scaled from Washington by size, the validation put it at about 40 minutes on the Mac, and the cluster's six-core workers are probably slower. `getid -r`'s peak on the planet is unknown; a worker has 24 GB.

## Alternatives rejected

- **Fill from the app's pod.** Its root is read-only with no scratch, and `getid -r` peaked at 3.6 GB on Washington alone.
- **Download the planet weekly and compare its hash** (#760's option D). The hash changes every week, so each week costs 95 GB.
- **A copy of the rules in the fill's tree.** Two definitions to drift apart. The image copies the app's file at build time.
- **A layer cache for the fill's build.** The repository's Actions cache is already over GitHub's 10 GB and evicting the app's layers.

## Consequences

Every release builds, pushes and scans two images, and a finding in the fill's holds production like one in the app's. The CronJob runs weekly and exits in seconds on most weeks, so a release that changes the rules waits up to a week for its refill unless one is started by hand (`kubectl create job --from=cronjob/bluebird-fill`). A failed fill leaves the table as it was, and the next week's run starts again with a fresh download, since the scratch volume goes with its pod. A rule change costs a refill: a 95 GB download and the whole pipeline.
