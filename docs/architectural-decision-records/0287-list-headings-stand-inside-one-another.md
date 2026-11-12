# 0287. The list menu's headings stand inside one another, and the lists reach past the United States

- Status: Accepted. Amends [0281](0281-coordinate-lists-in-a-manifest-and-a-browsing-menu.md) (the flat region headings, and what a search matches)
- Date: 2026-11-11
- Decider: the maintainer (TJ), on issue #892, 2026-11-11
- Issues and PRs: #892, #910, #848
- Cited in code as: #892
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `Menu.tsx` bullet; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `coordinate-lists/` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `presetLists.ts` bullet; [`docs/USAGE.md`](../USAGE.md), List search; [`docs/STYLES.md`](../STYLES.md), `MENU_BROWSE`

## Context

Record 0281 gave the Coordinate list menu one level of headings: ten regions of the United States, each opening to its lists. Issue #892 adds lists from Canada, Britain and Ireland, the rest of Europe, Asia, Australia and New Zealand, South America, Africa and the world as a whole. A heading for each country at the level of `Washington` would put `Scotland` beside `Colorado`, and the menu would read as one long run of places of every size.

A lab page offered three shapes (flat, folded under a continent, folded under a country) and whether the United States should open by itself. The maintainer picked the shape and the lists from it on 2026-11-11.

## Decision

- **Headings stand inside one another.** A region in `lists.json` may name a `parent`, and its heading then stands under that region's heading. The top level is continents: North America, Europe, Asia, Australia and New Zealand, South America, Africa and Worldwide. `United States` and `Canada` stand under North America, and the ten regions of record 0281 under United States. Europe holds `Britain and Ireland` (with Scotland, England, Wales, Ireland and Across Britain and Ireland under it), then Alps, Central Europe, Southern Europe and Across Europe. Every other continent, and Canada, holds its lists directly.
- **Headings sort A to Z, lists do not.** Under each parent the headings stand in alphabetical order (Africa first, Worldwide last; Alaska first among the United States' regions), sorted in `presetLists.ts` so a heading added later lands in its place. The lists under a heading keep the manifest's order, which leads with the list a reader looks for first: Munros before Munro Tops. The maintainer chose this on 2026-11-12 over a hand-set geographic order and over sorting the lists too.
- **Nothing opens by itself.** The menu opens on the path to the picked list, or on the only top heading when there is one, as before. The maintainer declined a United States that opens on its own.
- **One path is open at a time.** Opening a heading shuts every heading not over it. Pressing an open heading shuts it back to the one above. Under an open heading its headings come first, then its own lists.
- **A heading counts every list under it**, at any depth. A heading with no list under it at any depth is not drawn.
- **A search reaches up the tree.** It matches a list's name, its heading, that heading's `places`, and the name and `places` of every heading over it. So `Europe` finds every list in Europe, and `Japan` finds the lists under Asia.
- **Every list comes from peakbagger.com**, Britain and Ireland included, read from its Wayback Machine captures as the US lists were. Eleven picks peakbagger does not carry were dropped rather than built from another source. Two rosters were read once from peakbagger.com and kept beside the crawl: the New Zealand 100 Peaks Challenge's, which no capture holds, and UK County and Council High Points', whose capture dated from 2023 and lacked Helvellyn. 476 peaks with no captured page had their coordinates read from peakbagger.com the same way, with the maintainer's yes on 2026-11-12.
- **A row OpenStreetMap cannot place stays as it is.** 843 of the 7,769 new rows get no elevation from the lookup: the summit is unmapped, or OSM's point stands more than 150 m off (300 m for the same name) or spells the name otherwise. They forecast at the terrain height under the dagger (record 0116), as any pasted point does. The maintainer declined an elevation field in the CSV, a hidden elevation per list, and a looser name match on 2026-11-12.
- **The words are the maintainer's.** Every heading, list name and description was approved on a words page before it landed.

## Evidence

- The lab page and the maintainer's picks: 86 lists, of which 73 remain after the drops above (issue #892, 2026-11-11).
- The survey counted 24 of 415 non-US list pages at zero peaks. Those pages carry two or three cells between a peak's rank and its link, where the crawl's parser allowed one. With the parser passing over up to three, the 24 parse and the other 391 parse as before. That fix ships in the crawl skill in this PR.

## Consequences

- `lists.schema.json` gains `parent`, and `presetLists.test.ts` holds each heading to its approved parent and every parent ahead of the headings under it.
- A list's `region` must be a heading. A list may sit under a heading that also has headings under it (Canada, for one).
- `MENU_BROWSE.nest` steps in once per level, so a list three headings down stands 24px in.
