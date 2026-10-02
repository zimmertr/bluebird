# 0088. A committed report closes every popup on the map, pinned ones included

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #577 (option A, shift-pinned popups not exempt)
- Issues and PRs: #577
- Cited in code as: `hooks/useClosePopupsOnCommit.ts`, `components/TimelineTransport.tsx`
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useClosePopupsOnCommit.ts` bullet

## Context

A result popup is static HTML. `openFitted` in `map/resultsLayer.ts` builds it once, from the rows as they stood at the click, and its title is the rank and the name with no window on it. Nothing closed it when a report committed: Analyze is a panel click, so the map never saw it, and the only caller of the handle's `closePopups` was the tutorial. The Round 5 readiness review found a popup reading "#3 Booker Mountain" with cloud base values beside a table ranked by AQI, with no cloud columns and Johannesburg Mountain at #3. The same review found the forecast player's bar standing over a popup's last rows on desktop windows of 1478x812, 1432x840 and 1493x812, because the bar did not carry `data-map-overlay` and so the placement never stepped around it.

## Decision

Every committed report closes every popup on the map's popup board, shift-pinned ones included. The trigger is `analysisSeq`, which moves once per committed report and on nothing else, so a live knob leaves an open card where it is. The close goes through the map handle's existing `closePopups`, because `MapView` is memoized and a new prop would cost every render of the map column. The forecast player's bar carries `data-map-overlay`, so a popup's placement avoids it like the button column and the legend.

## Evidence

Reproduced from the review's screenshots (P31-cloud-07, P01-bulger-18, P02-mara-06, P03-dale-12) and the code paths named in #577. `useClosePopupsOnCommit.test.tsx` pins one close per commit and none on a render between; `TimelineTransport.test.tsx` pins the attribute.

## Alternatives rejected

- Rebuilding each open popup from the new report (#577 option B). The reader keeps the place they were looking at, but it is more code, and a destination absent from the new report still needs a close.
- Exempting shift-pinned popups. A pinned card is the one most likely to be read side by side with the new table, and it is built the same static way.

## Consequences

The board is shared, so a basemap feature's popup and a smoke plume's popup close on a commit too. A live sort or a change in the Columns picker still does not refresh an open card; the maintainer decided only the commit. On a map too short to hold a card above the bar, some of the card still runs under it.
