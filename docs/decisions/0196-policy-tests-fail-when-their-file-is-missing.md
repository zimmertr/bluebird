# 0196. A backend test that reads a file outside `backend/` fails when it cannot see it, rather than skipping

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #690, 2026-10-18, answering the audit's question on the "repo root not visible" skips: they become failures, and `test_workflow_pins.py` fails on an empty file list. The CSP host check, which the question did not name, joined them as the same shape.
- Issues and PRs: #690, #PRNUM
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Development commands; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), Tests and Checks, "Every container mounts the repo root"

## Context

Several backend tests hold files outside `backend/` to a rule: the workflows' pinned actions, the `Dockerfile`'s digests and its `apk upgrade` layer, the Node major, the lockfiles, the license notices, and the hosts `frontend/src` fetches. Each skipped itself when the repo root was not mounted. A run from `backend/` alone therefore passed every one of those rules unread, and `test_workflow_pins.py` passed on an empty list of workflows.

## Decision

- Every such guard is gone. A missing file fails its test with an error that names the path.
- `test_workflow_pins.py` fails when it finds no workflow at all.
- The CSP host check in `test_security_headers.py` asserts that `frontend/src` is there before it reads it.

## Evidence

Counted 2026-10-18 at the audit's head: eleven "repo root not visible" skips in seven files (`test_node_version.py`, `test_release_scan.py`, `test_release_titles.py`, `test_notices.py`, `test_apk_upgrade_layer.py`, three in `test_workflow_pins.py` and three in `test_dependency_lock.py`), where the question had named five, and the CSP check's `skipif` in `test_security_headers.py`. Run from a copy of `backend/` with no repo root, each of the eleven failed naming the missing path; the CSP check's assertion names `frontend/src`. Both supported runs see the whole tree: `make test-backend` mounts the repo root, and the `pr.yml` backend job checks out the repository and runs pytest from `backend/`.

## Alternatives rejected

- **Keep the skips.** A green run then said nothing about the rules it skipped.

## Consequences

Running pytest without the repo root now fails, loudly and by path, instead of passing quietly.
