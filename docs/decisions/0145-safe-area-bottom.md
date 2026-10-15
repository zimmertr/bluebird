# 0145. Nothing a finger presses stands in a phone's home indicator band

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #336 (folded into #708), 2026-10-14; the band moved inside the sheets' scrollers on a Pixel the same evening
- Issues and PRs: #336, #696, #708
- Cited in code as: #336
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useSafeAreaBottom.ts`, `useResultsLayout.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

No file used `env(safe-area-inset-*)`, and the viewport meta had no `viewport-fit=cover`. On an iPhone the bottom 34px are the home indicator's, and the results sheet's grip, the player and the floating Analyze could stand in it.

## Decision

- **`index.html` asks for the whole screen** (`viewport-fit=cover`), so the browser reports the band as `env(safe-area-inset-bottom)`.
- **One role, `SAFE_AREA` in `styles.ts`**: `pad` pads a surface that reaches the screen's foot by the band (the results sheet), so its surface runs under the indicator and its grip and header stand above it; `probe` is an invisible box as tall as the band, which `useSafeAreaBottom` reads.
- **A sheet whose body scrolls takes the band inside its scroller's end**, Material's rule for a sheet under gesture navigation: the Controls sheet (`CONTROLS_SHEET.body`, the panel body's 16px plus the band) and every bottom sheet (`BOTTOM_SHEET.body`, its 12px plus the band). The content runs to the sheet's bottom edge while it scrolls, and the last item clears the band once scrolled to; nothing fixed sits under it. The first cut put `pad` on those cards, which on the maintainer's Pixel left a strip of sheet fill about 40px tall under the content that nothing scrolled into: the band, which Chrome reports for the gesture bar, outside the scroller, plus the scroller's own end padding. The Controls body's end shade is told the band (`--scroll-shadow-end-inset`), so it still stands on the scroller's bottom edge.
- **The chrome placed in pixels measures from the band's top** before there is a sheet (`resolveSheetLift`'s `footPx`), and the results' panels give the band up rather than the map: the Analyze button, the notice band, the player, the scale and the credit all stand on the sheet or on the band, never in it.
- **A desk reports 0**, and every number there is unchanged.

## Evidence

2026-10-14 at 390x844 with a 34px bottom inset emulated in Chromium (`Emulation.setSafeAreaInsetsOverride`): before a report the button's bottom edge stood 50px up (the band and the 16px inset); collapsed, the sheet was 118px, its 84px bar standing on the band's top at 810. After the band moved inside the scrollers, measured the same way: the Controls body and the Layers body both run to the screen's foot at 844, their end padding 50px and 46px, and scrolled to the end the Terms link stands at 793 and the last layer row at 798, over the band; with no inset, 16px and 12px, at 827 and 832.

## Consequences

The landscape side insets are not handled: a phone on its side keeps its chrome inside the screen's edges, where a notch can stand.
