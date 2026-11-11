# 0281. The coordinate lists are described by a manifest, and their menu is searched and browsed

- Status: Accepted. Supersedes [0263](0263-coordinate-search-loads-preset-lists.md) in part (the directory as the list, file names as menu strings, and the flat alphabetical menu). Superseded in part by [0283](0283-a-menu-rows-description-is-italic.md) (the description under the field, and the description's type)
- Date: 2026-11-05
- Decider: the maintainer (TJ), on issue #848, 2026-11-04 to 2026-11-05
- Issues and PRs: #848, #893, #838, #864
- Cited in code as: #848
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `coordinate-lists/` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `presetLists.ts`, `listbox.ts` and `viewPrefs.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `Menu.tsx` and `DestinationsSection.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useStarredLists.ts` bullet; [`docs/USAGE.md`](../USAGE.md), Coordinate search

## Context

Record 0263 shipped the Coordinate list field with four Washington lists. The directory was the list: a file's name was its menu string, and the menu read the files alphabetically. Issue #848 takes the field to 74 lists across the United States. A file name cannot carry a region, a peak count, a description or a source, and 74 names in alphabetical order fail a reader who knows only their state. Issue #864 also wants a share link to name a list, which a file name with spaces and an apostrophe serves badly.

## Decision

- **One manifest describes the lists**: `frontend/src/coordinate-lists/lists.json`, with its JSON Schema beside it in `lists.schema.json`. Each list has an `id`, a `name`, a `description`, a `region`, a `file`, a `peaks` count, a `source` (site, list id and URL), a `credit` and the day it was `crawled`. The manifest also lists the `regions`, the menu's headings in the menu's order, each with the states it covers when its heading names none (`places`), which a search also matches.
- **An `id` is a slug that never changes once shipped.** It matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Each CSV is named by its id and holds rows only. The menu's words live in the manifest alone, so renaming a list is a manifest edit.
- **The manifest and the CSVs stay frontend assets.** The manifest is imported into the app's script. Each CSV is still a hashed asset fetched on the pick, as record 0263 settled. No backend route.
- **No `bounds`.** The chosen menu reads none, and the map already frames whatever rows the box holds.
- **The menu is direction P5 of the lab.** A search box on top. Then `Starred`, shown only once a list is starred. Then each region that holds a list, as a heading that opens in place, one at a time, with its list count. `Custom coordinates` stays last, under a rule.
- **Every list row ends in its peak count and an info button.** The info button opens the list's description under the row, one at a time. Each row starts with a star, a toggle that keeps the list under `Starred`.
- **A search replaces all of that with its matches**, under their regions' headings. It matches a list's name, its region's heading and the region's `places`, and never a peak's name. Each match shows its description under it, with no info button: a reader who is searching is comparing.
- **After a pick the description stands under the field**, in the helper's italic, for as long as the box holds exactly that list.
- **Stars are this browser's habit.** They live in local storage under `bluebird_forecast_starred_lists`, like the theme (record 0158), and never ride a share link. A blocked storage leaves the menu working, with stars that last the visit. The privacy page names the key.
- **There is no Recent group.**
- **A list appears once, in its home region**, however many states it crosses.
- **The menu opens on the picked list's region, or on the only region when there is one.** The second rule is for the weeks between this change and the crawl: four Washington lists under one shut heading would cost every reader a press.
- **It is the one menu** (record 0201): `MenuBrowse` in `Menu.tsx`, on the same card at a desk and in the same sheet on a phone. Its rows are buttons in groups and no listbox, because a listbox holds options alone and each row carries a star and an info button beside the pick.

## Evidence

- The maintainer picked 74 lists and approved every name, description and slug on 2026-11-05. The table is on issue #848.
- The lab held sixteen working directions, each at a desk and on a phone in both themes: https://claude.ai/artifact/K8XvT8K9Ziqiwy2hzAU8kW (private). The maintainer chose P on 2026-11-05, and P5 among its five ways to show a description the same day.
- The 74 approved names, slugs and descriptions were 9.6 KB as JSON before compression (measured 2026-11-05). The cold load's script budget is in `.github/lighthouserc.js`. The Lighthouse check passed on #893 with the manifest imported and four lists in it (2026-11-10); the second PR measures it again with all 74.
- The four shipped CSVs hold 100 rows each (2026-11-10), which `presetLists.test.ts` recomputes.

## Alternatives rejected

- **The directory as the list** (record 0263): a file name carries one string and nothing else.
- **`bounds` on each list**, for a menu that orders lists by the map's view: dropped on 2026-11-05 with that menu.
- **A backend route for the lists**: the lists change with a release and never between two, so a route would add a request and a failure for nothing.
- **Lab directions A to O**: a grouped menu with a filter, two fields, lists in the map's view first, a map of the country in the menu, a full sheet with chips, list cards, several lists at once, lists drawn on the map, chips over the map, lists in the map search, a command palette, lists from a peak's card, and Destinations in tabs. The maintainer chose P over each on 2026-11-05.
- **P1 to P4**, the other ways to show a description: under the field only, a second line on every row, an info button only, and under the field and in search. P5 combines the first, third and fourth.
- **A `Pinned` heading**: the maintainer named it `Starred` (2026-11-05).
- **A `Recent` group**: declined on 2026-11-05.
- **Searching peak names**: declined on 2026-11-05. The manifest holds no peak names, and reading them would mean loading every CSV.

## Consequences

`presetLists.test.ts` holds the manifest to its schema with `ajv`, a dev dependency, and to the directory: ids and names are unique, every CSV has one entry and every entry one CSV named by its id, each `peaks` is its file's row count, no list is longer than one analysis takes, and the region headings are the approved ten in the approved order. A new heading fails that last test until the maintainer approves it. `Menu.test.tsx`, `DestinationsSection.test.tsx`, `viewPrefs.test.ts` and `listbox.test.ts` hold the menu, the stars and the search. `legal.test.ts` fails a storage key the privacy page does not name. `styles.test.ts` measures the menu's inks on the card in both themes.

A list's name and description are user-facing strings in a JSON file, where no lint reads them, so the maintainer approves each before it lands (record 0064). A slug cannot be corrected after it ships. The `peakbagger-list-csv` skill still writes a CSV named as the menu reads it until #848's second PR reworks it, and a file it wrote today would fail the manifest tests.
