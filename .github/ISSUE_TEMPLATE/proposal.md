---
name: Proposal
about: A feature, fix, or decision, scoped to one deliverable PR
title: ''
labels: ''
assignees: ''
---

<!-- Write in ASD-STE100 Simplified Technical English: short sentences, active
voice, one instruction per sentence, one name for one thing, American spelling,
no idioms. The title is one short statement of the problem or the task. -->

## Problem Summary

<!-- What is wrong or missing, with verified facts. State what was measured and
how. Name files and functions. -->

## Proposed Solutions

<!-- Lettered options. Give each option Good and Bad bullets. End with one
recommendation line. State a settled decision as settled, with who decided and
when. -->

## Implementation Plan

<!-- Numbered imperative steps. Name the file and the function for each step.
Stay high level: detailed design belongs to the implementing session. -->

## Acceptance Criteria

<!-- Plain bullets a reviewer can verify. Repo gates that may apply: both test
suites pass inside Docker; backend/openapi.json regenerated on contract
changes; weather vectors regenerated on aggregation changes; the owning
docs/ page updated in the same PR. -->

## Notes for an AI agent

<!-- The guardrails and traps an implementing agent must know. Examples: tests
run only inside Docker; metrics.ts and styles.ts are the only sources for
names and styles; new user-facing text needs the maintainer's approval. -->

## Notes for a human

<!-- The decisions that are the maintainer's, the provenance (review finding,
TODO, conversation), the risks, and any open questions. -->

<!--
Optional extra sections (for example, Out of scope or Measured) go between
Acceptance Criteria and the Notes.

Labels to apply before submitting:
- Priority (required, exactly one): P1 (do next), P2 (soon), P3 (someday)
- Never PM: it means Priority Manual, and only the maintainer sets it
- Areas: frontend, backend, ci, kubernetes, security, compliance, ux, infra, data-sources, docker
- Type: enhancement, bug, documentation, or question
Style: no em dashes anywhere in issue copy.
-->
