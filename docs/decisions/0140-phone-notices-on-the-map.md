# 0140. On a phone with the drawer shut, the notice block stands on the map

- Status: Accepted. Amends 0028 on a phone (the block's other home is the map while the drawer is shut; on a desk and in an open drawer it stays under Analyze).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: frame 9 of the phone flow mockup approved 2026-10-14, the stale cue above the sheet in the drawer's own words
- Issues and PRs: #696, #708, #253, #123
- Cited in code as: #696
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Every notice renders in the one block under the Analyze button; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx` and `PhoneFoot.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`

## Context

Record [0028](0028-notices-below-analyze.md) puts every notice in one block under the panel's Analyze button. A phone now opens on the map with the drawer shut and Analyze at the map's foot (record [0135](0135-phone-opens-on-the-map.md)), so the cue that says a report no longer matches the panel, `A new forecast range requires a new analysis.` and its siblings, would be inside a closed drawer, where the reader who needs it cannot see it.

## Decision

- **The same block, rendered once, has two homes.** On a desk, and on a phone while the drawer is open, it stands under the panel's Analyze as before. On a phone while the drawer is shut, `PanelFooter` portals it into a band the map holds (`noticeHome`, `PhoneFoot`), so it is still the one `FooterNotice` block, with the same boxes, the same retry and the same #253 dismissals, in whichever home applies. The `style-footer-notice` check pins the one portal.
- **The band stands just above the scale and the credit**, at the map's foot or on the sheet's edge (`noticeBottomPx`), one inset off each side, on the drawer's own slate-800, so the boxes' translucent tints read as they do in the panel. The credit line is a licence term, which is why the band does not cover it.
- **The Analyze button rises over the band** by the band's height (record 0135).
- **The whole block moves, not the cues alone**, because the rule is one block: a phone with nothing to analyze therefore shows the panel's `Provide at least one destination to analyze.` on the map at arrival, dismissable like any other line.

## Evidence

Shot 2026-10-14 at 390x844 and 360x800: a second searched place puts `A new destination requires a new analysis.` on one line above the collapsed sheet at both widths, with the button over it.

## Alternatives rejected

- **The cues alone on the map and the rest in the drawer:** two blocks, which is the split 0028 exists to prevent.
- **The band on the sheet's edge, as the mockup drew it:** it covered the scale and the credit.

## Consequences

`ControlPanel` and `AppDrawer` thread `noticeHome` to `PanelFooter`; `App.tsx` hands it the band only on a phone with the drawer shut. Every footer line must still fit one line at 360px, now on the map as well as in the panel.
