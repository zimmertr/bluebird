# 0156. The Destinations subheadings say each row searches, the Map line names no type, and the search box stays on the map

- Status: Accepted. Amends [0137](0137-destinations-section-reordered.md)
- Date: 2026-10-15
- Decider: the maintainer (TJ), on issue #710, 2026-10-15
- Issues and PRs: #710, #687, #707, #715
- Cited in code as: #710
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Destinations

## Context

Record 0137 left two questions on #710. The Map row is a subheading and an italic line about controls that live on the map, with nothing to press in the panel, and a field for the search built in #707 was reverted. And the three subheadings were bare nouns, `Map`, `Coordinates` and `Polygon`: a first-time reader sees `Polygon` over a Draw polygon button and three checkboxes, and nothing says that drawing one searches the area for destinations.

## Decision

- **The search box stays on the map at every width.** No field, button or link for it goes in the panel.
- **The Map row keeps its shape**: a subheading and one italic helper line (`TEXT.helper`), with the hover cue that rings the search box and glows the clickable features.
- **The three subheadings are `Map search`, `Coordinate search` and `Polygon search`** (choice N1 on #710). The section heading stays `Destinations`, and so does the tutorial card that points at it.
- **The helper line is `Search by name, or select any destination from it.`** The map is named once, in the subheading, and `from it` points back at it. The line names no kind of destination, because prose that lists the types is a string every new type has to reopen (the maintainer on #715, 2026-10-15). To make `any destination` true of what the map labels, the map's clickable features grow to places and climbing labels in the same PR.

## Evidence

Widths at 12px italic in Chrome on a Mac, measured 2026-10-15. The helper's budget on a 360px phone is 295px, the counter line's width in record 0137.

| Sentence | Width |
|---|---|
| `Search by name, or click any peak or lake.` (the line before this record) | 237px |
| `Search the map by name, or select any peak or lake from it.` | 335px, wraps |
| `Search by name, or select any peak or lake from it.` | 286px |
| `Search by name, or select any destination from it.` (chosen) | 280px |

`DestinationsSection.test.tsx` holds the three subheadings in order and the helper line.

## Alternatives rejected

Mockups of each: https://claude.ai/artifact/KoVCFLpvaJXxJ8gqUcqWMS

- **Option A of #710, the search box moved into the panel on a desktop**: rejected again on 2026-10-15, "it belongs on the map". The field built in #707 that only focused the map's box was rejected on 2026-10-13 (record 0137).
- **A lead line with no Map row** (mocked, not chosen on 2026-10-15): the map would have had no row of its own beside the other two ways in.
- **A glyph-led Map row**, a magnifier and a summit triangle beside two caption lines (mocked, not chosen): two lines where the row had one.
- **The sentence's verbs as links** that focus the search box or light the features (mocked, not chosen): the hover cue already points at both.
- **N2, `Destination search` as the section heading** over the bare nouns (#710's recommendation, not chosen): one string, but the word lands on the section rather than on the `Polygon` row that needed it.
- **N3, `Search an area`** for the Polygon row (mocked, not chosen): the one subheading that would have been a verb phrase beside two nouns.
- **A sentence naming peaks and lakes**: true of the basemap before this PR, and rejected for the rule that prose does not list the types.

## Consequences

`docs/USAGE.md` names the three rows by their new subheadings, and its `### c.` and `### d.` headings follow them. The helper line's claim depends on what the map lets a reader select, so a destination type the map does not label (trailheads, which the basemap does not carry) is the one exception the sentence does not state; `USAGE.md` does.
