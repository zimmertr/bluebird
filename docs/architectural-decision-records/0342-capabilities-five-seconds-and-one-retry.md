# 0342. `/api/capabilities` gets five seconds and one retry

- Status: Proposed, in the reliability PR; accepted when the maintainer merges it.
- Date: 2026-11-25
- Decider: the maintainer, in the reliability plan's mitigation 4 ("`/api/capabilities` given 5 s, one retry and a last good copy")
- Issues and PRs: #152, #393, #1001
- Cited in code as: record 0342
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useCapabilities.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `apiFetch.ts`; [`docs/RELIABILITY.md`](../RELIABILITY.md), Mitigations

## Context

The browser asked `GET /api/capabilities` once per session, with the 110 s `API_DEADLINE_MS` and no retry (audit of main at 86e397f6, 2026-11-25). A shared link that runs on open waits for that answer or its failure, so a pod that hung held the link for 110 s. One failure left the whole session on the compiled stand-ins: one model in the picker and the ring count off.

## Decision

- Each ask gets `CAPABILITIES_DEADLINE_MS`, 5 s, through a `deadlineMs` that `apiFetch` and `apiJson` now take.
- Any failure but a cancel is asked once more, at once. Two failures settle on the compiled stand-ins as one did before.
- The last good answer kept in local storage, ahead of the stand-ins, is part of the plan and is not built here: a new key has to be named on the privacy page, whose wording needs the maintainer's approval first.

## Evidence

- 2026-11-25: the pod answers this route from memory and Cloudflare holds it for 60 s (`public, max-age=60`, `docs/TRAFFIC.md`), so a healthy answer takes milliseconds and 5 s is only reached by an origin that is not answering.

## Consequences

- The longest a shared link can be held by this call is 10 s, down from 110 s.
- A retry costs one more request to a route the edge caches, only on a failure.
