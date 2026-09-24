# 0029. An archive window disables the model picker instead of hiding it

- Status: Accepted
- Date: 2026-09-13 (git: the merge of #334)
- Decider: TJ (git: author and merger of #334)
- Issues and PRs: #123, #334
- Cited in code as: #123
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/components/ModelPicker.tsx` bullet, from "It takes a `disabled` prop"

## Context

An archive window sends no model (see [0027](0027-archive-endpoint-seam.md)).

## Decision

`ModelPicker` takes a `disabled` prop for an archive window and wears `DISABLED` rather than disappearing. A window that crosses the boundary keeps the picker, because its forecast half is the chosen model's. An info line under Analyze says why the picker is faded.

## Evidence

The reason was a `title` on the trigger until 2026-09-14, out of reach of every touch reader.

## Alternatives rejected

- Hiding the control: it takes its label and its last value with it.
- A `title` on the trigger: no hover on touch.

## Consequences

The archive-model line is one of the `windowMessages` under Analyze: see [0028](0028-notices-below-analyze.md).
