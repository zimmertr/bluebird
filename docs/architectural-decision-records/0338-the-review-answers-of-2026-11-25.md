# 0338. The maintainer's review answers of 2026-11-25

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0309](0309-the-view-is-the-search-area-under-a-sentence-bar.md) (the area line over a view). Confirms [0312](0312-a-desk-stands-its-results-in-a-column.md), [0324](0324-archivo-and-38px-map-tools.md), [0330](0330-a-phone-sheet-ranks-by-a-lens-in-compact-rows.md), [0310](0310-the-cloud-sea-is-drawn-from-the-report.md) and [0332](0332-the-review-answers-of-2026-11-21.md) as built.
- Date: 2026-11-25
- Decider: the maintainer, 2026-11-25, answering the review list the build left
- Issues and PRs: #825, #965, #959
- Cited in code as: TJ, 2026-11-25
- Guide: `frontend/src/utils/CLAUDE.md` (`panelMessages.ts`); `docs/USAGE.md`

## Context

The from-scratch shell finished with a list of calls made while the maintainer was away, a strings table waiting for approval, and a rival PR (#959) for the same job. Eight of those calls changed how the app behaves or reads.

## Decision

- **Both shells stay open.** Neither #965 nor #959 is chosen yet; #965 keeps current with main and stays green, so the two can be compared.
- **The chart stays in the widened column** behind `Every column`, with the toolbar, rather than in a pane under the map (0312 as built).
- **Over a view too large to forecast, the area line reads `Zoom in to forecast here.`** A view has no edge to drag, so the line names the one move that shrinks it. A drawn loop over the cap keeps the polygon's sentence and its published maximum.
- **The strings in the PR's table are approved as written**: `Wind (mph)`, `Low (°F)`, the opened row's key and fact labels, `{n} h of daylight`, `Show on map`, `Details for {name}` and `Every column`.
- **Archivo stays the face** (0324), over the Inter that #984 fixed on main.
- **A keyboard opens a compact row through its `Details for {name}` button** (0332 as built): it takes focus by Tab and opens with Enter or Space.
- **The cloud sea carries no legend line.** It reads as cloud on the terrain, and its Layers row already names it `Cloud deck`.
- **A phone's compact rows stay rank, name, score and hours** (0330 as built). Wind and Low are one press away in the opened row or in `Every column`.

## Consequences

- One new string, `Zoom in to forecast here.`, joins the strings table, approved here.
- The area blocker reads which source the search area came from (`viewIsArea`, from `searchArea`'s `view` source), so `panelMessages.ts` takes one more input.
- The known gaps lose the area line and the cloud sea's missing key.
