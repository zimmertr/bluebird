# 0145. Nothing a finger presses stands in a phone's home indicator band

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #336 (folded into #708), 2026-10-14; the band moved inside the sheets' scrollers on a Pixel the same evening, and left the sheets altogether later that night
- Issues and PRs: #336, #696, #708
- Cited in code as: #336
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useSafeAreaBottom.ts`, `useResultsLayout.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

No file used `env(safe-area-inset-*)`, and the viewport meta had no `viewport-fit=cover`. On an iPhone the bottom 34px are the home indicator's, and the results sheet's grip, the player and the floating Analyze could stand in it.

## Decision

- **`index.html` asks for the whole screen** (`viewport-fit=cover`), so the browser reports the band as `env(safe-area-inset-bottom)`.
- **One role, `SAFE_AREA` in `styles.ts`**: `pad` pads a surface that reaches the screen's foot by the band (the results sheet), so its surface runs under the indicator and its grip and header stand above it; `probe` is an invisible box as tall as the band, which `useSafeAreaBottom` reads.
- **A sheet whose body scrolls takes no band, on its card or in its scroller** (the Controls sheet and every bottom sheet). The space under its last line is the space above the rule before it, the sheet's own rhythm: the panel body's 16px under the document links, which is the stack's 16px above each rule, and in a menu sheet the last row's own half of its 44px, which is what every row keeps above its rule. Two cuts came first. The band on the cards left a strip of fill about 40px tall under the content on the maintainer's Pixel, and the band moved inside the scrollers' ends, Material's rule for a sheet under gesture navigation, left 55 to 65px of fill under Tutorial · Privacy · Terms on the same phone. That phone runs Chrome on Android with three-button navigation, where the page stops above the system bar, so whatever inset the page is told there stands over nothing a finger can reach, and a sheet the reader has scrolled to the end of needs no clearance beyond its rhythm. The inset stays where the page's edge is the screen's: the floating Analyze button, the notice band, the scale and credit, and the results sheet's grip. The cost is on a phone that does draw the page under its band, an iPhone: a menu sheet scrolled to its end has its last row reaching into the band, so this record's title now holds for the chrome on the viewport's edge and not for a sheet's last row.
- **The chrome placed in pixels measures from the band's top** before there is a sheet (`resolveSheetLift`'s `footPx`), and the results' panels give the band up rather than the map: the Analyze button, the notice band, the player, the scale and the credit all stand on the sheet or on the band, never in it.
- **A desk reports 0**, and every number there is unchanged.

## Evidence

2026-10-14 at 390x844 with a 34px bottom inset emulated in Chromium (`Emulation.setSafeAreaInsetsOverride`): before a report the button's bottom edge stood 50px up (the band and the 16px inset); collapsed, the sheet was 118px, its 84px bar standing on the band's top at 810. After the band moved inside the scrollers, measured the same way: the Controls body and the Layers body both run to the screen's foot at 844, their end padding 50px and 46px, and scrolled to the end the Terms link stands at 793 and the last layer row at 798, over the band; with no inset, 16px and 12px, at 827 and 832.

After the band left the sheets, measured the same way at 390x844, scrolled to the end, with no inset and with 34px: the Controls sheet's last section ends 16px above the rule over the links and the links' line 16px above the scroller's foot; the Layers sheet's next-to-last label ends 15px above its rule and the last one 15px above the foot. Equal, and the same at both insets and at 360x740 (pinned in `styles.test.ts`).

What Chrome reports for `env(safe-area-inset-bottom)` under three-button navigation was not measured on a device. Chrome's edge-to-edge guide (developer.chrome.com/docs/css-ui/edge-to-edge) says the viewport may extend into the gesture navigation bar from Chrome 135, and Chromium's `EdgeToEdgeUtils` treats a tappable navigation bar as unsupported for the bottom chin, which reads as 0 for three buttons; the fill on the Pixel was more than the 16px the scroller added, so one of those readings does not hold on that phone. The decision does not depend on which.

## Consequences

The landscape side insets are not handled: a phone on its side keeps its chrome inside the screen's edges, where a notch can stand.
