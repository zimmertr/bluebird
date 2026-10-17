# 0168. An open radar card keeps one width, and reads a frame again as its tiles arrive

- Status: Accepted. Supersedes 0166 in part: its consequences, the width left open and a frame without tiles reading `No radar echo`
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #752, 2026-10-16: "make it always as wide as max"
- Issues and PRs: #752, #748, #749
- Cited in code as: #752
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupChrome.ts`, `pointReadout.ts` and `radarPoint.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `overlays/radar.ts` bullet; [`docs/DATA.md`](../DATA.md), Rain radar; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), The browser suite
- Related: 0166 (the card follows the player), 0165 (the cards)

## Context

0166 made an open radar card read its point again on every frame the player shows, and left its width to follow its name. The card is centred on its tip, so both edges moved as the name changed, and the close button with the right one: 129 px wide on `No radar echo`, 145 px on `Weak radar echo`, 181 px on `Moderate precipitation`, each edge moving 26 px inside a 500 ms frame (Carbondale, PA, 2026-10-16). #749 shipped it as an open question. The maintainer called it a bug.

The browser test for the fix found a second fault. A frame waiting at opacity 0 loads no tiles, so a card opened before the warm-up reached the older frames was read on a frame whose tiles had not arrived. It said `No radar echo` over a storm the map painted a moment later, and was never read again. 0166 accepted the first half of that and did not see the second.

## Decision

**The card is always as wide as the longest name the radar gives.** Every name a radar section can take (`RADAR_TITLES` in `radarPoint.ts`) stands in one grid cell (`widestName` in `popupChrome.ts`). The shown one is visible; the rest are hidden from sight and from a screen reader. The browser sizes the cell, so the width follows the font, the size and the theme with no number to keep. `pointCardHtml` does this for any section that lists its names (`PointSection.titles`), on the band of a radar card and on the radar's heading of a card shared with the snow. A `No radar echo` card is about 60 px wider than its name needs, the width of a `Very heavy precipitation` one. That is the price of a card that does not move.

**A frame is read again as each of its tiles arrives.** `overlays/radar.ts` listens for `sourcedata` carrying a tile of the frame on screen and asks `refreshPoint('radar')`, so the card and the pointer catch up when the picture does.

## Alternatives rejected

- Never letting an open card shrink: it still grows on the first frame with a longer name, which is the jump.
- Anchoring the card at a corner: one edge still moves, and the close button with it.
- A fixed pixel width: a number to keep in step with the font, the touch lane and both themes. The grid cell measures it instead.
- Waiting for a frame's tiles before reading it: the card would show the last frame's reading over the new picture.

## Consequences

`frontend/e2e/radarCard.spec.ts` serves fixed radar frames, opens a card on the newest before the older frames have loaded, steps the player back twice, and holds the card to one width and left edge and the older frame to its painted name. On the code before this change it fails the width every run, and with the width checks removed it fails the name. A tile arriving for the frame on screen now reads an open card again while the map pans too. The read is of a tile the app holds, so it asks IEM for nothing.
