# 0166. An open radar card and the pointer follow the forecast player

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #748, 2026-10-16: the card follows the player, the pointer follows the frames under a resting mouse, a frame with no echo reads `No radar echo` with `Rate: 0 in/h` and `Reflectivity: N/A`, and a weak echo keeps its rate row as `Rate: N/A`
- Issues and PRs: #748, #749, #737 (the cards), #121 (the radar loop)
- Cited in code as: #748
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts` and `overlays/radar.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `radarPoint.ts` bullet; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `testSupport/fakeMapPopups.ts` bullet; [`docs/DATA.md`](../DATA.md), Rain radar; [`docs/USAGE.md`](../USAGE.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0165 (the cards), 0125 (map popups open on a click)

## Context

The forecast player steps the rain radar through its six frames, one every 500 ms. The card 0165 opens on an echo was read once, at the click, and the pointer was decided only on a mouse move. So during playback a card could say `Heavy precipitation` and `Updated: now` over a frame 40 minutes back that showed nothing at its point, and the pointer stayed a pointer after the echo under a still mouse had gone. The maintainer found both on 2026-10-16.

## Decision

**A frame change reads every open radar card again where it stands, and decides the cursor again where the mouse rests.** `showFrame` in `map/overlays/radar.ts` calls `refreshPoint('radar')` in `map/mapPopups.ts` when the frame on screen changes. The card's radar section is read again from the copy of that frame's tile the app already holds (0165), so playback asks IEM for nothing. Only the radar section of a combined card changes, a slower read never paints over a newer frame's, and closing the card ends it. The cursor is decided at the last position the mouse was seen at, unless the mouse has left the map or is dragging it.

**An open card stays open on a frame with no echo at its point.** It reads `No radar echo`, `Rate: 0 in/h` and `Reflectivity: N/A`: no echo means the radar saw nothing falling, so 0 is a reading, and there is no reflectivity to give. Closing the card instead was weighed and rejected, since a card that disappears mid-playback, when the storm may be back on the next frame, reads as broken. A click on a bare pixel still opens nothing.

**Every radar card has the same three lines.** A weak echo, under 15 dBZ, kept no rate row before; it now reads `Rate: N/A`, because birds and clutter paint there as readily as drizzle, and the card no longer changes height every half second.

## Alternatives rejected

- **Freezing the card on the frame it was opened on.** No work, and the card disagrees with the map under it for five frames in six.
- **Dropping the radar section where the frame shows no echo.** No new strings, but a radar-only card would close itself mid-playback.

## Consequences

The card's width still follows its title, so it shifts by about 50 px between `Moderate precipitation` and `No radar echo` during playback (measured at Carbondale, PA, 2026-10-16). Sizing the radar card to its widest title would stop it; that is left open. A frame whose tiles the browser has not loaded at the map's zoom reads `No radar echo`, which is what the map shows there too.
