# 0200. The backend pins uvicorn, httptools and uvloop by name rather than asking for uvicorn's `[standard]` extra

- Status: Accepted
- Date: 2026-10-20
- Decider: the maintainer, choosing this over a re-lock that kept the extra and over staying on 3.14, on the fix for #775
- Issues and PRs: #775
- Cited in code as: #775
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands, the sentence "The pins name uvicorn, httptools and uvloop separately"

## Context

Dependabot's bump of the runtime image from `python:3.14-alpine` to `python:3.15-alpine` (#775) failed its Docker build. `uvicorn[standard]` pulls in httptools, locked at 0.8.0, which publishes no wheel for Python 3.15, so pip fell back to the sdist, and the Alpine image carries no compiler. The extra also installs pyyaml, python-dotenv, watchfiles and websockets. The app imports none of the six; httptools and uvloop are there because uvicorn is faster with them.

## Decision

`backend/requirements.in` names `uvicorn`, `httptools` and `uvloop` as three direct pins and no longer asks for the `[standard]` extra. pyyaml, python-dotenv, watchfiles and websockets leave the runtime image. pyyaml stays a development dependency, pinned in `requirements-dev.in`, because three backend tests read the workflow files as YAML.

## Evidence

Read on PyPI, 2026-10-20: httptools 0.8.0 has no cp315 wheel and 0.9.0 has cp315 musllinux wheels for x86_64 and aarch64; uvloop 0.23.0, pydantic-core 2.50.1, psycopg-binary 3.3.6 and mypy 2.4.0 have them too; PyYAML 6.0.3, the newest release, has no cp315 wheel for any platform. A re-lock that kept the extra would therefore still build PyYAML from its sdist inside the image, fetching setuptools and Cython without hashes, which is the source build record 0099 says the lock never meets. The Docker Build log of PR #775 (run 39512239332) ends with `error: command 'gcc' failed: No such file or directory` while building httptools.

`uvicorn --reload`, the hot-reload command in `docs/DEVELOPMENT.md`, falls back to stat polling when watchfiles is absent. Nothing under `backend/app` imports yaml, dotenv, watchfiles or websockets.

With the extra dropped and the locks regenerated on `python:3.15-alpine`, the image built with no compiler, `import httptools, uvloop` succeeded inside it and `import yaml` failed with `ModuleNotFoundError`. The backend suite, ruff, mypy and the OpenAPI check passed on 3.15. Ruff 0.16.0 accepts `target-version = "py315"` with a warning that its 3.15 support is under development.

## Alternatives rejected

- **Keep the extra and re-lock.** httptools moves to 0.9.0, but PyYAML builds from source on every image build, with its build backend fetched unhashed.
- **Add gcc and musl-dev to the runtime stage.** A compiler in the shipped image, for a package the app does not import.
- **Stay on 3.14 and ignore the minor.** Supported until 2030, but it leaves the bump to be done later for the same reason.

## Consequences

Dependabot proposes bumps for two more direct pins. `NOTICES.md` carries two more rows, which `test_notices.py` holds to the pins. `test_dependency_lock.py` holds the three pins to the lock. A future need for one of the four dropped packages is a direct pin, not the extra.
