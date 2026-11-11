# 0282. A coordinate list's name is title case, the one exception to sentence case

- Status: Accepted
- Date: 2026-11-05
- Decider: the maintainer (TJ), on issue #848
- Issues and PRs: #848, #893
- Cited in code as: #848
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, the design system bullet's copy rules; [`docs/STYLES.md`](../STYLES.md), Sentence case

## Context

Every string in the app is sentence case. Issue #848 brings 74 peak lists into the Coordinate list menu, and the drafts of their names followed the rule: `US state high points`, `Washington fire lookouts`. Most of the lists are a club's or an author's own, and their owners write them as titles: The Bulger List, New Hampshire 52 With a View.

## Decision

- **A list's `name` in `frontend/src/coordinate-lists/lists.json` is title case.** `US State High Points`, `Washington Fire Lookouts`, `Colorado 14ers`.
- **An owner's own spelling stands**: `New Hampshire 52 With a View` keeps its capital `With`.
- **States are spelled out, and a list's jargon stays** (`14ers`, `P2K`, `Ultras`).
- **No name carries a count.** Two lists that differ by who counts them share a name and take the counter after a spaced hyphen: `Colorado 14ers` and `Colorado 14ers - 14ers.com`, `California 14ers` and `California 14ers - Porcella & Burns`.
- **Nothing else changes case.** Region headings, descriptions, `Starred`, `Custom coordinates` and every other string in the app stay sentence case.

## Evidence

The maintainer asked for title case on 2026-11-05 ("It looks better") and approved all 74 names in it the same day, on the approval sheet https://claude.ai/artifact/8SUxWXJX3onzk8AkbueEgV (private). The twins' names are the maintainer's own wording.

No check reads `lists.json` for sentence case (checked 2026-11-10): the tests that assert sentence case each name one string of their own.

## Alternatives rejected

- **Sentence case names**, as the drafts were: consistent with the app, and unlike how any of these lists is written by the people who keep it.
- **Counts in the twins' names** (`Colorado 14ers (53)` and `(58)`): a count in a name goes stale when a survey moves a summit, and every row already ends in its peak count.

## Consequences

Nothing enforces a name's case. The maintainer approves each name before it lands (record 0064), and `presetLists.test.ts` holds each to being unique. A reader sees title case in the menu's rows and in the field after a pick, beside sentence case headings.
