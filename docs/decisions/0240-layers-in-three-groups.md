# 0240. The Layers rows stand in three groups, Base map, Hazards and Forecast, under muted headings, by kind inside each, and the legend follows their order

- Status: Accepted. Amends 0019 (the rows are grouped under headings, not alphabetical) and 0048 (the legend's sections read in the menu's order, not alphabetically).
- Date: 2026-10-29
- Decider: the maintainer (TJ), on #799, 2026-10-29, from a lab of the Layers menu that grouped its rows four ways and marked the groups three ways: three groups, marked by headings, the headings in sentence case and muted rather than the panel's small caps, named `Base map`, `Hazards` and `Forecast`, the ground first, and the rows ordered by kind. The legend following the menu's order was in the brief that came with it. The heading's spacing and the metric key's place in the legend were the implementer's, for review on the pull request.
- Issues and PRs: #799, #823
- Cited in code as: record 0240
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MapLegend.tsx`/`LayersPopover.tsx` bullet; [`frontend/src/utils/forecastGrid/CLAUDE.md`](../../frontend/src/utils/forecastGrid/CLAUDE.md), the Layers rows and the legend's sections; [`docs/STYLES.md`](../STYLES.md), `MENU` and `MENU_GROUP`; [`docs/USAGE.md`](../USAGE.md), Map layers and The map's legend
- Related: 0117 (a bounded row greys), 0174 (the desk's chips and their cards), 0208 (one list for the Analyze button's messages, the other grouped list in the app), 0227 (Shift ranges on every group of checkboxes)

## Context

The Layers rows were alphabetical by label since record 0019, which held while they were a handful of unrelated switches. #799 brought them to thirteen, and the alphabet parted the rows that belong together: `Fire activity` stood second and `Wildfires` last, `Satellite`, `Shaded relief`, `Slope angle` and `Topographic` stood in two places around `Smoke` and `Snow depth`, and `Area closures` first with `Trail closures` twelfth. The maintainer called the list disorganised (2026-10-29). The legend card read its sections alphabetically by the same rule (record 0048), so it parted the same keys.

## Decision

- **Three groups, by what a layer changes.** `Base map` changes the map itself: Satellite, Topographic, Shaded relief and Slope angle. `Hazards` draws a danger on it: Wildfires, Fire activity, Smoke, Area closures and Trail closures. `Forecast` draws the weather on it: Rain radar, Snow depth, Forecast grid and Forecast player. The ground comes first.
- **By kind inside a group, not by name.** The imagery before the drawn base and the relief before the slope read off it; a fire before its detections and its smoke; an area closure before the trails it closes; the observed weather before the forecast, and the player last, since what it plays is the forecast.
- **A heading over each group**, `MENU.heading`: the caption step in semibold, sentence case, `text-ink-soft`, which is the rows' own 12px in a quieter ink and a heavier weight. It is read and never pressed. The headings are not indented and neither are the rows, so the list keeps one left edge.
- **At a desk** the heading stands on the card with 6px over every group but the first (`MENU_GROUP.card`) and 2px under it (`cardHeading`), and no rule. **On a phone's sheet** each group is one child of the sheet's body, so the sheet's rule falls over the heading, and the group draws the same rule between its heading and each row (`MENU_GROUP.sheet`, the sheet's own `divide-y divide-rule` held in one constant); the heading stands 8px under its rule and 4px over the next, shorter than the 32px rows (`sheetHeading`, `sheetRow`).
- **Each group is a `role="group"` named by its heading**, so a screen reader hears a box with the group it stands in.
- **A Shift range runs down the whole list, across the groups** (record 0227): the press order is the thirteen rows flattened in the order they stand.
- **The legend card reads in the menu's order**: the metric key first, then the slope bands (the base map's one key), the hazards and the forecast, each section where its row stands in the menu. No headings there: the legend is a key, not a list of switches, and a section stands only while its layer is on, so a heading would often head one line. The metric key leads because it keys the markers, which stand on the map whatever layer is on; sorted by its label, it moved with every ranking. The sections are written in order rather than sorted.

## Evidence

The lab (artifact `ULTfeNvb3LHR2GZ8bakZCT`, 2026-10-29) drew the menu at a desk and as a phone sheet in both themes, alphabetical and in four, three and two groups, marked by headings, rules or gaps, with three sets of names, the rows alphabetical or by kind, and the ground first or last. The maintainer's settings are the decision above.

MEASUREMENTS

## Alternatives rejected

- **Alphabetical**, record 0019's order since 2026-08-04: no learning, and the pairs split.
- **Four groups**, fire apart from closures, and **two**, the ground and then everything on it alphabetical: the lab's other groupings.
- **Rules or gaps alone** between groups: they mark where a group ends but not what it is.
- **The panel's small caps** for the headings (`TEXT.overline`, as the model list's group heads wear): they shout over a list of short rows.
- **The headings at the 11px step** (`MICRO_SIZE`): MICRO11
- **Indented rows under a heading**, which record 0019 tried and reverted: not tried again. The rows keep their place and the heading stands on the same edge.
- **Headings in the legend**: see the decision.

## Consequences

`styles.test.ts` pins the three headings and the thirteen rows in order, the one Shift order across the groups, `MENU.heading`'s recipe and its ratios in both themes, and `MENU_GROUP`'s spacing against the rows' and the sheet's; it reads the legend's sections in order with no sort. `LayersPopover.test.tsx` holds the groups, their names and their rows at a desk and on a sheet, and a Shift range from Hazards into Forecast; `MapLegend.test.tsx` holds every section's place with every layer on. The lint checks over the menu read `MAP_LAYERS` by its rows and did not change. The two cards still differ in one way a reader may notice: the menu has headings and the legend does not.
