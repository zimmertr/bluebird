# 0288. The List search field reads Select a list until something is picked

- Status: Accepted. Amends [0263](0263-coordinate-search-loads-preset-lists.md) (what the field reads while the box is shut)
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12
- Issues and PRs: #917
- Cited in code as: record 0288
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` and `Menu.tsx` bullets; [`docs/USAGE.md`](../USAGE.md), List search

## Context

Record 0263 had the field read `Coordinate list` while the box is shut, because the field had lost its visible label and had to say what it was. Record 0286 then put the `List search` subheading over the row, so the field's name stood right under a heading that already says it. The maintainer found it awkward.

The common pattern for a dropdown with nothing picked is a short prompt in the field, a verb and what is chosen, with the field's name in its label: HTML's own select prompt ("Select..."), "Select a country" on any address form. GOV.UK and Material both warn against a placeholder that does a label's work. Map search's field already reads a prompt, `Search for a destination`.

## Decision

- **The field reads `Select a list` while nothing is picked.** The list's name and `Custom coordinates` are unchanged.
- **A screen reader hears the field by its name alone at rest.** `MenuBrowse` names the field by its `label` (`Coordinate list`) while it shows its placeholder, and by the label and its value after a pick, so the prompt is never read as if it were a pick.
- The maintainer chose `Select a list` over `Choose a peak list`, `Pick a peak list` and keeping `Coordinate list`.

## Consequences

- The phone sheet's heading and the field's accessible name stay `Coordinate list`.
