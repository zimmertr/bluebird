# 0152. Nothing a finger presses stands in a phone's home indicator band, a scrolled sheet's last row included

- Status: Accepted. Supersedes [0145](0145-safe-area-bottom.md). Amended by 0262 (Android runs without `viewport-fit=cover`)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14, after seeing a sheet with the band and one without drawn side by side (mockup B)
- Issues and PRs: #336, #696, #708
- Cited in code as: #696
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useSafeAreaBottom.ts`, `useResultsLayout.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ControlPanel.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

Record 0145 kept a phone's chrome out of the home indicator band, and its last amendment took the band off every sheet that scrolls, because on the maintainer's Pixel (Chrome on Android, three-button navigation) the page stops above the system bar and the space looked like dead fill. That left an iPhone's menu sheet, scrolled to its end, with its last row in the band, where the system's own gesture takes a finger first.

## Decision

- **`index.html` asks for the whole screen** (`viewport-fit=cover`), so the browser reports the band as `env(safe-area-inset-bottom)`, and **one role, `SAFE_AREA` in `styles.ts`**, holds it: `pad` pads a surface by the band, `probe` is the invisible box `useSafeAreaBottom` reads.
- **The results sheet runs under the band** (`pad`), its grip and header standing on the band's top edge, and **the chrome placed in pixels measures from the band's top** before there is a sheet: the Analyze button, the notice band, the player, the scale and the credit.
- **Every sheet whose body scrolls ends its content the band above the screen's foot**: the Layers, Legend, Columns, Models and Removed sheets (`BOTTOM_SHEET.body`, `SAFE_AREA.pad` at its end) and the Controls sheet (`CONTROLS_SHEET.body`, its 16px and then the band). The band is the scroller's end padding rather than the card's, so the content still runs under the band while it scrolls, and nothing of a second colour stands under the list. The Controls body's end shade is told the band (`--scroll-shadow-end-inset`), so it still stands on the scroller's bottom edge.
- **Where the browser reports 0, nothing changes**: the space under a sheet's last line is the space above the rule before it, which is why the Pixel's frames are the same.
- The reason is the one 0145 began with: nothing a finger presses stands in an iPhone's home indicator band, and one padding per sheet buys it.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium at 390x844, scrolled to the end. With no band: the Controls sheet's last section ends 16px above the rule over the document links and the links' line 16px above the foot; the Layers sheet's next-to-last label 15px above its rule and the last 15px above the foot. With a 34px band emulated (`Emulation.setSafeAreaInsetsOverride`): the same above, and 50px and 49px under. Pinned in `styles.test.ts`.

## Alternatives rejected

- **No band on any sheet** (0145's last amendment, the same day): one rule fewer, but an iPhone's last row stood in the band.
- **The band on the cards** (0145's first cut): a strip of the sheet's fill under the content that nothing scrolled into.

## Consequences

The landscape side insets are not handled: a phone on its side keeps its chrome inside the screen's edges, where a notch can stand.
