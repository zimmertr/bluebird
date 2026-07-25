# Security Policy

## Supported Versions

Bluebird is a rolling-release web application. The only supported version is the
latest release, which is what runs at [bluebirdforecast.com](https://bluebirdforecast.com)
and is published as the newest `zimmertr/bluebird` tag on Docker Hub. Older image
tags remain pullable for rollback but do not receive security fixes.

| Version                  | Supported          |
| ------------------------ | ------------------ |
| Latest release (live)    | :white_check_mark: |
| Older image tags         | :x:                |

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub:
[Report a vulnerability](https://github.com/zimmertr/bluebird/security/advisories/new).
Do not open a public issue for security problems.

In your report, include what you found, where it lives (URL, endpoint, or file),
and steps to reproduce it. A proof of concept helps but is not required.

What to expect:

- **Acknowledgement** within a few days. Bluebird is a solo-maintained free
  project, so response times are best effort.
- **Assessment and fix**: confirmed vulnerabilities are fixed in the next
  release, prioritized by severity. The release pipeline deploys to production
  automatically, so fixes go live as soon as they merge.
- **Credit**: reporters are credited in the advisory and release notes unless
  they prefer otherwise.

## Scope

In scope: this repository (the FastAPI backend, React frontend, and Docker
image), the deployment at bluebirdforecast.com, and the CI/CD workflows.

Out of scope: the third-party services Bluebird calls (OpenStreetMap/Overpass,
Open-Meteo, OpenFreeMap, Nominatim, NIFC). Report issues in those services to
their maintainers. Denial-of-service findings that only show the free upstream
APIs can be rate-limited are also out of scope.

Bluebird stores no user accounts or personal data, so there is no bounty
program. Reports are still very much appreciated.
