# 0069. The metric colour scales are not re-derived for colour vision deficiency

- Status: Accepted
- Date: 2026-08-07, the day #255 was closed (source: the issue's close event)
- Decider: TJ (closed #255 with the comment "Choosing not to implement, colors are ugly")
- Issues and PRs: #255, #445
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `colors.ts` bullet

## Context

The map marks each destination with a colour and nothing else. #255 (2026-08-06) reported that a reader with a colour vision deficiency cannot tell the steps apart, which is WCAG 2.2 success criterion 1.4.1 (colour is not the only way to give information). The finding was first reported in an earlier review, deferred twice and found again. It proposed three fixes, and the review that filed it treated it as a 1.0.0 blocker.

## Decision

The scales in `colors.ts` keep the hues they were designed with. They are not re-derived so that lightness runs in one direction, they are not replaced with a scale built for colour vision deficiency, and the markers carry no shape or pattern per band. The number behind a colour stays readable in text: the results table cell and the marker's popup print it, and the legend prints numbers along its strip.

#445 (2026-09-16) rebuilt the scales for other reasons (temperature, the precipitation rate and the wind's top band) and stated that it did not reopen this question.

## Evidence

Measured in #255 on 2026-08-06, on the five-step ramp precipitation, wind and temperature then shared (`#22c55e`, `#84cc16`, `#eab308`, `#f97316`, `#ef4444`): the best step against the worst was 1.65:1 in contrast under normal vision and 1.28:1 under tritanopia, the first three steps were 1.10:1 under protanopia, and lightness did not change in one direction under any of the three. The six-band scales #445 shipped have not been measured this way.

## Alternatives rejected

- Keep green through red and re-derive each step so that lightness changes in one direction (#255 Option A, its recommendation): declined with the issue.
- A scale built for colour vision deficiency, such as viridis (#255 Option B): declined with the issue. #255 noted its cost: green would no longer mean the good end, which changes every screen at once.
- A shape or pattern on each marker (#255 Option C): declined with the issue.

## Consequences

Colour remains the only channel on a map marker and on a forecast grid cell, so a reader who cannot separate the hues reads the map through the table, the popup and the legend's numbers. Cloud cover (slate) and the cold ramps of the freezing level, snow depth and cloud base were not part of #255's measurement. A later change that reopens this needs the maintainer's decision and a new record that supersedes this one. Nothing in the tests holds the decision.
