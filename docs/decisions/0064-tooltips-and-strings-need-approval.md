# 0064. A tooltip or a user-facing string needs the maintainer's approval

- Status: Accepted
- Date: 2026-08-05 (git: the rule first appears in the guide in #248)
- Decider: TJ, the maintainer (the guide: "Two of them are not yours to decide")
- Issues and PRs: #242, #248
- Cited in code as: #242
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc", from "Two of them are not yours to decide"

## Context

Every label, message, legend line and button in the app has been read and approved, which is why they are consistent; #242 audited every user-facing string. A tooltip does not exist on touch.

## Decision

Never add a tooltip without asking the maintainer first; recommending one is welcome. Never add or reword a user-facing string without confirming it first.

## Evidence

No measurement. A phone reader loses whatever a tooltip carries. A string invented in the middle of a change is the one thing code review reliably misses.

## Alternatives rejected

- A tooltip added unasked: it is invisible on touch.
- A string written during a change and left for review to catch: review reliably misses it.

## Consequences

`styles.test.ts` counts the approved tooltips, so a new one fails until it is approved. Where the app does carry a `title`, it has a hidden twin that `aria-describedby` names (see [0016](0016-overlays-not-knobs.md)). The copy rules are in `docs/STYLES.md`.
