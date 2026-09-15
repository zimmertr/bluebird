---
name: create-issue
description: File a GitHub issue on this repo with a plain two-sentence summary on top, the board's six-section Simplified Technical English body, and the required labels. Use whenever asked to file, create, or open an issue (a bug, a feature, a decision, or a task), or to convert findings into issues.
---

# Creating an issue

## Step 1: confirm the request

Never file an issue the maintainer did not ask for. If the idea is yours,
propose it and get an explicit yes first. This includes follow-up issues
discovered mid-task.

## Step 2: write in Simplified Technical English (ASD-STE100)

- Keep an instruction under 20 words. Keep a descriptive sentence under 25.
- Use the active voice. Give one instruction per sentence.
- Use one name for one thing. Do not alternate synonyms.
- Use simple tenses, and avoid -ing verb forms where a simple form works.
- Use American English spelling. Use no idioms, no em dashes, and no filler.
- File paths, functions, API names, and label names are technical names. Write
  them exactly as they appear in the code.
- Quote UI strings, commands, and code verbatim. STE applies to the prose
  around them.

## Step 3: open with a plain summary

The first thing in the body, above every section heading, is a summary a
reader can take in without opening the sections. It is the only part of the
issue most readers see on the board, so it carries the whole point.

- Two sentences, three at most. No heading, no bullets, no file paths, no
  line numbers, no code spans.
- Sentence one: what is wrong, in words a hiker who does not read code would
  follow. Sentence two: what changes when the issue is closed. An optional
  third: why it matters now.
- Write it last, after the six sections, so it summarizes what is actually
  in the issue. Then place it first.
- Keep every STE rule from Step 2. The summary is the one place plain
  language beats precision: say "the app shows the browser's own error text"
  rather than naming the exception.

Example, above the sections of an issue about a bare `fetch`:

> When the server cannot be reached, the app shows the browser's own error
> text instead of one of ours. After this change every network failure shows
> an approved message, and one shared helper handles every request.

## Step 4: use the six sections, in this order

This list is the skeleton; write the sections from it directly. Every issue
carries at least:

1. **Problem Summary**: what is wrong or missing, with verified facts. State
   what was measured and how.
2. **Proposed Solutions**: lettered options, each with Good and Bad bullets,
   ending in one recommendation line. State a settled decision as settled,
   with who decided and when.
3. **Implementation Plan**: numbered imperative steps. Name the file and the
   function for each step.
4. **Acceptance Criteria**: plain bullets a reviewer can verify. Include the
   repo gates that apply: both test suites pass inside Docker; regenerate
   `backend/openapi.json` on contract changes; regenerate the weather vectors
   on aggregation changes; update the owning `docs/` page in the same PR.
5. **Notes for an AI agent**: the guardrails and traps an implementing agent
   must know. Examples: tests run only inside Docker; `metrics.ts` and
   `styles.ts` are the only sources for metric names and styles; new
   user-facing text needs the maintainer's approval before it ships.
6. **Notes for a human**: the decisions that are the maintainer's, the
   provenance (review finding, TODO, conversation), the risks, and any open
   questions.

Optional extra sections (for example, Out of scope or Measured) go between
Acceptance Criteria and the Notes.

## Step 5: title

One short STE statement of the problem or the task, with no
conventional-commit prefix. Example: "A caller can defeat the per-client rate
limit with one header".

## Step 6: labels

Always add labels when you create the issue:

- Exactly one priority: `P1` (do next), `P2` (soon), or `P3` (someday).
- **Never add `PM`.** It means Priority Manual, and only the maintainer sets it.
- Every area that applies: `frontend`, `backend`, `ci`, `kubernetes`,
  `security`, `compliance`, `ux`, `infra`, `data-sources`, `docker`.
- One type: `bug`, `enhancement`, `documentation`, or `question`.

## Step 7: verify before you write

- Verify file references and measured numbers against a fresh clone before you
  state them. Write "near line N" only when just verified; otherwise name the
  file and the function.
- Name related issues by number, and state a blocking relation explicitly.
