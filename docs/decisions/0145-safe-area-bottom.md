# 0145. Nothing a finger presses stands in a phone's home indicator band

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #336 (folded into #708), 2026-10-14
- Issues and PRs: #336, #696, #708
- Cited in code as: #336
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useSafeAreaBottom.ts`, `useResultsLayout.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

No file used `env(safe-area-inset-*)`, and the viewport meta had no `viewport-fit=cover`. On an iPhone the bottom 34px are the home indicator's, and the results sheet's grip, the player and the floating Analyze could stand in it.

## Decision

- **`index.html` asks for the whole screen** (`viewport-fit=cover`), so the browser reports the band as `env(safe-area-inset-bottom)`.
- **One role, `SAFE_AREA` in `styles.ts`**: `pad` pads a surface that reaches the screen's foot by the band (the results sheet, the Controls sheet and every bottom sheet), so its surface runs under the indicator and its grip, header and foot stand above it; `probe` is an invisible box as tall as the band, which `useSafeAreaBottom` reads.
- **The chrome placed in pixels measures from the band's top** before there is a sheet (`resolveSheetLift`'s `footPx`), and the results' panels give the band up rather than the map: the Analyze button, the notice band, the player, the scale and the credit all stand on the sheet or on the band, never in it.
- **A desk reports 0**, and every number there is unchanged.

## Evidence

2026-10-14 at 390x844 with a 34px bottom inset emulated in Chromium (`Emulation.setSafeAreaInsetsOverride`): before a report the button's bottom edge stood 50px up (the band and the 16px inset); collapsed, the sheet was 118px, its 84px bar standing on the band's top at 810; the Controls sheet and the Layers sheet kept their content above it.

## Consequences

The landscape side insets are not handled: a phone on its side keeps its chrome inside the screen's edges, where a notch can stand.
