# 0308. The map's view is the search area, and a sentence bar holds what a Forecast spends

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves its strings and merges it. Would supersede the docked desk panel of 0202 and the panel half of 0028.
- Date: 2026-11-18
- Decider: the maintainer, 2026-11-17 ("build it in a pr", from the prototype)
- Issues and PRs: #825
- Cited in code as: record 0308
- Guide: `frontend/src/utils/CLAUDE.md` (`searchArea.ts`, `sentenceBar.ts`), `frontend/src/components/CLAUDE.md` (`SentenceBar`, `DocLinks`), `frontend/src/hooks/CLAUDE.md` (`useSearchArea`)

## Context

A desk opened on a 360px panel of three sections, and nothing could be forecast until a ring was drawn. The from-scratch prototype treated the map's view as the area a reader is already looking at, and put everything that costs a forecast into one line over the map: what to find, where, over which hours, and one button that says what it will spend.

## Decision

While no ring is drawn and a kind of place is ticked, the search area is the box the map's view covers lying flat, as a four-cornered ring. It goes to the gate, the count ahead of Forecast and the command exactly where a drawn ring went, so every rule a ring obeys, the area cap among them, holds for the view with no second spelling. The link and the commit cues keep the drawn ring alone, so a pan writes no ring into a link and raises no cue. A drawn ring of three points or more wins over the view, and a list with no kind ticked searches no ring at all.

At a desk the docked panel is gone. The map's chip row carries the sentence bar: the product's name, a Where chip, a When chip, a Limits chip, the Forecast button with its message badge, and the theme switch. Each chip opens its panel section as a card under the bar, one at a time, with the section's own controls. The button names the spend: `Forecast 247 peaks` ahead of a first run where the count is known, `Forecast 31 new` once a report holds forecasts for the same window and model, `Up to date` when it holds them all, and `Forecast` where nothing is counted. The run a link asks for on open is the bar's, since the cards come and go. The Tutorial, Privacy and Terms links stand on the map's credit line (`DocLinks`). A phone keeps its Controls sheet in this PR.

## Evidence

- `searchArea.test.ts` pins which ring wins and that a pan of under 8 m is not a new area.
- `sentenceBar.test.ts` pins each label; `SentenceBar.test.tsx` pins which card each chip opens and the run on open.

## Alternatives rejected

- Keep the panel beside the bar: two homes for the Forecast button, and the badge's one-per-button rule (`style-analyze-badge`) says one.
- Freeze the view at each Forecast and cue a pan: a pan is how a reader looks around, and a cue for each would read as nagging.

## Open

- The area cap's message still names the polygon when the view is too large; it wants a "zoom in" sentence, which needs the maintainer's wording.
- `Forecast 31 new` counts what the held report lacks, not whether the held forecasts are still within `FORECAST_REUSE_MS`.
