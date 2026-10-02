# 0091. The marker's rank digit stays plain white, with no halo

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on the pr-607 preview: "It looks too heavy. I think I prefer the way it is now."
- Issues and PRs: #576 (item 10), #607
- Cited in code as: none
- Guide: [`docs/STYLES.md`](../STYLES.md), the contrast rules beside the legend ramp

## Context

The rank digit is printed in the marker, and the marker wears the band its value falls in, so the digit lands on every colour every scale has. The Round 5 readiness review measured white straight on those bands and found it under AA on almost all of them (#576 item 10). The issue offered a halo or a dark ink.

## Decision

#576 item 10 is declined. The digit stays as it was: white (`#fff`), Noto Sans Bold at 10px, with no halo. The maintainer decided this after seeing a 1.5px slate-900 halo on the PR #607 preview, which read as too heavy.

## Evidence

Measured 2026-10-01 over every band colour of every scale plus the no-value grey (`#64748b`):

| Ink and ground | Contrast |
|---|---|
| White straight on the bands, worst | 1.05:1 (cloud cover's `#f8fafc`) |
| White straight on the bands, best under AA | 3.96:1 (the purple top band, `#a855f7`) |
| White on the no-value grey | 4.76:1 |
| White on AQI's maroon (`#991b1b`) | 8.31:1, the only band that clears AA |
| Slate-900 (`#0f172a`) straight on the bands, worst | 2.15:1 (the maroon); 4.51:1 on the purple |
| White on a slate-900 halo, any band | 17.85:1 (built and declined) |

## Alternatives rejected

- A 1.5px slate-900 halo, the one the name labels wear. Built and shown on the preview; declined as too heavy.
- Dark ink. It fails on the maroon at 2.15:1.
- An ink chosen per band. A second colour table to keep beside the scales, for a ten-pixel digit.

## Consequences

The digit remains under 1.4.3 on most bands; the marker's colour and its row in the table carry the rank meanwhile. A session that wants to raise the contrast has these numbers and the declined halo to start from, and should bring the maintainer something lighter than a full halo rather than the same fix.
