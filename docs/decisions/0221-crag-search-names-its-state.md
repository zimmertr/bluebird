# 0221. A crag's Mountain Project search names the crag's state

- Status: Accepted. Amends [0159](0159-crags-destination-type.md) (a crag row's name links to a Mountain Project search by name).
- Date: 2026-10-22
- Decider: the maintainer (TJ), after Family Wall at Little Si linked to other states' walls: of the options put to him, "State only, drop the tag".
- Issues and PRs: PR #797
- Cited in code as: none
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `destinationUrl.ts`, `usStates.ts` and `usStatesLoad.ts`; [`docs/DATA.md`](../DATA.md), Mountain Project

## Context

0159 sent a crag's link to a Mountain Project search by its name. That works for a distinctive name and fails for a common one. On 2026-10-22 the crag marker for Family Wall near Mount Si linked to `search?q=Family%20Wall`, whose first page listed walls in North Carolina, California and Colorado. The one at Little Si (`/area/124872576/family-wall`) was not on it.

## Decision

- **Inside the fifty states, the search is the name and the state**: `Family Wall Washington`. Mountain Project files every US area under its state, spelled as the Census spells it, and its search matches the words of an area's path as well as its name.
- **Outside them, or before the outlines arrive, it is the name alone**, which is the link 0159 shipped.
- **The state comes from bundled outlines.** These are the Census Bureau's 2024 cartographic boundaries, rebuilt by `frontend/tools/us-states/build.sh`. Each border between two states is kept to 250 m, and each coast to 1 km (3 km in Alaska and Hawaii), because only a border decides which state a crag is in. A point off a simplified coast takes the nearest state within that coast's tolerance and no further.
- **The outlines are fetched, not bundled into the cold load**: a hashed asset, fetched once the first time a crag is about to show. That moment is a crag marker in view, a crag row in the table, or a crag's card opening. A link drawn before they arrive is drawn again when they do.

## Evidence

Measured 2026-10-22:

- Mountain Project's search, Areas section: `Family Wall Washington` listed only Little Si's Family Wall. `Lower Town Wall Washington` listed Lower Town Wall first, and `Midnite Boulder Washington` listed that boulder alone. `Main Wall Washington` narrowed a national list to Washington's eight.
- Mountain Project's route guide lists fifty top-level areas, one per state, plus International. `usStates.test.ts` holds the outlines to that list.
- Of 80,000 random points over the lower 48, Alaska and Hawaii, the simplified outlines gave a different state than the full-resolution ones in 23 points. All 23 were within 95 m of a state line. Sea or foreign land was given a state only within the coast's tolerance (1,057 m at most in the lower 48, 4,071 m in Hawaii). A lookup took about 5 µs.
- The file is 137,125 bytes, 54,610 gzipped. Alaska was 6,902 of 21,981 vertices before its coast took 3 km.

## Alternatives rejected

- **A link to the crag's own page from OpenStreetMap's `climbing:url:mountainproject` tag.** About 522 features carry it, out of roughly 16,600 crags, areas and boulders, and Family Wall does not. It would also need a column in the places table, the planet fill, the daily update, the readers, a re-fill and a new API field. The maintainer dropped it.
- **OpenBeta's API**, which holds Mountain Project ids and answers by location. Its copy of Mountain Project predates Family Wall (id 124872576). The nearest area it returned was Blackstone, 911 m away, so matching by distance would have linked the wrong wall.
- **Mountain Project's own API**: shut down in 2020, and scraping is against its terms.
- **The outlines at one tolerance everywhere**: 125 kB gzipped at 1 km, most of it coastline that decides nothing.
- **A lazy `import()` of the outlines**: a stale tab's failed import reloads the page through `staleChunk.ts`.
- **The crag group's name in the search** (`Canopy Crag Group`): the search needs every word, and OpenStreetMap's group names do not follow Mountain Project's (`Exit 32; Little Si`), so one more word can empty the list.

## Consequences

`usStates.test.ts` pins the state list, named crags on both sides of tight borders (the Columbia at Beacon Rock and Broughton Bluff, Cave Rock above Lake Tahoe) and crags in Canada and Mexico that must find none. `destinationUrl.test.ts`, both popup suites, `ResultsTableRow.test.tsx`, `useUsStates.test.tsx`, `usStatesLoad.test.ts` and `landmarks.test.ts` hold the link, the redraw, the fetch and the preload. The cost:

- A crag within about 100 m of a state line can get its neighbour's name, and the search then misses it.
- A crag in Canada or Mexico within about a kilometre of the border (3 km by Alaska) gets the state across it.
- The first crag of a session costs a 55 kB fetch.
- The outlines are a file to regenerate if Census boundaries move.

The maintainer credited the Census Bureau in `NOTICES.md` alone, under Bundled data, and not on the privacy and terms pages (2026-10-22): the browser never contacts it, and those pages list the services it does.
