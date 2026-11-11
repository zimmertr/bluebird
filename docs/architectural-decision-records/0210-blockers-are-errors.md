# 0210. Every blocker is an error

- Status: Accepted. Reverses the blocker severities set on 2026-08-22 and 2026-09-14, which had no record.
- Date: 2026-10-21
- Decider: the maintainer (TJ), on the review of PR #789: asked whether the messages that block Analyze should be a level of their own in red, and chose all eight blockers red.
- Issues and PRs: #786, #789, #579
- Cited in code as: record 0210
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every message is in the one list the Analyze button opens"; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `notices.ts`

## Context

The panel's messages come in three severities, one box each: error, warn and info. The eight reasons the gate can hold Analyze up spoke from all three. An oversized ring was an error, because it rejects finished work (TJ, 2026-08-22). The two comparison blockers were warnings, because they report a contradiction in settings already made (TJ, 2026-09-14). The other five were information, because each reports an input still to give: no destination, a ring short of points, a ring with no type, no day picked, and a window nothing serves.

Record [0208](0208-analyze-button-counts-the-messages.md) put a count of the messages on the Analyze button in the worst severity's colour. A blocker is the one kind of message that holds the button up, so a reader who opened the app with nothing named saw a greyed button under a blue badge, the colour that elsewhere means nothing is wrong. The maintainer read the blockers as a level of their own and asked for them in red.

## Decision

- **All eight blockers speak from the error box** (`BLOCKER_SEVERITY` in `notices.ts`). A greyed button's badge reads red before the list is opened, whatever the reason.
- **No fourth level.** Error already means the app cannot or will not do what was asked, and a held-up button is that. A fourth box would be a fourth hue in a list whose hues each carry one meaning (record [0009](0009-no-hue-in-components.md)).
- **The ring line stays information.** A finished ring with no type ticked, beside a pasted list or a searched place, blocks nothing: Analyze runs the other inputs. It says the types blocker's sentence to explain why the ring adds nothing (#579), and it borrowed the blocker's severity. It is now `info` in its own right, so the badge does not read red over a button that runs.
- **The table stays a table.** Every value is the same, but `blockerOf` reads its keys, and its type holds it to every blocker the gate names.

## Evidence

The maintainer's question and answer on PR #789, 2026-10-21. The eight blockers and their sentences are `blockerText` in `panelMessages.ts`.

## Alternatives rejected

- **A fourth severity for blockers** in red, beside an error box also in red: two boxes in one colour, read as one by every reader.
- **The three severities kept**, the oversized ring alone red: the greyed button under a blue badge is the failure this record fixes.

## Consequences

The error box gathers the run error, every blocker, the failed supplier checks, the failed basemap and the refusal, in that order. A first load with nothing named opens on a red badge with a count of one. The tests that pinned the old table (`notices.test.ts`, `panelMessages.test.ts`) pin the new one, and the panel's test shows each blocker counted in the error colour.
