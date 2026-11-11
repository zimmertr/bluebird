# 0127. The table's # header is a sort of its own, which the table takes only when a reader clicks it

- Status: Accepted
- Date: 2026-10-08, the maintainer's call on #698. Recorded 2026-10-13, with the change that ships it.
- Decider: the maintainer (TJ), on issue #698
- Issues and PRs: #698, #579, #242, #292
- Cited in code as: #698
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsTableHeader.tsx` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useTableView.ts` and `usePresentedReport.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tableColumns.ts` bullet; [`docs/USAGE.md`](../USAGE.md), the Metrics paragraph and the share-link paragraph

## Context

Every header in the results table sorted the rows on screen except `#`, which was a bare `<th>` with no click, no key, no `aria-sort` and no arrow. Its numbers are the ranking's own, stamped on each row before a header sort moves it ([0070](0070-table-rank-is-the-ranking.md)), so the column whose numbers are the ranking was the one that could not put the rows back in it. The only way back after a sort by Name or Elevation was to click the ranked metric's column until its direction matched the panel's Lowest or Highest, and nothing on screen said so. The maintainer found this in use on 2026-10-08.

## Decision

- The `#` header sorts like every other header: a click sorts by rank ascending, a second click reverses it, Enter and Space do the same with a held key sorting once, and it carries the arrow, `aria-sort` and the shared sort hint. Its key is `RANK_KEY` (`rank`) in `utils/tableColumns.ts`, a sort key with no column behind it, so it stays out of `ColDef`, `COLUMNS`, the drag and the resize.
- It is a sort of its own, even when the rows come out in the same order. The table opens on the ranked metric's column in the ranking's direction, and a new report or a ranking change resets to it; `#` wears the arrow only after a reader clicks it. A `#` click is never folded into the ranking's own sort: `isRankingOrder` reads it as false, and a link writes it as `tsort=rank`, with `tdesc=1` when descending.
- It sorts on the stamped `rank` (`ModelRow.rank` for a comparison's rows) with a stable sort, so a comparison's rows stay grouped under their place, the report's row first, in either direction.
- A header click still re-ranks nothing ([0003](0003-analyze-is-spend-boundary.md), the #242 review): `#` descending is a view of the same ranking, and `rankedRows` in `useTableView` stays keyed on `results` alone.

## Evidence

- Read off `main` at `3960a9f` on 2026-10-08: `ResultsTableHeader` drew `#` before the `orderedColumns.map(...)` loop with none of the loop's wiring, and `useTableView` returned the rows unsorted only while `isRankingOrder` held.
- Settled by the maintainer on 2026-10-08, as #698 records it: the table sorts by the ranked metric column by default, and by `#` only once its header is clicked, even when the order comes out the same, because they are different columns and different sorts.

## Alternatives rejected

- `#` as a reset only, setting the header sort back to the ranking's: the smallest change, with no new key and no URL change, but `#` would be the one header that does not toggle, which is the same inconsistency in a different shape.
- Normalising a `#` ascending click into the ranked metric's column, because the order matches: the arrow would land on a header the reader did not click, and the link would forget which one they chose.

## Consequences

`ResultsTableHeader.test.tsx` holds the click, the keys, `aria-sort`, the arrow appearing only after a click, and that `#` is neither a drag source nor a resize target. `useTableView.test.tsx` holds both directions, a comparison grouped in both, and the download leaving in the `#` order. `usePresentedReport.test.tsx` and `urlState.test.ts` hold the default writing no `tsort`, `#` writing `tsort=rank` in either direction, and the round trip. The header draws every sortable cell through one `sortHeader`, so the `#` header and the columns share the sort's wiring and `disabled-reason-twin` still counts one `aria-describedby` to one hint. A link a reader made after sorting by `#` ascending carries a `tsort` where one sorted by the ranked column does not, although both open on the same rows.
