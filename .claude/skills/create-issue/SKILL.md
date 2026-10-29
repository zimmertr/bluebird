---
name: create-issue
description: File a GitHub issue on this repo with a plain two-sentence summary on top, the board's six-section body written for its two readers and run through the hemingway and humanizer skills, and the required labels. Use whenever asked to file, create, or open an issue (a bug, a feature, a decision, or a task), or to convert findings into issues.
---

# Creating an issue

## Step 1: confirm the request

Never file an issue the maintainer did not ask for. If the idea is yours,
propose it and get an explicit yes first. This includes follow-up issues
discovered mid-task.

## Step 2: keep technical names exact

- File paths, functions, API names, and label names are technical names. Write
  them exactly as they appear in the code.
- Quote UI strings, commands, and code verbatim.
- Use one name for one thing. Do not alternate synonyms.
- Use no em dashes.

## Step 3: open with a plain summary

The body opens with a `## Summary` heading, the summary, and a horizontal
rule (`---`) that closes it off from the six sections below. It is the only
part of the issue most readers see on the board, so it carries the whole point.

- Two sentences, three at most. No bullets, no file paths, no line numbers,
  no code spans.
- Sentence one: what is wrong, in words a hiker who does not read code would
  follow. Sentence two: what changes when the issue is closed. An optional
  third: why it matters now.
- Write it last, after the six sections, so it summarizes what is actually
  in the issue. Then place it first.
- The summary is the one place plain
  language beats precision: say "the app shows the browser's own error text"
  rather than naming the exception.

Example, for an issue about a bare `fetch`:

```markdown
## Summary

When the server cannot be reached, the app shows the browser's own error
text instead of one of ours. After this change every network failure shows
an approved message, and one shared helper handles every request.

---

## Problem
```

## Step 4: use the six sections, in this order

This list is the skeleton; write the sections from it directly. Every issue
carries at least:

1. **Problem**: what is wrong or missing, with verified facts. State
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

## Step 5: write for the reader, then cut, then strip the AI tells

An issue has two readers: a person on the board who may not read code, and
the agent that implements it. The body is done when each follows their part
on one read. Three things get it there, in this order.

**Write every section to the reader checklist.**

- Each section opens with its conclusion. The evidence follows it.
- One idea per sentence, and no sentence much past 25 words.
- A term, an acronym or a module name is explained the first time it
  appears. The second time it stands alone.
- The Problem says what a reader would see before it says how that was
  measured.
- Notes for a human reads on its own, without the Implementation Plan
  beside it.

**Run two passes over the whole body, summary and all six sections, once
the summary is placed first.** Both change prose only, and short issues take
them too.

1. `hemingway` first. It cuts words, and shorter is the biggest lever on
   comprehension. Take its trimmed version. Put back any cut that dropped a
   fact, a number or a qualifier that changes the meaning.
2. `humanizer` second, in embedded mode, on the trimmed text. It strips the
   AI tells from what survived. Apply every fix it returns.

After both, check the technical names against the draft: file paths,
function names, quoted UI strings, commands, code spans, label names and
issue numbers stay exactly as Step 2 wrote them. Wording the maintainer
dictated stays as dictated; both skills exempt quotations and proper names.

**Read it back as each reader before filing.** Read the Summary and the
Problem as the hiker, and the Implementation Plan and the agent notes as the
implementing agent. If either reader would have to look something up, fix
that before filing.

An edit to an existing issue takes the same three steps before
`gh issue edit`.

## Step 6: title

One short statement of the problem or the task, with no
conventional-commit prefix. Example: "A caller can defeat the per-client rate
limit with one header".

## Step 7: labels

Always add labels when you create the issue:

- Exactly one priority: `P1` (do next), `P2` (soon), or `P3` (someday). Add
  one every time, also when the maintainer asks for `PM`.
- `PM` means Priority Manual. Add it only when the maintainer asks for it in
  the request. It is one more label, not a replacement for the priority.
- The current Claude Code session ID, always. The ID is the UUID directory
  above `scratchpad` in the session's scratchpad path. Create the label first
  when it does not exist:
  `gh label create <uuid> --color 5ec3f7 --description "Filed in Claude Code session <uuid> (<date> <topic>)"`.
- Every area that applies: `frontend`, `backend`, `ci`, `kubernetes`,
  `security`, `compliance`, `ux`, `infra`, `data-sources`, `docker`.
- One type: `bug`, `enhancement`, `documentation`, or `question`.

## Step 8: verify before you write

- Verify file references and measured numbers against a fresh clone before you
  state them. Write "near line N" only when just verified; otherwise name the
  file and the function.
- Name related issues by number, and state a blocking relation explicitly.
