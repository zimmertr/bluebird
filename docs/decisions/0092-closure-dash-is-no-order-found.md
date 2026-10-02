# 0092. The Closure dash means "no Forest Service order found", and the N/A hover names no place

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #567 and PR #608 (option A, with the N/A hover replaced by "Outside the area the closure data covers"; land ownership geometry left for a separate issue)
- Issues and PRs: #567, #608
- Cited in code as: `utils/closureProximity.ts` (`CLOSURE_UNCOVERED_NOTE`)
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `closureProximity.ts` bullet

## Context

The Closure column shows a dash for every row inside the area coverage outline that no order polygon holds. The outline is drawn around states, and the feeds carry Forest Service orders alone, with Region 6 publishing fire closures only. The Round 5 readiness review cast eight points against the live outline on 2026-10-01 and found every one inside it with no hit: Mount Rainier, Eldorado Peak, Mount Olympus, the Crater Lake rim, Grand Teton and Angels Landing (park land), Mount Si (Washington DNR) and Slesse Mountain (British Columbia, inside the 0.2° outward bias). `docs/USAGE.md` called such a row open.

The N/A hover was one fixed sentence naming eight whole states. The outline takes in only southern Idaho and western Wyoming and cuts two Region 5 areas out of Nevada, so Scotchman Peak, Cloud Peak and Boundary Peak read N/A under a sentence that said their state was covered. The outline is also composed per snapshot from the regions whose feeds answered, so when a Region 3 or Region 4 feed failed, its rows read N/A under a sentence that still named its states.

## Decision

The docs say what the dash means, "no Forest Service order found", and name the ground inside the outline it cannot speak for: national parks, state land, BLM and tribal land, the Canadian strip, and non-fire closures in Oregon and Washington. No page calls a cleared row open.

The uncovered N/A hover is one fixed sentence that names no place: "Outside the area the closure data covers", with no trailing period, like the wildfire column's uncovered note. A sentence that names nothing cannot be wrong about a state or about a failed feed. Where the area reaches is said once, in the Area closures row of the layer table and in `docs/DATA.md`.

## Evidence

The review's findings P01-2, P30-closure-3, C09-1, C09-5 and D1-4 (2026-10-01). `closureProximity.test.ts` pins the sentence.

## Alternatives rejected

- A land ownership layer, so ground outside Forest Service management reads N/A (#567 option B). It makes the cell obey the N/A rule, but it is a new data source and a new fetch, and is for a separate issue.
- A state list composed from the live outline, with one probe point per state held by the backend and carried to the browser by the mirrored-constant manifest. It was built on #608 and removed: it stopped naming a failed region's states, but it still named whole states the outline covers only in part, and it cost a mirrored pair for a sentence.
- "Closure data covers parts of 8 states only", the count from that same list. Honest, but it needs the probes too and tells the reader nothing they can act on.

## Consequences

The hover no longer tells the reader where the data does reach; the layer table and `docs/DATA.md` do. The dash still stands for two facts, a checked national forest point and ground the feeds cannot see, until a land ownership layer exists.
