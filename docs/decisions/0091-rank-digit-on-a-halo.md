# 0091. The marker's rank digit stands on a halo

- Status: Proposed (the maintainer confirms halo over dark ink in review)
- Date: 2026-10-01
- Decider: proposed by the fix for #576 item 10, which the issue left to the maintainer as halo or dark ink
- Issues and PRs: #576
- Cited in code as: #576
- Guide: [`docs/STYLES.md`](../STYLES.md), the contrast rules beside the legend ramp

## Context

The rank digit is printed in the marker, and the marker wears the band its value falls in, so the digit lands on every colour every scale has. It was white with no halo.

## Decision

The digit keeps its white ink and wears the 1.5px slate-900 halo the marker's name label already wears. `RANK_INK` in `styles.ts` holds the three paint values, and `colors.test.ts` measures every band of every scale against white, against slate-900 and against the halo.

## Evidence

Measured 2026-10-01 over every band colour of every scale and the no-value grey: white straight on them ran from 1.05:1 (cloud cover's slate-50) to 3.96:1 (the purple top band), and cleared 4.5:1 only on AQI's maroon (8.31:1) and the no-value grey (4.76:1). Slate-900 straight on them falls to 2.15:1 on the maroon. White on the slate-900 halo is 17.85:1 whatever band is under it.

## Alternatives rejected

- Dark ink. It fails on the maroon and sits at 4.51:1 on the purple.
- An ink chosen per band. A second colour table to keep beside the scales, for a digit ten pixels high.

## Consequences

A band added to any scale is measured by `colors.test.ts` before it ships. The halo thickens the digit's outline slightly at every zoom.
