# 0001. The image runs on Alpine, not Debian slim

- Status: Accepted
- Date: 2026-07-25 (git: the merge of #99)
- Decider: TJ (git: author and merger of #99)
- Issues and PRs: #99
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the "Stage 2" line of the Docker build

## Context

The runtime image is the second stage of a multi-stage build. A Debian slim base carries CVEs that Debian marks as no-fix, so they never clear from a scan.

## Decision

Stage 2 is `python:3.14-alpine`. It runs uvicorn and serves the built SPA as static files at `/`.

## Evidence

The guide gives the reason and no measurement: the shipped image carries none of Debian's perpetual no-fix CVEs. #99 is titled "alpine base image (zero-CVE) and Trivy image scanning in CI".

## Alternatives rejected

- Debian slim: its no-fix CVEs stay in every scan for good.

## Consequences

CI builds the image and scans it with Trivy (#99). A base image change is a CVE change, so it shows in that scan.
