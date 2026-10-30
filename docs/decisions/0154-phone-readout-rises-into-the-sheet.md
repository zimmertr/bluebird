# 0154. A phone's chart readout rises into the sheet rather than being cut off

- Status: Superseded by [0243](0243-chart-metrics-as-panels.md) (a phone wears the desk's picker row, and its card stays inside the chart). Amends [0144](0144-chart-reads-a-finger.md). Amended by [0155](0155-phone-chart-rests-at-the-full-stop.md) (a phone's Chart rests at the full stop, so the rise matters on a Chart the reader has dragged short)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696 (round 8 review of #708), 2026-10-14
- Issues and PRs: #696, #708, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartPointer.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`

## Context

The chart's readout is drawn inside the plotting band, and Recharts keeps it there. At a phone sheet's resting height the band is short: 68px at 390x844 under the picker's title (record 0149), 18px at 360x740 and 5px at 393x727. A finger reading with five lines drew a 129px card from the band's top, and the plot's box cut it off at 92px, so four of the five rows showed and the card covered the lines it was reading. The tutorial's Chart card showed the same cut card over the demonstration.

## Decision

- **The readout is never cut off.** A card the band holds stays where Recharts puts it, by the reading. One it cannot hold stands at the top of the room above the band, from 8px under the sheet's top edge (`READOUT_ROOM_GAP_PX`), over the results bar and the picker, and runs down from there (`readoutPlace` in `chartPointer.ts`). The plot's box no longer clips on a phone; the sheet still does.
- **It lists what that whole room holds**, from its top to the band's foot, through the existing `tooltipCapacity` and its `+N more` line, so the card it settles on always fits. The capacity's existing ceiling of eight lines (`TOOLTIP_MAX_ROWS`) stands.
- **The chart follows its plot's height** through the container's resize report, so a readout already standing when the sheet grows moves into the band.
- **The tutorial's Chart step holds a phone's sheet at its full stop**, as high as a drag takes it, for its length (`fullOverride` on `useResultsLayout`), and gives the reader's height back after. At rest the five-line readout could only rise over the bar, which the tour's dim covers; at the full stop it stands inside the plot beside the lines it reads.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium with a ten-line report, a finger at the band's middle:

| Viewport | Band | Room (sheet top to band foot) | Lines listed | Card |
|---|---|---|---|---|
| 360x740 | 18px | 175px | 7, `+3 more` | 470 to 631, whole |
| 390x844 | 68px | 225px | 8, `+2 more` | 524 to 701, whole |
| 430x932 | 68px | 225px | 8, `+2 more` | 612 to 789, whole |
| 393x727 | 5px | 162px | 6, `+4 more` | 470 to 615, whole |

The Chart card at the full stop: the plot runs 345 to 749 at 390x844 and the five-line card stands 569 to 682 inside it, at every one of the four sizes. `chartPointer.test.ts` holds the placement, `useResultsLayout.test.tsx` the full stop and its release, and `chartTap.spec.ts` a finger reading at rest standing whole inside the sheet.

## Consequences

While a reading stands over a short band, the card covers the results bar's view buttons and the picker; they still take a press, and a vertical drag drops the reading. A ten-line report cannot list every line at rest on any phone measured: the eight-line ceiling binds at 390 and 430, and the room at 360x740 and 393x727. The band at rest on a short phone is too small to read a line from at all, which is the picker's title's cost (record 0149) and is unchanged here.
