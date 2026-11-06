# 0279. The workflow and dependency rules are held by tools and config, not by tests of our own

- Status: Accepted; supersedes 0099, 0100, 0197 and 0275 in part
- Date: 2026-11-06
- Decider: the maintainer (TJ), 2026-11-06, in zimmertr/yggdrasil#6: "We shouldn't be rolling our own scripts when open source tools and frameworks exist and are community maintained to solve these problems." and, on the plan, "Makes sense to me."
- Issues and PRs: zimmertr/yggdrasil#6 (step 4.4), zimmertr/yggdrasil#38, this PR
- Cited in code as: `.github/workflows/lint.yml`, `.github/workflows/pr.yml`, `frontend/.npmrc`, `backend/tests/test_base_image_digest.py`
- Guide: [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), the dependency lock and install-script rules; [`docs/CICD.md`](../CICD.md), What keeps it in

## Context

Four backend tests held files outside `backend/` to rules from records 0099, 0100, 0197 and 0275: the workflows, the Python locks, `npm ci`, the Dependabot cooldowns, the npm overrides, the base image digests and the `apk upgrade` layer. Each was Python of our own to maintain, and most of them re-checked something a tool or a setting already enforces.

## Decision

The rules stand. What holds each one changes:

| Rule | Held by |
|---|---|
| No `${{ }}` pasted into a `run:` script, and the rest of the workflow audits | yggdrasil's lint module (`lint.yml`): zizmor's pedantic audits and actionlint |
| Every action pinned by SHA | The repository's "require actions to be pinned to a full-length commit SHA" setting (record 0278) |
| A `.in` pin is in its lock, at its version | `Python Lint` reruns `make lock-backend` and fails on any diff |
| The dev lock holds the runtime lock's versions | pip-compile, through `requirements-dev.in`'s `-c requirements.txt` |
| Every locked package is hashed | The image's `pip install --require-hashes`, which Docker Build runs on every PR |
| No `npm ci` runs an install script | An `.npmrc` with `ignore-scripts=true` in each package folder under `frontend/` |
| The base images carry a digest | `test_base_image_digest.py`, the one check no tool makes |

These go with no replacement: the test that the image installs with `--require-hashes`, the Dependabot cooldown test, the two npm override tests and the `apk upgrade` layer tests. Each guarded a few lines of config that a reviewer sees change, and `pyyaml` leaves the dev lock with the last test that read YAML.

## Evidence

- 2026-11-06: `make lock-backend` reproduced the locks Dependabot last wrote (#853) byte for byte, so the diff check doesn't fight Dependabot's recompiles.
- 2026-11-06: in `node:26-alpine`, `npm config get ignore-scripts` read `true` in `frontend/`, `frontend/e2e` and through `npm --prefix tools/eslint`, and `false` in a folder with no `.npmrc`. No package here has a pre- or post-script, which `ignore-scripts` would also skip.
- 2026-11-06: zizmor 1.32.0 (pedantic, offline) found seven issues in the workflows, all fixed here; `pr-preview.yml`'s `pull_request_target` is silenced inline with its reason, the job's same-repo `if:`.
- 2026-11-06: hadolint, Trivy 0.69.1 and Checkov 3 don't check a base image for a digest, and frizbee 0.1.11's `--error` exited 0 after rewriting an unpinned image, so the digest test stays.

## Alternatives rejected

- Keeping the tests: Python of our own that mostly re-checked what pip, npm and GitHub enforce.
- Moving the lock and npm checks into yggdrasil modules: only this repo uses pip-compile, npm or `.node-version`, so a shared module would serve one caller.
- Dropping the flags `--ignore-scripts` already on every `npm ci`: the `.npmrc` makes them redundant, but they cost nothing and keep the rule visible where it applies.

## Consequences

- An npm override that is no longer needed stays until someone notices; `npm ci` still fails if the lock leaves it.
- A Dependabot entry without a cooldown, or an `apk upgrade` moved above the build arguments, is caught in review, or by the release scan when a fixable Critical or High results.
- `Lint / actionlint` and `Lint / zizmor` join the required checks.
