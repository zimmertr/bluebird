# 0016. A map overlay is never a knob

- Status: Accepted
- Date: 2026-08-04 (git: the merge of #245)
- Decider: TJ (git: author and merger of #245)
- Issues and PRs: #121, #123, #245, #246, #248, #249, #295, #334
- Cited in code as: #121, #123, #245, #246, #249, #295
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "A map overlay is never a knob at all"

## Context

Wildfires, rain radar, smoke, snow depth and the forecast grid draw beside the ranking. Timeline playback recolours markers to one hour of a grid the analysis already fetched.

## Decision

No overlay and no timeline action is a knob. None touches `commitNeeded` or the `analyzed` snapshot, and none changes which rows show or how they rank.

- The Forecast player is a row in the Layers popover and draws nothing. Its state is `boolean | null`, where null is the device default: on at a desktop width, off on a phone. Only a reader's own choice reaches the URL, as `player=1` or `player=0`.
- The forecast grid is the one overlay whose toggle spends. It fetches after the report commits, takes its window, model, source and pitch from the snapshot, and is metric-agnostic: one fetch covers every weather variable and AQI, so its fetch is never keyed on `sortBy`.
- The grid is out of play over a report with any archive hours (`gridAllowed`, #123), a window that crosses the boundary included.

## Evidence

No dated measurement. The archive answers from a reanalysis on a coarser grid than any model's finest figure, so a lattice over archive hours would paint real numbers at a pitch nothing produced them at, and the legend would state that pitch.

## Alternatives rejected

- A grid over archive hours: a false pitch on the legend.
- A grid over a window that crosses the archive boundary: one stated pitch cannot be honest about half a report.
- A grid fetch keyed on the ranking: a ranking switch would fetch again, where one fetch already holds every metric.
- Leaving the freezing level off the grid: #295 excluded it, and the exclusion was reversed on 2026-09-14. A sample with no number is skipped alone.

## Consequences

Playback changes the legend's bands, not its title, because precipitation ranks on a window total and plays back as an hourly rate (`hourlyScale` in `colors.ts`). The disabled grid row says why in its `title`, with the same sentence in a hidden twin that `aria-describedby` names, since a tooltip does not exist on touch.
