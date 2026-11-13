# 0292. The Controls sheet opens at half the map at least

- Status: Accepted. Amends [0207](0207-phone-controls-sheet-is-modal.md) (the sheet's opening height has a floor)
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12, on issue #927: of half the screen, full screen and a fixed minimum, half the screen
- Issues and PRs: #927, the PR that carries this record
- Cited in code as: #927; record 0292
- Guide: [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), the Controls sheet

## Context

On a phone the Controls sheet opens at the map less `CONTROLS_MAP_PX`, 256px (`controlsSheetPx`). Upright that leaves the reader the sheet they know: 484px at 360x740, 588px at 390x844. Held sideways, the 256px strip takes most of the screen. At 844x390 the sheet opened 134px tall, and on the maintainer's Android phone in Chrome, address bar showing, it opened with its title row and the `Destinations` heading alone in view. A map 256px tall or less opened it at 0px. A drag still raised it to full screen (record 0291), but the first sight after the Controls chip was an empty strip.

## Decision

- **The opening height is never under half the map** (`controlsSheetPx` returns the larger of the map less `CONTROLS_MAP_PX` and half the map). Upright phones open where they did, because 256px is under half of any upright phone's map. Sideways, the sheet opens at half: 195px at 844x390.
- **Half the map, not half the ceiling.** The ceiling is the map less the status bar's band, which only CSS can read (record 0291). Half of either differs by half that band, 0 on Android's browsers, and the arithmetic stays one pure function `App.tsx` calls on every layout.
- **A held sheet is unchanged.** It is a share of the ceiling (record 0291), so the floor moves where the sheet opens and where a double press or a release near it returns it, and nothing else.

## Evidence

`resultsSheet.test.ts` holds the floor: 740 gives 484, 512 gives 256, 390 gives 195, 256 gives 128 and 100 gives 50. `sheetDrag.spec.ts` opens the Controls sheet at 844x390 in the browser suite and finds its top and its height at 195.

## Alternatives rejected

- **Full screen sideways.** The most room with no drag, but it covers the map, the search box and Analyze on a screen where the map is already small.
- **A fixed minimum,** the title and a few panel rows. The same content on every short screen, but a measured number that can overflow the shortest ones.

## Consequences

A sideways reader sees the start of the panel without a drag, and keeps the top half of the map. The release near the opening height and the release near closed no longer meet on a short screen, since the sheet never opens at 0px.
