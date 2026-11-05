# 0272. The create-issue skill is shared from zimmertr/ai-config, and this repo's reader, gates, constraints and areas live in CLAUDE.md

- Status: Accepted
- Date: 2026-11-05
- Decider: the maintainer (TJ), 2026-11-05: "Lets move create-issue skill to it as well. Raise a PR to bluebird and hevy trainer repos deleting the create issue skill."
- Issues and PRs: zimmertr/ai-config#1, zimmertr/hevy-trainer-sync#38, this PR
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Filing issues

## Context

This repo and zimmertr/hevy-trainer-sync each kept a copy of `create-issue` in `.claude/skills/`. The two copies shared one flow and had already drifted: this copy had the summary example and the reader checklist, and the other had neither.

## Decision

The skill lives once, in `claude/skills/create-issue/` of zimmertr/ai-config, linked into `~/.claude/skills`, and this repo's copy is deleted. The shared copy is this one with its Bluebird specifics taken out. It reads four things from the Filing issues section of the root `CLAUDE.md`: who reads the summary, the gates every Acceptance Criteria list includes, the constraints for the agent notes, and the area labels. Those four are this copy's own, moved there unchanged.

## Evidence

- 2026-11-05: a diff of the two copies showed one flow and different examples, gates, constraints and areas, with 147 lines here and 108 in hevy-trainer-sync's.

## Alternatives rejected

- A copy per repo: they drift, as the diff showed.
- A plugin marketplace now: planned in zimmertr/ai-config's issues. A user-level skill works today.

## Consequences

Filing an issue here needs the skill installed at user level. Changing the flow is a PR to zimmertr/ai-config; changing this repo's reader, gates, constraints or areas is a change to `CLAUDE.md`.
