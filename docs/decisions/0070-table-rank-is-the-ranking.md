# 0070. The table's # and the CSV's Rank keep the ranking's rank after a header sort

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #579
- Issues and PRs: #579, #589, #198, #125
- Cited in code as: #579
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useTableView.ts` bullet

## Context

A header click sorts the table's rows in place. The markers and their popups keep the ranking's numbers, but the # column and the CSV's Rank counted the row's position after the sort. So after a sort by Elevation, row 1 in the table and marker 1 on the map named different destinations. A comparison's rows already carried the ranking's rank (`ModelRow.rank`), so the table also disagreed with itself between one model and several. The Round 5 readiness review found this (P06-1, E05-1, 2026-10-01).

## Decision

Every table row carries `rank`, its place in the ranking, stamped in `useTableView` before the header sort. `rankText` and the CSV's Rank column read it. A header sort reorders the rows and their numbers travel with them. The number on a row, its marker and its popup are always the same. The position is only a fallback for a row handed in without a stamp.

## Evidence

The review's persona saw marker 1 and table row 1 name different peaks after a header sort (P06-marcus-08, 2026-10-01). `rankText` (`utils/resultsCells.ts`) and `resultsCsv.ts` fell back to `index + 1` for single-model rows.

## Alternatives rejected

- Keep the position, as PR #198 accepted on 2026-07-30 when it moved the header sort out of the table: "the map markers kept the ranking numbers while the table renumbered by elevation". That kept a number that changes with a sort beside markers that do not, and it left the one-model table counting differently from the compared one.
- Make the markers follow the table's order. A header sort is a view of the rows on screen and re-ranks nothing (decision 0003), so the map would change its numbers for a reason that does not change the ranking.

## Consequences

`useTableView.test.tsx` pins the stamped rank through a header sort and pins that the rows keep one identity while their inputs hold, which the memoized `ResultsTable` needs. A removal still renumbers the rows below it, because a removal changes the ranking.
