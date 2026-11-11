# 0261. A desk's legend card stops above the forecast player only where the two would meet

- Status: Accepted. Amends 0174 (the legend card's height cap).
- Date: 2026-10-31
- Decider: the maintainer (TJ), 2026-10-31, from screenshots of a wide desk map where the card stopped above a player that stood well clear of it
- Issues and PRs: none yet
- Cited in code as: `LEGEND_BESIDE_TRANSPORT_PX`
- Guide: [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), the `resultsSheet.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Map chrome; [`docs/USAGE.md`](../USAGE.md), The map's legend
- Related: 0174 (the legend card under its chip), 0166 (the radar card follows the player)

## Context

A desk's legend card scrolls inside the map's height under the rows (`legendMaxCss`). Whenever the forecast player was on, the cap took the player's whole band off the bottom, 112px where the plain gap is 32. The player is centred and 368px wide, and the card hangs 224px wide at the map's left edge, so on most desk maps the two never share a column. With results expanded up, a tall key scrolled inside a card that had room to stand whole, and turning the player off gave the rows back, which showed the cap was keyed to the player's presence and not to where it stood.

## Decision

- **The card clears the player's band only on a map narrower than `LEGEND_BESIDE_TRANSPORT_PX`.** That line is where the bar's left edge stands one map inset clear of the card's right edge: twice the inset plus the card's width, doubled, plus the bar's width, 864px. On a wider map the card keeps the plain gap with the player on, as it does with no player.
- **The width is read in CSS, off the map wrapper's size container (`100cqw`)**, the way the height already is (`100cqh`). The extra clearance is `clamp(0px, (864px - 100cqw) * 1000, extra)`, a step on the map's width, so nothing measures the map in script and the card follows a panel opening or a window resize in the same frame the map does.

## Evidence

From the bar's class, `w-[min(23rem,calc(100%-4rem))]`, centred with `left-1/2 -translate-x-1/2`; the card's `w-56` at the `0.75rem` inset; `resultsSheet.test.ts` holds the three widths to the sources they are spelled in. TJ's screenshots on 2026-10-31: a map about 1,650px wide, where the bar stood some 400px right of the card and the card still stopped above it, and a map about 740px wide, where the two overlap and the card must stop.

## Alternatives rejected

- **A container query class** (`@max-[864px]:`): Tailwind scans class names as text, so the line would be a literal in a class string, held to the derived number by a test, beside an inline style it would have to fight. The clamp keeps it in the one function that already builds the cap.
- **Measuring the map's width in script**: the cap was made a CSS length in #714 so the card would not need to.
