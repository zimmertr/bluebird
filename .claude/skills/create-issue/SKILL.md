---
name: create-issue
description: File a GitHub issue on this repo in the board's six-section Simplified Technical English format, with the required labels. Use whenever asked to file, create, or open an issue (a bug, a feature, a decision, or a task), or to convert findings into issues.
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

## Step 3: use the six sections, in this order

The skeletons live in `.github/ISSUE_TEMPLATE/proposal.md` and `bug.md`.
Every issue carries at least:

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

## Step 4: title

One short STE statement of the problem or the task, with no
conventional-commit prefix. Example: "A caller can defeat the per-client rate
limit with one header".

## Step 5: labels

Always add labels when you create the issue:

- Exactly one priority: `P1` (do next), `P2` (soon), or `P3` (someday).
- **Never add `PM`.** It means Priority Manual, and only the maintainer sets it.
- Every area that applies: `frontend`, `backend`, `ci`, `kubernetes`,
  `security`, `compliance`, `ux`, `infra`, `data-sources`, `docker`.
- One type: `bug`, `enhancement`, `documentation`, or `question`.

## Step 6: verify before you write

- Verify file references and measured numbers against a fresh clone before you
  state them. Write "near line N" only when just verified; otherwise name the
  file and the function.
- Name related issues by number, and state a blocking relation explicitly.
