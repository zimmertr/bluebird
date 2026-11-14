# 0298. The built image is checked by a container-structure-test file, and what it serves by the backend's tests

- Status: Accepted. Amends [0276](0276-pr-checks-run-on-yggdrasils-modules.md) (the smoke test is no longer Bluebird's own) and [0086](0086-license-notices-built-into-the-image.md) (what enforces the notices in Docker Build)
- Date: 2026-11-13
- Decider: the maintainer (TJ), 2026-11-13, on #937 (option A), after deciding on zimmertr/hevy-garmin-sync#67 that no repo writes shell assertions in a workflow
- Issues and PRs: #937, #938, zimmertr/yggdrasil#113 (its record 0060)
- Cited in code as: none
- Guide: [`docs/CICD.md`](../CICD.md), the `pr.yml` docker-build summary

## Context

Docker Build ran a 50-line smoke test: it started the image, waited on `/healthz`, and compared eleven answers with `curl` and a `check` helper of its own. A failure printed only the label and two strings. yggdrasil's docker-build module now runs container-structure-test against the built image (v1.3.0), and its `smoke-test` input is deprecated. container-structure-test runs each command to completion, so it cannot start the server and send it requests.

## Decision

- `tests/structure-test.yaml` holds what only the built image can show:
  - the sentinel `APP_VERSION` in the image's environment, and read back through the app's own `get_version` and schema
  - `/docs`'s rendered page pointing at `/swagger-ui/` and naming no third-party host
  - the SPA, Swagger UI's script and stylesheet, and the bundle's notice in `static/`
  - `/app/LICENSE`
  - `third-party-licenses.txt` naming every direct dependency
- `backend/tests/test_structure_test.py` holds that file's dependency list to `frontend/package.json` and `backend/requirements.in`, because the tool cannot read the manifests.
- What the app answers for those files over HTTP is the backend's own tests, against stand-ins at the same paths. The `static_mount` fixture in `conftest.py` mounts them, and `test_static.py` and `test_notfound.py` use it. `/redoc` and the version endpoints were already covered there.

## Evidence

On #938's CI (2026-11-13), Docker Build runs the structure test against the image the PR builds, and the backend tests run in Backend Tests.

## Alternatives rejected

- Keeping a short HTTP check of the built image (#937 option B). It is still shell in a workflow.
- Running the image from the backend suite with a container library (#937 option C). It adds a test dependency, and the test job would need the built image.

## Consequences

A direct dependency added to either manifest fails `test_structure_test.py` until the structure test checks its notice. The HTTP checks now run from source, so they prove the app serves a file at a path, and the structure test proves the image holds it there. Neither proves both at once.
