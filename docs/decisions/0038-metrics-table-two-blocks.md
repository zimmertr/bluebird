# 0038. One Metrics table replaces Ranking and Filters, in two blocks with nothing between them

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 80

The `Options` panel section is **gone**, and since #341 so are `Ranking` and `Filters`: one `Metrics` table carries each metric's radio, aggregate dropdown and two bound boxes on one row. It reads in two blocks with NOTHING drawn between them (a rule was tried in both weights and rejected: that weight only ever says a new section begins). First the two wide controls that say how the list is ordered, `Rank by` — one segment, because the direction is a property of the ranking rather than of each metric, and four of five per-row segments were always disabled — and `Max results` under it. Then the `Min`/`Max` headings. Then the rankable metrics, one row each, alphabetically by noun; a snapshot family renders no aggregate dropdown and leaves that grid cell empty, because the four tracks are what line its bound boxes up with the two wide controls above (#449). What tells the blocks apart is shape, two wide controls over a table of narrow ones. The units live in the boxes' placeholders, because `Freezing level (ft)` does not fit beside three controls.
