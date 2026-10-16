# 0168. An open radar card keeps one width, and reads a frame again as its tiles arrive

- Status: Accepted. Supersedes 0166 in part: its consequences, the width left open and a frame without tiles reading `No radar echo`
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #752, 2026-10-16: "make it always as wide as max"
- Issues and PRs: #752, #748, #749
- Cited in code as: #752
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupChrome.ts`, `pointReadout.ts` and `radarPoint.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `overlays/radar.ts` bullet; [`docs/DATA.md`](../DATA.md), Rain radar; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), The browser suite
- Related: 0166 (the card follows the player), 0165 (the cards)

## Context

0166 made an open radar card read its point again on every frame the forecast player shows, and left its width to follow its name. The card is centred on its tip, so as the name changed both edges moved and the close button moved with the right one: 129 px wide on `No radar echo`, 145 px on `Weak radar echo` and 181 px on `Moderate precipitation`, each edge moving 26 px within a 500 ms frame (measured at Carbondale, PA, 2026-10-16). It shipped in #749 as an open question; the maintainer called it a bug.

The browser test written for the fix found a second fault in the same path. A frame waiting at opacity 0 loads no tiles, so on a card opened before the warm-up had loaded the older frames there, the playhead landed on a frame whose tiles were still on their way. The card was read at that moment, said `No radar echo` over a storm the map painted a moment later, and was never read again. 0166 had accepted the first half of that ("what the map shows there too") without seeing the second.

## Decision

**The card is always as wide as the widest name the radar gives.** Every name a radar section can take (`RADAR_TITLES` in `radarPoint.ts`) stands in one grid cell (`widestName` in `popupChrome.ts`), the shown one visible and the rest hidden from sight and from a screen reader, so the browser sizes the cell to the widest in whatever font, size and theme the card is drawn in. `pointCardHtml` does this for any section that lists its names (`PointSection.titles`), on the band of a radar card and on the radar's heading in a card it shares with the snow. A `No radar echo` card is therefore about 60 px wider than its own name needs, the width of a `Very heavy precipitation` one, which is the price of a card that does not move.

**A frame is read again as each of its tiles arrives.** `overlays/radar.ts` listens for `sourcedata` carrying a tile from the frame on screen and asks `refreshPoint('radar')`, so the card and the pointer catch up the moment the picture does.

## Alternatives rejected

- **Never letting an open card shrink.** It opens at its own width, but grows on the first frame with a longer name, which is the jump this fixes.
- **Anchoring the card at a corner.** One edge still moves, and the close button with it.
- **A fixed pixel width.** A number to keep in step with the font, the touch-screen close lane and both themes; the grid cell measures it instead.
- **Waiting for a frame's tiles before reading it.** The card would hold the previous frame's reading while the map shows the new one.

## Consequences

`frontend/e2e/radarCard.spec.ts` serves fixed radar frames, opens a card on the newest before the older frames have loaded, steps the player back twice and holds the card to the same width and left edge on each frame and the older frame to its painted name. On the code before this change it fails on the width every run, and with the width checks removed it fails on the older frame's name. A tile arriving for the frame on screen now reads an open card again even while the map is only panning; the read is of a tile the app already holds, so it asks IEM for nothing.
