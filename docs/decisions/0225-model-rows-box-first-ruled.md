# 0225. The model list's rows lead with their box, part by a hairline, and light for a mouse or the keyboard only

- Status: Accepted
- Date: 2026-10-22
- Decider: the maintainer (TJ), on #801, choosing option A from mockups on the real build in both themes, at a desk and on a phone, over spacing alone
- Issues and PRs: #801
- Cited in code as: #801
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ModelPicker.tsx` bullet; [`docs/STYLES.md`](../STYLES.md), `MODEL_ROW`; [`docs/USAGE.md`](../USAGE.md), the model picker

## Context

Each row of the model list is a name, two figures and a sentence or two of grey italics. The eight rows had nothing between them, so on a phone they read as one paragraph. The checkbox ended each row at the right edge, where Columns and Layers put theirs first. The grey fill was the list's cursor: it stood on the ranking row from the moment the list opened and moved to whatever row a pointer entered, a finger's tap included. At a desk it read as the selection following the mouse, and on a phone it stayed on the last row tapped.

## Decision

- The checkbox leads each row (`MODEL_ROW`).
- A hairline (`SURFACE_DIVIDER`) parts each model from the next, with 8px over and under each row.
- Every name is semibold. The ranking model no longer differs by weight: it is the one under the Ranking chip, with its tick fixed.
- The raised fill follows a mouse (`MENU.hover`) and the keyboard's cursor while the list shows its focus ring (`MODEL_ROW.keys`, through `group-focus-visible/list`). A finger never lights a row, and only a mouse moves the keyboard's cursor.

## Evidence

Checked on the PR #796 preview at a15b9b2 on 2026-10-22, at 1440x900 and in an iPhone 13 viewport, and drawn as mockups on a local build of main (0f121ea).

## Alternatives rejected

- **Spacing alone** (option B): the hairlines and the room, with the box kept at the right and the weights kept. The box stayed where no other menu puts it, and the names still competed with the summaries.

## Consequences

`styles.test.ts` holds the row's rule, padding and fills. `ModelPicker.test.tsx` keeps the keyboard model (`aria-activedescendant` on the listbox, the box `aria-hidden` and out of the Tab order) unchanged.
