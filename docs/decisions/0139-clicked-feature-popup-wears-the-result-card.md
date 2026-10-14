# 0139. The clicked feature's popup wears the result card: the header band, the facts line, and the button alone below

- Status: Accepted
- Date: 2026-10-14
- Decider: TJ (#712, on the PR #713 preview)
- Issues and PRs: #712, #713
- Cited in code as: #712
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/poiPopup.ts` bullet and the `popupShell` clause of the `src/utils/popupChrome.ts` bullet

## Context

A clicked basemap peak or lake opened a popup in the plain chrome: the name over a rule, the coordinates between them, and an `Elevation (ft): 4,114` row under the rule. The same mountain once analyzed opened the result card: the name and its link on a slate band, `Peak | 2,995 ft | 47.48844, -121.94734` under it, and the band's edge and shadow over the body. Side by side on the #713 preview the two read as two kinds of card for one object at two stages, which is what the shared chrome was meant to prevent (TJ, 2026-10-14).

## Decision

`poiPopupHtml` builds the result card (`popupShell` with `resultCard`), and the map opens it with the result card's class and width rule. Its facts line is `factsRow` from what the tile knows: the kind, in the word the table's Type column will use for the place once analyzed (`TYPE_COL.format` over `placeType`, so OSM's `volcano` reads `Peak`), the elevation as `elevationFact` says it where the tile carries one, and the coordinates. A fact the tile does not have is left off rather than fetched or filled in. The body holds the add or remove button alone, centred, with the body's own padding around it and no gap of its own (TJ, 2026-10-14: left against the edge it read as a row that lost its label; the alternative, the full width the panel's Analyze button takes, was offered and not taken).

## Evidence

- TJ's screenshot of the #713 preview, 2026-10-14: East Tiger Mountain analyzed beside Mount Si clicked, one card with a band and one with a rule.
- The band, its labels and the link colour were measured for #700 and #712 and do not change: the facts line's labels at 6.92:1 and the title at 19.17:1 on slate-100, the link at 5.42:1.

## Alternatives rejected

- Fetching the destination type for the clicked card: not needed. The tile's kind already answers, through the same word the Type column uses; TJ's instruction was to omit a fact the card does not have rather than fetch it.
- Keeping the elevation as a row under the band: the result card says it on the facts line, and one mountain must say its height one way.

## Consequences

`poiPopup.test.ts` reads the facts line the way `resultPopup.test.ts` reads a result's, and pins the band, the absence of the rule, the Type column's word and the elevation's spelling. `coordinateRow` is gone from `popupChrome.ts`: both cards draw `factsRow`. The clicked card takes `resultPopupWidth` rather than `popupWidth`, which is the rule the facts line's 274.7px was measured against.
