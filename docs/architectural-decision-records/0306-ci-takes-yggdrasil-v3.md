# 0306. CI takes yggdrasil v3: both images through docker-build, Lighthouse and cache cleanup through their modules, and signed provenance on every release

- Status: Accepted. Amends [0276](0276-pr-checks-run-on-yggdrasils-modules.md) (the fill's image is linted and scanned by Docker Build, not Planet Fill)
- Date: 2026-11-21
- Decider: the maintainer (TJ), in zimmertr/yggdrasil#133, which moves every repo onto yggdrasil's v3 modules and has this one drop the Planet Fill scan and its own `cache-cleanup.yml`
- Issues and PRs: zimmertr/yggdrasil#133
- Cited in code as: decision record 0306, in `.github/workflows/pr.yml`, `lint.yml` and `cache-cleanup.yml`
- Guide: [`docs/CICD.md`](../CICD.md), the `pr.yml` summaries, Build & Push, Scorecard

## Context

[0276](0276-pr-checks-run-on-yggdrasils-modules.md) kept the fill's hadolint and Trivy gate in `Planet Fill`, because yggdrasil's `docker-build` module built only one Dockerfile at its context's root. yggdrasil v3.0.0's `docker-build` takes the release's `images` list, `file` included, and builds each entry as a matrix job. v3 also added `lighthouse`, `cache-cleanup`, `dependency-review` and `scorecard` modules, two lint checks, and an attestation of every image the release pushes.

## Decision

- `Docker Build` takes the release's two images. The app's entry keeps its layer cache and `tests/structure-test.yaml`; the fill's builds from `fill/Dockerfile` with no cache. The checks are `Docker Build / Docker Build (zimmertr/bluebird)` and `(zimmertr/bluebird-fill)`, and the fill's scan gets a sticky comment of its own.
- `Planet Fill` builds only the fill's `test` stage and runs its suite. Its hadolint and Trivy steps are gone.
- `Lighthouse` calls the `lighthouse` module with `.github/lighthouserc.js`, on port 8000 behind `/healthz`. The module runs the same `treosh/lighthouse-ci-action` release this job ran. The check is `Lighthouse / Lighthouse`.
- `cache-cleanup.yml` calls the `cache-cleanup` module, which deletes a closed PR's caches with one `gh cache delete --all`.
- `Dependency Review` fails a PR that adds a package version with a known High or Critical vulnerability. `scorecard.yml` runs OpenSSF Scorecard weekly and on every push to `main`.
- `release.yml` grants `attestations: write` and `id-token: write`, so both images carry GitHub's signed build provenance.
- The lint module's `shellcheck` and `docs` checks join the required list. `docs` refuses an em dash in any Markdown file, so the guides and docs pages lost theirs in this PR.

## Evidence

- 2026-11-21: yggdrasil's `docker-build.yml` at v3.0.0 reads `image`, `context`, `file`, `cache` and `structure-test` from each entry, and saves the app's image as `bluebird-image` with the local tag `bluebird:pr-scan`, the names `Browser Smoke & Axe` already loads.
- 2026-11-21: yggdrasil's `lighthouse.yml` at v3.0.0 pins `treosh/lighthouse-ci-action` 12.6.2, the commit `pr.yml` pinned.
- 2026-11-21: the lint module's `shellcheck` found nothing here, and `docs` found 471 lines with an em dash across 24 Markdown files, and no broken link.

## Alternatives rejected

- Keeping the fill's scan in `Planet Fill`: a second copy of the module's gate, which 0276 kept only because the module couldn't build `fill/Dockerfile`.
- Keeping the repo's own cache cleanup loop: the module does the same with one command, and a change to it reaches every repo.

## Consequences

- The fill's image and the app's are linted, built and scanned the same way, and a change to that gate happens in yggdrasil.
- Docker Build saves the fill's image as an artifact too, which nothing loads.
- A new image joins the list in both `pr.yml` and `release.yml`.
