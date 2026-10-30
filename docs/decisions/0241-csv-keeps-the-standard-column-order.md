# 0241. The CSV keeps the standard column order

- Status: Accepted; amends 0037
- Date: 2026-10-29
- Decider: the maintainer (TJ), after PR #824
- Issues and PRs: #824
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tableColumns.ts` and `exportCsv.ts` bullets; [`USAGE.md`](../USAGE.md), Columns can be moved

## Context

A reader can drag the table's columns into an order of their own. The downloaded CSV followed that order, so two files of the same report could carry the same columns in different places.

## Decision

The CSV ignores the reader's dragged order and always writes the standard one: the desk's order, the Model column after Name while comparing. It still carries only the columns the table shows, and its rows still follow the table's sort.

## Evidence

No measurement. A file is read by scripts and spreadsheets, which find a column by its place; a consistent file serves them better than one that mirrors a screen.

## Alternatives rejected

- The file following the screen, as since #125: two downloads of one report could differ.
