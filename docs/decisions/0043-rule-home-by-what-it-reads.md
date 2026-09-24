# 0043. A rule lives where the thing it needs to read is

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #411)
- Decider: TJ (git: author and merger of #411)
- Issues and PRs: #379, #411
- Cited in code as: #379
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc", from "Where a rule lives is decided by what it needs to know"

## Context

The style checks were Vitest files that imported a source with `?raw` and searched its text. Such a check runs only under `npm test`, names a failing `it` rather than a line, and cannot tell code from a comment about it (the head comment of `frontend/tools/eslint/plugin.js`).

## Decision

A ban that a pattern over class names can settle is an ESLint rule in `frontend/tools/eslint/`, where it runs in the editor and reads string literals rather than a file's bytes. A check that measures something (a contrast ratio, a pixel sum, a width read off a role, a count of approved tooltips) stays in `styles.test.ts`.

## Evidence

No dated measurement.

## Alternatives rejected

- Every check as a `?raw` text test.

## Consequences

A class name in a comment is prose about a rule, not a violation of it. ESLint is a package of its own: see [0030](0030-tools-own-packages.md).
