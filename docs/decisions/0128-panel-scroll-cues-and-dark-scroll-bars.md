# 0128. The panel's edges are drawn: a structural seam beside the results, one dark scroll bar with its space kept, and scroll shadows where the body continues

- Status: Accepted
- Date: 2026-10-13
- Decider: the maintainer, on #697 and #687 (2026-10-13, after real prototypes on `proto/697-corners-b` and `proto/697-corners-c`: both corner options declined, option E kept; then the seam chosen from a round-2 mockup: "the panel's desktop right border becomes `PANEL_EDGE`")
- Issues and PRs: #687, #697
- Cited in code as: #697
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `ControlPanel.tsx` and `ResultsSheet.tsx`, `ResultsBar.tsx`, `ResultsPanels.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useScrollShadows.ts` bullet; [`docs/STYLES.md`](../STYLES.md), the three weights of rule

## Context

On a desktop the docked panel and the docked results are both slate-800, side by side, and the only line between them was the panel's `SURFACE_DIVIDER` at 1.41:1, so the two read as one L-shaped block. The panel's body took the browser's own scroll bar, 15px and light grey in Chromium, beside the results' styled 10px slate one, and the calendar well ran up against it. And the body scrolls under the header's rule and over the footer's, cut flat at both, with nothing to say it continues: at the default load 147px of it was out of sight at 1440x900 and 558px on a phone (#687's audit, 2026-10-13). The issue also asked whether the app's corners should be one shape.

## Decision

- **The seam is the panel's structural edge.** The aside's right border is `PANEL_EDGE` (slate-500) on every breakpoint, the line its header and footer rules already wear. No gutter, no rounded corner.
- **The app is dark to the browser.** `color-scheme: dark` on the root in `index.css`, which turns every scroll bar and native widget the app does not style itself dark (the welcome dialog's and the legal pages' bars, the date, time and number inputs). The map's white surfaces, its popups and MapLibre's controls, say `color-scheme: light` and resolve their default text again in it in `map.css`.
- **One scroll bar.** The panel body, the results table, the chart legend and the calendar's popover all wear `SCROLL_BARS` (`.surface-scrollbars`), whose colours are the theme's own slate-500 and slate-800 variables. The panel body reserves the bar's width with `scrollbar-gutter: stable`, so its column never moves when a section opens.
- **Scroll shadows.** A slate-950 shade at 70% fading over 12px under the panel body's top edge and over its bottom edge, and under the results table's sticky header and over its bottom edge, each shown only while there is content beyond that edge (`SCROLL_SHADOW`). Pure CSS where the browser has scroll-driven animations; elsewhere `useScrollShadows` sets `data-more-above` and `data-more-below` and the stylesheet reads those.
- **Corners stay as they are.** Docked surfaces are square and floating ones rounded, as `RADIUS` says.

## Evidence

- The seam (2026-10-13, Tailwind's slate): `PANEL_EDGE` is 3.07:1 on slate-800 and 3.74:1 on slate-900, past the 3:1 WCAG 1.4.11 asks of the only thing separating two surfaces, where `SURFACE_DIVIDER` is 1.41:1.
- The bar (2026-10-13, Chromium in the pinned Playwright image with classic bars): the browser's own was 15px and left 312px of content while it showed and 327px when it did not; the shared bar is 10px, and with its space kept the body is 317px wide always. On an overlay-bar screen (macOS by default, every phone) it takes and reserves nothing. The Metrics row's label budget is checked at 317px in `styles.test.ts`.
- What the body hides at defaults with this PR's other rows in (2026-10-13): 147 to 106px at 1440x900, 558 to 484px on a 390x844 phone under touch.
- The corner prototypes (#697, 2026-10-13): option B, floating inset cards, cost 36px of table width and up to 38px of map height and needed a camera fix the prototype did not do; option C, rounded docked corners over a gutter, read as awkward on the side panel and the results, and separated the two panels.
- `useScrollShadows.test.tsx` holds the fallback's two attributes at the top, mid-way, at the end and over a body that fits; `styles.test.ts` holds the roles, the root's scheme, the theme variables in the bar and the four fallback selectors.

## Alternatives rejected

- **An 8px slate-900 gutter between the panel and the results** (round 2's option B): it costs the map and the results 8px and separates the two panels, which the maintainer does not want; a line does the job.
- **Leaving the seam alone**: acceptable to the maintainer, and declined beside the edge, which costs nothing.
- **Floating cards** and **rounded docked corners** (#697 options B and C): above.
- **The shared bar without a kept gutter**: the column jumped by the bar's width whenever a section opened and the body began to overflow.

## Consequences

The body's controls end 10px short of the footer's Analyze button on a classic-bar screen, because the footer is not a scroller. The map's popup text is resolved in the light scheme in `map.css`, without which it measured white on the white card under the root's dark scheme. `SURFACE_DIVIDER` no longer draws the panel's right edge.
