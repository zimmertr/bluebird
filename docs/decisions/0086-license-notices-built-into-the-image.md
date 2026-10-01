# 0086. The image builds its own third-party license file from what it ships, and a package with no text fails the build

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #571 (option A: generate the file at build time, rather than serve `NOTICES.md`)
- Issues and PRs: #571
- Cited in code as: #571
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the Architecture bullet on `third-party-licenses.txt`; [`frontend/plugins/CLAUDE.md`](../../frontend/plugins/CLAUDE.md), the `plugins/thirdPartyLicenses.ts` bullet; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `scripts/write_third_party_licenses.py` bullet

## Context

MIT, ISC, BSD and Apache-2.0 each ask that a copy of the software carry the license text. The image `zimmertr/bluebird` is public on Docker Hub, so every pull is a copy, and the site hands the bundle to every visitor. Neither carried a single text: `.dockerignore` dropped `NOTICES.md` and `LICENSE`, the minified JavaScript keeps no license comment, `/swagger-ui/swagger-ui-bundle.js` pointed at a `.LICENSE.txt` that answered 404, and `NOTICES.md` names packages and licenses without any text, so linking it would not meet the terms either (#571, Round 5 readiness review).

## Decision

Each build stage writes its half of one file, `third-party-licenses.txt`, from what that stage actually ships, and the pod serves it at `/third-party-licenses.txt`.

- The frontend build runs `frontend/plugins/thirdPartyLicenses.ts`. It collects the packages behind every module in the bundle's chunks, in the MapLibre worker's separate bundle, behind every bare `@import` in the app's own stylesheets, and in `VENDORED_FILES` (Swagger UI, copied by the Dockerfile), and writes each package's own LICENSE, LICENCE, COPYING and NOTICE files, plus a vendored bundle's `<file>.LICENSE.txt`.
- The runtime stage runs `backend/scripts/write_third_party_licenses.py` from a bind mount after `pip install`. It appends one block per installed distribution, with every file under its `.dist-info/licenses/` (or a LICENSE at the `.dist-info` root for an older wheel), found through the RECORD.
- A package with no license text fails the build, in either stage. For an npm package that ships none, the text is copied from its own repository into `frontend/plugins/licenses/<name>.txt`; today that is `victory-vendor` alone.
- The Dockerfile also copies the repository's `LICENSE` to `/app/LICENSE`, and Swagger UI's `LICENSE`, `NOTICE` and `swagger-ui-bundle.js.LICENSE.txt` beside its two files.
- `NOTICES.md` stays the human summary and points at the served file for the complete list.

The path is a plain static file under the mount, so no route and no chart change are needed: the chart's gateway allowlist filters `/api` paths only, and every other path rides the stable route to the pod.

## Evidence

Measured 2026-10-01 on a local build of this change against `main` (6a2ee5c), Docker 29.7.2:

- The file holds 30 npm packages and 25 Python distributions, 201,704 bytes, served `200 text/plain; charset=utf-8`. The npm list is what ships, not what the lockfile names: the issue counted 68 runtime packages in the lockfile, and the bundle's module graph reaches 28 of them plus `tailwindcss` (through the stylesheet) and `swagger-ui-dist` (vendored). The MapLibre worker bundle's graph is `maplibre-gl` alone.
- One npm package shipped no text: `victory-vendor` 37.3.6 (MIT AND ISC), which recharts imports. Every installed Python distribution ships one; `httpx` 0.28.1 declares no `License-File` header but has its text under `licenses/`, which is why the RECORD is read rather than the header.
- Image content size 39,279,144 bytes before, 39,331,136 after (+52 KB). Cold `docker build --no-cache` with warm npm and pip cache mounts, three runs each: 12.0, 13.8 and 16.5 s before, 13.9, 15.5 and 16.2 s after, inside the run-to-run spread.
- The cold load is unchanged: every hashed asset name in `dist/assets/` is identical before and after, and three Lighthouse runs each gave 638,240 total bytes, performance 76 to 77 and accessibility 100 on both.
- Trivy over both images with the repository's `trivy.yaml`: the same two targets (alpine and Python) and no finding on either. The file is plain text, so no scanner reads it as an SBOM, which is how pip's `bom.cdx.json` once surfaced as image CVEs.

## Alternatives rejected

- Serving `NOTICES.md` and linking it (#571 option B). It holds no license texts, so it does not meet the terms.
- Vite 8's built-in `build.license`. It reads the main bundle's module graph, which is the right source, but it never sees the worker bundle or the stylesheet imports, and it writes a package with no license file without its text and without a warning.
- `rollup-plugin-license` or a similar dependency. Another devDependency to keep current for the hundred-odd lines this needs, with the same three gaps to fill on top.
- Listing packages from `package.json` or the lockfile (`license-checker`, `pip-licenses`). Most of the lockfile is build tooling that never ships, and a dependency's own dependencies reach the bundle without being named anywhere; a list read from the lockfile is both too long and unprovable.
- An SPDX or CycloneDX JSON file. Trivy reads any SBOM it finds as image inventory, so a generated one would become the scanner's view of the image.
- Writing a package with no text as a name only. That is the notice that looks complete and is not.

## Consequences

The Docker Build job enforces it: the build fails when a bundled or installed package has no text, and its smoke test fails when the file is not served, when it does not name every direct dependency in `frontend/package.json` and `backend/requirements.txt`, when Swagger UI's bundle notice does not answer, or when `/app/LICENSE` is missing. `frontend/plugins/thirdPartyLicenses.test.ts` holds `VENDORED_FILES` to the Dockerfile's COPY lines and fails once a package in `plugins/licenses/` ships its own text; `backend/tests/test_third_party_licenses.py` holds the Python half.

A Dependabot bump that brings in a package with no license file fails that PR's Docker Build until someone copies the text upstream, which is a few minutes of work and a deliberate stop. The served file lags nothing: it is rebuilt with every image. The base image's OS packages and the Python interpreter are not in it; they ship with their own files from the base image and are covered by the release's SBOM attestation.
