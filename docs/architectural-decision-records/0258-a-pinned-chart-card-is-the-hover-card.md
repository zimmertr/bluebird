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
- Its heads added a `Name` head over the names, which the hover card did not have, and every head kept a slot for the sort arrow, so the card grew wider.
- A hairline above every row added a pixel a row.
- It scrolled through every row, where the hover card counts the rows it cut in a `+N more` foot.

The maintainer saw the card jump on pinning, 2026-10-30, and asked for the pinned card to look like the hover card.

## Decision

A pinned card is the hover card it was pinned from, at the same size, and keeps its tools.

- **The ✕ stays in the band** and is pulled into the title's line by negative margins (`-my-[3px]`, `-my-2` on a touch screen's 32px square), so the band is no taller than the hover card's.
- **Every card carries the heads, `Name` included.** The hover card gained `Name` over its names, and its heads row over a single metric too, which it had left out because the picker names the unit. So the pinned card keeps its heads, sorts by name or by any metric, and is still the hover card's size (the maintainer, 2026-10-30, over dropping the name sort). The hover card's row count allows for the heads row: `TOOLTIP_CHROME_PX` went from 78 to 98, the 20px being a 16px line, the 1px rule and its 3px margin.
- **The sort arrow is drawn only on the head that orders the card**, outside it, so a head is as wide as the hover card's: in the gap before a metric's head, and after the names' head, in the room the name column has past its word.
- **No rule between rows.** A row still lights under the pointer.
- **The rows the height holds, and the rest counted** in the hover card's `+N more` foot. The body clips rather than scrolls, and the corner grip is how a reader sees more: a taller card holds more rows, and the count drops.

## Consequences

- A one-metric hover card is one row taller, for its heads, and lists one row fewer where the plot is short.
- The count is measured after each render: every row is laid out, and those past what the body holds are hidden.

## Alternatives rejected

- No head over the names on either card: a pinned card could not be sorted by name, which the maintainer needs.
- Heads over two or more metrics only: a one-metric pinned card could not be sorted by name.

- The hover card frozen, with a ✕ and nothing else: it drops the sort, the column sizing and the corner grip that #828 added.
- The same size with the body still scrolling every row: the scroll was the one part of the card the hover card does not have.
