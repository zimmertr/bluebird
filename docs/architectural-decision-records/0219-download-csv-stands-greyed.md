# 0219. Download CSV stands greyed when there is nothing to download

- Status: Accepted. Amends [0209](0209-shift-range-and-standing-reset.md): the rule it set for Removed reaches Download CSV.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #796: "Why does Download CSV disappear when there's nothing to download? Why not just disable the button? Similar to what we do with the Removed button now?"
- Issues and PRs: #795, #796
- Cited in code as: none; `ResultsBar.tsx` cites the record by number
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsSheet.tsx`/`ResultsBar.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), the results bar

## Context

Record 0209 made Removed stand greyed at zero rather than hide. Download CSV kept its old rule and was drawn only while a row could be downloaded, so a report emptied by removals, bounds that admitted no row, or an analysis that found nothing left the bar a button short, against the rule the bar states for Columns, that keeping its members is what makes it read as one control surface (#242).

## Decision

Download CSV stands whenever Columns does and is greyed (`DISABLED`) until there is a row to download.

## Evidence

None measured; the rule is 0209's, applied to the last member that did not follow it.

## Alternatives rejected

- **Hiding it at zero**, as it did: the bar lost its last member in the states where a reader is most likely to look for what changed.

## Consequences

`ResultsBar.test.tsx` holds the button greyed before a row and live with one, and the group's member count. The linter's `style-results-bar` check accepts `ACTION_ITEM` with `DISABLED` beside it.
