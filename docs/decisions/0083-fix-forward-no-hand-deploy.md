# 0083. A bad release is fixed forward, and the pipeline is the only supported way to deploy

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #573 (always fix forward, with no rollback procedure; the hand-build recipe in `docs/ARCHITECTURE.md` deleted)
- Issues and PRs: #573, #133, #562
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the Kubernetes deployment paragraph

## Context

Issue #133 asked for rollback and incident runbooks and was closed on 2026-07-31 with nothing shipped. The readiness review found three gaps (#573): no page said what to do about a release that passes the canary and is bad at full traffic, no procedure separated an outside outage from a pod fault, and the one manual deploy recipe, in `docs/ARCHITECTURE.md`, could not pass the canary. That recipe ran `docker build` with no `--build-arg`, so the image reported `dev` from `/api/version` and the `version-check` gate refused it; it tagged with a `v` the pipeline does not use; and it told the reader to commit to `Kubernetes-Manifests/main`, which takes no direct commit. Before writing a rollback procedure the maintainer had to decide whether one should exist.

## Decision

There is no rollback. A bad release, whether it was aborted by the canary or promoted, is repaired by the next release: a `fix:` PR merged to `main`, which may be a revert of the bad PR and still ships as a new version. A `Kubernetes-Manifests` PR that sets `newTag` to an older version is not a supported fix, and neither is `kubectl argo rollouts undo`. The release pipeline is the only supported way to deploy, so no document carries a hand-build recipe. `docs/CICD.md`, "When a release is bad", is the procedure: how to tell a bad release, how to find the outside service that failed, how to ship the fix, and what the operator sees while the canary runs.

## Evidence

Checked read-only on 2026-10-01:

- `release.yml`'s `Update Kubernetes Manifests` job runs `git checkout -B chore/bluebird-image origin/main` and `kustomize edit set image` on every release, so a hand pin lasts until the next merge.
- Docker Hub reports `immutable_tags_settings: {enabled: true, rules: [".*"]}` for `zimmertr/bluebird`, and `GET /repos/zimmertr/bluebird/immutable-releases` answers `enabled: true`. A published version cannot be replaced or withdrawn.
- `Kubernetes-Manifests/main` requires a PR and the `Validate manifests` check, with `enforce_admins` on. The `public` ApplicationSet syncs with `prune: true` and `selfHeal: true`, so a change made on the live Rollout is put back.
- The Dockerfile sets `ARG APP_VERSION=dev`, and `analysisTemplate-versionCheck.yml` passes only on `hasSuffix("{{args.version}}", ":" + result)`.
- Every read-only command in the new section ran against the cluster during the 0.92.4 rollout (revision 324), including the AnalysisRun query, which showed `api-test` recording one `received non 2xx response code: 502` before it passed.

## Alternatives rejected

- A rollback procedure as a `Kubernetes-Manifests` PR that pins the last good tag, with a merge freeze on `main` while it holds. It needs a freeze nothing enforces, the next merge silently undoes it, and the bad version stays published anyway.
- `kubectl argo rollouts undo`. `selfHeal` reverts it within one reconcile.
- Fixing the hand-build recipe with the three build args. It would still build one architecture with no SBOM or provenance, and it would be a second deploy path to keep correct.
- A separate `docs/RUNBOOK.md` (#573 option B). One more page to keep current; the section sits beside the canary text it extends.

## Consequences

The time to repair a promoted bad release is the merge-to-live time of the next one (`docs/CICD.md`, Merge to live), plus the time to write the fix or the revert. Nothing enforces the rule: no check refuses a `newTag` that goes backwards, so review in `Kubernetes-Manifests` does. `kubectl argo rollouts retry` stays available for an abort caused by an outside outage, because it re-runs the gates on the same version and moves nothing back. A failed release run, as distinct from a bad release, is #562's subject.
