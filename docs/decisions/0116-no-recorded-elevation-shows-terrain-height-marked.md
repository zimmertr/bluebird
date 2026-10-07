# 0116. A row whose place has no recorded elevation shows the terrain height it was read at, marked, with one note under the table

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on PR #674, choosing "show terrain height, marked" over nulls and over a blank cell, and writing the note's words
- Issues and PRs: #673, #674, #508 (the mark-and-footnote pattern this reuses), #545 (where the analysis path began reading the terrain height)
- Cited in code as: #673
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `ResultsTable.tsx` and `ResultsTableRow.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `tableColumns.ts`, `resultsCsv.ts` and `openMeteo.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useTableView.ts` bullet
- Related: 0114 (the lookup that leaves these rows), 0022 and 0045 (wind and temperature read at the destination's elevation), 0051 (no method in a column header)

## Context

Since #545 the browser's analysis path asks Open-Meteo for every row with no elevation at the terrain height Open-Meteo resolves for its coordinate, so the wind, the temperature and the cloud deck are read at the ground rather than at the surface layer. A pasted point no source can place (two of the maintainer's 100 Washington summits, Raven Ridge and Dorado Needle, are OpenStreetMap nodes with no `ele` tag), a clicked place with none, and a discovered lake or trailhead with none all take that path. Until this record their Elevation cell read blank: the numbers beside it were read at a height the table did not show, which the maintainer called a lie to the reader ("forecasts without the elevation lie to the user", 2026-10-07).

Three answers were on the table. Nulls for every height-read cell, which makes `wind_*` and `temp_*` nullable on the wire and the release a major. A blank cell, the status quo, which hides the height the numbers were read at. Or the terrain height itself, shown and marked as an estimate, which is what the numbers were in fact read at.

## Decision

**The Elevation cell shows the terrain height the row was read at, with a dagger raised beside it, and one line under the table says what the dagger means.** The reduce (`reduceWeather` in `openMeteo.ts`) reports the height it read at when that height was the terrain's (`terrain_ft`, whole feet, a client-only field the API never sends); `readAtTerrainHeight` in `tableColumns.ts` is the one predicate (no recorded elevation, a terrain height held); the cell prints the height with `TERRAIN_HEIGHT_MARK`; the table prints `TERRAIN_HEIGHT_NOTE` once while the Elevation column is drawn and a row on display shows one. The note's words are the maintainer's: `† Elevation data is unavailable for this destination. This value is estimated based on nearby terrain.`

**The dagger, not the asterisk.** A compared row can carry the Model cell's `*` (#508) at the same time, and two notes opening with one sign would read as one note.

**The file writes the height plain and marks the name.** The Elevation column stays numbers a spreadsheet can sort and average, so the mark rides the Name cell, the row's one text cell, as `Raven Ridge†`, the way the model mark rides the Model cell; the note follows the forecast window rows behind one blank row, after the model coverage note when both apply, and only when the file carries the Elevation column and a marked row.

**Every row read at terrain height is marked, whatever its kind.** A pasted point, a clicked place, and a discovered lake or trailhead with no recorded elevation all read their numbers the same way, so one rule and one note cover them.

**The header sort reads the number shown.** A header click on Elevation sorts a terrain row by its terrain height rather than as a null.

**A row the lookup still means to answer keeps ticking.** The terrain height shows only once the row is no longer in the lookup's `inquiring` set (0114); a late answer re-reduces the row at the recorded elevation and the mark goes.

## Evidence

The maintainer's 100-row list on 2026-10-07: 97 rows placed by the tiles and the pod, and two OpenStreetMap nodes with no `ele` anywhere, whose wind and temperature were read at the terrain height with a blank Elevation cell. The terrain height Open-Meteo resolves sits within 12 to 155 m of four Cascade summits measured 2026-09-22 (0051), which is why it is an estimate worth showing rather than a number to hide.

## Alternatives rejected

- **Nulls for the height-read cells.** Honest about the elevation and dishonest about the forecast: the numbers exist and were read at a known height. It also makes `wind_*` and `temp_*` nullable on the wire, a `feat!:` major release for two rows in a hundred.
- **A blank cell, as before.** Hides the one number that says what the row's wind and temperature mean.
- **A tooltip on the cell.** Not on touch (0064).
- **The asterisk shared with the model coverage mark.** Two footnotes with one sign.
- **A mark inside the file's number.** Turns the column into text (#508).

## Consequences

A row with no recorded elevation reads, for example, `7,119†` in the Elevation column with the note under the table, and `Raven Ridge†` and `7119` in the file with the note behind the window rows. A discovered lake with no `ele` tag carries the same mark. The row type grows a third client-only field (`terrain_ft`, beside `series_times` and `wind_dir_deg` in `api-compat.ts`'s `ClientOnly`). The API's rows are unchanged; an API caller's list keeps a null elevation where it had one.
