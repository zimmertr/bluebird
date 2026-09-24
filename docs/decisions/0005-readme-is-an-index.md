# 0005. The README is an index and the prose lives in docs/

- Status: Accepted
- Date: 2026-07-29 (git: the merge of #192)
- Decider: TJ (git: author and merger of #192)
- Issues and PRs: #113, #192, #196
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Documentation, the opening paragraph and the convention "Never restate a numeric limit that `GET /api/capabilities` publishes"

## Context

The README had grown to 560 lines. Prose copies of the numeric limits drifted from the code.

## Decision

The README is an index, not a manual. It carries the Summary, How It Works, Quick Start, the docs table, Support and License, and nothing else. Anything longer than a paragraph belongs on a page in `docs/`. No page restates a numeric limit that `GET /api/capabilities` publishes: it describes the shape and the reasoning and points at the endpoint.

## Evidence

The split found three copies that had already drifted: the polygon cap, max results, and the CAMS grid.

## Alternatives rejected

- One README for everything: 560 lines, and copies of limits that drift.

## Consequences

The Documentation table in the root `CLAUDE.md` says which page owns which topic (#196). Nothing enforces the rule against restating a limit; review does. The records in this directory follow it: a published limit is dated history here.
