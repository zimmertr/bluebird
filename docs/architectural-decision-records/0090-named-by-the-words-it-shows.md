# 0090. A control is named by the words it shows, and a sentence about where it goes is its description

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #575 (option A) and #576 item 7
- Issues and PRs: #575, #576, #322, #261
- Cited in code as: #575
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsTableRow.tsx` bullet

## Context

#322 (closing #261) gave every metric cell's Windy link the label `Open {name} on Windy. Opens in a new tab.`, on the belief that the bare link announced as "link, 0.0000". The link text was already its name. The label replaced it, so a screen reader reading the table heard the destination's name in place of every number, a links list could not tell a row's links apart, and voice control could not match "click 11.5" (WCAG 1.3.1, 4.1.2, 2.5.3). The results bar's Removed and Download CSV carried labels without the words on the button for the same 2.5.3 reason.

## Decision

The metric link carries no `aria-label`, so its value is its name. The existing sentence, unchanged, is its description: one `SR_ONLY` copy per row, in the row's `aria-hidden` filler cell, the way the header's filler holds the sort hint. Removed and Download CSV lose their labels, so the words on them are their names. The linter's `new-tab-anchors-named` check fails a label that returns to the metric link.

## Evidence

The review computed the names with `dom-accessibility-api` on 2026-10-01: the link showing `11.5` and its cell were both named by the sentence; without the label, both are named `11.5`. The new test finds the link by its value through Testing Library's role query, which computes the name the same way.

## Alternatives rejected

- Drop the sentence with the label (#575 option B). The reader would lose the new-tab warning.
- A label holding both the value and the site. A new string, and the value would still have to be spelled twice.

## Consequences

The description follows the value on every cell a keyboard tabs through. "Both" keeps a label, because the word is hidden on a phone and the button would otherwise have no name there; the label now holds the word ("Show both chart and table", approved by the maintainer).
