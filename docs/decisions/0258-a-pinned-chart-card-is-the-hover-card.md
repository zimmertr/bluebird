# 0258. A pinned chart card is the hover card it was pinned from, at its size

- Status: Accepted; amends 0255
- Date: 2026-10-30
- Decider: the maintainer (TJ), on PR #828's pinned cards in production
- Issues and PRs: #499, #828
- Cited in code as: none; `styles.ts` (`CHART_CARD`) and `TimeSeriesChart.tsx` (`PinnedCard`) cite the maintainer and the date
- Guide: `components/` guide: `TimeSeriesChart.tsx`; `STYLES.md`; `USAGE.md`

## Context

A click on the chart pins its hover card (record [0255](0255-chart-metrics-as-panels.md)). The pinned card kept the hover card's height, and nothing else about its size. Four differences grew it as it pinned:

- Its ✕, a 22px square, stood taller than the band's 13px title, whose line is about 17.3px, so the band grew.
- Its heads added a `Name` head over the names, and every head kept a slot for the sort arrow, so the card grew wider.
- A hairline above every row added a pixel a row.
- It scrolled through every row, where the hover card counts the rows it cut in a `+N more` foot.

The maintainer saw the card jump on pinning, 2026-10-30, and asked for the pinned card to look like the hover card.

## Decision

A pinned card is the hover card it was pinned from, at the same size, and keeps its tools.

- **The ✕ stays in the band** and is pulled into the title's line by negative margins (`-my-[3px]`, `-my-2` on a touch screen's 32px square), so the band is no taller than the hover card's.
- **The heads are the hover card's.** There are none over a single metric, and over several there is no head over the names. The sort arrow is drawn only on the head that orders the card, outside it in the gap before it, so a head is as wide as the hover card's. The names' column keeps its resize edge.
- **No rule between rows.** A row still lights under the pointer.
- **The rows the height holds, and the rest counted** in the hover card's `+N more` foot. The body clips rather than scrolls, and the corner grip is how a reader sees more: a taller card holds more rows, and the count drops.

## Consequences

- The names can no longer be sorted, because there is no head to press. Over a single metric the card has no heads, so it cannot be sorted at all and stays high to low.
- The count is measured after each render: every row is laid out, and those past what the body holds are hidden.

## Alternatives rejected

- The hover card frozen, with a ✕ and nothing else: it drops the sort, the column sizing and the corner grip that #828 added.
- The same size with the body still scrolling every row: the scroll was the one part of the card the hover card does not have.
