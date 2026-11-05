# 0099. The backend installs from a hashed pip-compile lock, no `npm ci` runs install scripts, and npm and pip updates wait seven days

- Status: Accepted
- Date: 2026-10-06
- Decider: the fix for #633, taking the issue's recommended option A with its recommended seven days; git is the source. The cooldown length and the issue's option B (a person on build-chain bumps) are the maintainer's to revisit.
- Issues and PRs: #633, #595
- Cited in code as: #633
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands, the sentence "The backend's direct pins live in `backend/requirements.in`"

## Context

The security review in #595 found two gaps beside the recorded patch auto-merge (`docs/CICD.md`, Dependabot auto-merge). A Dependabot patch PR auto-merges once the required checks pass, and a merge to `main` deploys, with no wait between a package's release and its proposal: on 2026-10-01 vite 8.3.1 (#556) opened at 06:48 and merged at 06:51. Every `npm ci`, in the image build and on the runner, ran each package's install script. And the backend's five direct pins were the whole of what was locked: the roughly twenty indirect distributions the image installs, Starlette among them, resolved at build time with nothing checking the downloads, and GitHub's dependency graph did not list them, so an advisory against one raised no alert. Decision 0083 makes the repair for a bad dependency the next release, which leaves prevention as the lever.

## Decision

Every npm and pip entry in `.github/dependabot.yml` carries `cooldown: default-days: 7`. The `github-actions` and `docker` entries do not.

Every `npm ci` passes `--ignore-scripts`: the `Dockerfile`'s builder stage, both `npm ci` steps in `pr.yml`, the two tool-package installs in `frontend/package.json`, and the four in the `Makefile`.

The backend follows pip-tools' own layout. `backend/requirements.in` holds the direct pins and is the file a person edits; `backend/requirements.txt` is `pip-compile --generate-hashes` output from it, every installed distribution with its hashes; the image installs that file with `pip install --require-hashes`. `requirements-dev.in` adds pytest, pytest-asyncio and mypy with `-c requirements.txt`, and `requirements-dev.txt` is its hashed lock, which CI and the `Makefile` install, so the suite runs on the versions the image ships. `make lock-backend` regenerates both on `python:3.14-alpine` with pip-tools 7.5.3, the version Dependabot runs.

## Evidence

Dependabot's options reference, read 2026-10-06: "The `cooldown` option is only available for *version* updates, not *security* updates", and of its default "This default cooldown does not apply to security updates." So a fix for a published advisory is not delayed. `pip` takes `default-days` but not the `semver-*-days` keys.

dependabot-core's Python file fetcher (`shared_file_fetcher.rb`, read 2026-10-06) fetches only files ending in `.txt` or `.in`, and its `PipCompileFileMatcher` treats a `.txt` as a pip-compile lock only when a `.in` file exists beside it. GitHub's dependency graph names `requirements.txt` as pip's recognised lock file. A lock named `requirements.lock` would be read by neither, so the lock takes the `.txt` name and the direct pins move to `.in`.

The app's lockfile holds two packages with `hasInstallScript`, `@scarf/scarf` 1.4.0 (install telemetry, through `swagger-ui-dist`) and `fsevents` 2.3.3 (optional, `os: darwin`); the three other lockfiles hold none (2026-10-06). The image built from this change serves a frontend bundle byte-identical to main's, with scripts on there and off here, and its smoke checks answer as `pr.yml` expects.

On `python:3.14-alpine`, pip-compile resolved 23 runtime distributions, every one installed from a wheel, so `--require-hashes` meets no source build and no unhashed build backend. pip-tools 7.5.3 fails on pip 26 (`make_requirement_preparer() missing 1 required keyword-only argument: 'allow_editables'`), so the target installs a pip older than 26 beside it. A dev file that constrains to the hashed lock while listing unhashed test tools does not work: pip turns hash checking on for the whole install as soon as one line carries a hash, which is why the dev file is compiled too.

`backend/tests/test_dependency_lock.py` failed all eight of its cases on main before the change.

## Alternatives rejected

- **`requirements.txt` stays the direct list, with the lock beside it as `requirements.lock`.** The brief's first suggestion. Neither Dependabot nor the dependency graph reads that file, so Starlette would stay invisible to the alerts, which is half of what #633 asks for.
- **`uv pip compile`.** Equivalent output, but Dependabot rewrites the lock with pip-compile, and a lock written by one tool and rewritten by another churns its header.
- **`SCARF_ANALYTICS=false` instead of `--ignore-scripts`** (#633 option C). It stops the one telemetry call and leaves every future install script enabled.
- **An `.npmrc` with `ignore-scripts=true` in each package.** It would cover every install, a developer's `npm install` included, without a flag at each call site. It is not taken here because the image build copies only `package.json` and the lockfile before `npm ci`, and a flag at the call site is visible where the install happens; it remains an option.
- **Limiting auto-merge to production dependencies** (#633 option B). It reopens the recorded patch auto-merge decision and adds weekly manual work for one maintainer.

## Consequences

`backend/tests/test_dependency_lock.py` holds it: a pin in a `.in` file that is missing from its lock or locked at another version, a dev lock that disagrees with the runtime lock, a locked package with no hash, an image install without `--require-hashes`, an `npm ci` without `--ignore-scripts` in the `Dockerfile`, the `Makefile`, a workflow or `frontend/package.json`, and an npm or pip Dependabot entry without a cooldown each fail it. `backend/tests/test_notices.py` and the image's smoke test read the direct list from `requirements.in`.

The cost: ordinary releases arrive a week later, and the two locks are generated files that a pin change regenerates in the same PR. A package that one day needs its install script on Linux fails the build until it is handled by name.
