# 0100. Every action is pinned to a commit, the base images to a digest, and only `main` releases

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), through the 2026-10-06 security fix pass that assigned #632's pinning, gating and `env:` steps (recommendation A, its mechanical half)
- Issues and PRs: #632, #595, bluebird-helm#301
- Cited in code as: #632
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the CI/CD pipeline paragraph

## Context

The release job that holds `GH_PAT`, a token that can merge into Kubernetes-Manifests and so reach the cluster, first ran `imranismail/setup-kustomize@v3`, a third-party action named by a tag its owner can move. Any action in a job can rewrite the later steps through `$GITHUB_PATH` and `$GITHUB_ENV`, so that tag was inside the token's trust boundary. None of the 24 action references in the three repositories was pinned to a commit, `release.yml` accepted a `workflow_dispatch` from any branch, and both base images were pulled by tag. The security review found it (#595, findings CI1, CI5, CI11 and CI13).

## Decision

- Every `uses:` in bluebird, bluebird-helm and Kubernetes-Manifests is `owner/action@<40-hex SHA> # <exact version>`. Dependabot (bluebird, bluebird-helm) and Renovate (Kubernetes-Manifests) read the comment and move the pin by PR.
- No third-party action runs in a job that holds `GH_PAT`: `update-manifests` downloads the kustomize release tarball and checks it against its published SHA-256. GitVersion (`versionSpec`) and Helm (`setup-helm`'s `version`) are exact versions.
- Every job in both release workflows carries `if: github.ref == 'refs/heads/main'`; the dispatch trigger stays, for `main`.
- A value from the event or a step output reaches a `run:` script through `env:`, never pasted into it. Every checkout sets `persist-credentials: false` except the two jobs that push a tag.
- The Dockerfile's `FROM` lines are `tag@sha256:<digest>`: the tag says which runtime, the digest which build of it.
- The credential itself (an App token or a fine-grained token in a `release` environment restricted to `main`) is the maintainer's to create; `docs/CICD.md`, The release credentials, lists the steps.

## Evidence

Read 2026-10-06 with read-only `gh api` calls: every tag named below resolved to the commit pinned, and each floating major tag (`actions/checkout@v7`, `gittools/actions@v4`, and the rest) named the same commit as the exact release in the comment, so the pins change no code that runs. The last chart release (run 37520713633, 2026-10-06) resolved GitVersion `6.x` to 6.8.2 and `setup-helm` to Helm v4.3.0, the versions now pinned. The kustomize 5.4.3 and 5.8.1 tarballs were downloaded and hashed, and each matched its release's `checksums.txt`. The base image digests are the indexes `node:26-alpine` and `python:3.14-alpine` named on the same day.

## Alternatives rejected

- Pinning `setup-kustomize` by SHA and keeping it. Its code would still run beside the token; a pinned binary checked against upstream's hash runs nothing of a third party's.
- The runner image's own `kustomize`. It works today, but its version moves with the runner image, unreviewed.
- Removing `workflow_dispatch` from `release.yml`. The recovery path for a failed release is a re-run, not a dispatch, so this would have worked too; the ref check keeps a manual run from `main` available and closes the same hole.
- A Dependabot entry in Kubernetes-Manifests. Renovate already manages that repository's actions and understands SHA pins with version comments; a second bot would open duplicate PRs.

## Consequences

`backend/tests/test_workflow_pins.py` fails an unpinned action, a pasted expression in a `run:` script, a release job without the `main` check, or a `FROM` line without a digest in this repository. The cost is churn: every action release and every rebuild of a base image under its tag is a PR, and action PRs wait for a person because `AUTO_MERGE_PAT` has no `Workflows` permission. In bluebird and bluebird-helm the kustomize version and hash, GitVersion's version and Helm's version sit outside Dependabot's view and move by hand; in Kubernetes-Manifests Renovate moves the kustomize version and the hash check fails its PR until the hash moves with it.
