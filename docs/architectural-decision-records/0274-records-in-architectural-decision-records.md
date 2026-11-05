# 0274. Decision records live in `docs/architectural-decision-records/`, the name every new project uses

- Status: Accepted
- Date: 2026-11-05
- Decider: the maintainer (TJ), 2026-11-05: "We should use ./docs/architectural-decision-records instead. Raise a PR to update this for Bluebird. Update skill to define the template and naming format that should be used."
- Issues and PRs: this PR, zimmertr/ai-config#1
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change: "A design decision gets a record"

## Context

The records lived in `docs/decisions/`. The maintainer's `initialize-project` skill (zimmertr/ai-config) sets `docs/architectural-decision-records/` as the folder every new project uses, with the same `NNNN-slug.md` names, `README.md` index and `0000-template.md`, and asked for Bluebird to match.

## Decision

The folder is `docs/architectural-decision-records/`. Nothing inside it changes: file names, numbers, the index and every record's text stay as they were, and records keep linking each other by bare file name. Every link and mention of the old path moves to the new one: the root and nested `CLAUDE.md` files, the `docs/` pages, and the source and test comments that cite a record by path.

## Evidence

- 2026-11-05: 28 files carried the old path. After the move, every relative Markdown link into the folder was resolved from its own file: 796 links, all resolving, except one that was already broken on main (below).
- Three links were already broken on main. Two are fixed here: `frontend/src/components/CLAUDE.md` linked `0243-chart-metrics-as-panels.md`, which is record 0255, and `frontend/src/utils/chart/CLAUDE.md` linked 0256 one directory short. The third, `0187-fill-heartbeat-and-pool-check.md` in `backend/CLAUDE.md`, names a record that doesn't exist (0187 is the coverage record) and is left for the maintainer.
- No code, test, workflow or build file reads the path; every mention is a link or a comment.

## Alternatives rejected

- Keeping `docs/decisions/`: Bluebird would be the one project on a different name.
- Leaving old links to redirect: GitHub does not redirect a moved folder's file links.

## Consequences

An open PR that adds a record under `docs/decisions/` needs the file moved before it merges; `git mv` keeps its history. Links from outside the repo to the old path break.
