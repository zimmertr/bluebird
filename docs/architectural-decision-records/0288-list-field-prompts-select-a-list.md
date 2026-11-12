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
- **A screen reader hears the heading over the field and then what the field shows**: `List search, Select a list` at rest, `List search, Munros` after a pick, `List search, Custom coordinates` over the reader's own rows. `MenuBrowse` takes the heading's id as `labelledBy`, so the reader hears only words on screen, and the name holds the words the field shows, which WCAG 2.5.3 (Label in Name) asks for. Two other names were tried: the label alone, `Coordinate list`, which axe's `label-content-name-mismatch` failed in the browser suite, and the label then the field's words, `Coordinate list, Select a list`, which passes but reads a name the screen no longer shows. The maintainer chose the heading on 2026-11-12, over reading the field's words alone, which leaves a pick as a bare list name.
- The maintainer chose `Select a list` over `Choose a peak list`, `Pick a peak list` and keeping `Coordinate list`.

## Consequences

- `Coordinate list` stays the dialog's name and the phone sheet's heading.
- The `Clear` beside the field was already named with the same heading.
