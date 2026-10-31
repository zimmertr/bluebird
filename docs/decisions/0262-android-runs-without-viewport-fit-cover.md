# 0262. Android runs the app without viewport-fit=cover

- Status: Accepted. Amends [0152](0152-sheets-end-above-the-home-indicator.md) (the page asks for the whole screen on every platform but Android)
- Date: 2026-10-31
- Decider: the maintainer (TJ), on PR #841, 2026-10-31: a band under the results sheet on a Pixel in Firefox, seen on no other site
- Issues and PRs: #837, #841
- Cited in code as: #837
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `public/viewport.js`

## Context

The maintainer's Pixel, in Firefox with three-button navigation, showed a band about 46px tall under the results sheet, in the sheet's own colour, on Bluebird Forecast and on no other site. The sheet pads its foot by `env(safe-area-inset-bottom)` (`SAFE_AREA.pad`, record 0152), which `index.html` makes the browser report by asking for `viewport-fit=cover`. A daisyUI discussion reports that Firefox for Android 150 and later gives a bottom inset to a page that sets `cover`, though it draws no page under the system bar. Chrome for Android answers `cover` with a bar of its own at the foot, the chin, which only a scrolling page retracts, and this page never scrolls.

## Decision

`public/viewport.js`, a classic script under the viewport tag in `index.html`, takes `viewport-fit=cover` off the tag before the first layout when the user agent says Android. Every other platform keeps it, an iPhone's home indicator above all, which is what record 0152 asked for it. With no `cover` an Android browser reports no inset, and the sheet's padding is 0 there.

## Evidence

The band's height in the maintainer's screenshot, about 100 of 1999 device pixels at a 2.18 scale (2026-10-31), is close to a three-button navigation bar's 48dp. `src/viewport.test.ts` runs the script with Firefox's and Chrome's Android user agents, an iPhone's and a desk's. The fix is confirmed only once the band is gone on the maintainer's phone; the cause is the reported Firefox behaviour, not one measured here.

## Alternatives rejected

- **Read the inset and ignore it where the browser draws nothing under it:** no API says where the page ends against the system bar.
- **Drop `cover` everywhere:** an iPhone's home indicator would stand over the sheet's last row again (record 0152).
- **Chrome's recommended pattern for a bottom bar:** it answers Chrome's chin, not Firefox's inset, and a page that never scrolls keeps the chin in either case.

## Consequences

The one platform check in the app is a user agent test, in a 500-byte file that runs before anything else. An Android browser that reports `Android` nowhere in its user agent keeps `cover`.
