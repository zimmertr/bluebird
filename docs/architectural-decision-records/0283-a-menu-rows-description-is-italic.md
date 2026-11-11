# 0283. A menu row's description is one italic role, and the Coordinate list field repeats none under it

- Status: Accepted. Supersedes [0281](0281-coordinate-lists-in-a-manifest-and-a-browsing-menu.md) in part (the description under the field after a pick, and a description set at the micro step in the mid ink)
- Date: 2026-11-11
- Decider: the maintainer (TJ), on issue #848
- Issues and PRs: #848
- Cited in code as: record 0283
- Guide: [`docs/STYLES.md`](../STYLES.md), the `MENU` and `MENU_BROWSE` rows and the enforcement table; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet

## Context

Record 0281 shipped a coordinate list's description in three places: behind each row's info button, under each search result, and under the Coordinate list field after a pick. The menu set it upright at 11px in the mid ink, a step under the list's name and in nearly the same ink, so a description read as a second name. The model list sets the sentence under each model's name in italic (`TEXT.helper`, 12px), under a semibold name.

After #893 released, the maintainer found the line under the field awkward, between the field and the box, and redundant with the info button. The maintainer also asked for descriptions that stand apart from the names in the menu, and for the two menus to stay alike from here on.

## Decision

- **The Coordinate list field shows no description under it.** A list's description lives in the menu alone: behind its row's info button, and under each search result.
- **The sentence under a menu row's name is one role, `MENU.description`**: italic, at the 11px step, in the caption's soft ink, on no ground of its own. The model list's summaries and the coordinate lists' descriptions both wear it, through `MODEL_ROW.description` and `MENU_BROWSE.description`.
- **A list's name stays regular weight.** Semibold in that menu already marks the picked list and a region's heading.
- **The model list's summary moves from 12px to 11px**, so the two menus are one treatment and not two near ones.

## Evidence

The maintainer chose the treatment on 2026-11-11 in a lab that drew both menus live in both themes: https://claude.ai/artifact/ArcViYMnBZcRwN25d7M7oS (private). The exported settings were italic, no ground, 11px, soft ink, regular names, the picked list in semibold, and the model list following the same settings.

The soft ink reads 5.56:1 on the dark card and 8.91:1 on the light (measured 2026-11-11 by `styles.test.ts`, the same pair `MENU.heading` is pinned at). 11px is the floor for a line that is read and never pressed (record 0131).

## Alternatives rejected

All were knobs in the lab.

- **Upright type**, as record 0281 shipped it: the description reads as a second name.
- **A recessed box, a tinted band or a left rule** around the description: each adds a shape to a card of short rows, and the model list would have to take the same shape under every model.
- **12px**, the model list's size until now: the maintainer chose the smaller step with both menus on screen.
- **Semibold list names**, everywhere or only over a shown description, to match the model list's names: weight would no longer mark the picked list, and a list's name would weigh the same as the region heading over it.

## Consequences

`styles.test.ts` holds both row roles to `MENU.description`, with no weight of their own, and pins its two contrast ratios. The linter's `style-menu-description` check fails `Menu.tsx` or `ModelPicker.tsx` when it sets a sentence in `TEXT.helper` itself or drops its row role's `description`. A new menu whose rows carry a sentence composes `MENU.description` in its own row role and joins that check's file list; nothing fails a menu that forgets to.

A reader who picks a list no longer sees what it is in the panel. The field names the list, and the menu's info button says the rest.
